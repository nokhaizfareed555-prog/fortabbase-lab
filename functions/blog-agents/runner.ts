// blog-agents — the job runner (index.ts serves it; tests import it directly).
// Woken by the database (public._blog_kick: every 2 minutes when work is waiting, and right after an admin action)
// with a shared secret header. It answers at once, then works through due jobs in the background:
// claim → run the agent → record the result → queue the next agent(s) → wake itself again if more is waiting.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { AI, Fatal, LimitReached, RetryLater } from "./ai.ts";
import { AGENTS, type Ctx } from "./agents.ts";

export const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const SITE = (Deno.env.get("SITE_URL") || "https://fortabbaspolyclinic.com").replace(/\/+$/, "");
const BUDGET_MS = 55_000;       // start new jobs only during the first ~minute of a run
const MAX_PARALLEL = 2;         // at most two agents working at once (keeps free AI quotas happy)

async function log(job: any, agent: string, level: "info" | "warn" | "error", message: string, data?: unknown) {
  await db.from("blog_logs").insert({ job_id: job?.id || null, run_id: job?.run_id || null, agent, level, message: String(message).slice(0, 2000), data: data ?? null });
}

async function email(subject: string, html: string) {
  try {
    const [{ data: sec }, { data: b }] = await Promise.all([
      db.from("blog_secrets").select("resend_api_key").eq("id", 1).maybeSingle(),
      db.from("blog_settings").select("notify_email,email_from").eq("id", 1).maybeSingle()
    ]);
    const to = (b?.notify_email || "").trim();
    if (!to || !sec?.resend_api_key || !b?.email_from) return false;   // no email set up: the admin panel still shows the alert
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${sec.resend_api_key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: b.email_from, to: [to], subject, html }), signal: AbortSignal.timeout(15_000) });
    return r.ok;
  } catch { return false; }
}
const escH = (s: string) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export async function runOne(): Promise<boolean> {
  const [{ data: s }, { data: secrets }, { data: keys }] = await Promise.all([
    db.from("blog_settings").select("*").eq("id", 1).single(),
    db.from("blog_secrets").select("gsc_service_account,gsc_property").eq("id", 1).single(),
    db.from("ai_keys").select("provider,value")
  ]);
  if (!s) return false;
  const { count: running } = await db.from("blog_jobs").select("id", { count: "exact", head: true }).eq("status", "running").gt("locked_at", new Date(Date.now() - 8 * 60e3).toISOString());
  if ((running || 0) >= MAX_PARALLEL) return false;

  let job: any = null;
  if (s.agents_enabled) {
    const { data, error } = await db.rpc("blog_claim");
    if (error) { console.error("[claim]", error.message); return false; }
    job = data && data.id ? data : null;
  } else {
    // paused: only the Settings connection test may run
    const { data: p } = await db.from("blog_jobs").select("id").eq("status", "queued").eq("agent", "ping").order("created_at").limit(1).maybeSingle();
    if (p) { const { data } = await db.from("blog_jobs").update({ status: "running", attempts: 1, locked_at: new Date().toISOString(), started_at: new Date().toISOString() }).eq("id", p.id).eq("status", "queued").select("*").maybeSingle(); job = data; }
  }
  if (!job) return false;

  const fn = AGENTS[job.agent];
  // each provider has its own key; the one for the provider picked in Settings is used
  const key = String((keys || []).find((k: any) => k.provider === s.provider)?.value || "");
  const sec = { ...(secrets || {}), ai_api_key: key };
  const ctx: Ctx = {
    db, s, secrets: sec, job, site: SITE,
    ai: (agent: string) => new AI(db, s, key, job.id, agent),
    log: (level, message, data) => log(job, job.agent, level, message, data)
  };
  const t0 = Date.now();
  try {
    if (!fn) throw new Fatal(`Unknown agent "${job.agent}"`);
    const out = await fn(ctx);
    // "only" = an admin asked for just this one step (e.g. re-check, new photo): don't hand over to the next agent
    const next = job.payload?.only ? [] : (out.next || []).map((n) => ({ ...n, post_id: n.post_id || (out.result as any)?.post_id || undefined }));
    const { error } = await db.rpc("blog_finish", { p_job: job.id, p_ok: true, p_result: { ...out.result, ms: Date.now() - t0 }, p_error: null, p_next: next });
    if (error) throw new RetryLater("Couldn't record the result: " + error.message, 30);
    const notify = (out.result as any)?.notify;
    if (notify) await email(`Health article ready for review: ${notify.title}`, `<p>A new health article is waiting for your approval:</p><p><b>${escH(notify.title)}</b></p><p>Open <a href="${SITE}/admin/blog#articles">${SITE}/admin/blog</a> to read, edit and approve it.</p>`);
  } catch (e) {
    const err = e as Error;
    const retry = e instanceof RetryLater ? e.seconds * Math.max(1, job.attempts) : e instanceof Fatal || e instanceof LimitReached ? null : 120 * Math.max(1, job.attempts);
    const willRetry = retry != null && job.attempts < job.max_attempts;
    await log(job, job.agent, willRetry ? "warn" : "error", `${willRetry ? "Will retry" : "Failed"}: ${err.message || err}`);
    await db.rpc("blog_finish", { p_job: job.id, p_ok: false, p_result: null, p_error: String(err.message || err).slice(0, 2000), p_next: [], p_retry_in: retry });
    if (!willRetry) {
      if (job.topic_id && ["researcher", "writer"].includes(job.agent)) await db.from("blog_topics").update({ status: "approved" }).eq("id", job.topic_id).eq("status", "writing");
      if (job.agent !== "ping") await email(`Fort Abbas blog agent failed: ${job.agent}`, `<p>The <b>${escH(job.agent)}</b> agent stopped after ${job.attempts} attempt(s):</p><p>${escH(err.message || String(err))}</p><p>Retry it from <a href="${SITE}/admin/blog#pipeline">${SITE}/admin/blog → Pipeline</a>.</p>`);
    }
  }
  return true;
}

export async function work() {
  const start = Date.now();
  let did = 0;
  while (Date.now() - start < BUDGET_MS) {
    const ran = await runOne().catch((e) => { console.error("[run]", e); return false; });
    if (!ran) break;
    did++;
  }
  // more waiting? wake up again (a fresh run gets a fresh time budget)
  if (did) {
    const { count } = await db.from("blog_jobs").select("id", { count: "exact", head: true }).eq("status", "queued").lte("run_after", new Date().toISOString());
    if (count) await db.rpc("_blog_kick");
  }
}

