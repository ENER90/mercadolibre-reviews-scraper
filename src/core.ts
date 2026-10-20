// Pure helpers: normalize reviews from many sources, group, batch, build prompts, merge results.
export interface Review { id: string; product: string; productId?: string; rating?: number; ratingScale?: number; title?: string; text: string; date?: string; source?: string; }

const pick = (o: any, keys: string[]) => { for (const k of keys) { const v = o?.[k]; if (v !== undefined && v !== null && v !== '') return v; } return undefined; };

/** Turn one raw item (Mercado Libre, Walmart, TrustRadius/Capterra, Trustpilot, Google Maps, plain strings...) into a Review, or null. */
export function normalizeReview(raw: any, idx: number, defaultProduct = 'All reviews'): Review | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return raw.trim() ? { id: `r${idx}`, product: defaultProduct, text: raw.trim() } : null;
  if (raw.type && raw.type !== 'review') return null; // skip product/question/summary rows
  const parts: string[] = [];
  const body = pick(raw, ['text', 'reviewText', 'review', 'content', 'body', 'comment', 'reviewBody', 'description']);
  if (body) parts.push(String(body));
  for (const [k, label] of [['pros', 'Pros'], ['cons', 'Cons'], ['useCases', 'Use cases']] as const) if (raw[k]) parts.push(`${label}: ${Array.isArray(raw[k]) ? raw[k].join('; ') : raw[k]}`);
  const text = parts.join('\n').trim();
  if (!text) return null;
  const rating = Number(pick(raw, ['rating', 'stars', 'score', 'ratingValue']));
  const scale = Number(pick(raw, ['ratingScale'])) || (rating > 5 ? 10 : 5);
  return {
    id: String(pick(raw, ['reviewId', 'id', 'review_id']) ?? `r${idx}`),
    product: String(pick(raw, ['productName', 'title', 'name', 'placeName', 'appName', 'companyName', 'productSlug', 'objectId']) ?? defaultProduct),
    productId: pick(raw, ['productSlug', 'itemId', 'objectId', 'productId', 'placeId', 'appId']) as string | undefined,
    rating: Number.isFinite(rating) ? rating : undefined, ratingScale: Number.isFinite(rating) ? scale : undefined,
    title: raw.type === 'review' && raw.productName ? pick(raw, ['title', 'reviewTitle']) : pick(raw, ['reviewTitle']),
    text, date: pick(raw, ['date', 'publishedAt', 'createdAt']), source: pick(raw, ['source', 'siteId']),
  };
}

/** ML review rows carry the product name in `title`; when productName exists, title is the review title. */
export function groupByProduct(reviews: Review[], groupBy: 'product' | 'none'): Map<string, Review[]> {
  const m = new Map<string, Review[]>();
  for (const r of reviews) { const k = groupBy === 'none' ? 'All reviews' : r.product; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
  return m;
}

export function chunk<T>(a: T[], n: number): T[][] { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }

export const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);

export function batchPrompt(product: string, batch: Review[], language: string, perReview: boolean): string {
  const lines = batch.map((r, i) => `[${i}] ${r.rating !== undefined ? `(${r.rating}/${r.ratingScale}) ` : ''}${r.title ? r.title + ' — ' : ''}${truncate(r.text.replace(/\s+/g, ' '), 1500)}`);
  return `You analyze customer reviews of "${product}". Reviews may be in any language. Write ALL text values in ${language}.
Return ONLY JSON with this shape:
{${perReview ? '"reviews":[{"i":<index>,"sentiment":"positive|neutral|negative","score":<-1..1>,"topics":["short topic"]}],' : ''}
"pros":[{"point":"short","mentions":<count of reviews>}],"cons":[{"point":"short","mentions":<n>}],
"themes":[{"theme":"short","sentiment":"positive|mixed|negative","mentions":<n>}],
"featureRequests":[{"request":"short","mentions":<n>}],"notableQuotes":["<=25 words, verbatim"],"summary":"2-3 sentences"}
${perReview ? `The "reviews" array MUST contain exactly ${batch.length} entries, one for EVERY index 0..${batch.length - 1}. ` : ''}In pros, cons, themes and featureRequests merge duplicates, keep max 8 items each, count mentions honestly.
REVIEWS:
${lines.join('\n')}`;
}

export function reducePrompt(product: string, partials: any[], language: string, total: number): string {
  return `Combine these partial analyses of ${total} reviews of "${product}" into one final analysis. Write ALL text values in ${language}.
Merge duplicate points and SUM their mentions. Keep the top 8 per list sorted by mentions.
Return ONLY JSON: {"pros":[{"point","mentions"}],"cons":[{"point","mentions"}],"themes":[{"theme","sentiment","mentions"}],"featureRequests":[{"request","mentions"}],"notableQuotes":[max 5],"summary":"3-5 sentences, an executive summary with the main strengths, weaknesses and opportunities"}
PARTIALS:
${JSON.stringify(partials)}`;
}

/** Parse JSON from an LLM reply, tolerating ```json fences. */
export function parseJson(s: string): any {
  const t = s.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch { const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1)); throw new Error('LLM did not return JSON'); }
}

const top = (a: any[] | undefined, key: string, n = 8) => (Array.isArray(a) ? a : []).filter((x) => x && x[key]).sort((x, y) => (y.mentions ?? 0) - (x.mentions ?? 0)).slice(0, n);

/** Local stats + LLM insight -> final per-product row. */
export function buildInsight(product: string, reviews: Review[], sentiments: { sentiment: string; score: number }[], llm: any, meta: { model: string; language: string }) {
  const rated = reviews.filter((r) => r.rating !== undefined);
  const avg5 = rated.length ? rated.reduce((s, r) => s + (r.rating! / (r.ratingScale ?? 5)) * 5, 0) / rated.length : null;
  const cnt = { positive: 0, neutral: 0, negative: 0 } as Record<string, number>;
  for (const s of sentiments) if (s.sentiment in cnt) cnt[s.sentiment]++;
  const n = sentiments.length;
  return {
    type: 'productInsight', product, productId: reviews[0]?.productId, source: reviews[0]?.source,
    reviewsAnalyzed: reviews.length, averageRating5: avg5 === null ? null : Math.round(avg5 * 100) / 100,
    sentiment: n ? { positivePct: Math.round((cnt.positive / n) * 100), neutralPct: Math.round((cnt.neutral / n) * 100), negativePct: Math.round((cnt.negative / n) * 100), avgScore: Math.round((sentiments.reduce((s, x) => s + (Number(x.score) || 0), 0) / n) * 100) / 100 } : null,
    summary: String(llm?.summary ?? ''), pros: top(llm?.pros, 'point'), cons: top(llm?.cons, 'point'), themes: top(llm?.themes, 'theme', 10),
    featureRequests: top(llm?.featureRequests, 'request'), notableQuotes: (llm?.notableQuotes ?? []).slice(0, 5),
    language: meta.language, model: meta.model, analyzedAt: new Date().toISOString(),
  };
}

/** Drop duplicate reviews (same product + id, or same product + text). */
export function dedupe(reviews: Review[]): Review[] {
  const seen = new Set<string>();
  return reviews.filter((r) => { const k1 = `${r.product}|id|${r.id}`, k2 = `${r.product}|tx|${r.text}`; if (seen.has(k1) || seen.has(k2)) return false; seen.add(k1); seen.add(k2); return true; });
}
