// send-email: sends staff-written emails through the Hostinger mailbox or Resend, one per recipient, and logs each result.
import { buildMessage, Smtp, SmtpError } from "./smtp.ts";
const URL_ = Deno.env.get("SUPABASE_URL")!, KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey" };
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const svc = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };
const get = async (q: string) => (await (await fetch(`${URL_}/rest/v1/${q}`, { headers: svc })).json())[0];
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const fill = (t: string, v: Record<string, string>) => t.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k) => v[k.toLowerCase()] ?? "");
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const html = (body: string, clinic: string) => `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1b2a41;max-width:560px;margin:auto;padding:24px"><div style="font-weight:700;font-size:17px;color:#14396f;margin-bottom:18px">${esc(clinic)}</div><div>${esc(body).replace(/\n/g, "<br>")}</div></div>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const who = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, authorization: req.headers.get("authorization") ?? "" } });
  if (!who.ok) return out({ error: "Not signed in" }, 401);
  const me = await get(`profiles?id=eq.${(await who.json()).id}&active=eq.true&select=*`);
  if (!me || !(me.role === "owner" || me.perms?.messages === true)) return out({ error: "Not allowed" }, 403);

  const b = await req.json().catch(() => ({}));
  const [sec, set] = [await get("blog_secrets?id=eq.1&select=resend_api_key,smtp_password"), await get("blog_settings?id=eq.1&select=email_from,email_reply_to,email_provider,smtp_user,smtp_name")];
  const useSmtp = set?.email_provider === "smtp";
  if (b.action === "test") {
    if (!useSmtp) return out({ error: "This check is only for a Hostinger mailbox" }, 400);
    if (!set.smtp_user || !sec?.smtp_password) return out({ error: "Save the mailbox address and password first" }, 400);
    try { await (await Smtp.open(set.smtp_user, sec.smtp_password)).quit(); return out({ ok: true }); }
    catch (e) { return out({ error: e instanceof SmtpError ? e.message : "Could not check the mailbox" }, 400); }
  }
  const to = (Array.isArray(b.to) ? b.to : []).filter((r: any) => EMAIL.test(r?.email ?? "") && !/[<>]/.test(r.email));
  if (!to.length) return out({ error: "Add at least one valid email address" }, 400);
  if (to.length > 50) return out({ error: "Send to 50 people or fewer at a time" }, 400);
  if (!String(b.subject ?? "").trim() || !String(b.body ?? "").trim()) return out({ error: "Write a subject and a message" }, 400);

  if (useSmtp ? !set.smtp_user || !sec?.smtp_password : !sec?.resend_api_key || !set?.email_from) return out({ error: useSmtp ? "Finish Email setup first: add the Hostinger mailbox and its password" : "Finish Email setup first: add the Resend key and the sender address" }, 400);
  let smtp: Smtp | null = null, dead = "";
  if (useSmtp) try { smtp = await Smtp.open(set.smtp_user, sec.smtp_password); } catch (e) { return out({ error: e instanceof SmtpError ? e.message : "Could not reach the mail server" }, 400); }

  const vars = Object.fromEntries(Object.entries(b.vars ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)])) as Record<string, string>;
  let sent = 0, failed = 0, lastError = "";
  for (const [i, r] of to.entries()) {
    if (i) await new Promise((d) => setTimeout(d, 600)); // stay inside the provider's rate limit
    const v = { ...vars, name: r.name || vars.name || "Patient", email: r.email };
    const subject = fill(String(b.subject), v).replace(/[\r\n]+/g, " ").slice(0, 200);
    let status = "sent", error: string | null = null, provider_id: string | null = null;
    try {
      const text = fill(String(b.body), v), page = html(text, v.clinic || "Fort Abbas Poly Clinic");
      if (useSmtp) {
        if (dead) throw new SmtpError(dead);
        if (!smtp) smtp = await Smtp.open(set.smtp_user, sec.smtp_password);
        await smtp.send(set.smtp_user, r.email, buildMessage({ fromName: set.smtp_name, from: set.smtp_user, to: r.email, replyTo: set.email_reply_to, subject, text, html: page }));
      } else {
        const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${sec.resend_api_key}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000),
          body: JSON.stringify({ from: set.email_from, to: [r.email], subject, html: page, ...(set.email_reply_to ? { reply_to: set.email_reply_to } : {}) }) });
        const j = await res.json().catch(() => ({}));
        if (res.ok) provider_id = j.id ?? null; else { status = "failed"; error = String(j.message || res.status).slice(0, 400); }
      }
    } catch (e) {
      status = "failed"; error = String((e as Error).message).slice(0, 400);
      if (useSmtp) { // a refused address keeps the connection; anything else opens a new one for the next person
        if (e instanceof SmtpError && e.auth) dead = e.message;
        try { await smtp?.reset(); } catch { smtp?.close(); smtp = null; }
      }
    }
    if (status === "sent") sent++; else { failed++; lastError = error || ""; }
    await fetch(`${URL_}/rest/v1/email_log`, { method: "POST", headers: svc, body: JSON.stringify({ actor: me.email, template: b.template || null, recipient: r.email, subject, status, error, provider_id }) });
  }
  await smtp?.quit();
  return out({ sent, failed, error: lastError });
});
