// staff-admin: create or remove login accounts. Needs the service key, so it runs on the server only.
const URL_ = Deno.env.get("SUPABASE_URL")!, KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey" };
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const svc = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };
const row = async (q: string) => (await (await fetch(`${URL_}/rest/v1/profiles?${q}&select=*`, { headers: svc })).json())[0];
const log = (actor: string, action: string, email: string) => fetch(`${URL_}/rest/v1/audit_log`, { method: "POST", headers: svc, body: JSON.stringify({ actor_email: actor, action, area: "users", detail: { email } }) });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const who = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, authorization: req.headers.get("authorization") ?? "" } });
  if (!who.ok) return out({ error: "Not signed in" }, 401);
  const me = await row(`id=eq.${(await who.json()).id}&active=eq.true`);
  if (!me || me.role === "user") return out({ error: "Not allowed" }, 403);
  const b = await req.json();

  if (b.action === "create") {
    if (b.role === "owner" && me.role !== "owner") return out({ error: "Not allowed" }, 403);
    const r = await fetch(`${URL_}/auth/v1/admin/users`, { method: "POST", headers: svc, body: JSON.stringify({ email: b.email, password: b.password, email_confirm: true }) });
    const u = await r.json();
    if (!r.ok) return out({ error: u.msg || "Could not create the account" }, 400);
    await fetch(`${URL_}/rest/v1/profiles`, { method: "POST", headers: svc, body: JSON.stringify({ id: u.id, email: b.email, name: b.name || "", role: b.role, perms: b.perms || {} }) });
    await log(me.email, "Added staff member", b.email);
    return out({ id: u.id });
  }
  if (b.action === "delete") {
    const t = await row(`id=eq.${b.id}`);
    if (!t || t.id === me.id || t.protected || (me.role === "admin" && t.role === "owner")) return out({ error: "Not allowed" }, 403);
    await fetch(`${URL_}/auth/v1/admin/users/${t.id}`, { method: "DELETE", headers: svc });
    await log(me.email, "Removed staff member", t.email);
    return out({ ok: true });
  }
  return out({ error: "Unknown action" }, 400);
});
