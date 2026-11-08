// Labs: serves unreleased experiments to signed-in admin staff only. The files live in /labs, outside the public web folder.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.join(process.cwd(), "labs");
const w = {}; vm.runInNewContext(fs.readFileSync(path.join(process.cwd(), "web/assets/config.js"), "utf8"), { window: w });
const CFG = w.FA_CONFIG;

async function isStaff(auth) {
  if (!/^Bearer \S+$/.test(auth || "") || auth === "Bearer " + CFG.anon) return false;
  try {
    const r = await fetch(`${CFG.url}/rest/v1/rpc/is_active_staff`, { method: "POST", headers: { apikey: CFG.anon, authorization: auth, "content-type": "application/json" }, body: "{}", signal: AbortSignal.timeout(6000) });
    return r.ok && (await r.json()) === true;
  } catch { return false; }
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "private, no-store");
  res.setHeader("x-robots-tag", "noindex, nofollow");
  if (!(await isStaff(req.headers.authorization))) return res.status(401).json({ error: "Sign in to the admin panel to open Labs." });
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, "registry.json"), "utf8")), f = req.query?.f;
  if (!f) return res.status(200).json(list);
  if (!list.some((x) => x.id === f)) return res.status(404).json({ error: "Not found" });
  res.setHeader("content-type", "text/html; charset=utf-8");
  return res.status(200).send(fs.readFileSync(path.join(ROOT, `${f}.html`), "utf8"));
}
