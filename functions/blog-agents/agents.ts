// blog-agents — the team. Each agent does one job and hands over to the next one through the queue:
//
//   Planner ─▶ Source Researcher ─▶ Writer ─▶ SEO & Linker ─▶ Image Curator ─▶ Quality Reviewer ─▶ Publisher ─▶ (Translator)
//      ▲  └──▶ Topic Scout (when the topic backlog runs low)
//   Performance Monitor (weekly) ─▶ recommendations ─▶ Refresher (when you press "Improve") ─▶ SEO & Linker ─▶ …
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { AI, Fatal, RetryLater } from "./ai.ts";
import * as web from "./web.ts";
import "./blog-md.js";
const MD = (globalThis as any).BlogMD;

export type Next = { agent: string; payload?: Record<string, unknown>; dedupe?: string; delay_s?: number; post_id?: string; topic_id?: string; run_id?: string };
export type Out = { result: Record<string, unknown>; next?: Next[] };
export type Ctx = {
  db: SupabaseClient; s: Record<string, any>; secrets: Record<string, any>; job: Record<string, any>; site: string;
  ai: (agent: string) => AI; log: (level: "info" | "warn" | "error", message: string, data?: unknown) => Promise<void>;
};

const STORE = `Fort Abbas Poly Clinic Laboratories is a clinic and diagnostic laboratory in Fort Abbas, Pakistan, offering OPD consultations, laboratory tests, digital X-ray and home sample collection. Its readers are ordinary people and patients, worldwide but with particular attention to Pakistan, who read English. Local conditions (diet, heat, dengue and typhoid seasons, access to care) may be mentioned only when genuinely relevant.`;
const LENGTH: Record<string, [number, number]> = { short: [900, 1200], standard: [1400, 2000], long: [2200, 3000] };
// anything that could change what a patient does about a medicine or treatment always goes to a person
const SAFETY_RE = /(\b\d+(\.\d+)?\s?(mg|mcg|µg|iu|units?|ml)\b|\b(dos(e|es|age|ing)|prescri\w+|antibiotics?|insulin|steroids?|chemotherapy|overdose|side effects?|contraindicat\w+|interactions?|pregnan\w+|breastfeeding|infants?|newborns?|suicid\w*|self[- ]?harm|self[- ]?(medicat|treat)\w*|stop(ping)? (taking )?(your |the )?(medicine|medication|treatment|tablets?|insulin)|cures?|cured|normal range|reference range)\b)/i;
// sentences hands-off mode removes: exact doses and telling someone to stop treatment (mg/dL lab values are fine)
const HARD_RE = /(\b\d+(\.\d+)?\s?(mg|mcg|µg|iu)\b(?!\s?\/)|\bself[- ]?medicat\w*|\boverdose\b|\bsuicid\w*|\bself[- ]?harm\b|\bstop(ping)? (taking )?(your |the )?(medicine|medication|treatment|tablets?|insulin)\b)/i;
const STAT_RE = /(\d+(\.\d+)?\s?(%|percent)|\b(a|one|recent|new|the) (study|survey)\b|\bstudies (show|found|suggest)|\bresearch(ers)? (show|shows|found|suggests?)\b|\baccording to\b)/i;
// topics the agents never write about at all
const BLOCKED_TOPIC_RE = /\b(how much .{0,40}(take|dose)|dosage (of|for)|max(imum)? dose|abortion pills?|home abortion|miracle cure|cure .{0,30}(at home|naturally)|detox|suicide method|without (a )?(doctor|prescription))\b/i;
// words containing letters that are neither Urdu/Arabic nor Latin (digits, punctuation and marks are fine)
export const foreignWords = (t: string): string[] => [...new Set(String(t || "").match(/[^\s]*[^\p{Script=Arabic}\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}\s][^\s]*/gu) || [])];
const slugOf = (s: string) => String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70).replace(/-+$/, "");
const words = (s: string) => String(s || "").toLowerCase().match(/[a-z0-9]+/g) || [];
const STOP = new Set("a an the and or of for to in on with how what which why is are your you best vs do does can i my at by from".split(" "));
const jaccard = (a: string, b: string) => { const A = new Set(words(a).filter((w) => !STOP.has(w))), B = new Set(words(b).filter((w) => !STOP.has(w))); if (!A.size || !B.size) return 0; let n = 0; A.forEach((w) => B.has(w) && n++); return n / (A.size + B.size - n); };
const clip = (s: string, n: number) => { s = String(s || "").replace(/\s+/g, " ").trim(); if (s.length <= n) return s; const c = s.slice(0, n); return c.slice(0, Math.max(c.lastIndexOf(" "), n * 0.6)).replace(/[\s,.;:–—-]+$/, "") + "…"; };
const PK = 5 * 3600e3;

/* ---------------- shared context ---------------- */
async function shop(ctx: Ctx) {
  // the clinic's live test list (active tests and panels), served by the site itself
  let items: any[] = [];
  try { const r = await fetch(`${ctx.site}/api/blog?catalog=1`, { headers: { "User-Agent": web.UA }, signal: AbortSignal.timeout(15_000) }); if (r.ok) items = await r.json(); } catch { /* no test cards this time */ }
  const products = (Array.isArray(items) ? items : []).map((t: any) => ({ id: String(t.id), name: String(t.name || ""), variant_name: "", category: String(t.category || ""), subcategory: "", images: [], image_url: "", path: `/lab-tests?book=${encodeURIComponent(t.id)}` }));
  const live = await web.livePaths(ctx.site);
  ["/lab-tests", "/reports"].forEach((p) => live.add(p));
  const catPaths: [string, string][] = [["Book a lab test", "/lab-tests"]];
  return { products, catPaths, live };
}
async function blogState(ctx: Ctx) {
  const [{ data: posts }, { data: cats }] = await Promise.all([
    ctx.db.from("blog_posts").select("id,slug,lang,title,status,category_id,is_pillar,pillar_id,focus_query,published_at,topic_id").order("created_at", { ascending: false }).limit(1000),
    ctx.db.from("blog_categories").select("id,slug,name,description,active").eq("active", true).order("sort")
  ]);
  return { posts: posts || [], cats: cats || [] };
}
const enabledCats = (ctx: Ctx, cats: any[]) => (ctx.s.enabled_categories?.length ? cats.filter((c) => ctx.s.enabled_categories.includes(c.slug)) : cats);
async function post(ctx: Ctx, id?: string) {
  const pid = id || ctx.job.post_id || ctx.job.payload?.post_id;
  if (!pid) throw new Fatal("No article given.");
  const { data, error } = await ctx.db.from("blog_posts").select("*").eq("id", pid).single();
  if (error || !data) throw new Fatal("The article no longer exists.");
  return data;
}
async function save(ctx: Ctx, id: string, patch: Record<string, unknown>) {
  const { error } = await ctx.db.from("blog_posts").update(patch).eq("id", id);
  if (error) throw new RetryLater("Couldn't save the article: " + error.message, 30);
}
function bodyLinks(md: string) { return [...String(md).matchAll(/\[([^\]\n]{1,200})\]\(([^)\s]{1,600})\)/g)].map((m) => ({ label: m[1], url: m[2] })); }

/* ======================= PING (Settings → Test) ======================= */
export async function ping(ctx: Ctx): Promise<Out> {
  const ai = ctx.ai("ping");
  let models: string[] = [];
  try { models = await ai.listModels(); } catch (e) { await ctx.log("warn", "Couldn't list models: " + (e as Error).message); }
  const r = await ai.json("You are a connection test.", 'Reply with {"ok": true, "says": "<five words saying hello>"}', { maxTokens: 200, temperature: 0 });
  return { result: { ok: !!r.ok, says: String(r.says || "").slice(0, 80), model: ctx.s.model, provider: ctx.s.provider, models: models.slice(0, 150) } };
}

/* ======================= TOPIC SCOUT ======================= */
export async function scout(ctx: Ctx): Promise<Out> {
  const { posts, cats } = await blogState(ctx);
  const { products } = await shop(ctx);
  const seeds = [...new Set([...(ctx.s.research_seeds || []), ...products.map((p: any) => String(p.name || "").toLowerCase()).filter(Boolean).sort(() => Math.random() - 0.5).slice(0, 4)])].slice(0, 14);
  const mods = (q: string) => [q, `what is ${q}`, `why ${q}`, `${q} for`, `${q} vs`, `${q} symptoms`];
  const found = new Set<string>();
  for (const seed of seeds) for (const q of mods(seed)) (await web.suggestions(q)).forEach((x) => found.add(x));
  let gsc: string[] = [];
  if (ctx.secrets.gsc_service_account && ctx.secrets.gsc_property) {
    try {
      const tok = await web.gscToken(ctx.secrets.gsc_service_account);
      const end = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), start = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const rows = await web.gscQuery(tok, ctx.secrets.gsc_property, { startDate: start, endDate: end, dimensions: ["query"], rowLimit: 200 });
      gsc = rows.filter((r: any) => r.impressions >= 5).sort((a: any, b: any) => b.impressions - a.impressions).slice(0, 60).map((r: any) => `${r.keys[0]} (impr ${r.impressions}, pos ${Math.round(r.position)})`);
    } catch (e) { await ctx.log("warn", (e as Error).message); }
  }
  const { data: topics } = await ctx.db.from("blog_topics").select("query,title_idea,status").limit(2000);
  const existing = [...posts.map((p: any) => p.title), ...(topics || []).filter((t: any) => !["rejected"].includes(t.status)).map((t: any) => t.title_idea || t.query)];
  const candidates = [...found].filter((q) => !existing.some((e) => jaccard(q, e) >= 0.6)).slice(0, 140);
  if (!candidates.length && !gsc.length) return { result: { found: found.size, added: 0, note: "No new questions found this time." } };

  const allowed = enabledCats(ctx, cats);
  const r = await ctx.ai("scout").json(
    `You are the topic strategist for a clinic's health-awareness blog. ${STORE}
Pick topics that answer real questions people search, where a genuinely useful guide can be written from general knowledge plus public reference sources (no individual medical advice, no prices of other laboratories, no unverified news).
Prefer lab tests explained, common conditions, prevention, health myths and newly reported medical findings, especially these category slugs: ${(ctx.s.priority_categories || []).join(", ")}.
Group topics into clusters; mark one broad topic per cluster as a pillar guide (is_pillar) if the cluster has none yet.
Score 0–100 by: search intent clarity, usefulness, realistic ranking chance for a small site (specific long-tail beats broad head terms), and relevance to the clinic.`,
    `Candidate search queries (from autocomplete):\n${candidates.join("\n")}
${gsc.length ? `\nQueries the site already gets impressions for in Google (Search Console):\n${gsc.join("\n")}\n` : ""}
Already covered or planned (do NOT repeat or closely overlap):\n${existing.slice(0, 200).join("\n") || "(none yet)"}

Allowed categories (slug — name): ${allowed.map((c: any) => `${c.slug} — ${c.name}`).join("; ")}

Return JSON: {"topics":[{"query":"the search query","title_idea":"a catchy, click-worthy article title that promises a clear payoff (no invented numbers)","intent":"informational|commercial","category_slug":"one of the allowed slugs","cluster":"short cluster name","is_pillar":false,"score":0,"reason":"one sentence"}]}
Return at most 15 topics, best first. Skip anything unsafe (how much medicine to take, self-treatment, abortion methods, miracle cures), off-topic, or duplicate.`, { maxTokens: 4096, temperature: 0.4 });

  const slugs = new Set(allowed.map((c: any) => c.slug));
  const rows: any[] = [];
  // models answer in slightly different shapes: {"topics":[…]}, a bare list, or another key holding the list
  const list: any[] = Array.isArray(r) ? r : Array.isArray(r?.topics) ? r.topics : ((Object.values(r || {}).find((v) => Array.isArray(v)) as any[]) || []);
  const skipped: Record<string, number> = { short: 0, duplicate: 0, unsafe: 0, similar: 0 };
  for (const t0 of list.slice(0, 15)) {
    const t = typeof t0 === "string" ? { query: t0 } : (t0 || {});
    const q = String(t.query || t.search_query || t.keyword || t.question || t.title_idea || t.title || "").trim().slice(0, 200);
    const title = String(t.title_idea || t.title || t.article_title || "").trim().slice(0, 200);
    if (q.length < 3) { skipped.short++; continue; }
    if ([...existing, ...rows.map((x) => x.title_idea || x.query)].some((e) => jaccard(title || q, e) >= 0.55)) { skipped.duplicate++; continue; }
    if (BLOCKED_TOPIC_RE.test(`${q} ${title}`)) { skipped.unsafe++; continue; }   // no dosing or self-treatment guides
    const { data: sim } = await ctx.db.rpc("blog_similar", { p_text: title || q, p_min: 0.5 });
    if (sim && sim.length) { skipped.similar++; continue; }
    rows.push({ query: q, title_idea: title, intent: t.intent === "commercial" ? "commercial" : "informational", category_slug: slugs.has(t.category_slug || t.category) ? (t.category_slug || t.category) : null,
      cluster: String(t.cluster || "").slice(0, 120), is_pillar: !!t.is_pillar, score: Math.max(0, Math.min(100, Math.round(Number(t.score) || 50))),
      source: gsc.some((g) => g.startsWith(q)) ? "search-console" : "autocomplete", notes: String(t.reason || "").slice(0, 500) });
  }
  let saved: any[] = [];
  if (rows.length) { const { data, error } = await ctx.db.from("blog_topics").insert(rows).select("id,score,title_idea,query"); if (error) throw new RetryLater("Couldn't save topics: " + error.message, 30); saved = data || []; }
  const why = Object.entries(skipped).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ");
  await ctx.log(rows.length ? "info" : "warn", `Found ${found.size} search questions; the AI suggested ${list.length} topics; added ${rows.length}${why ? ` (skipped: ${why})` : ""}`
    + (list.length ? "" : ` — the AI's answer had no topic list (keys: ${Object.keys(r || {}).join(", ") || "none"})`));
  const next: Next[] = [];
  // "Publish a guide now" with no topics yet: write the best new one straight away
  if (ctx.job.payload?.write_now) {
    const best = saved.sort((a, b) => b.score - a.score)[0]
      || (await ctx.db.from("blog_topics").select("id,score,title_idea,query").in("status", ["approved", "idea"]).order("score", { ascending: false }).limit(1)).data?.[0];
    if (best) {
      await ctx.db.from("blog_topics").update({ status: "writing" }).eq("id", best.id);
      next.push({ agent: "researcher", payload: { topic_id: best.id, publish_now: true }, topic_id: best.id, dedupe: "article:topic:" + best.id });
      await ctx.log("info", `Writing now (you asked to publish a guide): ${best.title_idea || best.query}`);
    } else await ctx.log("warn", "Publish now: no suitable topic found — add one in Topics and press Publish a guide now again.");
  } else if (ctx.job.payload?.then_plan && rows.length) next.push({ agent: "planner", payload: { after_scout: true }, dedupe: "planner:after-scout" });
  return { result: { found: found.size, considered: candidates.length, added: rows.length, topics: rows.map((x) => x.title_idea || x.query) }, next };
}

/* ======================= PLANNER ======================= */
function upcomingSlots(s: Record<string, any>, from: number, days: number): number[] {
  const out: number[] = [];
  const pkNow = new Date(from + PK);
  for (let d = 0; d <= days; d++) {
    const day = new Date(Date.UTC(pkNow.getUTCFullYear(), pkNow.getUTCMonth(), pkNow.getUTCDate() + d, s.publish_hour, 0, 0));
    if ((s.publish_days || []).includes(day.getUTCDay())) { const t = day.getTime() - PK; if (t > from) out.push(t); }
  }
  return out;
}
const weekKey = (t: number) => { const d = new Date(t + PK); const day = (d.getUTCDay() + 6) % 7; return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10); };

export async function planner(ctx: Ctx): Promise<Out> {
  const s = ctx.s, now = Date.now(), next: Next[] = [];
  if (!ctx.secrets.ai_api_key) { await ctx.log("warn", "Planner skipped: no AI key yet (Settings → AI)."); return { result: { skipped: "no AI key" } }; }
  const { data: ideas } = await ctx.db.from("blog_topics").select("*").in("status", ["approved", "idea"]).order("score", { ascending: false }).limit(300);
  const backlog = (ideas || []).length;
  // the Topic Scout runs at most once a day
  const scoutKey = "scout:" + new Date(now + PK).toISOString().slice(0, 10);
  const { count: scoutedToday } = await ctx.db.from("blog_jobs").select("id", { count: "exact", head: true }).eq("dedupe_key", scoutKey);
  const needScout = !scoutedToday;
  if (backlog < s.topic_backlog_min && needScout) next.push({ agent: "scout", payload: { then_plan: backlog === 0 }, dedupe: scoutKey });
  if (s.articles_per_week <= 0) return { result: { backlog, planned: 0, note: "Articles per week is 0" }, next };

  // what is already planned: articles made this week + pipelines still running
  const { data: recent } = await ctx.db.from("blog_posts").select("id,created_at,scheduled_at,quality").eq("ai_generated", true).eq("lang", "en").gte("created_at", new Date(now - 9 * 864e5).toISOString());
  const { data: active } = await ctx.db.from("blog_jobs").select("payload,agent").in("status", ["queued", "running"]).in("agent", ["researcher", "writer"]);
  const planned = new Set<number>([...(recent || []).map((p: any) => Number(p.quality?.planned_for || 0)), ...(active || []).map((j: any) => Number(j.payload?.planned_for || 0))].filter(Boolean));
  const perWeek: Record<string, number> = {};
  planned.forEach((t) => (perWeek[weekKey(t)] = (perWeek[weekKey(t)] || 0) + 1));
  // start an article ~2 days before its slot so there is time for review
  const slots = upcomingSlots(s, now, 9).filter((t) => t - now <= 2.2 * 864e5 && !planned.has(t));
  const prio = new Set(s.priority_categories || []), allowed = new Set(s.enabled_categories?.length ? s.enabled_categories : []);
  const { posts } = await blogState(ctx);
  const pool = (ideas || []).filter((t: any) => !allowed.size || !t.category_slug || allowed.has(t.category_slug))
    .map((t: any) => ({ t, rank: (t.status === "approved" ? 200 : 0) + t.score + (prio.has(t.category_slug) ? 15 : 0) + (t.is_pillar && !posts.some((p: any) => p.is_pillar) ? 20 : 0) }))
    .filter((x: any) => x.t.status === "approved" || x.t.score >= 55).sort((a: any, b: any) => b.rank - a.rank);
  const started: string[] = [];
  for (const slot of slots) {
    const wk = weekKey(slot);
    if ((perWeek[wk] || 0) >= s.articles_per_week) continue;
    const pick = pool.shift();
    if (!pick) { if (needScout && !next.some((x) => x.agent === "scout")) next.push({ agent: "scout", payload: { then_plan: true }, dedupe: scoutKey }); break; }
    const topic = pick.t;
    const dup = posts.find((p: any) => jaccard(p.title, topic.title_idea || topic.query) >= 0.6);
    if (dup) { await ctx.db.from("blog_topics").update({ status: "duplicate", notes: `Too close to "${dup.title}"` }).eq("id", topic.id); continue; }
    await ctx.db.from("blog_topics").update({ status: "writing" }).eq("id", topic.id);
    next.push({ agent: "researcher", payload: { topic_id: topic.id, planned_for: slot }, topic_id: topic.id, run_id: crypto.randomUUID(), dedupe: "article:topic:" + topic.id });
    perWeek[wk] = (perWeek[wk] || 0) + 1; started.push(topic.title_idea || topic.query);
  }
  await ctx.log("info", started.length ? `Started ${started.length} article(s): ${started.join("; ")}` : "Nothing to start today (schedule is full or no slot in the next 2 days)");
  return { result: { backlog, slots: slots.map((t) => new Date(t).toISOString()), started }, next };
}

/* ======================= SOURCE RESEARCHER ======================= */
export async function researcher(ctx: Ctx): Promise<Out> {
  const tid = ctx.job.topic_id || ctx.job.payload?.topic_id;
  const { data: topic } = await ctx.db.from("blog_topics").select("*").eq("id", tid).single();
  if (!topic) throw new Fatal("Topic not found.");
  const trusted: string[] = ctx.s.trusted_sources || [];
  const q = topic.title_idea || topic.query;
  const [medline, wiki, ...refs] = await Promise.all([web.medlinePlus(topic.query, 2), web.wikipedia(topic.query, 2), ...(topic.reference_urls || []).slice(0, 5).map((u: string) => web.fetchSource(u, trusted))]);
  const sources = [...refs.filter(Boolean), ...medline, ...wiki].slice(0, 6) as web.Source[];
  await ctx.log("info", `${sources.length} source(s): ${sources.map((x) => x.title).join("; ") || "none"}`);
  const { posts } = await blogState(ctx);
  const brief = await ctx.ai("researcher").json(
    `You are a research editor preparing a brief for an accurate, plain-language health article. ${STORE}
Only list facts that are stated in the provided sources, each with the source number. Do not add facts from memory as "facts" — put general advice under "practical_points" instead.`,
    `Topic: ${q}\nSearch query: ${topic.query}\nIntent: ${topic.intent}\nNotes: ${topic.notes || "-"}\n
Sources:\n${sources.map((x, i) => `[${i + 1}] ${x.title} — ${x.url}\n${x.text.slice(0, 3500)}`).join("\n\n") || "(no sources found — keep the article to general, practical advice and avoid specific figures)"}

Existing articles on the site (avoid overlap; link-worthy): ${posts.filter((p: any) => p.status === "published").slice(0, 60).map((p: any) => p.title).join(" | ") || "none"}

Return JSON: {"angle":"what makes this guide genuinely useful","reader":"who is searching and why","main_question":"the one question to answer first","outline":[{"h2":"...","points":["..."]}],"facts":[{"fact":"...","source":1}],"practical_points":["..."],"faq":["question"],"comparison_table":"describe a useful comparison table or empty","safety_notes":["anything needing a caution or a doctor's advice"]}`,
    { maxTokens: 4096, temperature: 0.3 });
  return { result: { sources: sources.map((x) => ({ title: x.title, url: x.url })), outline: (brief.outline || []).map((o: any) => o.h2) },
    next: [{ agent: "writer", payload: { topic_id: tid, planned_for: ctx.job.payload?.planned_for || null, publish_now: !!ctx.job.payload?.publish_now, brief, sources: sources.map((x) => ({ ...x, text: x.text.slice(0, 3000) })) }, topic_id: tid }] };
}

/* ======================= WRITER ======================= */
const FORMAT = `Article format (a small Markdown):
- "## Heading" for sections, "### Sub-heading" inside a section. Never use "#" (the title is the page's only H1).
- Paragraphs of 2–4 sentences. "- " bullet lists, "1. " numbered steps, "> " for one important tip or caution.
- Tables: | Col | Col | header row, then |---|---| separator.
- Links: [short label](https://source-url) — ONLY to the numbered sources given. No raw HTML, no images, no other links.`;
// the house voice: what makes a reader stay to the end (the editor can add to it in Admin → Guides → Settings → Writing style)
export const DEFAULT_VOICE = `You are the senior health writer of the Fort Abbas Poly Clinic blog: a careful professional who explains medicine the way a kind, clear-headed doctor friend would.
- Hook first: open with a real, relatable situation (a lab report you can't read, a tiredness that won't go away) or a surprising truth, one or two lines, then give the straight answer. Scenes must be clearly general, never presented as a real patient.
- Talk to one reader: "you", contractions, plain words, a calm and confident tone. Explain every medical term the first time it appears.
- Make it useful: what the test or condition is, what it can and cannot tell you, when to see a doctor. Every paragraph must earn its place.
- Every heading is a mini-hook that pulls the reader on: a promise or a question they're secretly asking ("What your HbA1c number can't tell you"). Never generic ones like "Introduction" or "Conclusion".
- Easy to scan: short paragraphs, **bold** the one key takeaway in a section, lists where they help, one "> " box for the most important caution.
- Respectful always. No humour about illness, no blame, no shaming about weight, habits or age.
- Catchy, NOT frightening. Never use fear to get a click, and never: "In today's fast-paced world", "Look no further", "game-changer", "unlock", "delve", "dive in", "navigating", "miracle", "shocking", "doctors hate", "it's important to note", "Let's face it", "In conclusion", emojis, exclamation marks in a row, ALL CAPS.
- End with a crisp takeaway, "The short version" in 2-3 lines, which includes when to see a doctor.
- Title: makes the reader curious and promises something the article fully delivers, e.g. "What Your CBC Report Is Really Telling You", "Is Fasting Really Needed Before a Cholesterol Test?". 50-70 characters. No invented numbers, no alarm, no promise of a cure.
- Excerpt (the one line under the title and on cards): a calm tagline that says what the reader will understand after reading.`;
const writerRules = (ctx: Ctx) => {
  const voice = String(ctx.s.writing_style || "").trim();
  return `${WRITER_RULES}

HOUSE VOICE (how it should read):
${DEFAULT_VOICE}${voice ? `

EXTRA INSTRUCTIONS FROM THE EDITOR (follow them; if one conflicts with rules 3–5 above — facts, honesty, medical safety — those rules win):
${voice.slice(0, 4000)}` : ""}`;
};
const WRITER_RULES = `You write accurate, original health-awareness articles for the Fort Abbas Poly Clinic blog. ${STORE}
Rules, follow all of them:
1. Educate first. Do not advertise; the SEO editor adds a few relevant lab-test links later. Never write prices, and never mention other laboratories.
2. Open with a short hook (1-2 lines) and then answer the question plainly in 2-3 sentences. Then sections that go deeper: what it is, why it matters, what results can and cannot show, common myths, when to see a doctor, whichever genuinely help.
3. Specific facts, numbers, reference ranges, risks, study findings and health claims ONLY when they appear in the provided sources, and cite them inline with a link to that source. Say plainly when evidence is limited or early. General explanations need no citation.
4. Never invent statistics, studies, quotes, doctors, patient stories or reviews. Never claim "we tested", "in our experience", "our doctors say". Write in second person ("you"). Scenes you describe must be clearly general.
5. Medical safety: this is general information, not personal advice. Never tell a reader what dose to take, to start, stop or change a medicine, or that they do or don't have a condition. Never promise a cure. Results are interpreted by a doctor with the person's history. Name urgent warning signs when relevant and tell the reader to seek medical care promptly.
6. Clear English for readers in Pakistan and elsewhere; no keyword stuffing (use the main query naturally 2-4 times); no repetition; no fluff.
7. Include a comparison table when the topic compares options; include 3-6 FAQ questions that are NOT already answered word-for-word in the body. A checklist may use "- [ ] item" lines.
${FORMAT}`;
const WRITER_SCHEMA = `Return JSON:
{"title":"a scroll-stopping, curiosity-driven title the article fully delivers on (50–70 characters)","excerpt":"a catchy one-line tagline that teases the payoff (max 160 characters)","answer_summary":"40–80 words that directly answer the main question (can use **bold**)","body_md":"the article","faq":[{"q":"...","a":"2–4 sentences"}],"tags":["3–6 short tags"],"focus_query":"the main search query","sources_used":[1],"claims_needing_review":["any sentence you are not fully sure about"],"has_medical_advice":false}`;

export async function writer(ctx: Ctx): Promise<Out> {
  const p = ctx.job.payload || {}, tid = ctx.job.topic_id || p.topic_id;
  const { data: topic } = await ctx.db.from("blog_topics").select("*").eq("id", tid).single();
  if (!topic) throw new Fatal("Topic not found.");
  const sources: web.Source[] = p.sources || [];
  const [min, max] = LENGTH[ctx.s.length_pref] || LENGTH.standard;
  const r = await ctx.ai("writer").json(writerRules(ctx),
    `Write a ${topic.is_pillar ? "complete pillar guide (broad, covers the whole subject, links out to detail later)" : "focused guide"} of ${min}–${max} words.
Topic: ${topic.title_idea || topic.query}\nMain search query: ${topic.query}\nIntent: ${topic.intent}

Research brief:\n${JSON.stringify(p.brief || {}, null, 1).slice(0, 6000)}

Sources (cite only these, by URL):\n${sources.map((x, i) => `[${i + 1}] ${x.title} — ${x.url}\n${String(x.text || "").slice(0, 2500)}`).join("\n\n") || "(none — avoid specific figures)"}

${WRITER_SCHEMA}`, { maxTokens: 8192, temperature: 0.7 });
  if (!r.body_md || String(r.body_md).length < 1500) throw new RetryLater("The draft came back too short — writing it again", 30);

  const { posts, cats } = await blogState(ctx);
  const cat = cats.find((c: any) => c.slug === topic.category_slug) || cats.find((c: any) => c.slug === "lab-tests-explained") || cats[0];
  const pillar = !topic.is_pillar && topic.cluster ? (await ctx.db.from("blog_topics").select("post_id").eq("cluster", topic.cluster).eq("is_pillar", true).not("post_id", "is", null).limit(1)).data?.[0]?.post_id : null;
  const used = new Set((Array.isArray(r.sources_used) ? r.sources_used : []).map(Number));
  const cited = sources.filter((x, i) => used.has(i + 1) || String(r.body_md).includes(x.url));
  let slug = slugOf(r.title) || slugOf(topic.query) || "article", n = 2;
  while (posts.some((x: any) => x.slug === slug && x.lang === "en")) slug = `${slugOf(r.title)}-${n++}`;
  const claims = (Array.isArray(r.claims_needing_review) ? r.claims_needing_review : []).map(String).filter(Boolean).slice(0, 10);
  const row = {
    slug, lang: "en", title: clip(r.title, 140), excerpt: clip(r.excerpt || "", 390), answer_summary: clip(r.answer_summary || "", 880),
    body_md: String(r.body_md).replace(/^#\s+/gm, "## ").slice(0, 59000),
    faq: (Array.isArray(r.faq) ? r.faq : []).filter((f: any) => f?.q && f?.a).slice(0, 8).map((f: any) => ({ q: clip(f.q, 200), a: clip(f.a, 900) })),
    tags: (Array.isArray(r.tags) ? r.tags : []).map((t: any) => String(t).toLowerCase().slice(0, 40)).slice(0, 8),
    focus_query: clip(r.focus_query || topic.query, 190), category_id: cat?.id || null, is_pillar: !!topic.is_pillar, pillar_id: pillar || null,
    status: "draft", author_name: ctx.s.author_name, sources: cited.map((x) => ({ title: x.title, url: x.url, publisher: x.publisher })),
    topic_id: tid, ai_generated: true,
    review_notes: claims.map((c: string) => ({ level: "check", agent: "writer", message: `Writer wasn't sure: "${clip(c, 240)}"` })),
    needs_review: claims.length > 0 || !!r.has_medical_advice,
    quality: { planned_for: p.planned_for || null, medical: !!r.has_medical_advice, run_id: ctx.job.run_id, ...(p.publish_now ? { publish_now: true } : {}) }
  };
  const { data: ins, error } = await ctx.db.from("blog_posts").insert(row).select("id").single();
  if (error) throw new RetryLater("Couldn't save the draft: " + error.message, 30);
  await ctx.db.from("blog_topics").update({ post_id: ins.id }).eq("id", tid);
  await ctx.log("info", `Draft saved: "${row.title}" (${MD.plain(row.body_md).split(" ").length} words, ${cited.length} sources)`);
  return { result: { post_id: ins.id, title: row.title, slug }, next: [{ agent: "linker", payload: { post_id: ins.id, source_text: sources.map((x) => ({ url: x.url, title: x.title, text: String(x.text || "").slice(0, 1800) })) }, post_id: ins.id }] };
}

/* ======================= SEO & LINKER ======================= */
export async function linker(ctx: Ctx): Promise<Out> {
  const art = await post(ctx);
  const { products, catPaths, live } = await shop(ctx);
  const { posts, cats } = await blogState(ctx);
  const promo = ctx.s.promo_level, maxP = promo === "off" ? 0 : promo === "light" ? Math.min(1, ctx.s.max_product_links) : ctx.s.max_product_links;
  const blogTargets = posts.filter((p: any) => p.status === "published" && p.lang === "en" && p.id !== art.id).slice(0, 80).map((p: any) => [p.title, `/blog/${p.slug}`]);
  const catTargets = cats.map((c: any) => [`Articles: ${c.name}`, `/blog/category/${c.slug}`]);
  const targets = [...blogTargets, ...catPaths.map(([n, path]) => [`Clinic: ${n}`, path]), ...catTargets];
  const allowed = new Set(targets.map((t) => t[1]));
  const r = await ctx.ai("linker").json(
    `You are the SEO editor of the Fort Abbas Poly Clinic blog. You add a few genuinely useful internal links and, where it truly fits the reader's need, cards for the clinic's lab tests; and you write the search title and description. Never force a link. Never change the article's meaning.`,
    `ARTICLE TITLE: ${art.title}\nMAIN QUERY: ${art.focus_query}\nBODY:\n${art.body_md.slice(0, 16000)}

LINK TARGETS (title — path):\n${targets.map((t) => `${t[0]} — ${t[1]}`).join("\n") || "(none)"}

LAB TESTS (id — name — category):\n${products.map((p: any) => `${p.id} — ${p.name}${p.variant_name ? " " + p.variant_name : ""} — ${p.category}${p.subcategory ? " › " + p.subcategory : ""}`).join("\n") || "(none)"}

Return JSON: {"links":[{"anchor":"exact phrase copied from a body paragraph (3–8 words, not in a heading)","path":"one of the paths above"}],"products":[{"product_id":"...","after_heading":"exact text of the ## heading whose section it fits","reason":"why a reader of that section would want it"}],"seo_title":"max 60 characters, includes the main query naturally, catchy — gives a reason to click, no brand stuffing","meta_description":"140–158 characters: hooks with the problem or a curiosity gap, then promises the payoff — accurate, never misleading"}
Rules: 2–5 links, each path at most once. At most ${maxP} products, only if clearly relevant (e.g. the HbA1c test in an article about diabetes). If nothing fits, return empty lists.`, { maxTokens: 2048, temperature: 0.3 });

  let body = String(art.body_md);
  const added: string[] = [];
  const done = new Set(bodyLinks(body).map((l) => l.url));
  for (const l of (Array.isArray(r.links) ? r.links : []).slice(0, 6)) {
    const path = String(l.path || ""), anchor = String(l.anchor || "").trim();
    if (!allowed.has(path) || done.has(path) || anchor.length < 4 || (live.size > 2 && !live.has(path) && !path.startsWith("/blog/category/"))) continue;
    // first occurrence in a normal paragraph line that isn't already inside a link
    const lines = body.split("\n");
    const i = lines.findIndex((ln) => !/^\s*(#|\||\[\[)/.test(ln) && ln.includes(anchor) && !new RegExp(`\\[[^\\]]*${anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\]]*\\]\\(`).test(ln));
    if (i < 0) continue;
    lines[i] = lines[i].replace(anchor, `[${anchor}](${path})`);
    body = lines.join("\n"); done.add(path); added.push(path);
  }
  const ids = new Set(products.map((p: any) => p.id));
  const placed: string[] = [];
  for (const pr of (Array.isArray(r.products) ? r.products : []).slice(0, maxP)) {
    const id = String(pr.product_id || "");
    if (!ids.has(id) || placed.includes(id) || body.includes(`[[product:${id}]]`)) continue;
    const lines = body.split("\n");
    const h = lines.findIndex((ln) => /^##\s/.test(ln) && ln.replace(/^#+\s*/, "").trim().toLowerCase() === String(pr.after_heading || "").replace(/^#+\s*/, "").trim().toLowerCase());
    if (h < 0) continue;
    // end of that section's first paragraph
    let k = h + 1; while (k < lines.length && !lines[k].trim()) k++; while (k < lines.length && lines[k].trim() && !/^#/.test(lines[k])) k++;
    lines.splice(k, 0, "", `[[product:${id}]]`, "");
    body = lines.join("\n").replace(/\n{3,}/g, "\n\n"); placed.push(id);
  }
  // a cluster article always links up to its pillar guide
  if (art.pillar_id) { const pl = posts.find((p: any) => p.id === art.pillar_id && p.status === "published"); if (pl && !body.includes(`/blog/${pl.slug}`)) body += `\n\nFor the bigger picture, read our complete guide: [${pl.title}](/blog/${pl.slug}).`; }
  const seo_title = clip(r.seo_title || art.title, 60).replace(/…$/, "");
  const meta = clip(r.meta_description || art.excerpt || MD.plain(art.answer_summary), 158);
  await save(ctx, art.id, { body_md: body, seo_title: seo_title.length >= 20 ? seo_title : "", meta_description: meta, product_ids: placed });
  await ctx.log("info", `Added ${added.length} internal link(s) and ${placed.length} product card(s)`);
  return { result: { links: added, products: placed, seo_title, meta_description: meta }, next: [{ agent: "imager", payload: { post_id: art.id, source_text: ctx.job.payload?.source_text || [] }, post_id: art.id }] };
}

/* ======================= IMAGE CURATOR ======================= */
async function storeImage(ctx: Ctx, url: string, name: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": web.UA }, signal: AbortSignal.timeout(20_000) });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !/^image\/(jpeg|png|webp)/.test(type)) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length > 4.5 * 1024 * 1024 || buf.length < 8000) return null;
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    const path = `covers/${name}-${Date.now().toString(36)}.${ext}`;
    const { error } = await ctx.db.storage.from("blog").upload(path, buf, { contentType: type, upsert: false, cacheControl: "31536000" });
    if (error) { await ctx.log("warn", "Couldn't store the photo (using the original link): " + error.message); return null; }
    return ctx.db.storage.from("blog").getPublicUrl(path).data.publicUrl;
  } catch { return null; }
}
export async function imager(ctx: Ctx): Promise<Out> {
  const art = await post(ctx);
  const mode = ctx.s.image_source;
  const nextStep: Next[] = [{ agent: "reviewer", payload: { post_id: art.id, source_text: ctx.job.payload?.source_text || [] }, post_id: art.id }];
  if (mode === "none" || (art.cover_image && art.cover_image.url && !ctx.job.payload?.replace)) return { result: { skipped: mode === "none" ? "images off" : "already has a cover" }, next: nextStep };
  let cover: Record<string, unknown> | null = null;
  if (mode === "products" || mode === "products_then_openverse") {
    const ids: string[] = art.product_ids || [];
    if (ids.length) {
      const { data: prods } = await ctx.db.from("products").select("id,name,images,image_url").in("id", ids).eq("is_active", true);
      const p = (prods || []).find((x: any) => (Array.isArray(x.images) && x.images.some((m: any) => m?.url && !/\.(mp4|webm|mov)$/i.test(m.url))) || x.image_url);
      if (p) {
        const img = (p.images || []).find((m: any) => m?.url && !/\.(mp4|webm|mov)$/i.test(m.url))?.url || p.image_url;
        cover = { url: img, alt: `${p.name} at Fort Abbas Poly Clinic`, credit: "Fort Abbas Poly Clinic", license: "", license_url: "", source_url: "", kind: "product" };
      }
    }
  }
  if (!cover && (mode === "openverse" || mode === "products_then_openverse")) {
    const queries = [art.focus_query, ...(art.tags || []), "medical laboratory"].filter(Boolean).slice(0, 4);
    for (const q of queries) {
      const photos = await web.openverse(q);
      const pick = photos[0];
      if (pick) {
        const own = await storeImage(ctx, pick.url, art.slug.slice(0, 40));
        cover = { url: own || pick.url, alt: clip(pick.alt ? `${pick.alt} — illustration for “${art.title}”` : art.title, 160), credit: pick.credit, license: pick.license, license_url: pick.license_url, source_url: pick.source_url, kind: "openverse", original_url: pick.url };
        break;
      }
    }
  }
  if (cover) await save(ctx, art.id, { cover_image: cover });
  await ctx.log(cover ? "info" : "warn", cover ? `Cover: ${cover.kind} (${cover.credit}${cover.license ? ", " + cover.license : ""})` : "No suitable licensed photo found — the article will show without a cover");
  return { result: { cover }, next: nextStep };
}

/* ======================= QUALITY REVIEWER ======================= */
export async function reviewer(ctx: Ctx): Promise<Out> {
  const art = await post(ctx);
  const { products, live } = await shop(ctx);
  const { posts } = await blogState(ctx);
  const notes: { level: string; agent: string; message: string }[] = (art.review_notes || []).filter((n: any) => n.agent === "writer");
  const note = (level: string, message: string) => notes.push({ level, agent: "reviewer", message });
  let body = String(art.body_md);

  // 1. no raw HTML ever
  if (/<\/?[a-z][^>]*>/i.test(body)) { body = body.replace(/<\/?[a-z][^>]*>/gi, ""); note("fixed", "Removed raw HTML tags from the article."); }
  // 2. links: internal must exist, external must be a listed source or trusted domain and be reachable
  const srcUrls = new Set((art.sources || []).map((x: any) => x.url));
  const blogPaths = new Set(posts.filter((p: any) => p.status === "published").map((p: any) => `/blog/${p.slug}`));
  for (const l of bodyLinks(body)) {
    const href = MD.cleanHref(l.url);
    let ok = !!href;
    if (ok && href.startsWith("/")) ok = live.has(href.split(/[?#]/)[0]) || blogPaths.has(href) || href.startsWith("/blog/category/");
    else if (ok) ok = (srcUrls.has(href) || web.hostOk(href, ctx.s.trusted_sources || [])) && await web.linkAlive(href);
    if (!ok) { body = body.split(`[${l.label}](${l.url})`).join(l.label); note("fixed", `Removed a link that was broken or not to a listed source: ${clip(l.url, 120)}`); }
  }
  // 3. product cards must be real, live products
  const ids = new Set(products.map((p: any) => p.id));
  body = body.replace(/^\[\[product:([A-Za-z0-9_.:-]{1,80})\]\]$/gm, (m, id) => { if (ids.has(id)) return m; note("fixed", "Removed a card for a lab test that is not in the clinic's list."); return ""; });
  // 4. structure, length, stuffing, repetition
  const plain = MD.plain(body), wc = plain.split(/\s+/).filter(Boolean).length;
  const [min] = LENGTH[ctx.s.length_pref] || LENGTH.standard;
  const h2 = (body.match(/^##\s/gm) || []).length;
  if (wc < min * 0.7) note("warn", `Shorter than planned: ${wc} words (aim ${min}+).`);
  if (h2 < 3) note("warn", `Only ${h2} main section(s); 3+ usually reads better.`);
  if (!art.answer_summary || art.answer_summary.split(/\s+/).length < 25) note("warn", "The quick answer is missing or very short.");
  const fq = String(art.focus_query || "").toLowerCase().trim();
  if (fq) { const hits = plain.toLowerCase().split(fq).length - 1; const density = (hits * fq.split(/\s+/).length) / Math.max(1, wc); if (density > 0.025) note("warn", `The main query appears ${hits} times — may read as keyword stuffing.`); }
  const sentences = plain.split(/(?<=[.!?])\s+/).map((x: string) => x.toLowerCase().trim()).filter((x: string) => x.length > 40);
  const dupS = sentences.filter((x: string, i: number) => sentences.indexOf(x) !== i);
  if (dupS.length) note("warn", `${dupS.length} sentence(s) are repeated word for word.`);
  // 5. duplication with other articles
  const { data: sim } = await ctx.db.rpc("blog_similar", { p_text: art.title, p_min: 0.6 });
  (sim || []).filter((x: any) => x.kind === "post" && x.id !== art.id).forEach((x: any) => note("check", `Title is very close to another article: "${x.title}" (${x.status}).`));
  // 6. safety: anything about medicines, treatment or sensitive care always goes to a person
  const medical = SAFETY_RE.test(plain) || art.quality?.medical;
  if (medical) note("check", "Contains medicine, dosing, treatment or other sensitive medical content: a qualified person must read it before publishing.");
  // 7. numbers and claims that look like statistics but aren't linked to a source
  const statLines = body.split("\n").filter((ln) => /(\d+(\.\d+)?\s?(%|percent)|\b(a|one|recent|new|the) (study|survey)\b|\bstudies (show|found|suggest)|\bresearch(ers)? (show|shows|found|suggests?)\b|\baccording to\b)/i.test(ln) && !/\]\(https?:/.test(ln));
  statLines.slice(0, 5).forEach((ln) => note("check", `Figure or claim without a source link: "${clip(MD.plain(ln), 200)}"`));

  // 8. AI fact-check against the sources it was given
  let src = (ctx.job.payload?.source_text || []) as { url: string; title: string; text: string }[];
  if (!src.length && (art.sources || []).length) {   // a manual re-check: read the article's own sources again
    const got = await Promise.all((art.sources || []).slice(0, 5).map((x: any) => web.fetchSource(x.url, ctx.s.trusted_sources || [])));
    src = got.filter(Boolean).map((x) => ({ url: x!.url, title: x!.title, text: x!.text.slice(0, 1800) }));
  }
  const fc = await ctx.ai("reviewer").json(
    `You are a strict medical fact-checker and editor for a clinic's health blog. You compare an article with its sources. You flag: (a) specific facts, numbers or claims that the sources do not support and that are not common general knowledge; (b) invented experience, testing, reviews, experts or statistics; (c) unsafe or misleading health advice, especially about medicines, doses, stopping treatment, self-diagnosis or promised cures; (d) promotional tone that gets ahead of being helpful. You may propose small text fixes that remove or soften a problem without adding new facts.`,
    `ARTICLE: ${art.title}\nQUICK ANSWER: ${art.answer_summary}\n\n${body.slice(0, 16000)}\n\nFAQ:\n${(art.faq || []).map((f: any) => `Q: ${f.q}\nA: ${f.a}`).join("\n")}\n
SOURCES:\n${src.map((x, i) => `[${i + 1}] ${x.title} — ${x.url}\n${x.text}`).join("\n\n") || "(none)"}

Return JSON: {"score":0-100,"unsupported":[{"claim":"exact words","why":"..."}],"invented":["..."],"safety":["..."],"fixes":[{"find":"exact text from the article (one sentence or less)","replace":"corrected text"}],"verdict":"one sentence"}`, { maxTokens: 3072, temperature: 0.1 });
  let fixed = 0;
  for (const f of (Array.isArray(fc.fixes) ? fc.fixes : []).slice(0, 8)) {
    const find = String(f.find || ""), rep = String(f.replace ?? "");
    if (find.length >= 12 && body.split(find).length === 2 && !/\]\(|\[\[product/.test(find + rep) && rep.length <= find.length * 1.5) { body = body.replace(find, rep); fixed++; }
  }
  if (fixed) note("fixed", `Applied ${fixed} small correction(s) suggested by the fact-check.`);
  (fc.unsupported || []).slice(0, 8).forEach((u: any) => { if (!body.includes(String(u.claim || "")) || !u.claim) return; note("check", `Not supported by the sources: "${clip(u.claim, 200)}" — ${clip(u.why || "", 160)}`); });
  (fc.invented || []).slice(0, 5).forEach((x: any) => { if (String(x).length > 12 && !body.includes(String(x).slice(0, 40))) return; note("check", `Possibly invented: ${clip(String(x), 220)}`); });
  (fc.safety || []).slice(0, 5).forEach((x: any) => note("check", `Safety: ${clip(String(x), 220)}`));
  const score = Math.max(0, Math.min(100, Math.round(Number(fc.score) || 0)));
  if (score && score < 60) note("check", `Fact-check score ${score}/100: ${clip(fc.verdict || "", 200)}`);

  // Hands-off mode: instead of waiting for a person, take out whatever could not be verified or could be unsafe.
  // Only what cannot be fixed that way (safety concerns from the fact-check, a low score, a near-duplicate) still waits.
  if (ctx.s.auto_publish && !ctx.s.manual_approval) {
    const drop = (keep: (sentence: string) => boolean) => { let n = 0; body = body.split("\n").map((ln) => { if (/^\s*(#|\||\[\[|!\[)/.test(ln)) return ln; const parts = ln.split(/(?<=[.!?])\s+/), left = parts.filter(keep); n += parts.length - left.length; return left.join(" "); }).join("\n").replace(/\n{3,}/g, "\n\n"); return n; };
    const claims = [...(fc.unsupported || []).map((u: any) => String(u.claim || "")), ...notes.filter((n) => n.agent === "writer").map((n) => (n.message.match(/"(.+)"/)?.[1] || "").replace(/…$/, ""))].filter((c) => c.length > 12);
    let removed = 0;
    for (const c of claims) removed += drop((x) => !x.includes(c));
    removed += drop((x) => !(STAT_RE.test(x) && !/\]\(https?:/.test(x)));
    removed += drop((x) => !HARD_RE.test(x));
    for (const n of notes) if (n.level === "check" && !/^(Safety:|Fact-check score|Title is very close|Possibly invented)/.test(n.message)) n.level = "fixed";
    if (removed) note("fixed", `Removed ${removed} sentence(s) that could not be verified or that gave medicine or dose instructions.`);
    if (HARD_RE.test(MD.plain(body))) note("check", "Still mentions self-harm or medicine instructions: a person must read it before publishing.");
  }
  const needs = notes.some((n) => n.level === "check");
  await save(ctx, art.id, { body_md: body, review_notes: notes, needs_review: needs,
    quality: { ...(art.quality || {}), score, words: wc, sections: h2, verdict: clip(fc.verdict || "", 300), checked_at: new Date().toISOString(), medical: !!medical } });
  await ctx.log(needs ? "warn" : "info", `Quality ${score}/100 — ${needs ? notes.filter((n) => n.level === "check").length + " item(s) for a person to check" : "no blocking issues"}`);
  return { result: { score, needs_review: needs, notes: notes.length }, next: [{ agent: "publisher", payload: { post_id: art.id }, post_id: art.id }] };
}

/* ======================= PUBLISHER ======================= */
export async function publisher(ctx: Ctx): Promise<Out> {
  const art = await post(ctx);
  const s = ctx.s, now = Date.now();
  const planned = Number(art.quality?.planned_for || 0);
  let status = "review", scheduled_at: string | null = planned > now ? new Date(planned).toISOString() : null, why = "";
  const now_ = !!(art.quality?.publish_now || ctx.job.payload?.publish_now);
  if (art.status === "published" || art.status === "scheduled") { status = art.status; why = "already live/scheduled — left as is"; }
  else if (!art.ai_generated) { status = art.status; scheduled_at = art.scheduled_at || null; why = "you created this article yourself — only you publish it"; }
  else if (art.needs_review) why = now_ ? "you asked to publish it now, but it has items flagged for a person to check first" : "has items flagged for a person to check";
  else if (now_) { status = "published"; scheduled_at = null; why = "you asked to publish a guide now and it passed every check"; }
  else if (s.manual_approval || !s.auto_publish) why = "manual approval is on";
  else { status = scheduled_at ? "scheduled" : "published"; why = "auto-publish is on and all checks passed"; }
  if (status !== art.status) await save(ctx, art.id, { status, scheduled_at: status === "scheduled" ? scheduled_at : art.scheduled_at || scheduled_at });
  if (art.topic_id) await ctx.db.from("blog_topics").update({ status: "done", post_id: art.id }).eq("id", art.topic_id);
  await ctx.log("info", `"${art.title}" → ${status === "review" ? "waiting for your approval" : status}${scheduled_at && status !== "published" ? ` (planned ${new Date(scheduled_at).toLocaleString("en-GB", { timeZone: "Asia/Karachi" })})` : ""} — ${why}`);
  const next: Next[] = [];
  if (s.urdu_enabled && art.lang === "en") next.push({ agent: "translator", payload: { post_id: art.id }, post_id: art.id, dedupe: "translator:post:" + art.id });
  return { result: { status, scheduled_at, why, notify: status === "review" ? { title: art.title, id: art.id } : null }, next };
}

/* ======================= TRANSLATOR (Urdu) ======================= */
export async function translator(ctx: Ctx): Promise<Out> {
  const art = await post(ctx);
  if (art.lang !== "en") throw new Fatal("Only English articles are translated.");
  const r = await ctx.ai("translator").json(
    `You translate health-awareness articles from English into natural, clear Urdu (Urdu script) for Pakistani readers. Write every Urdu word only in Urdu (Arabic) letters — never Hindi/Devanagari, Bengali, Korean or any other alphabet, not even for one syllable. Keep the title, the one-line tagline (excerpt) and the headings just as catchy in Urdu — natural Urdu hooks that make a reader want to click, not word-for-word. Keep technical terms readers use in English (CBC, HbA1c, MRI, X-ray) in English where that is more natural. Keep the Markdown exactly: headings (##), lists, tables, and links — translate only the link text, keep every URL unchanged. Keep any line like [[product:...]] exactly as it is. Keep every medical meaning, caution and number exactly. Do not add or remove information.`,
    `Translate this article. Return JSON {"title":"","excerpt":"","answer_summary":"","body_md":"","faq":[{"q":"","a":""}],"seo_title":"max 60 chars","meta_description":"max 158 chars"}\n\n${JSON.stringify({ title: art.title, excerpt: art.excerpt, answer_summary: art.answer_summary, body_md: art.body_md, faq: art.faq })}`,
    { maxTokens: 8192, temperature: 0.2 });
  if (!r.body_md || !r.title) throw new RetryLater("Translation came back empty", 30);
  // AI models sometimes slip Hindi, Bengali or Korean letters into Urdu words ("ٹی이블" for "ٹیبل"). No font can show
  // those as Urdu, so: find them, ask once for the right Urdu spelling, and flag anything still wrong for a person.
  const FIELDS = ["title", "excerpt", "answer_summary", "body_md", "seo_title", "meta_description"];
  const allText = () => [...FIELDS.map((k) => String(r[k] || "")), ...(r.faq || []).flatMap((f: any) => [String(f?.q || ""), String(f?.a || "")])].join("\n");
  let bad = foreignWords(allText());
  if (bad.length) {
    await ctx.log("warn", `Translation had ${bad.length} word(s) in the wrong alphabet (${bad.slice(0, 6).join(", ")}) — fixing`);
    try {
      const fx = await ctx.ai("translator").json(
        "You fix Urdu spelling. Each word below was meant to be Urdu but contains letters from another alphabet (Hindi, Bengali, Korean…). Give the correct Urdu word in Urdu (Arabic) script only. English product words may stay in Latin letters.",
        `Return JSON {"fixes":[{"bad":"","good":""}]}. Words: ${JSON.stringify(bad.slice(0, 60))}`, { maxTokens: 2000, temperature: 0 });
      for (const f of (fx.fixes || [])) {
        if (!f?.bad || !f?.good || foreignWords(String(f.good)).length) continue;
        FIELDS.forEach((k) => { if (r[k]) r[k] = String(r[k]).split(f.bad).join(f.good); });
        r.faq = (r.faq || []).map((q: any) => ({ q: String(q?.q || "").split(f.bad).join(f.good), a: String(q?.a || "").split(f.bad).join(f.good) }));
      }
    } catch (e) { await ctx.log("warn", "Couldn't fix the wrong-alphabet words: " + ((e as Error).message || e)); }
    bad = foreignWords(allText());
  }
  // Urdu copy of an agent article follows the English one live when auto-publish is on and nothing is left to fix
  const s = ctx.s;
  const autoUr = !!(s.auto_publish && !s.manual_approval && !bad.length && art.ai_generated && ["published", "scheduled"].includes(art.status));
  const keep = (art.body_md.match(/\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g) || []).length, got = (String(r.body_md).match(/\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g) || []).length;
  const row = { slug: art.slug, lang: "ur", translation_of: art.id, title: clip(r.title, 140), excerpt: clip(r.excerpt || "", 390), answer_summary: clip(r.answer_summary || "", 880),
    body_md: String(r.body_md).replace(/^#\s+/gm, "## ").slice(0, 59000), faq: (r.faq || []).filter((f: any) => f?.q && f?.a).slice(0, 8),
    seo_title: clip(r.seo_title || "", 60), meta_description: clip(r.meta_description || "", 158), category_id: art.category_id, tags: art.tags, cover_image: art.cover_image,
    sources: art.sources, product_ids: art.product_ids, author_name: art.author_name, ai_generated: true,
    status: autoUr ? art.status : "review", ...(autoUr && art.status === "scheduled" ? { scheduled_at: art.scheduled_at } : {}), needs_review: !autoUr,
    review_notes: [{ level: autoUr ? "info" : "check", agent: "translator", message: `Machine translation — please have an Urdu reader check it.${keep !== got ? ` Links: ${got} of ${keep} kept.` : ""}` },
      ...(bad.length ? [{ level: "check", agent: "translator", message: `Words in the wrong alphabet still need fixing: ${bad.slice(0, 12).join(", ")}` }] : [])] };
  const { data: existing } = await ctx.db.from("blog_posts").select("id,status").eq("translation_of", art.id).eq("lang", "ur").maybeSingle();
  if (existing) { if (existing.status === "published") throw new Fatal("The Urdu version is already published; edit it in the admin instead."); await save(ctx, existing.id, row); }
  else { const { error } = await ctx.db.from("blog_posts").insert(row); if (error) throw new RetryLater("Couldn't save the translation: " + error.message, 30); }
  await ctx.log("info", `Urdu version of "${art.title}" ${autoUr ? (art.status === "published" ? "published with the English one" : "scheduled with the English one") : "saved for review"}`);
  return { result: { title: row.title } };
}

/* ======================= REFRESHER (improve an existing article) ======================= */
export async function refresher(ctx: Ctx): Promise<Out> {
  const art = await post(ctx);
  const reason = String(ctx.job.payload?.reason || "Refresh outdated information and improve usefulness.");
  const sources = [...(await web.medlinePlus(art.focus_query || art.title, 2)), ...(await web.wikipedia(art.focus_query || art.title, 2))];
  for (const s of art.sources || []) if (!sources.some((x) => x.url === s.url) && web.hostOk(s.url, ctx.s.trusted_sources || [])) { const f = await web.fetchSource(s.url, ctx.s.trusted_sources || []); if (f) sources.push(f); }
  const r = await ctx.ai("refresher").json(writerRules(ctx),
    `Improve this published health article. Reason: ${reason}\nKeep what works, fix what is weak, keep existing internal links and [[product:...]] lines unless they no longer fit. Same length range or a little longer.\n
CURRENT TITLE: ${art.title}\nCURRENT QUICK ANSWER: ${art.answer_summary}\nCURRENT BODY:\n${art.body_md.slice(0, 16000)}\nCURRENT FAQ: ${JSON.stringify(art.faq)}

Sources:\n${sources.slice(0, 6).map((x, i) => `[${i + 1}] ${x.title} — ${x.url}\n${x.text.slice(0, 2500)}`).join("\n\n")}

${WRITER_SCHEMA.replace('{"title"', '{"change_summary":"what you changed and why, 1–3 sentences","title"')}`, { maxTokens: 8192, temperature: 0.5 });
  if (!r.body_md || String(r.body_md).length < 1500) throw new RetryLater("The update came back too short", 30);
  const proposal = { title: clip(r.title || art.title, 140), excerpt: clip(r.excerpt || art.excerpt, 390), answer_summary: clip(r.answer_summary || art.answer_summary, 880),
    body_md: String(r.body_md).replace(/^#\s+/gm, "## ").slice(0, 59000), faq: (r.faq || art.faq).slice(0, 8),
    sources: sources.filter((x, i) => (r.sources_used || []).map(Number).includes(i + 1) || String(r.body_md).includes(x.url)).map((x) => ({ title: x.title, url: x.url, publisher: x.publisher })),
    change_summary: clip(r.change_summary || "", 500), reason, at: new Date().toISOString() };
  if (art.status === "published") {
    // a live article is never changed silently: the update waits in the editor for "Apply update"
    await save(ctx, art.id, { quality: { ...(art.quality || {}), proposed: proposal } });
    await ctx.log("info", `Proposed update ready for "${art.title}" — open it in Articles and press Apply update`);
    if (ctx.job.payload?.reco_id) await ctx.db.from("blog_recommendations").update({ status: "done" }).eq("id", ctx.job.payload.reco_id);
    return { result: { proposed: true, change_summary: proposal.change_summary } };
  }
  await save(ctx, art.id, { title: proposal.title, excerpt: proposal.excerpt, answer_summary: proposal.answer_summary, body_md: proposal.body_md, faq: proposal.faq, sources: proposal.sources.length ? proposal.sources : art.sources });
  return { result: { updated: true }, next: [{ agent: "linker", payload: { post_id: art.id, source_text: sources.map((x) => ({ url: x.url, title: x.title, text: x.text.slice(0, 1800) })) }, post_id: art.id }] };
}

/* ======================= PERFORMANCE MONITOR ======================= */
export async function monitor(ctx: Ctx): Promise<Out> {
  const { data: posts } = await ctx.db.from("blog_posts").select("id,slug,title,published_at,content_updated_at,focus_query").eq("status", "published").eq("lang", "en");
  const bySlug: Record<string, any> = Object.fromEntries((posts || []).map((p: any) => [p.slug, p]));
  const since = new Date(Date.now() - 8 * 864e5).toISOString();
  // 1. our own numbers → daily rows
  const { data: ev } = await ctx.db.from("blog_events").select("post_slug,event,created_at").gte("created_at", since).limit(50000);
  const agg: Record<string, any> = {};
  (ev || []).forEach((e: any) => { const p = bySlug[e.post_slug]; if (!p) return; const day = new Date(new Date(e.created_at).getTime() + PK).toISOString().slice(0, 10); const k = p.id + day;
    agg[k] ||= { post_id: p.id, day, source: "site", views: 0, product_clicks: 0, ai_referrals: 0 };
    if (e.event === "read") agg[k].views++; else if (e.event === "product_click") agg[k].product_clicks++; else if (e.event === "ai_referral") agg[k].ai_referrals++; });
  if (Object.keys(agg).length) await ctx.db.from("blog_metrics").upsert(Object.values(agg), { onConflict: "post_id,day,source" });
  // 2. Google Search Console (if connected)
  let gscRows = 0; const gscByPost: Record<string, { clicks: number; impressions: number; pos: number[]; queries: any[] }> = {};
  const newTopics: string[] = [];
  if (ctx.secrets.gsc_service_account && ctx.secrets.gsc_property) {
    try {
      const tok = await web.gscToken(ctx.secrets.gsc_service_account);
      const end = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), start = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const rows = await web.gscQuery(tok, ctx.secrets.gsc_property, { startDate: start, endDate: end, dimensions: ["date", "page"], rowLimit: 5000, dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "contains", expression: "/blog/" }] }] });
      const up: any[] = [];
      rows.forEach((r: any) => { const slug = new URL(r.keys[1]).pathname.replace(/^\/blog\//, "").replace(/\/$/, ""); const p = bySlug[slug]; if (!p) return;
        up.push({ post_id: p.id, day: r.keys[0], source: "gsc", clicks: r.clicks, impressions: r.impressions, position: r.position });
        const g = (gscByPost[p.id] ||= { clicks: 0, impressions: 0, pos: [], queries: [] }); g.clicks += r.clicks; g.impressions += r.impressions; g.pos.push(r.position); });
      if (up.length) await ctx.db.from("blog_metrics").upsert(up, { onConflict: "post_id,day,source" });
      gscRows = up.length;
      const qrows = await web.gscQuery(tok, ctx.secrets.gsc_property, { startDate: start, endDate: end, dimensions: ["query", "page"], rowLimit: 2000 });
      qrows.forEach((r: any) => { const path = new URL(r.keys[1]).pathname; const slug = path.startsWith("/blog/") ? path.slice(6) : null; const p = slug && bySlug[slug];
        if (p) (gscByPost[p.id] ||= { clicks: 0, impressions: 0, pos: [], queries: [] }).queries.push({ q: r.keys[0], impressions: r.impressions, position: Math.round(r.position) });
        else if (!slug && r.impressions >= 20 && r.position > 10) newTopics.push(r.keys[0]); });
    } catch (e) { await ctx.log("warn", (e as Error).message); }
  }
  // 3. recommendations (rules, no AI needed)
  const { data: open } = await ctx.db.from("blog_recommendations").select("post_id,kind").in("status", ["open", "queued"]);
  const has = (id: string, kind: string) => (open || []).some((o: any) => o.post_id === id && o.kind === kind);
  const recos: any[] = [];
  const now = Date.now();
  const { data: perf } = await ctx.db.from("blog_events").select("post_slug").eq("event", "read").gte("created_at", new Date(now - 30 * 864e5).toISOString()).limit(50000);
  const reads: Record<string, number> = {}; (perf || []).forEach((e: any) => (reads[e.post_slug] = (reads[e.post_slug] || 0) + 1));
  for (const p of posts || []) {
    const age = (now - new Date(p.content_updated_at || p.published_at).getTime()) / 864e5, g = gscByPost[p.id];
    if (age > 365 && !has(p.id, "refresh")) recos.push({ post_id: p.id, kind: "refresh", message: `Last updated ${Math.round(age / 30)} months ago — check that advice and sources are still current.` });
    if (g && g.impressions >= 200 && g.clicks / g.impressions < 0.01 && !has(p.id, "improve_ctr")) recos.push({ post_id: p.id, kind: "improve_ctr", message: `${g.impressions} Google impressions but only ${g.clicks} clicks in 30 days — a clearer title and description could earn more clicks.` });
    const pos = g && g.pos.length ? g.pos.reduce((a, b) => a + b, 0) / g.pos.length : 0;
    if (pos >= 8 && pos <= 20 && !has(p.id, "expand")) recos.push({ post_id: p.id, kind: "expand", message: `Average Google position ${pos.toFixed(1)} — close to page one. Expanding it to answer: ${(g!.queries || []).sort((a, b) => b.impressions - a.impressions).slice(0, 4).map((q) => `“${q.q}”`).join(", ") || "related questions"} could help.` });
    if ((now - new Date(p.published_at).getTime()) / 864e5 > 30 && !reads[p.slug] && !has(p.id, "add_links")) recos.push({ post_id: p.id, kind: "add_links", message: "No reads in the last 30 days — link to it from related articles and from the tests page." });
  }
  if (recos.length) await ctx.db.from("blog_recommendations").insert(recos.slice(0, 30));
  // 4. questions the site is seen for but has no guide → topic ideas
  let added = 0;
  for (const q of [...new Set(newTopics)].slice(0, 10)) {
    const { data: sim } = await ctx.db.rpc("blog_similar", { p_text: q, p_min: 0.45 });
    if (sim && sim.length) continue;
    const { error } = await ctx.db.from("blog_topics").insert({ query: q.slice(0, 200), source: "search-console", score: 65, notes: "Site already appears in Google for this; no guide yet." });
    if (!error) added++;
  }
  await ctx.log("info", `Updated numbers (${Object.keys(agg).length} site rows, ${gscRows} Search Console rows), ${recos.length} recommendation(s), ${added} topic idea(s)`);
  return { result: { site_rows: Object.keys(agg).length, gsc_rows: gscRows, recommendations: recos.length, topics_added: added, gsc: !!ctx.secrets.gsc_service_account } };
}

export const AGENTS: Record<string, (ctx: Ctx) => Promise<Out>> = { ping, scout, planner, researcher, writer, linker, imager, reviewer, publisher, translator, refresher, monitor };
