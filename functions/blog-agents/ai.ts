// blog-agents — the AI provider layer. One place for: Google Gemini, Anthropic Claude and every OpenAI-compatible
// API (OpenAI, xAI Grok, DeepSeek, Groq, Mistral, OpenRouter, Together, …), JSON answers, usage + cost logging,
// per-minute rate limit and monthly limits. Each provider has its own key (public.ai_keys).
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export class RetryLater extends Error { constructor(msg: string, public seconds = 90) { super(msg); } }
export class LimitReached extends Error {}
export class Fatal extends Error {}

export type Settings = Record<string, any>;
export type Usage = { input: number; output: number };

const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
const ANTHROPIC = "https://api.anthropic.com/v1";

/** Providers that speak the OpenAI chat-completions format. The API address is fixed here (server side), so a
 *  saved setting can't point a key at another site. "openai_compat" = any other service, address from Settings. */
export const OPENAI_COMPAT: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  xai: "https://api.x.ai/v1",
  deepseek: "https://api.deepseek.com/v1",
  groq: "https://api.groq.com/openai/v1",
  mistral: "https://api.mistral.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  together: "https://api.together.xyz/v1",
  fireworks: "https://api.fireworks.ai/inference/v1",
  cerebras: "https://api.cerebras.ai/v1",
  perplexity: "https://api.perplexity.ai",
  cohere: "https://api.cohere.ai/compatibility/v1",
  moonshot: "https://api.moonshot.ai/v1",
  qwen: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  zai: "https://api.z.ai/api/paas/v4",
  nvidia: "https://integrate.api.nvidia.com/v1",
  huggingface: "https://router.huggingface.co/v1",
  github: "https://models.github.ai/inference",
};
export const PROVIDERS = ["gemini", "anthropic", ...Object.keys(OPENAI_COMPAT), "openai_compat"];

function parseJson(text: string): any {
  let t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(t); } catch { /* fall through */ }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* fall through */ } }
  throw new RetryLater("The AI answer was not valid JSON (will try again)", 30);
}

export class AI {
  constructor(private db: SupabaseClient, private s: Settings, private key: string, private jobId: string | null, private agent: string) {}

  private async guard() {
    if (!this.key) throw new Fatal("No AI key yet — add it in /admin/blog → Settings → AI.");
    const { data: u, error } = await this.db.rpc("blog_usage_now");
    if (error) throw new RetryLater("Couldn't read AI usage: " + error.message, 60);
    const s = this.s;
    if (u.last_minute >= s.max_calls_per_minute) throw new RetryLater(`Rate limit: ${s.max_calls_per_minute} AI calls a minute`, 65);
    if (s.monthly_call_limit > 0 && u.month_calls >= s.monthly_call_limit) throw new LimitReached(`Monthly AI call limit reached (${s.monthly_call_limit}). Raise it in Settings or wait for next month.`);
    if (s.monthly_token_limit > 0 && u.month_tokens >= s.monthly_token_limit) throw new LimitReached(`Monthly AI token limit reached (${s.monthly_token_limit}).`);
    const price = Number(s.price_in_per_m) + Number(s.price_out_per_m);
    if (price > 0 && Number(u.month_cost) >= Number(s.monthly_cost_limit)) throw new LimitReached(`Monthly AI budget reached ($${s.monthly_cost_limit}).`);
  }

  private async record(u: Usage, ok: boolean) {
    const cost = (u.input * Number(this.s.price_in_per_m) + u.output * Number(this.s.price_out_per_m)) / 1e6;
    await this.db.from("blog_ai_usage").insert({ job_id: this.jobId, agent: this.agent, provider: this.s.provider, model: this.s.model,
      input_tokens: u.input, output_tokens: u.output, est_cost: cost, ok });
  }

  private httpError(status: number, body: string): Error {
    const short = body.replace(/\s+/g, " ").slice(0, 300);
    if (status === 429) return new RetryLater(`The AI provider is busy or the free quota is used up for now (429). ${short}`, 120);
    if (status >= 500) return new RetryLater(`The AI provider had an error (${status}). ${short}`, 120);
    if (status === 401 || status === 403) return new Fatal(`The AI key was refused (${status}). Check the key in Settings. ${short}`);
    if (status === 404) return new Fatal(`Model "${this.s.model}" not found (404). Pick another in Settings → AI → "Test & list models". ${short}`);
    return new Fatal(`AI request failed (${status}). ${short}`);
  }

  /** Ask for a JSON object. `system` sets the rules, `prompt` the task. */
  async json(system: string, prompt: string, opts: { maxTokens?: number; temperature?: number } = {}): Promise<any> {
    await this.guard();
    const maxTokens = opts.maxTokens ?? 8192, temperature = opts.temperature ?? 0.5;
    let text = "", usage: Usage = { input: 0, output: 0 };
    try {
      if (this.s.provider === "gemini") {
        const r = await fetch(`${GEMINI}/models/${encodeURIComponent(this.s.model)}:generateContent`, {
          method: "POST", signal: AbortSignal.timeout(110_000),
          headers: { "Content-Type": "application/json", "x-goog-api-key": this.key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature, maxOutputTokens: maxTokens }
          })
        });
        const body = await r.text();
        if (!r.ok) throw this.httpError(r.status, body);
        const j = JSON.parse(body);
        const cand = j.candidates?.[0];
        if (!cand) throw new RetryLater("The AI returned no answer" + (j.promptFeedback?.blockReason ? ` (blocked: ${j.promptFeedback.blockReason})` : ""), 60);
        text = (cand.content?.parts || []).filter((p: any) => !p.thought && typeof p.text === "string").map((p: any) => p.text).join("");
        usage = { input: j.usageMetadata?.promptTokenCount || 0, output: (j.usageMetadata?.candidatesTokenCount || 0) + (j.usageMetadata?.thoughtsTokenCount || 0) };
        if (cand.finishReason === "MAX_TOKENS" && !text.trim().endsWith("}")) throw new RetryLater("The AI answer was cut off (too long) — will retry", 30);
      } else if (this.s.provider === "anthropic") {
        const call = (withTemp: boolean) => fetch(`${ANTHROPIC}/messages`, {
          method: "POST", signal: AbortSignal.timeout(110_000),
          headers: { "Content-Type": "application/json", "x-api-key": this.key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: this.s.model, max_tokens: maxTokens, ...(withTemp ? { temperature } : {}),
            system: system + "\nReply with one JSON object only — no text before or after it.",
            messages: [{ role: "user", content: prompt }] })
        });
        let r = await call(true);
        if (r.status === 400) { const b = await r.text(); if (/temperature/i.test(b)) r = await call(false); else throw this.httpError(400, b); }
        const body = await r.text();
        if (!r.ok) throw this.httpError(r.status, body);
        const j = JSON.parse(body);
        text = (j.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
        usage = { input: j.usage?.input_tokens || 0, output: j.usage?.output_tokens || 0 };
        if (j.stop_reason === "max_tokens" && !text.trim().endsWith("}")) throw new RetryLater("The AI answer was cut off (too long) — will retry", 30);
      } else {
        const base = this.base();
        // some models refuse response_format, temperature or max_tokens (newer reasoning models want
        // max_completion_tokens) — drop or swap whatever the provider complains about and ask again
        const opt = { format: true, temp: true, maxKey: "max_tokens" };
        const call = () => fetch(`${base}/chat/completions`, {
          method: "POST", signal: AbortSignal.timeout(110_000),
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.key}`,
            ...(this.s.provider === "openrouter" ? { "HTTP-Referer": "https://fortabbaspolyclinic.com", "X-Title": "Fort Abbas Poly Clinic health blog" } : {}) },
          body: JSON.stringify({ model: this.s.model, [opt.maxKey]: maxTokens, ...(opt.temp ? { temperature } : {}),
            ...(opt.format ? { response_format: { type: "json_object" } } : {}),
            messages: [{ role: "system", content: system + "\nReply with one JSON object only." }, { role: "user", content: prompt }] })
        });
        let r = await call();
        for (let i = 0; i < 3 && (r.status === 400 || r.status === 422); i++) {
          const b = await r.text();
          if (opt.format && /response_format|json_object|json mode/i.test(b)) opt.format = false;
          else if (opt.maxKey === "max_tokens" && /max_completion_tokens|max_tokens/i.test(b)) opt.maxKey = "max_completion_tokens";
          else if (opt.temp && /temperature/i.test(b)) opt.temp = false;
          else throw this.httpError(r.status, b);
          r = await call();
        }
        const body = await r.text();
        if (!r.ok) throw this.httpError(r.status, body);
        const j = JSON.parse(body);
        const msg = j.choices?.[0]?.message || {};
        text = typeof msg.content === "string" ? msg.content : (Array.isArray(msg.content) ? msg.content.map((c: any) => c.text || "").join("") : "");
        usage = { input: j.usage?.prompt_tokens || 0, output: j.usage?.completion_tokens || 0 };
        if (j.choices?.[0]?.finish_reason === "length" && !text.trim().endsWith("}")) throw new RetryLater("The AI answer was cut off (too long) — will retry", 30);
      }
    } catch (e) {
      if (e instanceof RetryLater || e instanceof Fatal) { await this.record(usage, false); throw e; }
      if ((e as Error)?.name === "TimeoutError") { await this.record(usage, false); throw new RetryLater("The AI took too long to answer", 60); }
      throw e;
    }
    await this.record(usage, true);
    return parseJson(text);
  }

  private base(): string {
    const fixed = OPENAI_COMPAT[this.s.provider];
    if (fixed) return fixed;
    if (this.s.provider !== "openai_compat") throw new Fatal(`Unknown AI provider "${this.s.provider}".`);
    const base = String(this.s.base_url || "").replace(/\/+$/, "");
    if (!/^https:\/\//.test(base)) throw new Fatal("Set the API address (e.g. https://api.example.com/v1) in Settings → AI.");
    return base;
  }

  /** For the Settings "Test & list models" button. */
  async listModels(): Promise<string[]> {
    if (!this.key) throw new Fatal("No AI key yet.");
    if (this.s.provider === "gemini") {
      const r = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { "x-goog-api-key": this.key }, signal: AbortSignal.timeout(20_000) });
      const b = await r.text(); if (!r.ok) throw this.httpError(r.status, b);
      return (JSON.parse(b).models || []).filter((m: any) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m: any) => String(m.name).replace(/^models\//, "")).sort();
    }
    if (this.s.provider === "anthropic") {
      const r = await fetch(`${ANTHROPIC}/models?limit=1000`, { headers: { "x-api-key": this.key, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(20_000) });
      const b = await r.text(); if (!r.ok) throw this.httpError(r.status, b);
      return (JSON.parse(b).data || []).map((m: any) => String(m.id)).sort();
    }
    const base = this.base();
    const url = this.s.provider === "github" ? "https://models.github.ai/catalog/models" : `${base}/models`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${this.key}`, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    const b = await r.text(); if (!r.ok) throw this.httpError(r.status, b);
    const j = JSON.parse(b);
    const list = Array.isArray(j) ? j : (j.data || j.models || []);
    return list.map((m: any) => String(m.id || m.name || "")).filter(Boolean).sort();
  }
}
