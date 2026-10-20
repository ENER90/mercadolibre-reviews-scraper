// Optional AI add-on: per-product review insights with the user's own Gemini or OpenAI key.
import { Actor, log } from 'apify';
import { LlmClient } from './llm.js';
import { normalizeReview, groupByProduct, chunk, batchPrompt, reducePrompt, parseJson, buildInsight, dedupe } from './core.js';

export interface AiInput { aiInsights?: boolean; aiProvider?: 'gemini' | 'openai'; aiApiKey?: string; aiModel?: string; aiLanguage?: string; }

export function aiEnabled(input: AiInput): boolean {
  if (!input.aiInsights) return false;
  if (!input.aiApiKey) { log.warning('aiInsights=true but no aiApiKey: skipping AI insights (bring your own Gemini or OpenAI key).'); return false; }
  return true;
}

/** Runs map-reduce over the scraped review rows and pushes one `ai-insight` row per product. Never throws. */
export async function runAiInsights(input: AiInput, source: string): Promise<number> {
  const rows = ((await (await Actor.openDataset()).getData({ limit: 100000 })).items as any[]).filter((r) => r.type === 'review');
  const provider = input.aiProvider ?? ((input.aiApiKey!.startsWith('sk-') ? 'openai' : 'gemini'));
  const model = input.aiModel || (provider === 'gemini' ? 'gemini-3.1-flash-lite' : 'gpt-4.1-mini');
  const language = input.aiLanguage || 'English';
  const llm = new LlmClient({ provider, apiKey: input.aiApiKey!, model, fallbackModels: provider === 'gemini' && !input.aiModel ? ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite'] : [] }, 5);
  const reviews = dedupe(rows.map((r, i) => normalizeReview({ source, ...r }, i)).filter(Boolean) as any);
  let pushed = 0;
  const cm = Actor.getChargingManager();
  const priced = 'review-analyzed' in cm.getPricingInfo().perEventPrices;
  for (const [product, all] of groupByProduct(reviews, 'product')) {
    let n = Math.min(all.length, 500);
    if (priced) n = Math.min(n, cm.calculateMaxEventChargeCountWithinLimit('review-analyzed'));
    if (n <= 0) { log.warning(`Max charge budget reached: skipping AI insight for "${product}".`); continue; }
    const list = all.slice(0, n);
    try {
      const sentiments: any[] = []; const partials: any[] = [];
      for (const b of chunk(list, 40)) {
        const j = parseJson(await llm.json(batchPrompt(product, b, language, true)));
        for (const r of j.reviews ?? []) sentiments.push(r);
        const { reviews: _r, ...rest } = j; partials.push(rest);
      }
      const final = partials.length === 1 ? partials[0] : parseJson(await llm.json(reducePrompt(product, partials, language, list.length)));
      const row = buildInsight(product, list, sentiments, final, { model: llm.model, language });
      await Actor.pushData({ ...row, type: 'ai-insight', source }); // counts as one normal result row; no separate AI event yet
      if (priced) await Actor.charge({ eventName: 'review-analyzed', count: list.length });
      pushed++; log.info(`AI insight saved for "${product}" (${list.length} reviews).`);
    } catch (e) { log.error(`AI insight failed for "${product}": ${(e as Error).message}`); }
  }
  log.info(`AI usage: ${llm.usage.calls} calls, ${llm.usage.inTokens} input tokens, ${llm.usage.outTokens} output tokens.`);
  await Actor.setValue('AI_USAGE', { ...llm.usage, model: llm.model, products: pushed, reviews: reviews.length });
  return pushed;
}
