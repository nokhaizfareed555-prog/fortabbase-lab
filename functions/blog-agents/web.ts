// blog-agents — everything the agents read from the web: search suggestions (what people ask), Wikipedia and
// trusted reference pages (sources), Openverse (openly licensed photos), Google Search Console, and the
// site's own page addresses (so links only ever point to real pages).
export const UA = "FortAbbasHealthBlog/1.0 (+https://fortabbaspolyclinic.com/blog/editorial-standards)";
const T = (ms: number) => AbortSignal.timeout(ms);

/* ---------------- what people search for ---------------- */
export async function suggestions(q: string): Promise<string[]> {
  const out = new Set<string>();
  const add = (arr: unknown) => Array.isArray(arr) && arr.forEach((s) => typeof s === "string" && s.length > 3 && out.add(s.toLowerCase().trim()));
  await Promise.all([
    fetch(`https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=pk&q=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA }, signal: T(4000) })
      .then((r) => (r.ok ? r.json() : null)).then((j) => j && add(j[1])).catch(() => {}),
    fetch(`https://duckduckgo.com/ac/?type=list&q=${encodeURIComponent(q)}`, { headers: { "User-Agent": UA }, signal: T(4000) })
      .then((r) => (r.ok ? r.json() : null)).then((j) => j && add(j[1])).catch(() => {})
  ]);
  return [...out];
}

/* ---------------- sources ---------------- */
export type Source = { title: string; url: string; publisher: string; text: string };

export async function wikipedia(query: string, n = 3): Promise<Source[]> {
  try {
    const s = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=${n}&srsearch=${encodeURIComponent(query)}`, { headers: { "User-Agent": UA }, signal: T(10_000) }).then((r) => r.json());
    const titles: string[] = (s.query?.search || []).map((x: any) => x.title);
    if (!titles.length) return [];
    const e = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts|info&inprop=url&explaintext=1&exsectionformat=plain&format=json&titles=${encodeURIComponent(titles.join("|"))}`, { headers: { "User-Agent": UA }, signal: T(12_000) }).then((r) => r.json());
    return Object.values(e.query?.pages || {}).filter((p: any) => p.extract && p.fullurl)
      .map((p: any) => ({ title: p.title, url: p.fullurl, publisher: "Wikipedia", text: cleanText(p.extract).slice(0, 6000) }));
  } catch { return []; }
}

/** MedlinePlus (US National Library of Medicine): plain-language health topics, free and without a key. */
export async function medlinePlus(query: string, n = 2): Promise<Source[]> {
  try {
    const r = await fetch(`https://wsearch.nlm.nih.gov/ws/query?db=healthTopics&retmax=${n}&term=${encodeURIComponent(query)}`, { headers: { "User-Agent": UA }, signal: T(12_000) });
    if (!r.ok) return [];
    const xml = await r.text();
    const strip = (x: string) => decodeEntities(decodeEntities(x)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const field = (doc: string, name: string) => doc.match(new RegExp(`<content name="${name}">([\\s\\S]*?)</content>`))?.[1] || "";
    return [...xml.matchAll(/<document\b[^>]*\burl="([^"]+)"[^>]*>([\s\S]*?)<\/document>/g)]
      .map((m) => ({ title: strip(field(m[2], "title")), url: m[1].replace(/^http:/, "https:"), publisher: "MedlinePlus (U.S. National Library of Medicine)", text: strip(field(m[2], "FullSummary")).slice(0, 6000) }))
      .filter((x) => x.title && x.text.length > 200);
  } catch { return []; }
}

export function hostOk(url: string, trusted: string[]): boolean {
  try { const h = new URL(url).hostname.toLowerCase(); return trusted.some((d) => h === d || h.endsWith("." + d.replace(/^www\./, ""))); } catch { return false; }
}

const cleanText = (s: string) => String(s || "").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ").trim();
function htmlToText(html: string): { title: string; text: string } {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim();
  const main = html.match(/<(main|article)\b[\s\S]*?<\/\1>/i)?.[0] || html;
  const text = main.replace(/<(script|style|noscript|svg|nav|footer|header|form)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return { title: decodeEntities(title), text: cleanText(text) };
}
const decodeEntities = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** A page from a trusted domain (the admin's reference links). */
export async function fetchSource(url: string, trusted: string[]): Promise<Source | null> {
  if (!/^https:\/\//i.test(url) || !hostOk(url, trusted)) return null;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: T(12_000), redirect: "follow" });
    if (!r.ok || !/html/i.test(r.headers.get("content-type") || "")) return null;
    const { title, text } = htmlToText((await r.text()).slice(0, 600_000));
    if (text.length < 400) return null;
    return { title: title || url, url: r.url || url, publisher: new URL(r.url || url).hostname.replace(/^www\./, ""), text: text.slice(0, 6000) };
  } catch { return null; }
}

/** Is an external link alive? (HEAD, then GET) */
export async function linkAlive(url: string): Promise<boolean> {
  for (const method of ["HEAD", "GET"]) {
    try {
      const r = await fetch(url, { method, headers: { "User-Agent": UA }, signal: T(8000), redirect: "follow" });
      if (r.status < 400) return true;
      if (r.status !== 405 && r.status !== 403) return false;
    } catch { /* try GET */ }
  }
  return false;
}

/* ---------------- photos (openly licensed) ---------------- */
export type Photo = { url: string; alt: string; credit: string; license: string; license_url: string; source_url: string; width: number; height: number };
const LICENSE_NAME: Record<string, string> = { cc0: "CC0", pdm: "Public Domain Mark", by: "CC BY", "by-sa": "CC BY-SA" };
export async function openverse(q: string, shape: "wide" | "square" = "wide"): Promise<Photo[]> {
  try {
    const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm,by,by-sa&mature=false&category=photograph&aspect_ratio=${shape}&size=large&page_size=20`, { headers: { "User-Agent": UA }, signal: T(15_000) });
    if (!r.ok) { console.warn(`openverse ${r.status} for "${q}": ${(await r.text()).slice(0, 200)}`); return []; }
    const j = await r.json();
    return (j.results || []).filter((x: any) => x.url && /^https:/.test(x.url) && /\.jpe?g($|\?)/i.test(x.url) && (x.width || 0) >= 800 && LICENSE_NAME[x.license])
      .map((x: any) => ({ url: x.url, alt: String(x.title || "").slice(0, 120), credit: `${x.creator ? String(x.creator).slice(0, 80) : "Unknown"} via ${x.source || "Openverse"}`,
        license: `${LICENSE_NAME[x.license]}${x.license_version && !["cc0", "pdm"].includes(x.license) ? " " + x.license_version : ""}`,
        license_url: x.license_url || "", source_url: x.foreign_landing_url || "", width: x.width, height: x.height }));
  } catch { return []; }
}
/* Pexels: professional stock photos (free key, no attribution required). Any size is cropped for us through the image link. */
export async function pexels(key: string, q: string): Promise<Photo[]> {
  try {
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&orientation=landscape&size=large&per_page=30`, { headers: { Authorization: key, "User-Agent": UA }, signal: T(15_000) });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.photos || []).filter((x: any) => x.src?.original && x.width >= 1920 && x.height >= 1080)
      .map((x: any) => ({ url: x.src.original, alt: String(x.alt || "").slice(0, 120), credit: `${String(x.photographer || "Pexels").slice(0, 80)} via Pexels`, license: "Pexels License", license_url: "https://www.pexels.com/license/", source_url: x.url || "", width: x.width, height: x.height }));
  } catch { return []; }
}

/* ---------------- Google Search Console (read-only service account) ---------------- */
const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b as ArrayBuffer);
  let s = ""; bytes.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export async function gscToken(saJson: string): Promise<string> {
  const sa = JSON.parse(saJson);
  const pem = String(sa.private_key).replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/webmasters.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }))}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${unsigned}.${b64url(sig)}`, signal: T(15_000) });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error("Search Console sign-in failed: " + (j.error_description || j.error || r.status));
  return j.access_token;
}
export async function gscQuery(token: string, property: string, body: Record<string, unknown>): Promise<any[]> {
  const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: T(30_000) });
  const j = await r.json();
  if (!r.ok) throw new Error("Search Console: " + (j.error?.message || r.status) + (r.status === 403 ? ` — add the service-account email as a user of "${property}" in Search Console.` : ""));
  return j.rows || [];
}

/* ---------------- the site's page addresses (same rules as assets/shared.js → Store.siteUrls) ---------------- */
const slugify = (x: string) => String(x || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const RESERVED = new Set(["admin", "receipt", "policy", "policies", "product", "products", "category", "assets", "brand", "supabase", "scripts", "index", "config", "sitemap", "robots", "favicon", "apple-touch-icon", "admin-favicon", "favicon-32", "404", "api", "shop", "blog", "ur"]);
export function siteUrls(products: any[]) {
  const list = (products || []).slice().sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.id).localeCompare(String(b.id)));
  const used = new Set<string>(), byId: Record<string, string> = {};
  const catSlug = (c: string) => { let s = slugify(c) || "collection"; if (RESERVED.has(s)) s += "-collection"; return s; };
  const cat = (c: string) => "/" + catSlug(c);
  const sub = (c: string, t: string) => `${cat(c)}/${slugify(t) || "type"}`;
  list.forEach((p) => { if (p.category) { used.add(cat(p.category)); if (String(p.subcategory || "").trim()) used.add(sub(p.category, p.subcategory)); } });
  list.forEach((p) => {
    const base = (p.category ? (String(p.subcategory || "").trim() ? sub(p.category, p.subcategory) : cat(p.category)) : "/shop") + "/";
    const name = slugify([p.name, p.variant_name].filter(Boolean).join(" ")).slice(0, 70).replace(/-+$/, "") || "piece";
    let path = base + name, n = 2;
    while (used.has(path)) path = `${base}${name}-${n++}`;
    used.add(path); byId[p.id] = path;
  });
  return { cat, sub, product: (p: any) => byId[p?.id] || "/" };
}

/** Every URL path currently in the live sitemap (the source of truth for "this page exists"). */
export async function livePaths(site: string): Promise<Set<string>> {
  const out = new Set<string>(["/", "/blog"]);
  try {
    const xml = await fetch(`${site}/sitemap.xml`, { headers: { "User-Agent": UA }, signal: T(15_000) }).then((r) => r.text());
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) { try { out.add(new URL(m[1].replace(/&amp;/g, "&")).pathname.replace(/\/+$/, "") || "/"); } catch { /* skip */ } }
  } catch { /* sitemap unreachable: only DB-derived paths are used */ }
  return out;
}
