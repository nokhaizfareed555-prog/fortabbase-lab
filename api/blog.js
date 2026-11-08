// Builds blog pages on the server so search engines and AI answer engines get complete HTML.
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_ANON_KEY, SITE = "https://fortabbaspolyclinic.com";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const get = async (q) => { if (!U) return []; const r = await fetch(`${U}/rest/v1/blog_posts?${q}`, { headers: { apikey: K } }); return r.ok ? r.json() : []; };
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
export const md = (t) => String(t || "").split(/\n{2,}/).map((b) => { b = b.trim();
  if (b.startsWith("### ")) return `<h3>${inline(b.slice(4))}</h3>`; if (b.startsWith("## ")) return `<h2>${inline(b.slice(3))}</h2>`;
  if (/^[-*] /.test(b)) return `<ul>${b.split("\n").map((l) => `<li>${inline(l.replace(/^[-*] /, ""))}</li>`).join("")}</ul>`;
  return b ? `<p>${inline(b)}</p>` : ""; }).join("\n");
const shell = (title, desc, canon, body, ld) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE}${canon}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><link rel="icon" href="/favicon.png"><link rel="stylesheet" href="/assets/site.css">${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>` : ""}</head><body data-page="blog"><header class="nav" id="nav"></header><main id="main0" style="position:relative;z-index:1"><section><div class="wrap">${body}</div></section></main><footer id="foot"></footer><div class="dock" id="dock"></div><div id="main" hidden></div><script src="/assets/config.js"></script><script src="/assets/defaults.js"></script><script src="/assets/core.js"></script><script src="/assets/site.js"></script></body></html>`;
export default async function handler(req, res) {
  const { slug, sitemap } = req.query || {};
  res.setHeader("content-type", sitemap ? "application/xml" : "text/html; charset=utf-8");
  res.setHeader("cache-control", "public, s-maxage=30, stale-while-revalidate=300");
  if (sitemap) {
    const p = await get("select=slug,updated_at");
    const urls = ["/", "/tests.html", "/blog", ...p.map((x) => `/blog/${x.slug}`)];
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${SITE}${u}</loc></url>`).join("")}</urlset>`);
  }
  if (slug) {
    const [p] = await get(`select=*&slug=eq.${encodeURIComponent(slug)}&limit=1`);
    if (!p) return res.status(404).send(shell("Article not found", "", "/blog", "<h1>Article not found</h1><p><a href='/blog'>All articles</a></p>"));
    const faq = (p.faq || []).map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("");
    const src = (p.sources || []).map((s) => `<li><a href="${esc(s.url)}" rel="noopener">${esc(s.title || s.url)}</a></li>`).join("");
    const ld = { "@context": "https://schema.org", "@type": "MedicalWebPage", headline: p.title, description: p.seo_desc || p.excerpt, datePublished: p.published_at, dateModified: p.updated_at, publisher: { "@type": "MedicalClinic", name: "Fort Abbas Poly Clinic Laboratories" } };
    return res.status(200).send(shell(p.seo_title || p.title, p.seo_desc || p.excerpt, `/blog/${p.slug}`, `<article class="article"><h1>${esc(p.title)}</h1>${p.image ? `<img src="${esc(p.image)}" alt="">` : ""}${md(p.body_md)}${faq ? `<h2>Questions</h2>${faq}` : ""}${src ? `<h2>Sources</h2><ul>${src}</ul>` : ""}<p><em>This article is general information and does not replace advice from your doctor.</em></p></article>`, ld));
  }
  const ps = await get("select=slug,title,excerpt,image&order=published_at.desc");
  return res.status(200).send(shell("Health awareness | Fort Abbas Poly Clinic", "New medical discoveries, common health myths and practical information.", "/blog", `<h1>Health awareness</h1><p class="lead">New discoveries, common myths and practical health information.</p><div class="grid">${ps.map((p) => `<a class="card glass" style="text-decoration:none" href="/blog/${esc(p.slug)}">${p.image ? `<img class="top" src="${esc(p.image)}" alt="" loading="lazy">` : ""}<div class="in"><h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p></div></a>`).join("") || "<p>Articles are coming soon.</p>"}</div>`));
}
