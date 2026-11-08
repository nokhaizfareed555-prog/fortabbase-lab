// daily-check: runs at 8am Pakistan time and, if that found a problem, again at 9am. Emails one recipient only when something is wrong.
// Site speed is deliberately not checked here. Called by pg_cron with the shared hook secret, or by signed-in staff for a test email.
import { buildMessage, Smtp } from "../send-email/smtp.ts";
const URL_ = Deno.env.get("SUPABASE_URL")!, KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, SITE = "https://fortabbaspolyclinic.com";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey" };
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const svc = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };
const rows = async (q: string) => { const r = await fetch(`${URL_}/rest/v1/${q}`, { headers: svc }); if (!r.ok) throw new Error(`read ${r.status}`); return await r.json(); };
const rpc = async (n: string) => { const r = await fetch(`${URL_}/rest/v1/rpc/${n}`, { method: "POST", headers: svc, body: "{}" }); if (!r.ok) throw new Error(`rpc ${r.status}`); return await r.json(); };
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
type Issue = { title: string; detail: string; where: string };

async function pageIssue(path: string, label: string): Promise<Issue | null> {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(SITE + path, { signal: AbortSignal.timeout(25000), redirect: "follow" });
      if (r.ok && (await r.text()).includes("data-page")) return null;
    } catch { /* tried again below */ }
    await new Promise((d) => setTimeout(d, 4000));
  }
  return { title: `${label} is not loading`, detail: `${SITE}${path} did not open after three tries.`, where: "Website" };
}

async function findIssues(): Promise<Issue[]> {
  const found: Issue[] = [];
  try { found.push(...await rpc("_health_issues")); }
  catch { found.push({ title: "The clinic data could not be checked", detail: "The database did not answer the daily check.", where: "Database" }); }
  for (const [p, l] of [["/", "The home page"], ["/lab-tests", "The lab tests page"], ["/reports", "The reports page"]]) { const x = await pageIssue(p, l); if (x) found.push(x); }
  return found;
}

async function send(to: string, subject: string, intro: string, issues: Issue[]) {
  const [sec] = await rows("blog_secrets?id=eq.1&select=resend_api_key,smtp_password"), [set] = await rows("blog_settings?id=eq.1&select=email_from,email_reply_to,email_provider,smtp_user,smtp_name");
  const text = `${intro}\n\n${issues.map((x, i) => `${i + 1}. ${x.title}\n   ${x.detail}\n   Where: ${x.where}`).join("\n\n")}\n\nOpen the admin panel: ${SITE}/admin`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#14396f"><h2 style="margin:0 0 12px">${esc(subject)}</h2><p style="color:#333">${esc(intro)}</p>${issues.map((x) => `<div style="border-inline-start:4px solid #d81f26;padding:8px 12px;margin:10px 0;background:#f7f8fb"><b>${esc(x.title)}</b><br><span style="color:#333">${esc(x.detail)}</span><br><small style="color:#667">Where: ${esc(x.where)}</small></div>`).join("")}<p><a href="${SITE}/admin" style="color:#14396f;font-weight:bold">Open the admin panel</a></p></div>`;
  if (set?.email_provider === "smtp") {
    if (!set.smtp_user || !sec?.smtp_password) throw new Error("The clinic mailbox is not set up in Messages > Email setup");
    const smtp = await Smtp.open(set.smtp_user, sec.smtp_password);
    try { await smtp.send(set.smtp_user, to, buildMessage({ fromName: set.smtp_name, from: set.smtp_user, to, replyTo: set.email_reply_to, subject, text, html })); } finally { await smtp.quit().catch(() => {}); }
  } else {
    if (!sec?.resend_api_key || !set?.email_from) throw new Error("Email is not set up in Messages > Email setup");
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${sec.resend_api_key}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000), body: JSON.stringify({ from: set.email_from, to: [to], subject, html, text }) });
    if (!r.ok) throw new Error(`Email provider refused the message (${r.status})`);
  }
}

async function logMail(to: string, subject: string, error: string | null) {
  await fetch(`${URL_}/rest/v1/email_log`, { method: "POST", headers: svc, body: JSON.stringify({ actor: "Daily check", template: null, recipient: to, subject, status: error ? "failed" : "sent", error }) });
}

async function deliver(to: string, subject: string, intro: string, issues: Issue[]) {
  if (!to) return "No alert email is set in Live optimization";
  try { await send(to, subject, intro, issues); await logMail(to, subject, null); return null; }
  catch (e) { const m = String((e as Error).message).slice(0, 300); await logMail(to, subject, m); return m; }
}

async function run(which: "morning" | "recheck") {
  const day = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
  const set = await rpc("_health_settings");
  if (set.on === false) return { skipped: "off" };
  if (which === "recheck") {
    const [m] = await rows(`health_checks?day=eq.${day}&run=eq.morning&select=issues`);
    if (!m || !m.issues?.length) return { skipped: "nothing to recheck" };
  }
  const issues = await findIssues();
  const ins = await fetch(`${URL_}/rest/v1/health_checks?on_conflict=day,run`, { method: "POST", headers: { ...svc, Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ day, run: which, issues, recipient: set.email || "" }) });
  const [row] = await ins.json();
  if (!row) return { skipped: "already ran" }; // never email twice for the same run
  if (!issues.length) return { ok: true, issues: 0 };
  const n = issues.length, what = `${n} issue${n === 1 ? "" : "s"}`;
  const subject = which === "morning" ? `Action needed: ${what} found on the clinic website` : `Still not fixed: ${what} on the clinic website`;
  const intro = which === "morning" ? "This morning's 8am check found the problems below. They will be checked again at 9am." : "The 9am recheck found these problems are still open.";
  const error = await deliver(set.email || "", subject, intro, issues);
  await fetch(`${URL_}/rest/v1/health_checks?id=eq.${row.id}`, { method: "PATCH", headers: svc, body: JSON.stringify({ sent: !error, email_error: error }) });
  return { ok: !error, issues: n, error };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const b = await req.json().catch(() => ({}));
  const [sec] = await rows("blog_secrets?id=eq.1&select=hook_secret");
  const given = req.headers.get("x-hook-secret") || "";
  if (sec?.hook_secret && given.length === sec.hook_secret.length && given === sec.hook_secret) {
    if (b.run !== "morning" && b.run !== "recheck") return out({ error: "Unknown run" }, 400);
    try { return out(await run(b.run)); } catch (e) { return out({ error: String((e as Error).message) }, 500); }
  }
  const who = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, authorization: req.headers.get("authorization") ?? "" } });
  if (!who.ok) return out({ error: "Not signed in" }, 401);
  const [me] = await rows(`profiles?id=eq.${(await who.json()).id}&active=eq.true&select=role,perms`);
  if (!me || !(me.role === "owner" || me.perms?.optimize === true)) return out({ error: "Not allowed" }, 403);
  if (b.action !== "test") return out({ error: "Unknown action" }, 400);
  const set = await rpc("_health_settings");
  if (!set.email) return out({ error: "Save the alert email first" }, 400);
  const error = await deliver(set.email, "Test: clinic website daily check", "This is a test. Real alerts arrive here only when the 8am or 9am check finds a problem.", [{ title: "Example problem", detail: "A real alert lists what is wrong and the order numbers involved.", where: "Example" }]);
  return error ? out({ error }, 400) : out({ ok: true, to: set.email });
});
