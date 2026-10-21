import { Actor, log } from 'apify';
import { aiEnabled, runAiInsights, AiInput } from './ai.js';
import { BasicCrawler } from 'crawlee';
import { SITES, parseTarget, reviewsUrl, parseReviews, parseQuestions, parseOfficialReviews, officialReviewsUrl, questionsUrl, extractItemIds, fetchAppToken, Target } from './parsers.js';

interface Input extends AiInput {
  startUrls?: { url: string }[]; itemIds?: string[]; country?: string; maxReviews?: number; includeQuestions?: boolean; maxQuestions?: number;
  mlClientId?: string; mlClientSecret?: string; mlAccessToken?: string; maxListingsPerProduct?: number; proxyConfiguration?: any;
}
const PAGE = 20;
const safeJson = (b: string): any => { try { return JSON.parse(b); } catch { throw new Error('Non-JSON response from Mercado Libre API.'); } };
const QPAGE = 50;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

await Actor.init();
const input = (await Actor.getInput<Input>()) ?? {};
const country = String(input.country || 'MLC').trim().toUpperCase();
const num = (v: any, d: number) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : d);
const maxReviews = num(input.maxReviews, 100);
const maxQuestions = num(input.maxQuestions, 50);
const maxListings = num(input.maxListingsPerProduct, 3);
const EXAMPLE = 'https://www.mercadolibre.cl/audifonos-bluetooth-in-ear-tws-buds10-master-g/p/MLC37981310';
const toStr = (u: any): string => (typeof u === 'string' ? u : (u && typeof u === 'object' && typeof u.url === 'string' ? u.url : '')).trim();
let raw = [...(Array.isArray(input.startUrls) ? input.startUrls : []).map(toStr), ...(Array.isArray(input.itemIds) ? input.itemIds : []).map(toStr)].filter(Boolean);
if (!raw.length) {
  log.warning(`No "startUrls" or "itemIds" given. Running a small demo with the example product ${EXAMPLE}. Add your own product URLs or IDs to scrape them.`);
  raw = [EXAMPLE];
}

const targets: Target[] = [];
const inputErrors: { type: 'error'; input: string; error: string }[] = [];
for (const r of raw) {
  try {
    const t = parseTarget(r, country);
    if (!SITES[t.siteId]) throw new Error(`Unsupported country/site "${t.siteId}" in "${r}". Supported: ${Object.keys(SITES).join(', ')}.`);
    targets.push(t);
  } catch (e) { log.error((e as Error).message); inputErrors.push({ type: 'error', input: r, error: (e as Error).message }); }
}
if (inputErrors.length) await Actor.pushData(inputErrors);
if (!targets.length) {
  const msg = 'None of the given URLs/IDs could be recognised as Mercado Libre products. Use a URL like https://www.mercadolibre.cl/.../p/MLC123 or https://articulo.mercadolibre.cl/MLC-123456789-..._JM, or an id like MLC123456789.';
  log.error(msg);
  await Actor.exit({ statusMessage: msg });
}

// ---- Official API token (client_credentials) ----
let token: string | undefined = input.mlAccessToken?.trim() || undefined;
if (input.mlClientId && input.mlClientSecret) {
  try { token = await fetchAppToken(input.mlClientId.trim(), input.mlClientSecret.trim()); log.info('Got Mercado Libre API token (client_credentials).'); }
  catch (e) { log.error((e as Error).message); }
}
if (input.includeQuestions && !token) log.warning('includeQuestions=true but no valid credentials (mlClientId + mlClientSecret, or mlAccessToken). Skipping questions.');
const wantQuestions = !!(input.includeQuestions && token);
const auth = () => ({ authorization: `Bearer ${token}`, accept: 'application/json' });

// ---- Probe official reviews endpoint once; fall back to the public web endpoint ----
let useOfficialReviews = false;
const probe = targets.find((t) => t.isItem);
if (token && probe && maxReviews > 0) {
  try {
    const r = await fetch(officialReviewsUrl(probe.objectId, 0, 1), { headers: auth() });
    useOfficialReviews = r.ok && Array.isArray(((await r.json()) as any)?.reviews);
    log.info(useOfficialReviews ? 'Official /reviews/item API available: using it for listings.' : `Official /reviews/item API not available for this app (HTTP ${r.status}); using public reviews endpoint.`);
  } catch { /* fallback */ }
}

const proxyConfiguration = (input.proxyConfiguration?.useApifyProxy || input.proxyConfiguration?.proxyUrls?.length) ? await Actor.createProxyConfiguration(input.proxyConfiguration) : undefined;
const seen = new Map<string, number>();
const qSeen = new Map<string, number>();
const qQueued = new Set<string>();
const qReq = (t: Target, itemId: string, offset = 0) => ({ url: questionsUrl(itemId, offset, QPAGE), label: 'QUESTIONS', uniqueKey: `${itemId}-q-${offset}`, userData: { target: t, itemId, offset } });

const crawler = new BasicCrawler({
  maxRequestRetries: 4,
  requestHandlerTimeoutSecs: 60,
  async requestHandler({ request, sendRequest, crawler: c }) {
    const t = request.userData.target as Target;
    const offset = request.userData.offset as number;
    if (request.label === 'REVIEWS') {
      const res = await sendRequest({ url: request.url, headers: { 'user-agent': UA, accept: 'application/json' }, proxyUrl: await proxyConfiguration?.newUrl(), responseType: 'text' } as any);
      if (res.statusCode === 403 || /account-verification|suspicious-traffic/.test(res.url)) throw new Error(`Blocked by Mercado Libre anti-bot (HTTP ${res.statusCode}) for ${t.objectId}. Try Apify RESIDENTIAL proxy.`);
      if (res.statusCode >= 400) throw new Error(`HTTP ${res.statusCode} for ${request.url}`);
      let json: any;
      try { json = JSON.parse(res.body); } catch { throw new Error(`Non-JSON reviews response for ${t.objectId} (HTTP ${res.statusCode}); probably blocked. Try Apify RESIDENTIAL proxy.`); }
      const { reviews, emptyMessage } = parseReviews(json, t);
      const done = seen.get(t.objectId) ?? 0;
      const take = reviews.slice(0, Math.max(0, maxReviews - done));
      if (take.length) await Actor.pushData(take);
      seen.set(t.objectId, done + take.length);
      if (!reviews.length && done === 0 && t.isItem && !t.sourceUrl && !request.userData.flipped) {
        // Bare IDs are ambiguous: MLC123 can be a listing or a catalog product. Retry as catalog product.
        const t2 = { ...t, isItem: false };
        await c.addRequests([{ url: reviewsUrl(t2, 0, PAGE), label: 'REVIEWS', userData: { target: t2, offset: 0, flipped: true } }]);
        return;
      }
      if (wantQuestions && !t.isItem) {
        // Questions belong to listings; collect listing ids referenced by the catalog product's reviews.
        const fresh = extractItemIds(json, t.siteId).filter((id) => !qQueued.has(id));
        const add = fresh.slice(0, Math.max(0, maxListings - (seen.get('#L' + t.objectId) ?? 0)));
        add.forEach((id) => qQueued.add(id));
        seen.set('#L' + t.objectId, (seen.get('#L' + t.objectId) ?? 0) + add.length);
        if (add.length) await c.addRequests(add.map((id) => qReq(t, id)));
      }
      if (emptyMessage && done === 0) log.warning(`${t.objectId}: no reviews (${emptyMessage})`);
      if (reviews.length === PAGE && done + take.length < maxReviews) {
        await c.addRequests([{ url: reviewsUrl(t, offset + PAGE, PAGE), label: 'REVIEWS', userData: { target: t, offset: offset + PAGE } }]);
      }
      log.info(`${t.objectId}: ${done + take.length} reviews so far`);
    } else if (request.label === 'OFFICIAL_REVIEWS') {
      const res = await sendRequest({ url: request.url, headers: auth(), responseType: 'text' } as any);
      if (res.statusCode >= 400) {
        log.warning(`Official reviews HTTP ${res.statusCode} for ${t.objectId}; falling back to public endpoint.`);
        await c.addRequests([{ url: reviewsUrl(t, offset, PAGE), label: 'REVIEWS', userData: { target: t, offset } }]);
        return;
      }
      const { reviews, total } = parseOfficialReviews(safeJson(res.body), t);
      const done = seen.get(t.objectId) ?? 0;
      const take = reviews.slice(0, Math.max(0, maxReviews - done));
      if (take.length) await Actor.pushData(take);
      seen.set(t.objectId, done + take.length);
      const next = offset + reviews.length;
      if (reviews.length && next < total && done + take.length < maxReviews) {
        await c.addRequests([{ url: officialReviewsUrl(t.objectId, next, PAGE), label: 'OFFICIAL_REVIEWS', userData: { target: t, offset: next } }]);
      }
      log.info(`${t.objectId}: ${done + take.length} reviews so far (official API)`);
    } else if (request.label === 'QUESTIONS') {
      const itemId = request.userData.itemId as string;
      const res = await sendRequest({ url: request.url, headers: auth(), responseType: 'text' } as any);
      if (res.statusCode === 401 || res.statusCode === 403) { log.error(`Questions for ${itemId}: HTTP ${res.statusCode}. Check your Mercado Libre credentials.`); return; }
      if (res.statusCode >= 400) throw new Error(`HTTP ${res.statusCode} for questions ${itemId}`);
      const { questions, total } = parseQuestions(safeJson(res.body), t);
      const done = qSeen.get(itemId) ?? 0;
      const take = questions.slice(0, Math.max(0, maxQuestions - done));
      if (take.length) await Actor.pushData(take);
      qSeen.set(itemId, done + take.length);
      const next = offset + questions.length;
      if (questions.length && next < total && done + take.length < maxQuestions) await c.addRequests([qReq(t, itemId, next)]);
      log.info(`${itemId}: ${done + take.length}/${total} questions so far`);
    }
  },
  failedRequestHandler({ request }, error) { log.error(`Gave up on ${request.url}: ${error.message}`); },
});

const reqs: any[] = [];
for (const t of targets) {
  if (maxReviews > 0 || (wantQuestions && !t.isItem)) {
    if (useOfficialReviews && t.isItem) reqs.push({ url: officialReviewsUrl(t.objectId, 0, PAGE), label: 'OFFICIAL_REVIEWS', userData: { target: t, offset: 0 } });
    else reqs.push({ url: reviewsUrl(t, 0, PAGE), label: 'REVIEWS', userData: { target: t, offset: 0 } });
  }
  if (wantQuestions && t.isItem) { qQueued.add(t.objectId); reqs.push(qReq(t, t.objectId)); }
}
await crawler.run(reqs);
const nQ = [...qSeen.values()].reduce((a, b) => a + b, 0);
log.info(`Done. Questions saved: ${nQ}.`);
if (aiEnabled(input)) try { await runAiInsights({ aiLanguage: 'Spanish', ...input }, 'mercadolibre'); } catch (e) { log.error(`AI insights failed: ${(e as Error).message}`); }
await Actor.exit();
