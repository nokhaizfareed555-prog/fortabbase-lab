/* Fort Abbas Poly Clinic — guides: anonymous reading stats (no personal data).
   read          once per article per visit, after 10 seconds on the page
   scroll_75     the reader got three-quarters of the way down
   product_click a shop product was opened from the article
   ai_referral   the visit came from an AI assistant / answer engine (ChatGPT, Perplexity, Gemini, Copilot…) */
(function () {
  "use strict";
  const art = document.querySelector("[data-blog-slug]");
  const cfg = window.FA_CONFIG; if (!art || !cfg) return;
  const slug = art.getAttribute("data-blog-slug");
  const visitor = () => { try { let v = localStorage.getItem("fa_visitor"); if (!v) { v = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem("fa_visitor", v); } return v; } catch (e) { return ""; } };
  const token = () => { try { const s = JSON.parse(localStorage.getItem("fa_session")); return s && s.exp > Date.now() ? s.access_token : cfg.anon; } catch (e) { return cfg.anon; } };
  const AI_HOSTS = /(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com|perplexity\.ai|gemini\.google\.com|bard\.google\.com|copilot\.microsoft\.com|claude\.ai|you\.com|phind\.com|meta\.ai|deepseek\.com|grok\.com|x\.ai)$/i;
  let refHost = "";
  try { refHost = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) {}
  const utm = new URLSearchParams(location.search).get("utm_source") || "";
  const send = (event, extra) => {
    try {
      fetch(`${cfg.url}/rest/v1/rpc/blog_track`, { method: "POST", keepalive: true, headers: { apikey: cfg.anon, authorization: "Bearer " + token(), "content-type": "application/json" }, body: JSON.stringify({ p: Object.assign({ slug, event, visitor_id: visitor(), referrer_host: refHost || utm }, extra || {}) }) }).catch(() => {});
    } catch (e) {}
  };
  const once = (k) => { try { const key = "fa_blog_" + k + "_" + slug; if (sessionStorage.getItem(key)) return false; sessionStorage.setItem(key, "1"); } catch (e) {} return true; };

  if ((AI_HOSTS.test(refHost) || AI_HOSTS.test(utm)) && once("ai")) send("ai_referral");
  setTimeout(() => { if (document.visibilityState !== "hidden" && once("read")) send("read"); }, 10000);
  let deep = false;
  window.addEventListener("scroll", () => {
    if (deep) return;
    const r = art.getBoundingClientRect();
    if (r.height && (window.innerHeight - r.top) / r.height >= 0.75) { deep = true; if (once("s75")) send("scroll_75"); }
  }, { passive: true });
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-blog-product]");
    if (a) send("product_click", { product_id: a.getAttribute("data-blog-product") });
  }, true);
})();

/* Fort Abbas Poly Clinic — guides: reading progress bar, "On this page" highlighting, share → copy link, "Keep reading" arrows,
   and the side rails stepping aside while the full-width "Try our lamp" panel is on screen. */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  // reading progress
  const art = $(".blog-post-page .blog-article"), bar = $(".bp-progress span");
  if (art && bar) {
    let tick = false;
    const upd = () => { tick = false; const r = art.getBoundingClientRect(); const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight * 0.6))); bar.style.setProperty("--p", p.toFixed(4)); };
    addEventListener("scroll", () => { if (!tick) { tick = true; requestAnimationFrame(upd); } }, { passive: true });
    upd();
  }
  // highlight the section being read
  const links = $$(".bp-toc a[data-toc]");
  if (links.length && "IntersectionObserver" in window) {
    const heads = links.map((a) => document.getElementById(a.dataset.toc)).filter(Boolean);
    const vis = new Set();
    const mark = () => {
      let cur = null;
      for (const hd of heads) { if (hd.getBoundingClientRect().top < innerHeight * 0.35) cur = hd; }
      links.forEach((a) => a.classList.toggle("on", !!cur && a.dataset.toc === cur.id));
    };
    const io = new IntersectionObserver((es) => { es.forEach((e) => (e.isIntersecting ? vis.add(e.target) : vis.delete(e.target))); mark(); }, { rootMargin: "0px 0px -50% 0px" });
    heads.forEach((hd) => io.observe(hd));
    addEventListener("scroll", () => requestAnimationFrame(mark), { passive: true });
    mark();
  }
  // copy link
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-copy-link]"); if (!b) return;
    const url = b.getAttribute("data-copy-link");
    const done = () => { b.classList.add("copied"); b.setAttribute("aria-label", "Link copied"); setTimeout(() => { b.classList.remove("copied"); b.setAttribute("aria-label", "Copy link"); }, 1800); };
    if (navigator.share && matchMedia("(max-width: 760px)").matches) { navigator.share({ title: document.title, url }).catch(() => {}); return; }
    try { navigator.clipboard.writeText(url).then(done, done); } catch (err) { done(); }
  });
  // "Keep reading" arrows
  $$(".blog-more").forEach((sec) => {
    const track = $("[data-more-track]", sec), btns = $$("[data-more]", sec);
    if (!track || !btns.length) return;
    const state = () => { const max = track.scrollWidth - track.clientWidth - 2; btns[0].disabled = track.scrollLeft <= 2; btns[1].disabled = track.scrollLeft >= max; };
    btns.forEach((b) => b.addEventListener("click", () => track.scrollBy({ left: (+b.dataset.more) * track.clientWidth * 0.9, behavior: "smooth" })));
    track.addEventListener("scroll", () => requestAnimationFrame(state), { passive: true });
    addEventListener("resize", state); state();
  });
  // the full-width lamp panel passes under the sticky rails: hide them while it is on screen
  const slot = $("[data-lamptry-slot]"), lay = $(".bp-layout");
  if (slot && lay && "IntersectionObserver" in window) {
    new IntersectionObserver((es) => es.forEach((e) => lay.classList.toggle("band-in", e.isIntersecting)), { rootMargin: "-90px 0px -10% 0px" }).observe(slot);
  }
})();
