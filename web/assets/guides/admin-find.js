/* Fort Abbas Poly Clinic — find anything in the admin.
   • A search bar in the header (press "/" or Ctrl/⌘+K) that understands related words, typos and
     plain questions ("where do I change the logo", "discount", "whatsap").
   • A Directory: every section, sub-section, setting and pop-up, grouped like the menu.
   • "On this page": a short index at the top of each section.
   Nothing here is written by hand except the how-to shortcuts and the related-words list: the index is
   read from the admin pages themselves each time they load (and re-read when a section changes), so it
   always matches what's really there. Both admin pages are indexed, so search on one finds things on the other. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const PAGE = document.body.classList.contains("blog-admin") ? "blog" : "admin";
  const URLS = { admin: "/admin", blog: "/admin/blog" };
  const PAGE_NAME = { admin: "Admin", blog: "Guides & blog" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clean = (s) => String(s || "").replace(/\s+/g, " ").replace(/[↗↶✦→←]/g, "").trim();

  /* ===================== words ===================== */
  const STOP = new Set("a an the to of in on for and or i my me we our is are be can do does how where what which who when should would could please want need find show me it this that with from by at as up into about page section admin panel settings setting option".split(" "));
  const SOFT = new Set("change edit set add make create update turn remove delete see open use manage put get".split(" ")); // verbs: count a little
  function stem(w) {
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
    if (w.length > 4 && /(sses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) w = w.slice(0, -1);
    if (w.length > 5 && /ing$/.test(w)) return w.slice(0, -3);
    if (w.length > 4 && /ed$/.test(w)) return w.slice(0, -2);
    return w;
  }
  const norm = (s) => String(s || "").toLowerCase().replace(/&/g, " and ").replace(/colour/g, "color").replace(/e-?mail/g, "email").replace(/whats ?app/g, "whatsapp").replace(/[^a-z0-9؀-ۿ]+/g, " ").trim();
  const toks = (s) => norm(s).split(" ").filter(Boolean).map(stem);

  // related words: searching any one finds the others
  const GROUPS = [
    "discount coupon code promo voucher offer giveaway deal",
    "logo brand favicon icon mark",
    "color theme palette look design style appearance shade",
    "email mail message template notification inbox resend smtp cpanel mailbox",
    "whatsapp wa sms text chat",
    "password login signin sign account security",
    "photo image picture media gallery upload video folder thumbnail",
    "shipping delivery courier fee dispatch ship",
    "bank payment pay jazzcash easypaisa iban transfer wallet screenshot receipt cod cash",
    "hero banner homepage home slider headline ticker",
    "section order arrange reorder layout divider separator drag move sort page",
    "popup pop opened card quick view product window variant choice size finish",
    "menu nav navigation header bar button",
    "blog guide article post writing content",
    "ai agent gemini claude openai key api model groq openrouter",
    "seo google search console sitemap index ranking",
    "user team staff access role permission owner",
    "visitor stat analytic traffic visit engagement",
    "review rating testimonial feedback star",
    "order purchase sale sold checkout",
    "customer client buyer crm contact people",
    "price cost rate amount",
    "stock inventory quantity available",
    "category collection type group",
    "speed health performance diagnostic check",
    "undo history version zero old previous",
    "font typography text heading",
    "request custom inquiry enquiry",
    "product item piece listing",
    "store shop website site",
    "schedule time weekly calendar day",
    "audit log activity change record",
    "delete remove hide trash",
    "phone mobile number contact",
    "address city province",
    "export csv download spreadsheet",
    "lamp light",
    "urdu language translate translation",
  ].map((g) => g.split(" ").map(stem));
  const SYN = new Map();
  GROUPS.forEach((g) => g.forEach((w) => { const s = SYN.get(w) || new Set(); g.forEach((x) => x !== w && s.add(x)); SYN.set(w, s); }));

  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        best = Math.min(best, cur[j]);
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  function wordScore(q, w) {
    if (q === w) return 1;
    if (q.length >= 2 && w.startsWith(q)) return q.length >= 4 ? .9 : .75;
    if (q.length >= 4 && w.length >= 4) { const d = lev(q, w, q.length >= 7 ? 2 : 1); if (d <= (q.length >= 7 ? 2 : 1)) return .62; }
    return 0;
  }

  /* ===================== how-to shortcuts (checked against the real page; ones that no longer match are left out) ===================== */
  const TASKS = [
    ["Change the shop logo or tab icon", "logo favicon icon", { page: "admin", tab: "settings", sub: "look", section: "Homepage", label: "Logo" }],
    ["Change homepage hero photos", "hero banner slider", { page: "admin", tab: "settings", sub: "look", section: "Homepage", label: "Hero photos" }],
    ["Change the website colours", "brand colour theme", { page: "admin", tab: "settings", sub: "look", section: "Design 2.0 colours" }],
    ["Rename or hide menu buttons", "menu navigation", { page: "admin", tab: "settings", sub: "look", section: "Menu bar" }],
    ["Change the store name, phone or address", "store details contact", { page: "admin", tab: "settings", sub: "store" }],
    ["Change my admin password", "password security", { page: "admin", tab: "settings", sub: "account" }],
    ["Check the website's health and speed", "speed health", { page: "admin", tab: "settings", sub: "health" }],
    ["Add a new product", "new product listing", { page: "admin", tab: "products" }],
    ["Edit categories", "category", { page: "admin", tab: "products" }],
    ["Create a discount code", "coupon promo", { page: "admin", tab: "coupons" }],
    ["Confirm or ship an order", "order status", { page: "admin", tab: "orders" }],
    ["Check a payment screenshot", "payment receipt verify", { page: "admin", tab: "orders" }],
    ["Add or change bank accounts", "bank jazzcash easypaisa", { page: "admin", tab: "payments" }],
    ["Turn order emails on or off", "email notification", { page: "admin", tab: "messages", msub: "email", section: "Email" }],
    ["Edit the order email wording and design", "email template", { page: "admin", tab: "messages", msub: "email", section: "Email design & wording" }],
    ["Set up WhatsApp messages", "whatsapp", { page: "admin", tab: "messages", msub: "wa" }],
    ["Choose which order changes send a message", "when to send", { page: "admin", tab: "messages", msub: "when" }],
    ["See messages that were sent", "activity log sent", { page: "admin", tab: "messages", msub: "log" }],
    ["Message a customer", "customer email whatsapp crm", { page: "admin", tab: "customers" }],
    ["Show, hide or pin reviews", "review", { page: "admin", tab: "reviews" }],
    ["Upload photos to the gallery", "media upload", { page: "admin", tab: "gallery" }],
    ["See who is visiting the shop", "visitors traffic", { page: "admin", tab: "engagements" }],
    ["Give someone admin access", "user team role", { page: "admin", tab: "users" }],
    ["See every change made in admin", "audit history", { page: "admin", tab: "audit" }],
    ["Publish a blog guide now", "blog publish article", { page: "blog", tab: "overview" }],
    ["Write or edit a blog article", "blog article editor", { page: "blog", tab: "articles" }],
    ["Add the AI key for the blog writers", "ai key gemini", { page: "blog", tab: "settings", section: "AI" }],
    ["Set how many guides are published each week", "blog schedule approval", { page: "blog", tab: "settings", section: "Schedule & approval" }],
    ["Add blog topics", "topic idea", { page: "blog", tab: "topics" }],
    ["See how blog articles are doing", "blog performance traffic", { page: "blog", tab: "performance" }],
    ["Change the admin colours", "admin palette theme surprise", { page: "*", palette: true }],
  ];

  /* ===================== reading the admin pages into an index ===================== */
  const DIALOG_TAB = { prodDlg: "products", imgDlg: "products", catDlg: "products", styleDlg: "settings", userDlg: "users", boostDlg: "products", auditDlg: "audit", brandDlg: "v0", revDlg: "reviews", heroDlg: "settings", editDlg: "articles" };
  const SKIP_DIALOG = new Set(["pwCheckDlg", "confirmDlg", "pickDlg"]);
  const META = () => (window.DivaarShell && window.DivaarShell.META) || {};

  function textOf(el) { if (!el) return ""; const c = el.cloneNode(true); c.querySelectorAll("button, .cb-toggle, .tab-count, svg, select, input, textarea, .badge").forEach((x) => x.remove()); return clean(c.textContent); }
  function headOf(box) { const h = box.querySelector(":scope > h3, :scope > .cb-head h3, :scope > .pm-head h3, :scope > .box-head h3, :scope > .ba-row-head h3, :scope > div:first-child > h3"); return h; }
  const visible = (el, live) => !live || !el.closest("[hidden]:not(section.panel):not([data-ssub]):not([data-msub]):not(dialog *)");

  function crawl(doc, page, live) {
    const out = [];
    const tabBtns = $$("#tabs [data-tab]", doc);
    const tabs = {};
    tabBtns.forEach((b) => {
      const tab = b.dataset.tab;
      if (live && b.hidden) return;
      const group = b.closest(".nav-group"); const gl = group && $(".nav-label", group);
      const title = clean((b.querySelector(".nl") || b).textContent.replace(/\d+$/, ""));
      const meta = META()[tab];
      tabs[tab] = { title, group: page === "blog" ? "Guides & blog" : (gl ? clean((gl.firstChild || gl).textContent) : "") };
      out.push({ kind: "page", title, path: [tabs[tab].group], desc: meta ? meta[1] : "", t: { page, tab } });
    });
    Object.keys(tabs).forEach((tab) => {
      const panel = doc.getElementById("panel-" + tab); if (!panel) return;
      const tabT = tabs[tab].title, group = tabs[tab].group;
      const subs = {};
      $$("#setNav [data-ssub], #msgTabs [data-msub]", panel).forEach((b) => {
        const key = b.dataset.ssub || b.dataset.msub, isS = !!b.dataset.ssub;
        subs[(isS ? "s:" : "m:") + key] = clean(b.textContent);
        out.push({ kind: "sub", title: clean(b.textContent), path: [group, tabT], desc: "", t: { page, tab, [isS ? "sub" : "msub"]: key } });
      });
      const subOf = (el) => {
        const s = el.closest("[data-ssub]:not([role=tab])"), m = el.closest("[data-msub]:not([role=tab])");
        const r = {}; if (s) r.sub = s.dataset.ssub.split(" ")[0]; if (m) r.msub = m.dataset.msub; return r;
      };
      const subName = (r) => r.sub ? subs["s:" + r.sub] : r.msub ? subs["m:" + r.msub] : "";
      const boxes = $$(".card-box", panel).filter((b) => headOf(b));
      boxes.forEach((box) => {
        const h = headOf(box), title = textOf(h); if (!title) return;
        const parent = box.parentElement && box.parentElement.closest(".card-box");
        const r = subOf(box), sn = subName(r);
        const path = [group, tabT]; if (sn) path.push(sn); if (parent && headOf(parent)) path.push(textOf(headOf(parent)));
        const p = $$(":scope > p, :scope > .muted, :scope > .fx-note", box)[0];
        const kw = [];
        $$("input[placeholder], textarea[placeholder]", box).forEach((i) => kw.push(i.placeholder));
        $$("option", box).slice(0, 30).forEach((o) => kw.push(o.textContent));
        out.push({ kind: "section", title, path, desc: p ? textOf(p).slice(0, 170) : "", kw: kw.join(" ").slice(0, 400), t: { page, tab, ...r, section: title } });
        // settings, sub-headings and actions inside the section (not inside a nested section)
        const own = (el) => el.closest(".card-box") === box && visible(el, live);
        const seen = new Set();
        const add = (kind, label, extra, el) => {
          label = clean(label).replace(/[:*]$/, ""); if (!label || label.length < 3 || label.length > 90 || seen.has(kind + label)) return; seen.add(kind + label);
          out.push({ kind, title: label, path: path.concat(title), desc: extra || "", t: { page, tab, ...r, section: title, label } });
        };
        $$("h4, .nav-sub, .pbg-title, .lbl", box).filter(own).forEach((e) => add("setting", textOf(e)));
        $$(".field > span:first-child", box).filter(own).forEach((e) => { const f = e.closest(".field"); const hint = f.querySelector("small, .muted"); add("setting", textOf(e), hint ? textOf(hint).slice(0, 120) : "", e); });
        $$("label.check, label.switch", box).filter(own).forEach((e) => add("setting", textOf(e) || e.title || ""));
        $$("button.btn, a.btn", box).filter(own).forEach((e) => { const t = textOf(e) || clean(e.textContent); if (t && !/^(remove|choose|save|undo|cancel|ok|x|×|show|hide)$/i.test(t)) add("action", t); });
      });
      // pages without sections: their toolbar and buttons
      if (!boxes.length) {
        const kw = [];
        $$(".toolbar input[placeholder], .toolbar option", panel).forEach((i) => kw.push(i.placeholder || i.textContent));
        out.forEach((e) => { if (e.kind === "page" && e.t.tab === tab && e.t.page === page) e.kw = kw.join(" "); });
        $$("button.btn, a.btn", panel).forEach((b) => { const t = clean(b.textContent); if (t && t.length > 2 && t.length < 60 && !b.closest(".card-box, dialog")) out.push({ kind: "action", title: t, path: [group, tabT], desc: "", t: { page, tab, label: t } }); });
      }
    });
    // pop-ups: one entry each, their fields as search words
    $$("dialog[id]", doc).forEach((d) => {
      if (SKIP_DIALOG.has(d.id)) return;
      const tab = DIALOG_TAB[d.id]; if (!tab || !tabs[tab]) return;
      const h = d.querySelector("h2, h3"); const title = textOf(h); if (!title) return;
      const fields = $$(".field > span:first-child, h3, h4, label.check", d).map((x) => textOf(x).replace(/\s*\d+\s*\/\s*\d+$/, "").replace(/\s*\*$/, "")).filter((x) => x && x !== textOf(h));
      out.push({ kind: "popup", title, path: [tabs[tab].group, tabs[tab].title], desc: "Opens from " + tabs[tab].title + (fields.length ? " · " + fields.slice(0, 6).join(", ") : ""), kw: fields.join(" "), t: { page, tab } });
    });
    if (page === "admin") { const g = doc.getElementById("guidesLink"); if (g) out.push({ kind: "page", title: "Guides agent", path: ["Agents"], desc: "The blog, its articles and the AI writing team.", t: { page: "blog", tab: "overview" } }); }
    return out;
  }

  /* ===================== the index (this page live + the other page as published) ===================== */
  let INDEX = [], other = [], builtAt = 0;
  function prep(e) {
    e.tt = toks(e.title); e.tp = toks((e.path || []).join(" ")); e.td = toks(e.desc); e.tk = toks(e.kw);
    e.nt = norm(e.title); e.key = e.t.page + "|" + e.kind + "|" + e.title + "|" + (e.path || []).join(">");
    return e;
  }
  function tasks(all) {
    const out = [];
    TASKS.forEach(([title, kw, t]) => {
      if (t.palette) { out.push({ kind: "task", title, path: ["Header", "Colours button"], desc: "The round palette button at the top right — pick a palette or press Surprise me.", kw, t }); return; }
      const ok = all.some((e) => e.t.page === t.page && e.t.tab === t.tab && (!t.sub || e.t.sub === t.sub) && (!t.msub || e.t.msub === t.msub) && (!t.section || e.t.section === t.section || e.title === t.section));
      if (!ok) return; // the admin changed: this shortcut no longer points anywhere
      const where = all.find((e) => e.t.page === t.page && e.t.tab === t.tab && e.kind === "page");
      const sub = (t.sub || t.msub) && all.find((e) => e.kind === "sub" && e.t.page === t.page && e.t.tab === t.tab && (e.t.sub === t.sub && t.sub || e.t.msub === t.msub && t.msub));
      const path = [where ? where.title : ""]; if (sub) path.push(sub.title); if (t.section) path.push(t.section);
      out.push({ kind: "task", title, path, desc: "", kw, t });
    });
    return out;
  }
  function rebuild() {
    const mine = crawl(document, PAGE, true);
    const all = mine.concat(other);
    const seen = new Set();
    INDEX = all.concat(tasks(all)).map(prep).filter((e) => (!e.t || e.t.page === "blog") && !seen.has(e.key) && seen.add(e.key));
    builtAt = Date.now();
    if (dir && dir.open) paintDir();
  }
  async function loadOther() {
    return;
    const want = PAGE === "admin" ? "blog" : "admin";
    if (PAGE === "admin" && !$("#guidesLink")) return; // no access to the Guides admin
    try {
      const r = await fetch(want === "blog" ? "/admin-blog.html" : "/admin.html", { cache: "no-cache", credentials: "same-origin" });
      if (!r.ok) return;
      const doc = new DOMParser().parseFromString(await r.text(), "text/html");
      other = crawl(doc, want, false);
      rebuild();
    } catch {}
  }

  /* ===================== search ===================== */
  const W = { tt: 4, tp: 1.4, tk: 1.1, td: .9 };
  const KIND = { task: 1.6, page: 1.3, sub: 1.1, section: 1.15, popup: .9, setting: .85, action: .7 };
  function search(q, limit = 12) {
    const nq = norm(q); if (!nq) return [];
    let qt = toks(q).filter((w) => !STOP.has(w));
    if (!qt.length) qt = toks(q);
    const hard = qt.filter((w) => !SOFT.has(w));
    const res = [];
    for (const e of INDEX) {
      let total = 0, hit = 0;
      for (const w of qt) {
        const soft = SOFT.has(w); let best = 0;
        for (const f of ["tt", "tp", "tk", "td"]) {
          for (const x of e[f]) {
            let s = wordScore(w, x);
            if (s < .7) { const syn = SYN.get(w); if (syn) { if (syn.has(x)) s = Math.max(s, .72); else for (const y of syn) { if (y.length > 3 && x.startsWith(y)) { s = Math.max(s, .6); break; } } } }
            if (s) best = Math.max(best, s * W[f]);
          }
        }
        if (best) { total += soft ? best * .3 : best; if (!soft) hit++; }
      }
      const need = hard.length <= 1 ? hard.length : Math.ceil(hard.length * .6);
      if (hit < need || total <= 0) continue;
      if (e.nt === nq) total += 6; else if (e.nt.startsWith(nq)) total += 3.5; else if (nq.length > 3 && e.nt.includes(nq)) total += 2;
      if (hit === hard.length && hard.length > 1) total += 1.5;
      total *= KIND[e.kind] || 1;
      if (e.t.page !== PAGE) total *= .92;
      res.push([total, e]);
    }
    res.sort((a, b) => b[0] - a[0]);
    const floor = res.length ? res[0][0] * .3 : 0; // drop weak tail matches
    return res.filter((x) => x[0] >= floor).slice(0, limit).map((x) => x[1]);
  }
  const mark = (text, q) => {
    const words = toks(q).filter((w) => w.length > 1 && !STOP.has(w) && !SOFT.has(w)); let h = esc(text);
    words.forEach((w) => { h = h.replace(new RegExp("(^|[^\\w])(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\w*)", "ig"), "$1<mark>$2</mark>"); });
    return h;
  };

  /* ===================== going to a result ===================== */
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(fn, ms = 6000) { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await wait(80); } return null; }
  function flash(el) {
    if (!el) return;
    el.classList.remove("find-flash"); void el.offsetWidth; el.classList.add("find-flash");
    setTimeout(() => el.classList.remove("find-flash"), 2400);
  }
  function scrollTo(el) { const top = el.getBoundingClientRect().top + scrollY - ((($(".topbar") || {}).offsetHeight) || 70) - 18; window.scrollTo({ top: Math.max(0, top), behavior: "smooth" }); }
  async function go(t) {
    closeAll();
    if (t.palette) { const b = $("#palBtn"); if (b) { b.click(); flash(b); } return; }
    if (t.page !== PAGE) { try { sessionStorage.setItem("dv_find_go", JSON.stringify(t)); } catch {} location.href = URLS[t.page] + "#" + t.tab; return; }
    if (location.hash !== "#" + t.tab) location.hash = t.tab;
    const panel = await until(() => { const p = document.getElementById("panel-" + t.tab); return p && !p.hidden && p; });
    if (!panel) return;
    if (t.sub && window.DivaarShell) window.DivaarShell.showSub(t.sub);
    if (t.msub) { const b = $(`#msgTabs [data-msub="${t.msub}"]`); if (b && !b.classList.contains("on")) b.click(); }
    await wait(120);
    let target = panel;
    if (t.section) {
      const box = await until(() => $$(".card-box", panel).find((b) => headOf(b) && textOf(headOf(b)) === t.section && !b.closest("[hidden]")), 2500);
      if (box) {
        target = box;
        if (box.classList.contains("collapsed")) { const tg = $(".cb-toggle", box); if (tg) tg.click(); await wait(60); }
        if (t.label) {
          const el = $$(".field > span:first-child, h4, .nav-sub, .pbg-title, .lbl, label.check, label.switch, button.btn, a.btn", box).find((x) => (textOf(x) || clean(x.textContent)).replace(/[:*]$/, "") === t.label);
          if (el) { const d = el.closest("details"); if (d) d.open = true; target = el.closest(".field, label, .card-box") || el; }
        }
      }
    } else if (t.label) {
      const el = $$("button.btn, a.btn", panel).find((x) => clean(x.textContent) === t.label); if (el) target = el;
    }
    if (target === panel) { window.scrollTo({ top: 0, behavior: "smooth" }); flash($(".page-title") || panel); return; }
    scrollTo(target); setTimeout(() => flash(target), 280);
  }

  /* ===================== the search bar ===================== */
  const ICONS = {
    search: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    page: '<path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 9h16"/>',
    sub: '<path d="M4 6h16M4 12h10M4 18h6"/>',
    section: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h10M7 13h6"/>',
    setting: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    action: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    popup: '<rect x="4" y="6" width="16" height="13" rx="3"/><path d="M8 3h8"/>',
    task: '<path d="m12 3 2.6 5.6L20 9.4l-4 4 1 5.6-5-2.8-5 2.8 1-5.6-4-4 5.4-.8z"/>',
  };
  const KIND_NAME = { page: "Page", sub: "Tab", section: "Section", setting: "Setting", action: "Button", popup: "Pop-up", task: "How to" };
  const kIcon = (k) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ICONS.section}</svg>`;
  let box, input, pop, dir, sel = 0, last = [];
  const SUGGEST = ["logo", "hero photos", "password", "blog AI key"];

  function rowHtml(e, i, q) {
    const where = (e.path || []).filter(Boolean).join(" › ");
    const ext = e.t.page && e.t.page !== "*" && e.t.page !== PAGE ? `<span class="find-ext">${PAGE_NAME[e.t.page]} ↗</span>` : "";
    return `<a href="#" role="option" class="find-row${i === sel ? " on" : ""}" data-i="${i}" aria-selected="${i === sel}">
      <span class="find-ic k-${e.kind}">${kIcon(e.kind)}</span>
      <span class="find-txt"><span class="find-t">${mark(e.title, q)}</span><span class="find-w">${esc(KIND_NAME[e.kind])}${where ? " · " + esc(where) : ""}</span>${e.desc ? `<span class="find-d">${mark(e.desc.slice(0, 120), q)}</span>` : ""}</span>${ext}</a>`;
  }
  function paintPop() {
    const q = input.value;
    if (!q.trim()) {
      pop.innerHTML = `<div class="find-empty"><b>Find anything in the admin</b><span>Type what you want to do or find — words like these work:</span><div class="find-sug">${SUGGEST.map((s) => `<button type="button" data-sug="${esc(s)}">${esc(s)}</button>`).join("")}</div></div>${footHtml()}`;
      return;
    }
    last = search(q);
    pop.innerHTML = (last.length ? `<div class="find-list" role="listbox">${last.map((e, i) => rowHtml(e, i, q)).join("")}</div>`
      : `<div class="find-empty"><b>Nothing matched “${esc(q)}”</b><span>Try another word, or browse the directory.</span></div>`) + footHtml();
  }
  const footHtml = () => `<div class="find-foot"><button type="button" class="find-dirbtn" data-dir>${kIcon("page")} Browse the full directory</button><span class="find-keys"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close</span></div>`;
  function openPop(on) { pop.hidden = !on; box.classList.toggle("open", on); input.setAttribute("aria-expanded", String(on)); if (on) { sel = 0; paintPop(); } }
  function closeAll() { if (pop) openPop(false); box && box.classList.remove("phone-open"); if (dir && dir.open) dir.close(); }

  function buildBar() {
    const bar = $(".topbar-in"); if (!bar || $("#findBox")) return;
    box = document.createElement("div"); box.className = "find-box"; box.id = "findBox";
    box.innerHTML = `<button type="button" class="icon-btn find-phone" aria-label="Search the admin">${ICONS.search}</button>
      <label class="find-field">${ICONS.search}<input id="findInput" type="search" autocomplete="off" spellcheck="false" placeholder="Search the admin…" role="combobox" aria-expanded="false" aria-controls="findPop" aria-autocomplete="list"><kbd class="find-kbd">/</kbd></label>
      <div class="find-pop" id="findPop" hidden></div>`;
    const actions = $(".topbar-actions", bar); bar.insertBefore(box, actions);
    input = $("#findInput"); pop = $("#findPop");
    input.addEventListener("focus", () => openPop(true));
    input.addEventListener("input", () => { sel = 0; paintPop(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!last.length) return; sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + last.length) % last.length; paintPop(); const r = pop.querySelector(".find-row.on"); if (r) r.scrollIntoView({ block: "nearest" }); }
      else if (e.key === "Enter") { e.preventDefault(); if (last[sel]) { const t = last[sel].t; input.value = ""; input.blur(); go(t); } else if (input.value.trim()) openDir(input.value); }
      else if (e.key === "Escape") { input.value = ""; openPop(false); input.blur(); box.classList.remove("phone-open"); }
    });
    pop.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the box
    pop.addEventListener("click", (e) => {
      const r = e.target.closest(".find-row"); if (r) { e.preventDefault(); const t = last[+r.dataset.i].t; input.value = ""; input.blur(); go(t); return; }
      const s = e.target.closest("[data-sug]"); if (s) { input.value = s.dataset.sug; paintPop(); input.focus(); return; }
      if (e.target.closest("[data-dir]")) { const q = input.value; input.blur(); openDir(q); }
    });
    input.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== input) { openPop(false); box.classList.remove("phone-open"); } }, 120));
    $(".find-phone", box).addEventListener("click", () => { box.classList.add("phone-open"); input.focus(); });
    document.addEventListener("keydown", (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
      if ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) { if (document.querySelector("dialog[open]:not(#findDir)")) return; e.preventDefault(); box.classList.add("phone-open"); input.focus(); input.select(); }
    });
  }

  /* ===================== the directory ===================== */
  function openDir(q) {
    if (!dir) {
      dir = document.createElement("dialog"); dir.id = "findDir"; dir.className = "find-dir";
      dir.innerHTML = `<div class="sheet find-sheet"><div class="find-dir-head"><div><p class="find-eyebrow">Directory</p><h2>Where everything is</h2><p class="muted small" id="findDirMeta"></p></div><button type="button" class="icon-btn" data-dirclose aria-label="Close">✕</button></div>
        <label class="find-field find-dir-q">${ICONS.search}<input type="search" id="findDirQ" placeholder="Filter the directory…" autocomplete="off"></label>
        <div class="find-dir-body" id="findDirBody"></div></div>`;
      document.body.appendChild(dir);
      dir.addEventListener("click", (e) => {
        if (e.target === dir || e.target.closest("[data-dirclose]")) { dir.close(); return; }
        const a = e.target.closest("[data-go]"); if (a) { e.preventDefault(); go(JSON.parse(a.dataset.go)); }
      });
      $("#findDirQ", dir).addEventListener("input", paintDir);
    }
    $("#findDirQ", dir).value = q || "";
    paintDir();
    if (!dir.open) dir.showModal();
    setTimeout(() => $("#findDirQ", dir).focus(), 30);
  }
  function paintDir() {
    const q = $("#findDirQ", dir).value.trim();
    const meta = $("#findDirMeta", dir);
    meta.textContent = `${INDEX.length} places · read from the live admin ${Math.max(0, Math.round((Date.now() - builtAt) / 1000)) < 5 ? "just now" : "at " + new Date(builtAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    const body = $("#findDirBody", dir);
    const link = (e, cls, inner) => `<a href="#" class="${cls}" data-go='${esc(JSON.stringify(e.t))}'>${inner}</a>`;
    if (q) {
      const r = search(q, 40);
      body.innerHTML = r.length ? `<div class="find-list">${r.map((e, i) => rowHtml(e, -1, q).replace('href="#"', `href="#" data-go='${esc(JSON.stringify(e.t))}'`)).join("")}</div>` : `<p class="muted">Nothing matched — try another word.</p>`;
      return;
    }
    // grouped like the menu: group → page → tabs/sections → settings
    const pages = INDEX.filter((e) => e.kind === "page" && !(e.t.page === "blog" && e.t.tab === "overview" && e.path[0] === "Marketing"));
    const groups = []; const byG = {};
    pages.forEach((p) => { const g = (p.t.page === "blog" ? "Guides & blog" : p.path[0]) || "Other"; if (!byG[g]) { byG[g] = []; groups.push(g); } byG[g].push(p); });
    const tasksHtml = INDEX.filter((e) => e.kind === "task").map((e) => link(e, "find-task", `${kIcon("task")}<span>${esc(e.title)}</span><small>${esc(e.path.filter(Boolean).join(" › "))}</small>`)).join("");
    body.innerHTML = `<section class="find-dir-tasks"><h3>Common jobs</h3><div class="find-task-grid">${tasksHtml}</div></section>` + groups.map((g) => `<section class="find-dir-group"><h3>${esc(g)}</h3><div class="find-dir-grid">${byG[g].map((p) => {
      const same = (e) => e.t.page === p.t.page && e.t.tab === p.t.tab;
      const secs = INDEX.filter((e) => same(e) && (e.kind === "section" || e.kind === "sub" || e.kind === "popup"));
      const subs = secs.filter((e) => e.kind === "sub");
      const secLine = (e) => { const n = INDEX.filter((x) => same(x) && x.kind === "setting" && x.t.section === e.title).length; return `<li>${link(e, "find-dl", `<span>${esc(e.title)}</span>${n ? `<em>${n}</em>` : ""}`)}${e.desc ? `<p>${esc(e.desc.slice(0, 110))}</p>` : ""}</li>`; };
      let inner = "";
      if (subs.length) inner = subs.map((s) => { const k = s.t.sub ? "sub" : "msub"; const list = secs.filter((e) => e.kind === "section" && e.t[k] === s.t[k]); return `<div class="find-dir-sub">${link(s, "find-dl find-dl-sub", `<span>${esc(s.title)}</span>`)}<ul>${list.map(secLine).join("")}</ul></div>`; }).join("") + `<ul>${secs.filter((e) => e.kind === "section" && !e.t.sub && !e.t.msub).map(secLine).join("")}</ul>`;
      else inner = `<ul>${secs.filter((e) => e.kind !== "sub").map(secLine).join("")}</ul>`;
      const acts = !secs.length ? INDEX.filter((e) => same(e) && e.kind === "action").slice(0, 6).map((e) => e.title) : [];
      return `<article class="find-card">${link(p, "find-card-h", `<b>${esc(p.title)}</b>${p.t.page !== PAGE ? `<span class="find-ext">${PAGE_NAME[p.t.page]} ↗</span>` : ""}`)}${p.desc ? `<p class="find-card-d">${esc(p.desc)}</p>` : ""}${inner.replace(/<ul><\/ul>/g, "")}${acts.length ? `<p class="find-acts">${acts.map(esc).join(" · ")}</p>` : ""}</article>`;
    }).join("")}</div></section>`).join("");
  }

  /* ===================== "On this page" ===================== */
  function toc(panel) {
    if (!panel || panel.hidden) return;
    let nav = panel.querySelector(":scope > .find-toc");
    const boxes = $$(".card-box", panel).filter((b) => headOf(b) && !b.closest("[hidden]") && !b.parentElement.closest(".card-box"));
    if (boxes.length < 2) { if (nav) nav.remove(); return; }
    const sig = boxes.map((b) => textOf(headOf(b))).join("|");
    if (nav && nav.dataset.sig === sig) return;
    if (!nav) {
      nav = document.createElement("nav"); nav.className = "find-toc"; nav.setAttribute("aria-label", "On this page");
      const after = panel.querySelector(":scope > .sub-nav, :scope > #msgTabs, :scope > .msg-tabs");
      if (after) after.after(nav); else panel.insertBefore(nav, panel.firstChild);
      nav.addEventListener("click", (e) => { const b = e.target.closest("[data-toc]"); if (!b) return; const box = $$(".card-box", panel).find((x) => headOf(x) && textOf(headOf(x)) === b.dataset.toc && !x.closest("[hidden]")); if (box) { if (box.classList.contains("collapsed")) { const tg = $(".cb-toggle", box); if (tg) tg.click(); } scrollTo(box); setTimeout(() => flash(box), 280); } });
    }
    nav.dataset.sig = sig;
    nav.innerHTML = `<span class="find-toc-l">On this page</span>${boxes.map((b) => { const t = textOf(headOf(b)); return `<button type="button" data-toc="${esc(t)}">${esc(t)}</button>`; }).join("")}`;
  }
  const tocAll = () => $$("section.panel").forEach(toc);

  /* ===================== start ===================== */
  let mo, timer;
  function start() {
    buildBar();
    rebuild(); tocAll(); loadOther();
    // keep everything current: re-read when sections change (new boxes, renamed titles, sub-tab switches)
    mo = new MutationObserver((list) => {
      if (list.every((m) => m.target.closest && (m.target.closest(".find-toc, .find-box, #findDir, .toast, .pal-pop")))) return;
      clearTimeout(timer); timer = setTimeout(() => { rebuild(); tocAll(); }, 500);
    });
    mo.observe($("#app") || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    addEventListener("hashchange", () => setTimeout(tocAll, 60));
    document.addEventListener("click", (e) => { if (e.target.closest("[data-ssub][role=tab], [data-msub][role=tab]")) setTimeout(tocAll, 40); });
    // arriving from the other admin page with somewhere to go
    let pending = null; try { pending = JSON.parse(sessionStorage.getItem("dv_find_go") || "null"); sessionStorage.removeItem("dv_find_go"); } catch {}
    if (pending && pending.page === PAGE) until(() => { const a = $("#app"); return a && !a.hidden; }, 10000).then((ok) => ok && setTimeout(() => go(pending), 400));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.DivaarFind = { search, go, openDir, rebuild, get index() { return INDEX; } };
})();
