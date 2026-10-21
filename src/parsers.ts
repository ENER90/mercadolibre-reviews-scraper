export const SITES: Record<string, { domain: string; name: string }> = {
  MLC: { domain: 'www.mercadolibre.cl', name: 'Chile' },
  MLA: { domain: 'www.mercadolibre.com.ar', name: 'Argentina' },
  MLM: { domain: 'www.mercadolibre.com.mx', name: 'México' },
  MCO: { domain: 'www.mercadolibre.com.co', name: 'Colombia' },
  MLU: { domain: 'www.mercadolibre.com.uy', name: 'Uruguay' },
  MPE: { domain: 'www.mercadolibre.com.pe', name: 'Perú' },
  MLB: { domain: 'www.mercadolivre.com.br', name: 'Brasil' },
  MEC: { domain: 'www.mercadolibre.com.ec', name: 'Ecuador' },
};

export interface Target { siteId: string; objectId: string; isItem: boolean; title: string | null; sourceUrl: string | null }

/** Parse a product URL (/p/MLC123), item URL (MLC-123-..._JM) or raw id (MLC123). */
export function parseTarget(input: string, defaultCountry = 'MLC'): Target {
  const s = input.trim();
  if (!s) throw new Error('Empty URL/ID in input.');
  const isUrl = /^https?:\/\//i.test(s);
  let m = s.match(/\/p\/([A-Za-z]{3})(\d{5,})/);
  if (m) m = [m[0], m[1].toUpperCase(), m[2]] as any;
  if (m) return { siteId: m[1], objectId: m[1] + m[2], isItem: false, title: slugTitle(s, /\/([^/]+)\/p\//), sourceUrl: s };
  if (/\/up\/[A-Z]{3}U\d+/i.test(s)) throw new Error(`"${s}" is a user-product page (/up/...), which has no public reviews id. Open the listing and copy its URL (…/MLC-123456789-…_JM) or the catalog URL (…/p/MLC123).`);
  m = s.match(/(?<![A-Za-z])([A-Z]{3})-?(\d{6,})(?:-([^?#/]*?))?(?:-_JM|[?#/]|$)/);
  if (m) return { siteId: m[1], objectId: m[1] + m[2], isItem: true, title: m[3] ? cleanSlug(m[3]) : null, sourceUrl: isUrl ? s : null };
  m = s.match(/^([A-Z]{3})(\d{6,})$/i);
  if (m) {
    const site = m[1].toUpperCase();
    return { siteId: site, objectId: site + m[2], isItem: true, title: null, sourceUrl: null };
  }
  m = s.match(/^(\d{6,})$/);
  if (m) return { siteId: defaultCountry, objectId: defaultCountry + m[1], isItem: true, title: null, sourceUrl: null };
  throw new Error(`Could not recognise a Mercado Libre product/item in "${s}". Use a URL like https://www.mercadolibre.cl/.../p/MLC123 or an id like MLC123456789.`);
}

function cleanSlug(slug: string): string { return decodeURIComponent(slug).replace(/-/g, ' ').trim(); }
function slugTitle(url: string, re: RegExp): string | null { const m = url.match(re); return m ? cleanSlug(m[1]) : null; }

export function reviewsUrl(t: Target, offset: number, limit: number): string {
  const site = SITES[t.siteId];
  if (!site) throw new Error(`Unsupported country/site "${t.siteId}". Supported: ${Object.keys(SITES).join(', ')}`);
  return `https://${site.domain}/noindex/catalog/reviews/${t.objectId}/search?objectId=${t.objectId}&siteId=${t.siteId}&isItem=${t.isItem}&offset=${offset}&limit=${limit}`;
}

export interface ReviewRecord {
  type: 'review'; siteId: string; country: string; objectId: string; isCatalogProduct: boolean; title: string | null;
  reviewId: number | string; rating: number | null; text: string | null; date: string | null; relativeDate: string | null;
  likes: number | null; photoCount: number; variant: string | null;
}

/** Recursively finds the first object with a given key (ML nests review metadata in tracking payloads). */
function findKey(obj: any, key: string, depth = 0): any {
  if (!obj || typeof obj !== 'object' || depth > 12) return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) { const r = findKey(v, key, depth + 1); if (r !== undefined) return r; }
  return undefined;
}

/** Parse the /noindex/catalog/reviews JSON. Deliberately keeps NO reviewer identity fields. */
export function parseReviews(json: any, t: Target): { reviews: ReviewRecord[]; emptyMessage: string | null } {
  if (!json || typeof json !== 'object' || !Array.isArray(json.reviews)) throw new Error('Unexpected reviews response shape (no "reviews" array). Mercado Libre may have changed the endpoint.');
  const reviews = json.reviews.map((r: any): ReviewRecord => {
    const meta = findKey(r, 'review') ?? {};
    return {
      type: 'review', siteId: t.siteId, country: SITES[t.siteId]?.name ?? t.siteId, objectId: t.objectId, isCatalogProduct: !t.isItem, title: t.title,
      reviewId: r.id ?? meta.review_id, rating: typeof r.rating === 'number' ? r.rating : (meta.rate ?? null),
      text: r.comment?.content?.text ?? null, date: meta.created_date ?? null, relativeDate: r.comment?.date ?? null,
      likes: typeof meta.count_likes === 'number' ? meta.count_likes : null,
      photoCount: Array.isArray(r.media) ? r.media.length : 0, variant: r.variant || null,
    };
  });
  const emptyMessage = reviews.length === 0 && json.message ? [json.message.title, json.message.subtitle].filter(Boolean).join(' ') : null;
  return { reviews, emptyMessage };
}

export interface QuestionRecord {
  type: 'question'; siteId: string; country: string; objectId: string; itemId: string; questionId: number | string; question: string | null;
  questionDate: string | null; status: string | null; answer: string | null; answerDate: string | null;
}

/** Parse official API /questions/search?item=...&api_version=4. Drops "from" (asker identity). */
export function parseQuestions(json: any, t: Target): { questions: QuestionRecord[]; total: number } {
  if (!json || !Array.isArray(json.questions)) throw new Error('Unexpected questions response shape (no "questions" array).');
  return {
    total: json.total ?? json.paging?.total ?? json.questions.length,
    questions: json.questions.map((q: any): QuestionRecord => ({
      type: 'question', siteId: t.siteId, country: SITES[t.siteId]?.name ?? t.siteId, objectId: t.objectId,
      itemId: q.item_id ?? t.objectId, questionId: q.id, question: q.text ?? null, questionDate: q.date_created ?? null, status: q.status ?? null,
      answer: q.answer?.text ?? null, answerDate: q.answer?.date_created ?? null,
    })),
  };
}

/** Listing ids (MLC123…) referenced inside a catalog-product reviews payload (e.g. denounce URLs). */
export function extractItemIds(json: any, siteId: string): string[] {
  const re = new RegExp(`item_id=(${siteId}\\d{6,})`, 'g');
  return [...new Set([...JSON.stringify(json ?? {}).matchAll(re)].map((m) => m[1]))];
}

export function questionsUrl(itemId: string, offset: number, limit = 50): string {
  return `https://api.mercadolibre.com/questions/search?item=${itemId}&api_version=4&offset=${offset}&limit=${limit}`;
}

export function officialReviewsUrl(itemId: string, offset: number, limit: number): string {
  return `https://api.mercadolibre.com/reviews/item/${itemId}?offset=${offset}&limit=${limit}`;
}

/** Parse official API /reviews/item/{id} (shape: { reviews: [{ id, rate, content, title, date_created, likes }], paging }). */
export function parseOfficialReviews(json: any, t: Target): { reviews: ReviewRecord[]; total: number } {
  if (!json || !Array.isArray(json.reviews)) throw new Error('Unexpected official reviews response shape.');
  return {
    total: json.paging?.total ?? json.reviews.length,
    reviews: json.reviews.map((r: any): ReviewRecord => ({
      type: 'review', siteId: t.siteId, country: SITES[t.siteId]?.name ?? t.siteId, objectId: t.objectId, isCatalogProduct: !t.isItem, title: t.title,
      reviewId: r.id, rating: typeof r.rate === 'number' ? r.rate : null, text: r.content ?? null, date: r.date_created ?? null, relativeDate: null,
      likes: typeof r.likes === 'number' ? r.likes : null, photoCount: Array.isArray(r.media) ? r.media.length : 0, variant: null,
    })),
  };
}

/** Token via OAuth client_credentials. Never logs the secret. */
export async function fetchAppToken(clientId: string, clientSecret: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl('https://api.mercadolibre.com/oauth/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString(),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`Mercado Libre OAuth failed (HTTP ${res.status}: ${j.error ?? j.message ?? 'unknown'}). Check mlClientId / mlClientSecret.`);
  return j.access_token;
}
