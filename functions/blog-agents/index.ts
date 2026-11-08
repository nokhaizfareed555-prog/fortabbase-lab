// blog-agents — the Fort Abbas Poly Clinic health blog AI team (agents.ts), run by runner.ts.
// Woken by the database (public._blog_kick: every 2 minutes when work is waiting, and right after an admin action)
// with a shared secret header. It answers at once, then works through due jobs in the background:
// claim → run the agent → record the result → queue the next agent(s) → wake itself again if more is waiting.
import { db, work } from "./runner.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const { data: sec } = await db.from("blog_secrets").select("hook_secret").eq("id", 1).single();
  const given = req.headers.get("x-hook-secret") || "";
  if (!sec?.hook_secret || given.length !== sec.hook_secret.length || given !== sec.hook_secret) return new Response("Forbidden", { status: 403 });
  const p = work();
  const er = (globalThis as any).EdgeRuntime;
  if (er?.waitUntil) { er.waitUntil(p); return new Response(JSON.stringify({ ok: true, queued: true }), { status: 202, headers: { "Content-Type": "application/json" } }); }
  await p;
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
