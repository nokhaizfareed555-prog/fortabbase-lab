// send-email: sends staff-written emails through Resend, one per recipient, and logs each result.
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
  const to = (Array.isArray(b.to) ? b.to : []).filter((r: any) => EMAIL.test(r?.email ?? ""));
  if (!to.length) return out({ error: "Add at least one valid email address" }, 400);
  if (to.length > 50) return out({ error: "Send to 50 people or fewer at a time" }, 400);
  if (!String(b.subject ?? "").trim() || !String(b.body ?? "").trim()) return out({ error: "Write a subject and a message" }, 400);

  const [sec, set] = [await get("blog_secrets?id=eq.1&select=resend_api_key"), await get("blog_settings?id=eq.1&select=email_from,email_reply_to")];
  if (!sec?.resend_api_key || !set?.email_from) return out({ error: "Finish Email setup first: add the Resend key and the sender address" }, 400);

  const vars = Object.fromEntries(Object.entries(b.vars ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)])) as Record<string, string>;
  let sent = 0, failed = 0, lastError = "";
  for (const [i, r] of to.entries()) {
    if (i) await new Promise((d) => setTimeout(d, 600)); // stay inside Resend's rate limit
    const v = { ...vars, name: r.name || vars.name || "Patient", email: r.email };
    const subject = fill(String(b.subject), v).replace(/[\r\n]+/g, " ").slice(0, 200);
    let status = "sent", error: string | null = null, provider_id: string | null = null;
    try {
      const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${sec.resend_api_key}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ from: set.email_from, to: [r.email], subject, html: html(fill(String(b.body), v), v.clinic || "Fort Abbas Poly Clinic"), ...(set.email_reply_to ? { reply_to: set.email_reply_to } : {}) }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok) provider_id = j.id ?? null; else { status = "failed"; error = String(j.message || res.status).slice(0, 400); }
    } catch (e) { status = "failed"; error = String((e as Error).message).slice(0, 400); }
    if (status === "sent") sent++; else { failed++; lastError = error || ""; }
    await fetch(`${URL_}/rest/v1/email_log`, { method: "POST", headers: svc, body: JSON.stringify({ actor: me.email, template: b.template || null, recipient: r.email, subject, status, error, provider_id }) });
  }
  return out({ sent, failed, error: lastError });
});
