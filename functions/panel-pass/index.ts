// panel-pass: one-click sign-in to another admin panel (Divaar.pk, Minzu Crafts, ...).
// Only people in admin_panel_access (the main owner and whoever they grant). Uses that project's service key (saved in admin_panel_keys, never sent to a browser)
// to create a one-time magic link for the owner's own email, then the browser follows it and lands
// signed in on that panel's admin. The link works once and expires within an hour.
const URL_ = Deno.env.get("SUPABASE_URL")!, KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey" };
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const svc = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json" };
const get = async (q: string) => (await (await fetch(`${URL_}/rest/v1/${q}`, { headers: svc })).json());
const log = (actor: string, action: string, detail: unknown) =>
  fetch(`${URL_}/rest/v1/audit_log`, { method: "POST", headers: svc, body: JSON.stringify({ actor_email: actor, action, area: "panels", detail }) });

// New-style keys (sb_secret_...) go in apikey only; old JWT service keys also go in Authorization.
const target = (k: string) => ({ apikey: k, ...(k.startsWith("eyJ") ? { authorization: `Bearer ${k}` } : {}), "content-type": "application/json" });

async function findUser(sb: string, k: string, email: string) {
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(`${sb}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: target(k) });
    if (r.status === 401 || r.status === 403) throw new Error("The saved key was refused by that project. Save its service key again.");
    if (!r.ok) throw new Error(`That project did not answer (${r.status}).`);
    const j = await r.json(), list = (j.users || []) as { email?: string }[];
    if (list.some((u) => (u.email || "").toLowerCase() === email)) return true;
    if (list.length < 200) return false;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const who = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: KEY, authorization: req.headers.get("authorization") ?? "" } });
    if (!who.ok) return out({ error: "Not signed in" }, 401);
    const uid = (await who.json()).id;
    const me = (await get(`profiles?id=eq.${uid}&active=eq.true&select=email,role`))[0];
    const acc = (await get(`admin_panel_access?profile_id=eq.${uid}&select=is_main`))[0];
    if (!me || !acc) return out({ error: "You do not have access to admin panels" }, 403);

    const b = await req.json().catch(() => ({}));
    if (!/^[0-9a-f-]{36}$/.test(String(b.id || ""))) return out({ error: "Pick a panel" }, 400);
    const p = (await get(`admin_panels?id=eq.${b.id}&select=*`))[0];
    if (!p || (!p.active && !acc.is_main)) return out({ error: "Panel not found" }, 404);
    const k = (await get(`admin_panel_keys?panel_id=eq.${b.id}&select=service_key`))[0]?.service_key;
    if (!k || !p.sb_url) return out({ url: p.admin_url, plain: true });

    // Only the main owner may use "Sign in as"; everyone else always signs in as themselves.
    const email = String((acc.is_main && p.sign_in_email) || me.email).toLowerCase();
    if (!(await findUser(p.sb_url, k, email)))
      return out({ error: `${p.name} has no account for ${email}. Add it there, or set "Sign in as" for this panel.` }, 400);
    if (b.action === "check") return out({ ok: true, email });

    const r = await fetch(`${p.sb_url}/auth/v1/admin/generate_link`, {
      method: "POST", headers: target(k), body: JSON.stringify({ type: "magiclink", email, redirect_to: p.admin_url }),
    });
    const j = await r.json().catch(() => ({}));
    const link = j.action_link || j.properties?.action_link;
    if (!r.ok || !link) return out({ error: j.msg || j.error_description || "That project would not create a sign-in link" }, 400);
    await log(me.email, "Opened admin panel", { name: p.name, as: email });
    return out({ url: link });
  } catch (e) {
    return out({ error: (e as Error).message || "Something went wrong" }, 500);
  }
});
