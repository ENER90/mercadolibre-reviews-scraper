import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseTarget, parseReviews, parseQuestions, reviewsUrl } from '../src/parsers';
const fx = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));

describe('parseTarget', () => {
  it('catalog product URL (CL)', () => {
    const t = parseTarget('https://www.mercadolibre.cl/audifonos-bluetooth-in-ear-tws-buds10-master-g/p/MLC37981310');
    expect(t).toMatchObject({ siteId: 'MLC', objectId: 'MLC37981310', isItem: false, title: 'audifonos bluetooth in ear tws buds10 master g' });
  });
  it('catalog product URL (AR)', () => {
    expect(parseTarget('https://www.mercadolibre.com.ar/auriculares-x/p/MLA41149389#reviews')).toMatchObject({ siteId: 'MLA', objectId: 'MLA41149389', isItem: false });
  });
  it('item URL', () => {
    expect(parseTarget('https://articulo.mercadolibre.cl/MLC-467281714-audifonos-bluetooth-soundcore-spirit-x-_JM')).toMatchObject({ objectId: 'MLC467281714', isItem: true, title: 'audifonos bluetooth soundcore spirit x' });
  });
  it('raw ids and default country', () => {
    expect(parseTarget('mla123456789').objectId).toBe('MLA123456789');
    expect(parseTarget('123456789', 'MLA').objectId).toBe('MLA123456789');
  });
  it('clear error on garbage', () => { expect(() => parseTarget('https://google.com')).toThrow(/Could not recognise/); });
  it('builds review url', () => {
    expect(reviewsUrl(parseTarget('MLA123456789'), 20, 20)).toBe('https://www.mercadolibre.com.ar/noindex/catalog/reviews/MLA123456789/search?objectId=MLA123456789&siteId=MLA&isItem=true&offset=20&limit=20');
  });
});

describe('parseReviews', () => {
  const t = parseTarget('https://www.mercadolibre.cl/x/p/MLC37981310');
  it('parses live-captured product reviews', () => {
    const { reviews } = parseReviews(fx('reviews_product_MLC37981310.json'), t);
    expect(reviews.length).toBe(3);
    expect(reviews[0]).toMatchObject({ reviewId: 1630769856, rating: 5, date: '2024-11-18T16:46:25Z', likes: 7, photoCount: 3, siteId: 'MLC', country: 'Chile' });
    expect(reviews[0].text).toMatch(/Bajos de buena calidad/);
  });
  it('parses item reviews', () => {
    const { reviews } = parseReviews(fx('reviews_item_MLC467281714.json'), parseTarget('MLC467281714'));
    expect(reviews.map((r) => r.reviewId)).toEqual([63745120, 66447044, 61586694]);
    for (const r of reviews) { expect(r.rating).toBeGreaterThanOrEqual(1); expect(typeof r.text).toBe('string'); }
  });
  it('contains no personal-data keys', () => {
    const { reviews } = parseReviews(fx('reviews_product_MLC37981310.json'), t);
    const keys = Object.keys(reviews[0]).join(',');
    expect(keys).not.toMatch(/user|nick|name|author|email|phone/i);
  });
  it('empty result message', () => {
    const r = parseReviews({ reviews: [], message: { title: '¡Nada por aquí!', subtitle: 'No se encontraron resultados' } }, t);
    expect(r.reviews).toEqual([]); expect(r.emptyMessage).toMatch(/Nada/);
  });
  it('throws on unexpected shape', () => { expect(() => parseReviews({ foo: 1 }, t)).toThrow(/Unexpected/); });
});

describe('parseQuestions', () => {
  it('maps questions and answers, drops asker', () => {
    const { questions, total } = parseQuestions(fx('questions_api_v4_sample.json'), parseTarget('MLC467281714'));
    expect(total).toBe(2);
    expect(questions[0]).toMatchObject({ question: '¿Sirve para iPhone?', answer: 'Hola, sí es compatible.', status: 'ANSWERED', answerDate: '2026-09-01T12:30:00.000-04:00' });
    expect(questions[1].answer).toBeNull();
    expect(JSON.stringify(questions)).not.toMatch(/"from"|seller_id/);
  });
});
