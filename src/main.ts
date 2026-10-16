import { Actor, log } from 'apify';
import { BasicCrawler } from 'crawlee';
import { parseTarget, reviewsUrl, parseReviews, parseQuestions, Target } from './parsers.js';

interface Input { startUrls?: { url: string }[]; itemIds?: string[]; country?: string; maxReviews?: number; includeQuestions?: boolean; maxQuestions?: number; mlAccessToken?: string; proxyConfiguration?: any }
const PAGE = 20;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

await Actor.init();
const input = (await Actor.getInput<Input>()) ?? {};
const country = (input.country ?? 'MLC').toUpperCase();
const maxReviews = input.maxReviews ?? 100;
const raw = [...(input.startUrls ?? []).map((u) => u.url), ...(input.itemIds ?? [])];
if (!raw.length) throw new Error('Input error: provide at least one product URL in "startUrls" or an id in "itemIds".');

const targets: Target[] = [];
for (const r of raw) { try { targets.push(parseTarget(r, country)); } catch (e) { log.error((e as Error).message); } }
if (!targets.length) throw new Error('None of the given URLs/IDs could be parsed. See errors above.');

const proxyConfiguration = (input.proxyConfiguration?.useApifyProxy || input.proxyConfiguration?.proxyUrls?.length) ? await Actor.createProxyConfiguration(input.proxyConfiguration) : undefined;
const seen = new Map<string, number>();

const crawler = new BasicCrawler({
  maxRequestRetries: 4,
  requestHandlerTimeoutSecs: 60,
  async requestHandler({ request, sendRequest, crawler: c }) {
    const t = request.userData.target as Target;
    if (request.label === 'REVIEWS') {
      const res = await sendRequest({ url: request.url, headers: { 'user-agent': UA, accept: 'application/json' }, proxyUrl: await proxyConfiguration?.newUrl(), responseType: 'text' } as any);
      if (res.statusCode === 403 || /account-verification|suspicious-traffic/.test(res.url)) throw new Error(`Blocked by Mercado Libre anti-bot (HTTP ${res.statusCode}) for ${t.objectId}. Try Apify RESIDENTIAL proxy.`);
      if (res.statusCode >= 400) throw new Error(`HTTP ${res.statusCode} for ${request.url}`);
      const { reviews, emptyMessage } = parseReviews(JSON.parse(res.body), t);
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
      if (emptyMessage && done === 0) log.warning(`${t.objectId}: no reviews (${emptyMessage})`);
      const offset = request.userData.offset as number;
      if (reviews.length === PAGE && done + take.length < maxReviews) {
        await c.addRequests([{ url: reviewsUrl(t, offset + PAGE, PAGE), label: 'REVIEWS', userData: { target: t, offset: offset + PAGE } }]);
      }
      log.info(`${t.objectId}: ${done + take.length} reviews so far`);
    } else if (request.label === 'QUESTIONS') {
      const res = await sendRequest({ url: request.url, headers: { authorization: `Bearer ${input.mlAccessToken}` }, responseType: 'text' } as any);
      if (res.statusCode === 401 || res.statusCode === 403) { log.error(`Questions for ${t.objectId}: HTTP ${res.statusCode}. Check "mlAccessToken" (official Mercado Libre API token).`); return; }
      if (res.statusCode >= 400) throw new Error(`HTTP ${res.statusCode} for questions ${t.objectId}`);
      const { questions, total } = parseQuestions(JSON.parse(res.body), t);
      await Actor.pushData(questions);
      const offset = request.userData.offset as number;
      const next = offset + questions.length;
      if (questions.length && next < Math.min(total, input.maxQuestions ?? 50)) {
        await c.addRequests([{ url: questionsUrl(t, next), label: 'QUESTIONS', uniqueKey: `${t.objectId}-q-${next}`, userData: { target: t, offset: next } }]);
      }
    }
  },
  failedRequestHandler({ request }, error) { log.error(`Gave up on ${request.url}: ${error.message}`); },
});

function questionsUrl(t: Target, offset: number) {
  return `https://api.mercadolibre.com/questions/search?item=${t.objectId}&api_version=4&offset=${offset}&limit=50`;
}

const reqs: any[] = targets.map((t) => ({ url: reviewsUrl(t, 0, PAGE), label: 'REVIEWS', userData: { target: t, offset: 0 } }));
if (input.includeQuestions) {
  if (!input.mlAccessToken) log.warning('includeQuestions=true but no "mlAccessToken": Mercado Libre only serves questions via its official API with a token (anonymous web endpoints return login/anti-bot). Skipping questions.');
  else for (const t of targets) {
    if (!t.isItem) log.warning(`${t.objectId} is a catalog product (/p/); questions belong to individual listings (MLC-123..._JM). Trying anyway.`);
    reqs.push({ url: questionsUrl(t, 0), label: 'QUESTIONS', userData: { target: t, offset: 0 } });
  }
}
await crawler.run(reqs);
await Actor.exit();
