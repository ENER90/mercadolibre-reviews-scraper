export const SITES: Record<string, { domain: string; name: string }> = {
  MLC: { domain: 'www.mercadolibre.cl', name: 'Chile' },
  MLA: { domain: 'www.mercadolibre.com.ar', name: 'Argentina' },
  MLM: { domain: 'www.mercadolibre.com.mx', name: 'México' },
  MCO: { domain: 'www.mercadolibre.com.co', name: 'Colombia' },
  MLU: { domain: 'www.mercadolibre.com.uy', name: 'Uruguay' },
  MPE: { domain: 'www.mercadolibre.com.pe', name: 'Perú' },
};

export interface Target { siteId: string; objectId: string; isItem: boolean; title: string | null; sourceUrl: string | null }

/** Parse a product URL (/p/MLC123), item URL (MLC-123-..._JM) or raw id (MLC123). */
export function parseTarget(input: string, defaultCountry = 'MLC'): Target {
  const s = input.trim();
  if (!s) throw new Error('Empty URL/ID in input.');
  const isUrl = /^https?:\/\//i.test(s);
  let m = s.match(/\/p\/([A-Z]{3})(\d{5,})/);
  if (m) return { siteId: m[1], objectId: m[1] + m[2], isItem: false, title: slugTitle(s, /\/([^/]+)\/p\//), sourceUrl: s };
  m = s.match(/([A-Z]{3})-(\d{6,})(?:-([^?#]*?))?(?:-_JM|[?#]|$)/);
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
  type: 'question'; siteId: string; country: string; objectId: string; questionId: number | string; question: string | null;
  questionDate: string | null; status: string | null; answer: string | null; answerDate: string | null;
}

/** Parse official API /questions/search?item=...&api_version=4. Drops "from" (asker identity). */
export function parseQuestions(json: any, t: Target): { questions: QuestionRecord[]; total: number } {
  if (!json || !Array.isArray(json.questions)) throw new Error('Unexpected questions response shape (no "questions" array).');
  return {
    total: json.total ?? json.paging?.total ?? json.questions.length,
    questions: json.questions.map((q: any): QuestionRecord => ({
      type: 'question', siteId: t.siteId, country: SITES[t.siteId]?.name ?? t.siteId, objectId: t.objectId,
      questionId: q.id, question: q.text ?? null, questionDate: q.date_created ?? null, status: q.status ?? null,
      answer: q.answer?.text ?? null, answerDate: q.answer?.date_created ?? null,
    })),
  };
}
