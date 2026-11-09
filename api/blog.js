// Builds the health blog on the server so search engines and AI answer engines get complete HTML.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { renderBlog } from "../lib/blog.mjs";
import "../web/assets/guides/blog-md.js";
import "../web/assets/guides/blog-fonts.js";

const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_ANON_KEY, SITE = "https://fortabbaspolyclinic.com", STORE = "Fort Abbas Poly Clinic", ORG_ID = `${SITE}/#clinic`;
const MD = globalThis.BlogMD, BF = globalThis.BlogFonts;
const COLS = "id,slug,lang,translation_of,title,seo_title,meta_description,excerpt,answer_summary,body_md,faq,cover_image,category_id,tags,is_pillar,pillar_id,status,published_at,content_updated_at,author_name,sources,product_ids,featured,noindex,word_count,reading_minutes,ai_generated,reviewed_at,created_at,updated_at";
const H = { apikey: K, authorization: `Bearer ${K}` };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const short = (s, n) => { s = String(s || "").trim(); if (s.length <= n) return s; const c = s.slice(0, n); return c.slice(0, c.lastIndexOf(" ") > n * 0.6 ? c.lastIndexOf(" ") : n).replace(/[\s,.;:–—-]+$/, "") + "…"; };
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;
const isoDay = (d) => { const t = new Date(d); return isNaN(t) ? null : t.toISOString().slice(0, 10); };
const safeUrl = (u) => { try { const x = new URL(String(u), SITE + "/"); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };
const get = async (path) => { const r = await fetch(`${U}/rest/v1/${path}`, { headers: H }); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); };
const merge = (d, v) => { if (v === undefined || v === null) return d; if (Array.isArray(v) || typeof v !== "object" || typeof d !== "object" || Array.isArray(d) || d === null) return v; const o = { ...d }; for (const k in v) o[k] = merge(d[k], v[k]); return o; };
const defaults = (() => { const w = {}; vm.runInNewContext(readFileSync(new URL("../web/assets/defaults.js", import.meta.url), "utf8"), { window: w }); return w.FA_DEFAULTS; })();
async function tests() {
  const rows = await get("site_sections?select=key,data&key=eq.tests").catch(() => []);
  return merge(defaults.tests, rows[0]?.data);
}
const headTags = ({ title, description, url, image, type = "website", extra = "", index = true }) => `<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(url)}"><meta name="robots" content="${index ? "index,follow,max-image-preview:large" : "noindex,follow"}"><meta property="og:type" content="${type}"><meta property="og:site_name" content="${STORE}"><meta property="og:locale" content="en_PK"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(image || `${SITE}/img/clinic.webp`)}"><meta name="twitter:card" content="summary_large_image">${extra}`;
const shopPage = ({ head, bodyClass, ssr }) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${head}<link rel="icon" href="/favicon.png"><link rel="stylesheet" href="/assets/site.css">${ld({ "@context": "https://schema.org", "@type": "MedicalClinic", "@id": ORG_ID, name: "Fort Abbas Poly Clinic Laboratories", url: SITE })}</head><body data-page="blog" class="${bodyClass}"><header class="nav" id="nav"></header><div style="position:relative;z-index:1">${ssr}</div><footer id="foot"></footer><div class="dock" id="dock"></div><div id="main" hidden></div><script src="/assets/config.js"></script><script src="/assets/defaults.js"></script><script src="/assets/core.js?v=20261110fx1"></script><script src="/assets/footer.js"></script><script src="/assets/site.js"></script></body></html>`;
const crumbsHtml = (items) => `<nav class="seo-crumbs" aria-label="Breadcrumb"><ol>${items.map(([n, u], i) => `<li>${u && i < items.length - 1 ? `<a href="${esc(u)}">${esc(n)}</a>` : `<span aria-current="page">${esc(n)}</span>`}</li>`).join("")}</ol></nav>`;
const crumbsLd = (items) => ({ "@type": "BreadcrumbList", itemListElement: items.map(([n, u], i) => ({ "@type": "ListItem", position: i + 1, name: n, ...(u ? { item: u } : {}) })) });

let cache = null;
async function build() {
  if (cache && Date.now() - cache.at < 30_000) return cache;
  const [posts, categories, settings, t] = await Promise.all([
    get(`blog_posts?select=${COLS}&status=eq.published&order=published_at.desc`),
    get("blog_categories?select=*&active=eq.true&order=sort"),
    fetch(`${U}/rest/v1/rpc/blog_public_settings`, { method: "POST", headers: { ...H, "content-type": "application/json" }, body: "{}" }).then((r) => r.json()),
    tests()
  ]);
  const products = (t.items || []).filter((x) => x.active !== false);
  const productPath = (p) => `/lab-tests?book=${encodeURIComponent(p.id)}`;
  const priceText = (p) => (t.showPrices && p.price !== "" && p.price != null ? `Rs ${p.price}` : "Book this test");
  const card = (p) => `<a class="blog-test-card" href="${esc(productPath(p))}"><span><small>Lab test</small><b>${esc(p.name)}</b></span><span class="go">${esc(priceText(p))} →</span></a>`;
  const out = new Map(), write = (k, v) => out.set(k, v);
  const r = renderBlog({ SITE, STORE, esc, write, shopPage, headTags, crumbsHtml, crumbsLd, ld, short, isoDay, products, productPath, S: { safeUrl, productImages: () => [] }, priceText, ORG_ID, MD, BF, validPaths: new Set(["/", "/lab-tests", "/test-panels", "/services", "/doctors", "/contact", "/reports", "/faq", "/about", "/gallery"]), blog: { posts, categories, settings }, card });
  cache = { at: Date.now(), out, r, products };
  return cache;
}
export default async function handler(req, res) {
  const q = req.query || {};
  res.setHeader("cache-control", "public, s-maxage=30, stale-while-revalidate=300");
  try {
    if (q.catalog) { const t = await tests(); res.setHeader("content-type", "application/json"); return res.status(200).send(JSON.stringify((t.items || []).filter((x) => x.active !== false).map((x) => ({ id: x.id, name: x.name, category: x.category, isPanel: !!x.isPanel })))); }
    const b = await build();
    if (q.sitemap) {
      const base = ["/", "/about", "/services", "/doctors", "/lab-tests", "/test-panels", "/gallery", "/faq", "/contact"].map((u) => ({ loc: SITE + u }));
      res.setHeader("content-type", "application/xml");
      return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...base, ...b.r.urls].map((u) => `<url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("")}</urlset>`);
    }
    const path = String(q.p || "blog").replace(/^\/+|\/+$/g, "");
    if (path === "blog/feed.xml") { res.setHeader("content-type", "application/rss+xml; charset=utf-8"); return res.status(200).send(b.out.get(path)); }
    res.setHeader("content-type", "text/html; charset=utf-8");
    if (path === "blog/search") return res.status(200).send(b.r.search(q.q || ""));
    const html = b.out.get(`${path}.html`);
    if (html) return res.status(200).send(html);
    return res.status(404).send(shopPage({ head: headTags({ title: "Article not found", description: "", url: `${SITE}/blog`, index: false }), bodyClass: "seo-blog", ssr: `<main class="wrap seo-page"><h1>Article not found</h1><p><a href="/blog">All articles</a></p></main>` }));
  } catch (e) {
    console.error(e);
    res.setHeader("cache-control", "no-store");
    res.setHeader("content-type", "text/html; charset=utf-8");
    return res.status(503).send("<!doctype html><title>Please try again</title><p>The health blog is briefly unavailable. Please try again in a minute.</p>");
  }
}
