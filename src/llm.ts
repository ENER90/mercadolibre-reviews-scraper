import { log } from 'apify';
export interface LlmConfig { provider: 'gemini' | 'openai'; apiKey: string; model: string; fallbackModels?: string[]; }
export interface Usage { calls: number; inTokens: number; outTokens: number; }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class LlmClient {
  usage: Usage = { calls: 0, inTokens: 0, outTokens: 0 };
  modelsUsed = new Set<string>();
  private mi = 0;
  constructor(private cfg: LlmConfig, private maxRetries = 8) {}
  get model() { return [this.cfg.model, ...(this.cfg.fallbackModels ?? [])][this.mi]; }
  async json(prompt: string): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      const res = await (this.cfg.provider === 'gemini' ? this.gemini(prompt) : this.openai(prompt));
      if (res.ok) { this.modelsUsed.add(this.model); return res.text!; }
      const models = [this.cfg.model, ...(this.cfg.fallbackModels ?? [])];
      if ((res.status === 503 || res.status === 404) && attempt >= 1 && models.length > 1) { this.mi = (this.mi + 1) % models.length; log.warning(`Model overloaded, switching to ${this.model}.`); }
      const retryable = res.status === 429 || res.status >= 500 || res.status === 0;
      if (!retryable || attempt >= this.maxRetries) throw new Error(`${this.cfg.provider} API error ${res.status}: ${res.error}`);
      const wait = Math.min(60000, res.retryAfterMs ?? 2000 * 2 ** attempt) + Math.random() * 500;
      log.warning(`${this.cfg.provider} ${res.status} (rate limit / overload), retrying in ${Math.round(wait / 1000)} s…`);
      await sleep(wait);
    }
  }
  private async call(url: string, headers: Record<string, string>, body: any) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
      const j: any = await r.json().catch(() => ({}));
      let retryAfterMs: number | undefined;
      const ra = r.headers.get('retry-after'); if (ra && !isNaN(+ra)) retryAfterMs = +ra * 1000;
      const gd = j?.error?.details?.find((d: any) => d.retryDelay)?.retryDelay; if (gd) retryAfterMs = parseFloat(gd) * 1000;
      return { status: r.status, j, retryAfterMs, error: String(j?.error?.message ?? r.statusText).slice(0, 300) };
    } catch (e) { return { status: 0, j: null, error: (e as Error).message }; }
  }
  private async gemini(prompt: string): Promise<any> {
    const r = await this.call(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`, { 'x-goog-api-key': this.cfg.apiKey },
      { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } });
    if (r.status !== 200) return { ok: false, ...r };
    this.usage.calls++; this.usage.inTokens += r.j.usageMetadata?.promptTokenCount ?? 0; this.usage.outTokens += r.j.usageMetadata?.candidatesTokenCount ?? 0;
    const text = (r.j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
    return text ? { ok: true, text, status: 200 } : { ok: false, status: 500, error: 'empty response' };
  }
  private async openai(prompt: string): Promise<any> {
    const r = await this.call('https://api.openai.com/v1/chat/completions', { authorization: `Bearer ${this.cfg.apiKey}` },
      { model: this.cfg.model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } });
    if (r.status !== 200) return { ok: false, ...r };
    this.usage.calls++; this.usage.inTokens += r.j.usage?.prompt_tokens ?? 0; this.usage.outTokens += r.j.usage?.completion_tokens ?? 0;
    return { ok: true, text: r.j.choices?.[0]?.message?.content ?? '', status: 200 };
  }
}
