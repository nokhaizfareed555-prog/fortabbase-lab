/* Fort Abbas Poly Clinic — the blog's public pages, rendered from the live database together with the shop pages
   (api/blog.js calls renderBlog). Nothing here is cached separately: publishing, editing or unpublishing an
   article in /admin/blog reaches these pages and the sitemap within about a minute.

     /blog                                 newest articles, featured, categories, search box   (+ /blog/page/2 …)
     /blog/<slug>                          an article
     /blog/category/<slug>                 a category                                          (+ /page/2 …)
     /blog/search?q=…                      search results (noindex, rendered on request)
     /blog/editorial-standards             how articles are researched, written and checked
     /blog/feed.xml                        RSS
     /ur/blog, /ur/blog/<slug>             Urdu versions (only when Urdu is switched on and translated)
*/
export const PER_PAGE = 12;


const ARROW = `<svg class="bl-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>`;
const ICON = {
  search: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,
  clock: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  wa: `<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.4-3c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.4-.3Z"/></svg>`,
  fb: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H7v4h3v8h4v-8h3l1-4h-4V8.5c0-.3.2-.5.5-.5Z"/></svg>`,
  x: `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.8 3h3.1l-6.8 7.7 8 10.3h-6.3l-4.9-6.4L5.3 21H2.2l7.3-8.3L1.8 3h6.4l4.4 5.9L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z"/></svg>`,
  link: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>`,
  prev: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>`,
  next: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`
};

export function renderBlog(h) {
  const { SITE, STORE, esc, write, shopPage, headTags, crumbsHtml, crumbsLd, ld, short, isoDay, products, productPath,
    S, priceText, ORG_ID, MD, BF, validPaths, blog, card: shopCard } = h;
  const urls = [];
  const posts = (blog && blog.posts) || [];
  const cats = ((blog && blog.categories) || []).slice().sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const pub = (blog && blog.settings) || {};
  if (!blog) return { urls, search: () => null, hasPosts: false };

  const en = posts.filter((p) => p.lang === "en");
  const ur = pub.urdu_enabled ? posts.filter((p) => p.lang === "ur") : [];
  const catById = Object.fromEntries(cats.map((c) => [c.id, c]));
  const prodById = Object.fromEntries(products.map((p) => [p.id, p]));
  const postPath = (p) => (p.lang === "ur" ? `/ur/blog/${p.slug}` : `/blog/${p.slug}`);
  const catPath = (c) => `/blog/category/${c.slug}`;
  const fmtDay = (d) => { try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Karachi" }); } catch (e) { return ""; } };
  const fmtShort = (d) => { try { return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" }); } catch (e) { return ""; } };
  const translationOf = (p) => (p.lang === "en" ? ur.find((x) => x.translation_of === p.id) : en.find((x) => x.id === p.translation_of));
  const authorOf = (p) => p.author_name || pub.author_name || `${STORE} Editorial Team`;
  const initial = (STORE[0] || "D").toUpperCase();

  // every internal address an article may link to (others are shown as plain text, never as a broken link)
  const blogPaths = new Set([...en.map(postPath), ...ur.map(postPath), "/blog", "/blog/editorial-standards", ...cats.map(catPath)]);
  const linkOk = (u) => /^https?:/i.test(u) || validPaths.has(u.split(/[?#]/)[0].replace(/\/+$/, "") || "/") || blogPaths.has(u.split(/[?#]/)[0].replace(/\/+$/, ""));
  const productOfPath = (u) => { const p = products.find((x) => productPath(x) === u.split(/[?#]/)[0]); return p ? p.id : null; };

  // the same product card as the shop and category pages (lib/site.mjs → tileHtml); clicks are counted as product clicks
  const productCard = (id) => {
    const p = prodById[id]; if (!p) return null;
    return `<aside class="blog-product-card" data-blog-product="${esc(p.id)}" aria-label="Lab test at ${esc(STORE)}">${shopCard(p)}</aside>`;
  };
  // a small product row for the side rail
  const productMini = (id) => {
    const p = prodById[id]; if (!p) return "";
    const img = (S.productImages(p).find((m) => m && m.url && !/\.(mp4|webm|mov)(\?|$)/i.test(m.url)) || {});
    return `<a class="bp-mini" href="${esc(productPath(p))}" data-blog-product="${esc(p.id)}">${img.url ? `<span class="bp-mini-img"><img src="${esc(img.thumb || img.url)}" alt="" loading="lazy" decoding="async"></span>` : `<span class="bp-mini-img"></span>`}<span class="bp-mini-txt"><b>${esc(p.name)}</b><small>${esc(priceText(p))}</small></span></a>`;
  };

  const coverUrl = (p) => { const c = p.cover_image || {}; return c.url && S.safeUrl(c.url) ? c.url : ""; };
  const cover = (p, cls, eager) => {
    const u = coverUrl(p); if (!u) return "";
    const c = p.cover_image || {};
    const op = MD.posCss(c.pos);
    return `<img class="${cls}" src="${esc(u)}" alt="${esc(c.alt || p.title)}"${op ? ` style="object-position:${op}"` : ""}${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
  };
  const excerptOf = (p, n) => short(p.excerpt || p.meta_description || MD.plain(p.body_md), n || 160);

  /* ---------- cards ---------- */
  // the standard card: photo with a frosted band (date · read time | topic), then title, summary and "Read article"
  const card = (p) => {
    const c = catById[p.category_id];
    return `<article class="blog-card">
  <a class="blog-card-img" href="${esc(postPath(p))}" tabindex="-1" aria-hidden="true">${cover(p, "", false) || `<span class="blog-card-ph"><span>${esc((c && c.name) || "Guide")}</span></span>`}
    <span class="blog-card-band"><span><b>${esc(authorOf(p).replace(/ Editorial Team$/, ""))}</b><time datetime="${esc(p.published_at)}">${esc(fmtShort(p.published_at))}</time></span>${c ? `<span class="blog-card-cat">${esc(c.name)}</span>` : ""}</span>
  </a>
  <div class="blog-card-body">
    <h3><a href="${esc(postPath(p))}">${esc(p.title)}</a>${ARROW}</h3>
    <p>${esc(excerptOf(p, 150))}</p>
    <span class="blog-card-foot"><span class="blog-meta">${ICON.clock} ${p.reading_minutes || 1} min read</span><a class="blog-read" href="${esc(postPath(p))}" aria-hidden="true" tabindex="-1">Read article ${ARROW}</a></span>
  </div>
</article>`;
  };
  // the big card at the top of the blog: the photo is the card, the words sit on it
  const heroCard = (p) => {
    const c = catById[p.category_id];
    return `<article class="blog-hero-card">
  <a class="bh-link" href="${esc(postPath(p))}" aria-label="${esc(p.title)}"></a>
  <div class="bh-img">${cover(p, "", true) || `<span class="blog-card-ph"><span>${esc((c && c.name) || "Guide")}</span></span>`}</div>
  <span class="bh-go" aria-hidden="true">${ARROW}</span>
  <div class="bh-copy">
    <span class="bh-tags">${p.featured ? `<span>Featured</span>` : `<span>Newest</span>`}${c ? `<a href="${esc(catPath(c))}">${esc(c.name)}</a>` : ""}</span>
    <h2>${esc(p.title)}</h2>
    <p>${esc(excerptOf(p, 170))}</p>
    <span class="bh-meta"><span class="bh-avatar" aria-hidden="true">${esc(initial)}</span><b>${esc(authorOf(p))}</b><span>·</span><time datetime="${esc(p.published_at)}">${esc(fmtDay(p.published_at))}</time><span>·</span><span>${p.reading_minutes || 1} min read</span></span>
  </div>
</article>`;
  };
  // a compact row (thumbnail + title) for side lists
  const rowCard = (p) => {
    const c = catById[p.category_id];
    return `<a class="blog-row" href="${esc(postPath(p))}"><span class="blog-row-img">${cover(p, "", false) || `<span class="blog-card-ph"></span>`}</span><span class="blog-row-txt">${c ? `<small>${esc(c.name)}</small>` : ""}<b>${esc(p.title)}</b><em>${esc(fmtShort(p.published_at))} · ${p.reading_minutes || 1} min</em></span></a>`;
  };
  // "Keep reading" at the bottom of every blog page: a swipeable row on phones, a grid with arrows on computers
  const moreWidget = (list, { title = "Keep reading", sub = `More articles from the ${STORE} team`, id = "more-guides" } = {}) => !list.length ? "" : `<section class="blog-more" aria-labelledby="${id}">
  <div class="blog-more-head">
    <div><span class="blog-eyebrow">From the blog</span><h2 id="${id}">${esc(title)}</h2><p>${esc(sub)}</p></div>
    <div class="blog-more-nav"><a class="blog-all" href="/blog">All articles ${ARROW}</a>${list.length > 3 ? `<button type="button" class="blog-more-btn" data-more="-1" aria-label="Previous guides">${ICON.prev}</button><button type="button" class="blog-more-btn" data-more="1" aria-label="Next guides">${ICON.next}</button>` : ""}</div>
  </div>
  <div class="blog-more-track" data-more-track>${list.map(card).join("")}</div>
</section>`;
  const latestExcept = (ids, n) => en.filter((x) => !ids.has(x.id)).slice(0, n);

  const pager = (base, page, pages) => pages < 2 ? "" : `<nav class="blog-pager" aria-label="Pages">${page > 1 ? `<a rel="prev" href="${esc(page === 2 ? base : `${base}/page/${page - 1}`)}">${ICON.prev} Newer</a>` : "<span></span>"}<span>Page ${page} of ${pages}</span>${page < pages ? `<a rel="next" href="${esc(`${base}/page/${page + 1}`)}">Older ${ICON.next}</a>` : "<span></span>"}</nav>`;
  const searchForm = (q, cls) => `<form class="blog-search${cls ? " " + cls : ""}" action="/blog/search" method="get" role="search"><label class="sr-only" for="blogQ${cls ? "2" : ""}">Search the articles</label>${ICON.search}<input id="blogQ${cls ? "2" : ""}" name="q" type="search" maxlength="80" placeholder="Search articles — e.g. HbA1c" value="${esc(q || "")}"><button class="btn btn-primary btn-sm" type="submit">Search</button></form>`;
  const catNav = (active) => {
    const used = cats.filter((c) => en.some((p) => p.category_id === c.id));
    if (!used.length) return "";
    const n = (c) => en.filter((p) => p.category_id === c.id).length;
    return `<nav class="blog-tabs" aria-label="Blog categories"><div class="blog-tabs-track"><a href="/blog"${active ? "" : ' aria-current="page"'}>View all <span>${en.length}</span></a>${used.map((c) => `<a href="${esc(catPath(c))}"${active === c.id ? ' aria-current="page"' : ""}>${esc(c.name)} <span>${n(c)}</span></a>`).join("")}</div></nav>`;
  };
  const page = (ssr, head, pageVar, lang) => {
    let html = shopPage({ head, bodyClass: "seo-blog", ssr, pageVar });
    html = html.replace("</head>", `<link rel="stylesheet" href="/assets/guides/blog.css"><link rel="stylesheet" href="/assets/guides/blog-site.css">\n<link rel="alternate" type="application/rss+xml" title="${esc(STORE)} guides" href="${SITE}/blog/feed.xml">\n</head>`)
               .replace("</body>", `<script src="/assets/guides/blog.js" defer></script>\n</body>`);
    if (lang === "ur") {
      html = html.replace(/<html lang="[^"]*"/, '<html lang="ur"');
      // Urdu: the text stays hidden for a moment while BlogFonts.guard() checks that each chosen font really
      // shows Urdu letters and swaps any that don't (CSS shows it anyway after 2.6 s if the script never runs)
      html = html.replace("</head>", `<script>document.documentElement.classList.add("bf-wait")</script>\n</head>`)
                 .replace("</body>", `<script src="/assets/guides/blog-fonts.js"></script>\n<script>(function(){var el=document.querySelector(".blog-page"),done=function(){document.documentElement.classList.remove("bf-wait")};if(!el||!window.BlogFonts){done();return}window.BlogFonts.guard(el).then(function(s){if(s.length)console.info("Urdu font swapped:",s)}).then(done,done)})();</script>\n</body>`);
    }
    // the fonts chosen in Guides admin → Settings → Fonts (Urdu pages: Nastaliq by default)
    if (BF) {
      const set = BF.pick(pub.typography, lang === "ur" ? "ur" : "en");
      const href = BF.googleHref([set]);
      // the "اردو" label on the language switch, drawn in Nastaliq even on English pages (a tiny font file with just those letters)
      const label = lang !== "ur" && ur.length ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@600&text=${encodeURIComponent("اردو")}&display=swap">\n` : "";
      html = html.replace("</head>", `${label}${href ? `<link rel="stylesheet" href="${esc(href)}">\n` : ""}<style>.blog-page{${BF.cssVars(set)}}</style>\n</head>`);
    }
    return html;
  };
  const blogHome = { "@type": "Blog", "@id": `${SITE}/blog#blog`, name: `${STORE} Health Blog`, url: `${SITE}/blog`, publisher: { "@id": ORG_ID }, inLanguage: "en-PK" };

  // words on the page around an article, in the article's language
  const L = (lang) => lang === "ur"
    ? { quick: "فوری جواب", faq: "اکثر پوچھے گئے سوالات", sources: "حوالہ جات", onPage: "اس صفحے پر", inGuide: "اس رہنمائی میں", sections: "حصے", minRead: "منٹ کا مطالعہ", published: "شائع", updated: "تازہ کاری", mentioned: "اس مضمون میں ذکر کردہ ٹیسٹ", moreGuide: "اس رہنمائی میں مزید", partOf: "ہماری رہنمائی کا حصہ:" }
    : { quick: "Quick answer", faq: "Frequently asked questions", sources: "Sources", onPage: "On this page", inGuide: "In this guide", sections: "sections", minRead: "min read", published: "Published", updated: "Updated", mentioned: "Tests mentioned in this article", moreGuide: "More in this guide", partOf: "Part of our guide:" };
  // the side button that switches between the languages an article is written in
  const langSwitch = (p, tr) => {
    if (!tr) return "";
    const en = p.lang === "en" ? p : tr, ur = p.lang === "ur" ? p : tr;
    const a = (x, label, lang) => x === p ? `<span class="bp-lang-opt on" aria-current="true" lang="${lang}">${label}</span>` : `<a class="bp-lang-opt" href="${esc(postPath(x))}" hreflang="${lang}" lang="${lang}" data-lang-switch="${lang}">${label}</a>`;
    return `<nav class="bp-lang" aria-label="Language · زبان" dir="ltr"><span class="bp-lang-ic" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg></span>${a(en, "English", "en")}${a(ur, "اردو", "ur")}</nav>`;
  };

  // the same switch on the blog home pages (/blog ↔ /ur/blog), once there are Urdu guides
  const listSwitch = (cur) => !ur.length ? "" : `<nav class="bp-lang" aria-label="Language · زبان" dir="ltr"><span class="bp-lang-ic" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg></span>${cur === "en" ? '<span class="bp-lang-opt on" aria-current="true" lang="en">English</span><a class="bp-lang-opt" href="/ur/blog" hreflang="ur" lang="ur" data-lang-switch="ur">اردو</a>' : '<a class="bp-lang-opt" href="/blog" hreflang="en" lang="en" data-lang-switch="en">English</a><span class="bp-lang-opt on" aria-current="true" lang="ur">اردو</span>'}</nav>`;

  /* ---------- article pages ---------- */
  const authorBox = (p) => {
    const reviewed = p.reviewed_at ? ` Approved for publishing by the ${esc(STORE)} team.` : "";
    // say how the article was made, truthfully: AI-assisted drafts say so; articles written by the team don't
    const how = p.ai_generated === false ? `Written by the ${esc(STORE)} team.` : `Researched and drafted with AI assistance${(p.sources || []).length ? ", checked by software against the sources listed above" : ""}.`;
    return `<section class="blog-author" aria-label="About the author"><div class="blog-author-mark" aria-hidden="true">${esc(initial)}</div><div><p class="blog-author-name">${esc(authorOf(p))}</p><p>${esc(pub.author_bio || "")}</p><p class="blog-author-note">${how}${reviewed} <a href="/blog/editorial-standards">How we write and check our guides</a>.</p></div></section>`;
  };
  const relatedOf = (p) => {
    const pool = (p.lang === "ur" ? ur : en).filter((x) => x.id !== p.id);
    const score = (x) => (x.category_id === p.category_id ? 2 : 0) + (x.pillar_id === p.id || p.pillar_id === x.id || (p.pillar_id && x.pillar_id === p.pillar_id) ? 3 : 0) + (x.tags || []).filter((t) => (p.tags || []).includes(t)).length;
    return pool.map((x) => [score(x), x]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0] || new Date(b[1].published_at) - new Date(a[1].published_at)).map(([, x]) => x);
  };
  const share = (p, url) => {
    const u = encodeURIComponent(url), t = encodeURIComponent(p.title);
    return `<div class="bp-share" aria-label="Share this article"><span>Share</span>
      <a href="https://wa.me/?text=${t}%20${u}" target="_blank" rel="noopener" aria-label="Share on WhatsApp">${ICON.wa}</a>
      <a href="https://www.facebook.com/sharer/sharer.php?u=${u}" target="_blank" rel="noopener" aria-label="Share on Facebook">${ICON.fb}</a>
      <a href="https://twitter.com/intent/tweet?url=${u}&amp;text=${t}" target="_blank" rel="noopener" aria-label="Share on X">${ICON.x}</a>
      <button type="button" data-copy-link="${esc(url)}" aria-label="Copy link">${ICON.link}</button></div>`;
  };

  [...en, ...ur].forEach((p) => {
    const path = postPath(p), url = SITE + path, c = catById[p.category_id];
    const md = MD.render(p.body_md, { linkCheck: linkOk, productOfPath, product: (id) => (p.lang === "en" || pub.urdu_enabled) ? productCard(id) : null });
    const inBody = new Set(md.productIds);
    const extraProducts = (p.product_ids || []).filter((id) => prodById[id] && !inBody.has(id)).slice(0, 3);
    const faq = (Array.isArray(p.faq) ? p.faq : []).filter((f) => f && f.q && f.a).slice(0, 10);
    const sources = (Array.isArray(p.sources) ? p.sources : []).filter((s) => s && S.safeUrl(s.url)).slice(0, 20);
    const pillar = p.pillar_id ? (p.lang === "ur" ? ur : en).find((x) => x.id === p.pillar_id) : null;
    const children = p.is_pillar ? (p.lang === "ur" ? ur : en).filter((x) => x.pillar_id === p.id) : [];
    const tr = translationOf(p);
    const crumbs = [["Home", `${SITE}/`], ["Articles", `${SITE}/blog`], ...(c ? [[c.name, SITE + catPath(c)]] : []), [p.title, url]];
    const updated = p.content_updated_at && new Date(p.content_updated_at) - new Date(p.published_at) > 864e5 ? p.content_updated_at : null;
    const toc = md.toc.filter((t) => t.level === 2);
    const coverImg = cover(p, "blog-cover-img", true);
    const ci = p.cover_image || {};
    const credit = ci.credit ? `<figcaption>${ci.source_url && S.safeUrl(ci.source_url) ? `<a href="${esc(ci.source_url)}" rel="noopener nofollow" target="_blank">${esc(ci.credit)}</a>` : esc(ci.credit)}${ci.license ? ` · ${ci.license_url && S.safeUrl(ci.license_url) ? `<a href="${esc(ci.license_url)}" rel="noopener nofollow license" target="_blank">${esc(ci.license)}</a>` : esc(ci.license)}` : ""}</figcaption>` : "";

    const body = md.html;
    // side rail: the shop pieces this guide mentions (or the newest guides when it mentions none)
    const railIds = [...new Set([...md.productIds, ...(p.product_ids || [])])].filter((id) => prodById[id]).slice(0, 4);
    const railOther = latestExcept(new Set([p.id, tr && tr.id]), 3);
    const rail = railIds.length
      ? `<div class="bp-rail-box"><p class="bp-rail-title">Tests in this article</p>${railIds.map(productMini).join("")}<a class="bp-rail-more" href="/tests.html">All lab tests ${ARROW}</a></div>`
      : railOther.length ? `<div class="bp-rail-box"><p class="bp-rail-title">New on the blog</p>${railOther.map(rowCard).join("")}</div>` : "";
    const tocList = toc.map((t, i) => `<li><a href="#${esc(t.id)}" data-toc="${esc(t.id)}"><span>${String(i + 1).padStart(2, "0")}</span>${esc(t.text)}</a></li>`).join("");
    // bottom widget: closest matches first, then the newest guides, so it is never empty while other guides exist
    const rel = relatedOf(p);
    const more = [...rel, ...(p.lang === "ur" ? ur : en).filter((x) => x.id !== p.id && !rel.includes(x))].slice(0, 6);

    const t = L(p.lang);
    const ssr = `<main class="seo-page wrap blog-page blog-post-page" id="seo"${p.lang === "ur" ? ' dir="rtl" lang="ur"' : ""}>
  <div class="bp-progress" aria-hidden="true"><span></span></div>
  ${langSwitch(p, tr)}
  ${crumbsHtml(crumbs)}
  <article class="blog-article" data-blog-slug="${esc(p.slug)}">
    <header class="bp-head">
      <div class="bp-head-tags">${c ? `<a class="blog-pill" href="${esc(catPath(c))}">${esc(c.name)}</a>` : ""}${p.is_pillar ? `<span class="blog-pill soft">Complete guide</span>` : ""}<span class="blog-pill soft">${ICON.clock} ${p.reading_minutes || 1} ${t.minRead}</span></div>
      <h1>${esc(p.title)}</h1>
      ${p.excerpt ? `<p class="blog-dek">${esc(p.excerpt)}</p>` : ""}
      <div class="bp-byline">
        <span class="bh-avatar" aria-hidden="true">${esc(initial)}</span>
        <p class="blog-meta"><a href="#author"><b>${esc(authorOf(p))}</b></a><br>${t.published} <time datetime="${esc(p.published_at)}">${esc(fmtDay(p.published_at))}</time>${updated ? ` · ${t.updated} <time datetime="${esc(updated)}">${esc(fmtDay(updated))}</time>` : ""}${tr ? ` · <a href="${esc(postPath(tr))}" hreflang="${tr.lang}" lang="${tr.lang}">${tr.lang === "ur" ? "اردو میں پڑھیں" : "Read in English"}</a>` : ""}</p>
        ${share(p, url)}
      </div>
    </header>
    ${coverImg ? `<figure class="blog-cover${MD.ratioCss(ci.ratio) ? " has-ratio" : ""}"${MD.ratioCss(ci.ratio) ? ` style="--ar:${MD.ratioCss(ci.ratio)}"` : ""}>${coverImg}${credit}</figure>` : ""}
    <div class="bp-layout${toc.length >= 2 ? "" : " no-toc"}">
      <aside class="bp-rail bp-rail-l" aria-label="${t.onPage}">${toc.length >= 2 ? `<div class="bp-sticky"><p class="bp-rail-title">${t.onPage}</p><ol class="bp-toc">${tocList}</ol>${share(p, url)}</div>` : ""}</aside>
      <div class="bp-main">
        ${p.answer_summary ? `<section class="blog-answer" aria-labelledby="quick-answer"><h2 id="quick-answer"><span aria-hidden="true">⚡</span> ${t.quick}</h2><div>${MD.render(p.answer_summary, { linkCheck: linkOk }).html}</div></section>` : ""}
        ${pillar ? `<p class="blog-pillar-note">${t.partOf} <a href="${esc(postPath(pillar))}">${esc(pillar.title)}</a></p>` : ""}
        ${toc.length >= 3 ? `<details class="blog-toc"><summary>${t.inGuide} <span>${toc.length} ${t.sections}</span></summary><ol>${toc.map((t) => `<li><a href="#${esc(t.id)}">${esc(t.text)}</a></li>`).join("")}</ol></details>` : ""}
        <div class="blog-body">${body}</div>
        ${children.length ? `<section class="blog-cluster"><h2>${t.moreGuide}</h2><div class="blog-rows">${children.map(rowCard).join("")}</div></section>` : ""}
        ${faq.length ? `<section class="blog-faq" aria-labelledby="faq"><h2 id="faq">${t.faq}</h2>${faq.map((f) => `<details><summary>${esc(f.q)}</summary><div>${MD.render(f.a, { linkCheck: linkOk }).html}</div></details>`).join("")}</section>` : ""}
        ${extraProducts.length ? `<section class="blog-products" aria-labelledby="mentioned"><h2 id="mentioned">${t.mentioned}</h2><div class="blog-product-grid">${extraProducts.map(productCard).join("")}</div></section>` : ""}
        ${sources.length ? `<section class="blog-sources" aria-labelledby="sources"><h2 id="sources">${t.sources}</h2><ol>${sources.map((s) => `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.title || s.url)}</a>${s.publisher ? ` — ${esc(s.publisher)}` : ""}</li>`).join("")}</ol></section>` : ""}
        <p class="blog-med-note">${p.lang === "ur" ? "یہ مضمون عمومی معلومات کے لیے ہے اور ڈاکٹر کے مشورے کا متبادل نہیں۔ اپنی صحت کے بارے میں فیصلے کے لیے ڈاکٹر سے رجوع کریں۔ ایمرجنسی میں فوراً قریبی ہسپتال جائیں۔" : "This article is general information and does not replace advice from your doctor. Talk to a doctor about your own health, and go to the nearest hospital in an emergency."}</p>
        <div id="author">${authorBox(p)}</div>
        <div class="bp-share-end">${share(p, url)}</div>
      </div>
      <aside class="bp-rail bp-rail-r" aria-label="Lab tests">${rail ? `<div class="bp-sticky">${rail}<div class="bp-ask"><b>Have a question about a test?</b><span>Talk to our team or book a visit.</span><a class="btn btn-primary btn-sm" href="/#visit">Contact the clinic</a></div></div>` : ""}</aside>
    </div>
  </article>
  ${moreWidget(more)}
</main>`;
    const imgAbs = ci.url && S.safeUrl(ci.url) ? new URL(ci.url, SITE + "/").href : `${SITE}/brand/og-image.png`;
    const article = {
      "@type": "MedicalWebPage", "@id": `${url}#article`, headline: short(p.title, 110), description: p.meta_description || short(p.excerpt || MD.plain(p.body_md), 158),
      url, mainEntityOfPage: url, image: [imgAbs], datePublished: p.published_at, dateModified: p.content_updated_at || p.published_at,
      inLanguage: p.lang === "ur" ? "ur-PK" : "en-PK", wordCount: p.word_count || undefined,
      author: { "@type": "Organization", name: authorOf(p), url: `${SITE}/blog/editorial-standards` },
      publisher: { "@id": ORG_ID }, isPartOf: { "@id": `${SITE}/blog#blog` },
      ...(c ? { articleSection: c.name } : {}), ...((p.tags || []).length ? { keywords: p.tags.join(", ") } : {}),
      ...(sources.length ? { citation: sources.map((s) => s.url) } : {}),
      ...(extraProducts.length || md.productIds.length ? { mentions: [...new Set([...md.productIds, ...extraProducts])].map((id) => ({ "@type": "Product", name: prodById[id].name, url: SITE + productPath(prodById[id]) })) } : {})
    };
    const graph = [article, crumbsLd(crumbs)];
    if (faq.length) graph.push({ "@type": "FAQPage", "@id": `${url}#faq`, mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: MD.plain(f.a) } })) });
    const alt = tr ? [`<link rel="alternate" hreflang="${p.lang}" href="${esc(url)}">`, `<link rel="alternate" hreflang="${tr.lang}" href="${esc(SITE + postPath(tr))}">`, `<link rel="alternate" hreflang="x-default" href="${esc(SITE + postPath(p.lang === "en" ? p : tr))}">`].join("\n") : "";
    const head = headTags({ title: p.seo_title || `${short(p.title, 58)} | ${STORE}`, description: p.meta_description || short(p.excerpt || MD.plain(p.body_md), 158), url, image: imgAbs, type: "article", index: !p.noindex,
      extra: [alt, `<meta property="article:published_time" content="${esc(p.published_at)}">`, `<meta property="article:modified_time" content="${esc(p.content_updated_at || p.published_at)}">`, c ? `<meta property="article:section" content="${esc(c.name)}">` : "", ld({ "@context": "https://schema.org", "@graph": graph })].filter(Boolean).join("\n") });
    write(`${path.slice(1)}.html`, page(ssr, p.lang === "ur" ? head.replace('content="en_PK"', 'content="ur_PK"') : head, { type: "blog", slug: p.slug }, p.lang));
    if (!p.noindex) urls.push({ loc: url, lastmod: isoDay(p.content_updated_at || p.published_at), img: ci.url && S.safeUrl(ci.url) ? [imgAbs] : [], alt: tr ? [[p.lang, url], [tr.lang, SITE + postPath(tr)], ["x-default", SITE + postPath(p.lang === "en" ? p : tr)]] : null });
  });

  /* ---------- listings: home, categories (with pages) ---------- */
  const listHead = ({ h1, intro, n, eyebrow }) => `<header class="blog-list-head">
    <div class="blh-title"><span class="blog-eyebrow">${esc(eyebrow || `${STORE} health blog`)}</span><h1>${esc(h1)}${n > 1 ? ` <span class="blog-page-no">— page ${n}</span>` : ""}</h1></div>
    <div class="blh-side"><p>${esc(intro)}</p>${searchForm("")}</div>
  </header>`;
  const listing = ({ base, title, h1, intro, list, crumbs, catId, top, eyebrow, others }) => {
    // page 1 of the main blog opens with a big story (+ a short "also new" list); the grid shows the rest
    const lead = !catId && top ? top : null;
    const rest = lead ? list.filter((p) => p !== lead.hero && !lead.side.includes(p)) : list;
    const pages = Math.max(1, Math.ceil(rest.length / PER_PAGE));
    for (let n = 1; n <= pages; n++) {
      const items = rest.slice((n - 1) * PER_PAGE, n * PER_PAGE);
      const path = n === 1 ? base : `${base}/page/${n}`, url = SITE + path;
      const cr = n === 1 ? crumbs : [...crumbs, [`Page ${n}`, url]];
      const shown = n === 1 && lead ? [lead.hero, ...lead.side, ...items] : items;
      const otherList = n === pages && others ? others : [];
      const ssr = `<main class="seo-page wrap blog-page blog-list-page" id="seo">
  ${base === "/blog" && n === 1 ? listSwitch("en") : ""}
  ${crumbsHtml(cr)}
  ${listHead({ h1, intro, n, eyebrow })}
  ${catNav(catId)}
  ${n === 1 && lead ? `<section class="blog-lead${lead.side.length ? "" : " solo"}" aria-label="Top story">${heroCard(lead.hero)}${lead.side.length ? `<div class="blog-lead-side"><p class="blog-side-title">Also new</p>${lead.side.map(rowCard).join("")}</div>` : ""}</section>` : ""}
  ${n === 1 && lead && lead.pillars.length ? `<section class="blog-pillars" aria-labelledby="pillars"><h2 id="pillars"><span aria-hidden="true">📌</span> Start here</h2><div class="blog-pillar-list">${lead.pillars.map((p) => `<a href="${esc(postPath(p))}"><b>${esc(p.title)}</b><span>Complete article · ${p.reading_minutes || 1} min ${ARROW}</span></a>`).join("")}</div></section>` : ""}
  ${items.length ? `${lead && n === 1 ? `<h2 class="blog-latest">Latest articles</h2>` : ""}<div class="blog-grid">${items.map(card).join("")}</div>` : (lead ? "" : `<p class="blog-empty">New articles are on the way. Meanwhile, <a href="/tests.html">see our lab tests</a>.</p>`)}
  ${pager(base, n, pages)}
  ${otherList.length ? moreWidget(otherList, { title: "More from the blog", sub: "Articles on other topics you might like", id: "more-topics" }) : ""}
</main>`;
      const graph = [{ "@type": "CollectionPage", "@id": url, name: title, url, description: intro, isPartOf: { "@id": `${SITE}/#website` },
        mainEntity: { "@type": "ItemList", itemListElement: shown.map((p, i) => ({ "@type": "ListItem", position: (n - 1) * PER_PAGE + i + 1, url: SITE + postPath(p), name: p.title })) } }, crumbsLd(cr)];
      if (base === "/blog" && n === 1) graph.push(blogHome);
      write(`${path.slice(1)}.html`, page(ssr, headTags({ title: n > 1 ? `${title} — page ${n}` : title, description: short(intro, 158), url, index: list.length > 0, extra: ld({ "@context": "https://schema.org", "@graph": graph }) }), { type: "blog-list" }));
      if (list.length) urls.push({ loc: url, lastmod: isoDay(Math.max(...shown.map((p) => +new Date(p.content_updated_at || p.published_at) || 0))) });
    }
  };
  const heroPost = en.find((p) => p.featured) || en[0];
  const top = heroPost ? { hero: heroPost, side: en.filter((p) => p !== heroPost).slice(0, en.length > 4 ? 3 : 0), pillars: en.filter((p) => p.is_pillar).slice(0, 4) } : null;
  listing({ base: "/blog", title: `Health awareness | ${STORE}`, h1: "Health awareness", intro: `New medical discoveries, common health myths and lab tests explained in plain words by the ${STORE} team.`, list: en, crumbs: [["Home", `${SITE}/`], ["Articles", `${SITE}/blog`]], top });
  cats.forEach((c) => {
    const list = en.filter((p) => p.category_id === c.id);
    listing({ base: catPath(c), title: `${c.name} | ${STORE}`, h1: c.name, eyebrow: "Articles", intro: c.description || `${c.name} articles from ${STORE}.`, list, catId: c.id, crumbs: [["Home", `${SITE}/`], ["Articles", `${SITE}/blog`], [c.name, SITE + catPath(c)]],
      others: en.filter((p) => p.category_id !== c.id).slice(0, 6) });
  });
  if (ur.length) {
    const ssr = `<main class="seo-page wrap blog-page blog-list-page" id="seo" dir="rtl" lang="ur">${listSwitch("ur")}${crumbsHtml([["Home", `${SITE}/`], ["رہنمائی", `${SITE}/ur/blog`]])}<header class="blog-list-head"><div class="blh-title"><h1>رہنمائی</h1></div><div class="blh-side"><p>صحت، لیب ٹیسٹ اور بیماریوں کے بارے میں آسان معلومات۔</p></div></header><div class="blog-grid">${ur.map(card).join("")}</div></main>`;
    write("ur/blog.html", page(ssr, headTags({ title: `رہنمائی | ${STORE}`, description: `صحت، لیب ٹیسٹ اور بیماریوں کے بارے میں آسان معلومات۔`, url: `${SITE}/ur/blog` }).replace('content="en_PK"', 'content="ur_PK"'), { type: "blog-list" }, "ur"));
    urls.push({ loc: `${SITE}/ur/blog` });
  }

  /* ---------- editorial standards (honest, follows the admin settings) ---------- */
  {
    const url = `${SITE}/blog/editorial-standards`;
    const review = pub.manual_approval || !pub.auto_publish
      ? `A member of the ${esc(STORE)} team approves every article before it is published.`
      : `Articles that pass these automated checks are published automatically, without being read by a doctor first. Anything the checks flag as a serious safety concern waits for a person on our team.`;
    const ssr = `<main class="seo-page wrap blog-page" id="seo">
  ${crumbsHtml([["Home", `${SITE}/`], ["Articles", `${SITE}/blog`], ["Editorial standards", url]])}
  <article class="blog-article"><header class="blog-head"><h1>How we write and check our articles</h1></header>
  <div class="blog-body">
    <p>Our articles give general health information. They do not replace advice from your doctor, and they cannot diagnose or treat you.</p>
    <h2 id="how-made">How articles are made</h2>
    <p>Topics come from questions people actually search for. Each article is researched and drafted with AI tools, using reference pages listed under <em>Sources</em> at the end of the article. Specific facts and figures must come from those sources; we do not invent statistics, studies, patient stories or quotes from doctors.</p>
    <h2 id="checks">Checks before publishing</h2>
    <ul><li>Every link is checked.</li><li>Articles are checked by software against their sources. Sentences that cannot be supported are removed.</li><li>Articles do not tell readers what dose to take or to stop a medicine.</li><li>${review}</li></ul>
    <h2 id="updates">Updates and corrections</h2>
    <p>Published articles are reviewed for updates; the "Updated" date shows the last real change. If you spot a mistake, please <a href="/#visit">tell us</a> and we will correct it.</p>
    <h2 id="who">Who we are</h2>
    <p>${esc(pub.author_bio || "")}</p>
  </div></article>
  ${moreWidget(en.slice(0, 6), { title: "Start reading", sub: "Our newest articles" })}
</main>`;
    write("blog/editorial-standards.html", page(ssr, headTags({ title: `Editorial standards | ${STORE}`, description: `How ${STORE} researches, writes, checks and updates its health articles.`, url, index: en.length > 0 }), { type: "blog-list" }));
    if (en.length) urls.push({ loc: url });
  }

  /* ---------- RSS ---------- */
  const xmlEsc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[ch]));
  write("blog/feed.xml", `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>${xmlEsc(STORE)} Guides</title><link>${SITE}/blog</link><description>Health articles from ${xmlEsc(STORE)}</description><language>en-pk</language>
<atom:link href="${SITE}/blog/feed.xml" rel="self" type="application/rss+xml"/>
${en.slice(0, 30).map((p) => `<item><title>${xmlEsc(p.title)}</title><link>${SITE}${postPath(p)}</link><guid isPermaLink="true">${SITE}${postPath(p)}</guid><pubDate>${new Date(p.published_at).toUTCString()}</pubDate><description>${xmlEsc(p.meta_description || p.excerpt || "")}</description></item>`).join("\n")}
</channel></rss>
`);

  /* ---------- search (rendered per request, never indexed) ---------- */
  const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const docs = en.map((p) => ({ p, title: norm(p.title), text: norm(`${p.excerpt} ${p.answer_summary} ${(p.tags || []).join(" ")} ${MD.plain(p.body_md)}`) }));
  function search(q) {
    q = String(q || "").trim().slice(0, 80);
    const words = norm(q).split(/[^a-z0-9؀-ۿ]+/).filter((w) => w.length > 1);
    const hits = words.length ? docs.map((d) => [words.reduce((s, w) => s + (d.title.includes(w) ? 5 : 0) + (d.text.includes(w) ? 1 : 0), 0) + (words.every((w) => d.text.includes(w) || d.title.includes(w)) ? 3 : 0), d.p])
      .filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, 24).map(([, p]) => p) : [];
    const url = `${SITE}/blog/search`;
    const ssr = `<main class="seo-page wrap blog-page" id="seo">
  ${crumbsHtml([["Home", `${SITE}/`], ["Articles", `${SITE}/blog`], ["Search", url]])}
  <header class="blog-list-head"><div class="blh-title"><span class="blog-eyebrow">Search</span><h1>${q ? `Articles about “${esc(q)}”` : "Search the articles"}</h1></div><div class="blh-side">${searchForm(q)}</div></header>
  ${catNav(null)}
  ${q ? (hits.length ? `<p class="blog-count">${hits.length} guide${hits.length === 1 ? "" : "s"} found</p><div class="blog-grid">${hits.map(card).join("")}</div>` : `<p class="blog-empty">No guides match that yet. Try fewer words, or <a href="/blog">browse all guides</a>.</p>`) : ""}
  ${moreWidget(latestExcept(new Set(hits.map((p) => p.id)), 6), { title: hits.length ? "More from the blog" : "Newest articles", sub: `Fresh articles from the ${STORE} team`, id: "more-search" })}
</main>`;
    return page(ssr, headTags({ title: `Search articles | ${STORE}`, description: `Search ${STORE}'s health articles.`, url, index: false }), { type: "blog-list" });
  }

  return { urls, search, hasPosts: en.length > 0, paths: blogPaths };
}
