/* Fort Abbas Poly Clinic — shared helpers for shop, admin, policy and receipt pages. Exposes window.Store. */
(function () {
  "use strict";
  const cfg = Object.assign({
    STORE_NAME: "Fort Abbas Poly Clinic", BRAND_KEY: "divaar", COUPON_PREFIX: "DIVAAR", CURRENCY: "Rs",
    CURRENCY_NAME: "Pakistani rupees (PKR)", LOCALE: "en-PK", TIME_ZONE: "Asia/Karachi", COUNTRY_NAME: "Pakistan",
    PHONE_COUNTRY_CODE: "92", PHONE_PLACEHOLDER: "0300 1234567", REGIONS: [], REGION_LABEL: "Province",
    POSTAL_LABEL: "Postal code", IBAN_EXAMPLE: "", OPTION_LABEL: "Option", OPTION_LABEL_PLURAL: "Options"
  }, window.STORE_CONFIG || {});

  const LOCALE = cfg.LOCALE, TIME_ZONE = cfg.TIME_ZONE;
  const storeKey = (k) => `${cfg.BRAND_KEY}_${k}`;
  const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient);
  const client = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, storageKey: "fa-guides-auth", storage: {
      /* one sign-in shared with the main admin: both read and write the same saved session */
      getItem(k) { if (k !== "fa-guides-auth") return localStorage.getItem(k); try { const s = JSON.parse(localStorage.getItem("fa_session")); return s && s.access_token ? JSON.stringify(Object.assign({ token_type: "bearer", expires_at: Math.floor((s.exp || 0) / 1000) }, s)) : null; } catch { return null; } },
      setItem(k, v) { if (k !== "fa-guides-auth") return localStorage.setItem(k, v); try { const s = JSON.parse(v); s.exp = (s.expires_at || 0) * 1000; localStorage.setItem("fa_session", JSON.stringify(s)); } catch {} },
      removeItem(k) { localStorage.removeItem(k === "fa-guides-auth" ? "fa_session" : k); } } }
  }) : null;

  /* ---------- text & numbers ---------- */
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const money = (v) => `${cfg.CURRENCY}${/[A-Za-z]$/.test(cfg.CURRENCY) ? " " : ""}${Math.round(num(v)).toLocaleString(LOCALE)}`;
  const safeUrl = (u) => { if (u == null || !String(u).trim()) return ""; try { const x = new URL(String(u), location.href); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };
  const fmtDate = (d, opts) => { try { return new Date(d).toLocaleDateString(LOCALE, Object.assign({ timeZone: TIME_ZONE, day: "numeric", month: "short", year: "numeric" }, opts || {})); } catch { return ""; } };
  const fmtDateTime = (d) => { try { return new Date(d).toLocaleString(LOCALE, { timeZone: TIME_ZONE, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
  const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));
  const errText = (e) => { const m = (e && (e.message || e.error_description || e.details)) || String(e || "Something went wrong."); return m.replace(/^.*?ERROR:\s*/, ""); };

  function waNumber(raw) {
    let d = String(raw || "").replace(/[^0-9]/g, "");
    if (!d) return "";
    if (d.startsWith("00")) d = d.slice(2);
    if (d.startsWith("0")) d = cfg.PHONE_COUNTRY_CODE + d.slice(1);
    return d;
  }
  const waLink = (raw, text) => { const n = waNumber(raw); return n ? `https://wa.me/${n}${text ? "?text=" + encodeURIComponent(text) : ""}` : ""; };

  /* ---------- toast ---------- */
  function toast(msg, kind) {
    let box = document.getElementById("toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
    const el = document.createElement("div");
    el.className = "toast" + (kind ? " toast-" + kind : "");
    el.setAttribute("role", kind === "error" ? "alert" : "status");
    const ic = document.createElement("span"); ic.className = "toast-ic"; ic.setAttribute("aria-hidden", "true");
    ic.innerHTML = kind === "ok" ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>' : kind === "error" ? "!" : "i";
    const tx = document.createElement("span"); tx.className = "toast-msg"; tx.textContent = msg;
    const life = kind === "error" ? 6500 : 4200;
    let bye;
    if (document.body.classList.contains("admin")) {
      // admin: an enclosed notice card — title + message, close button, time bar; hover keeps it open
      const text = String(msg == null ? "" : msg).trim();
      const short = text.split(/\s+/).length <= 3;   // "Saved.", "Cancelled." → that IS the title
      const title = short ? text.replace(/[.!]+$/, "") : kind === "ok" ? "Done" : kind === "error" ? "Something went wrong" : "Note";
      el.classList.add("toast-card");
      const body = document.createElement("span"); body.className = "toast-body";
      const t = document.createElement("b"); t.className = "toast-title"; t.textContent = title;
      body.append(t); if (!short) body.append(tx);
      const x = document.createElement("button"); x.type = "button"; x.className = "toast-x"; x.setAttribute("aria-label", "Close"); x.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      const bar = document.createElement("span"); bar.className = "toast-time"; bar.style.animationDuration = life + "ms";
      if (kind !== "ok" && kind !== "error") ic.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 11v6M12 7.5v.01"/></svg>';
      if (kind === "error") ic.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 7v6M12 16.5v.01"/></svg>';
      const act = arguments[2];
      if (act && act.label && act.href) { const a = document.createElement("a"); a.className = "toast-act"; a.href = act.href; a.textContent = act.label + " →"; a.addEventListener("click", () => bye()); body.append(a); }
      el.append(ic, body, x, bar);
      box.appendChild(el);
      let left = life, started = Date.now(), timer = null;
      bye = () => { clearTimeout(timer); el.classList.add("out"); setTimeout(() => el.remove(), 300); };
      const go = () => { started = Date.now(); timer = setTimeout(bye, left); };
      el.addEventListener("mouseenter", () => { clearTimeout(timer); left -= Date.now() - started; el.classList.add("hold"); });
      el.addEventListener("mouseleave", () => { el.classList.remove("hold"); go(); });
      x.addEventListener("click", bye);
      go();
      return;
    }
    el.append(ic, tx);
    box.appendChild(el);
    bye = () => { el.classList.add("out"); setTimeout(() => el.remove(), 300); };
    el.addEventListener("click", bye);
    setTimeout(bye, kind === "error" ? 5200 : 3600);
  }

  /* ---------- icons (inline stroke SVG) ---------- */
  const I = (p, w = 20) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICONS = {
    bag: I('<path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
    search: I('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    close: I('<path d="M6 6l12 12M18 6 6 18"/>'),
    menu: I('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    plus: I('<path d="M12 5v14M5 12h14"/>', 18),
    minus: I('<path d="M5 12h14"/>', 18),
    arrow: I('<path d="M7 17 17 7M8 7h9v9"/>', 18),
    left: I('<path d="m15 18-6-6 6-6"/>'),
    right: I('<path d="m9 18 6-6-6-6"/>'),
    copy: I('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>', 16),
    check: I('<path d="m5 12 5 5 9-10"/>', 16),
    star: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
    whatsapp: I('<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.6-5.4A8.4 8.4 0 1 1 21 11.5z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5"/>'),
    instagram: I('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>'),
    facebook: I('<path d="M15 3h-2a4 4 0 0 0-4 4v3H7v4h2v7h4v-7h3l1-4h-4V7a1 1 0 0 1 1-1h2z"/>'),
    tiktok: I('<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.5 2.5 2.3 4.3 5 4.5"/>'),
    youtube: I('<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10 9 5 3-5 3z"/>'),
    pinterest: I('<circle cx="12" cy="12" r="9"/><path d="M11 8.5c2.8-.6 5 .9 4.6 3.5-.4 2.4-2.6 3.4-4 2.6M11 9l-2.5 11"/>'),
    upload: I('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
    play: I('<path d="m8 5 11 7-11 7z"/>', 16),
    photo: I('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-8 8"/>', 14),
    phone: I('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>', 16),
    mail: I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>', 16),
    pin: I('<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>', 16),
    truck: I('<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>', 26),
    ruler: I('<path d="m3 17 14-14 4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>', 26),
    hand: I('<path d="M8 11V5a1.5 1.5 0 0 1 3 0v5M11 10V4a1.5 1.5 0 0 1 3 0v6M14 10V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7 6 6 0 0 1-5-3l-2.5-4a1.5 1.5 0 0 1 2.5-1.6L8 15"/>', 26),
    cash: I('<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>', 26),
    sparkle: I('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>', 26),
    edit: I('<path d="M4 20h4L19 9l-4-4L4 16z"/>', 16),
    trash: I('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 16),
    eye: I('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', 16),
    dup: I('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>', 16),
    refresh: I('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>', 16),
    logout: I('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/>', 18),
    external: I('<path d="M14 4h6v6M10 14 20 4M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>', 16),
    expand: I('<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>', 18),
    shrink: I('<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>', 18),
    drag: I('<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>', 16)
  };

  /* ---------- social ---------- */
  function socialLinks(s) {
    s = s || {};
    const norm = (v, base) => { v = String(v || "").trim(); if (!v) return ""; if (/^https?:\/\//i.test(v)) return safeUrl(v); if (/^[\w.-]+\.[a-z]{2,}\//i.test(v)) return safeUrl("https://" + v); return base ? safeUrl(base + v.replace(/^@/, "")) : ""; };
    return [
      ["instagram", "Instagram", norm(s.instagram_handle, "https://www.instagram.com/")],
      ["facebook", "Facebook", norm(s.facebook_url, "https://www.facebook.com/")],
      ["tiktok", "TikTok", norm(s.tiktok_url, "https://www.tiktok.com/@")],
      ["youtube", "YouTube", norm(s.youtube_url, "https://www.youtube.com/@")],
      ["pinterest", "Pinterest", norm(s.pinterest_url, "https://www.pinterest.com/")],
      ["whatsapp", "WhatsApp", waLink(s.whatsapp_number)]
    ].filter((x) => x[2]);
  }
  const socialHtml = (s) => socialLinks(s).map(([k, label, url]) => `<a class="social" href="${esc(url)}" target="_blank" rel="noopener" aria-label="${label}">${ICONS[k]}</a>`).join("");

  /* ---------- products, media, options, prices ---------- */
  // per-product photo framing (zoom + focus point), stored on the product's image entry only
  function mediaStyle(m, view) {
    if (!m) return "";
    if (view === "page" && m.page && typeof m.page === "object") m = m.page;   // product page has its own framing
    const fit = ["cover", "contain", "fill", "original"].includes(m.fit) ? ` data-fit="${m.fit}"` : "";
    if (m.zoom == null && m.x == null && m.y == null) return fit;
    const z = Math.min(3, Math.max(0.3, Number(m.zoom) || 1)), x = Math.min(100, Math.max(0, Number(m.x ?? 50))), y = Math.min(100, Math.max(0, Number(m.y ?? 50)));
    return `${fit} style="--z:${z};--fx:${x}%;--fy:${y}%"`;
  }
  const isVideo = (m) => !!m && (m.type === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(m.url || m.path || ""));
  function productMedia(p) {
    const list = Array.isArray(p && p.images) ? p.images.filter((m) => m && safeUrl(m.url)) : [];
    if (!list.length && p && safeUrl(p.image_url)) list.push({ url: p.image_url, path: p.image_path });
    return list;
  }
  const productImages = (p) => productMedia(p).filter((m) => !isVideo(m));
  const mediaKey = (m) => (m && (m.path || m.url)) || "";
  const safeHex = (h) => (/^#[0-9a-f]{3,8}$/i.test(String(h || "")) ? h : "#8A6A3E");
  const HEX_RE = /^#[0-9a-f]{6}$/i;
  // A finish can be one colour or a combination (e.g. Black & Beige) — up to 3 colours.
  function finHexes(c) {
    const list = (c && Array.isArray(c.hexes) && c.hexes.length ? c.hexes : [c && c.hex]).filter((h) => HEX_RE.test(String(h || ""))).slice(0, 3);
    return list.length ? list : [safeHex(c && c.hex)];
  }
  function swatchBg(c) {
    const h = finHexes(c);
    if (h.length === 1) return h[0];
    if (h.length === 2) return `linear-gradient(135deg, ${h[0]} 0 50%, ${h[1]} 50% 100%)`;
    return `conic-gradient(from 210deg, ${h[0]} 0 33.34%, ${h[1]} 0 66.67%, ${h[2]} 0)`;
  }
  // Background behind the product photo in the product view.
  /* ---- per-category card look (admin → Products → Card style) ---- */
  const HEX = /^#[0-9a-f]{6}$/i;
  const clampN = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) && v !== "" && v != null ? Math.min(hi, Math.max(lo, n)) : d; };
  const roundByDefault = (name) => /lamp|light|wall\s*art/i.test(String(name || ""));
  function cardStyle(c, name) {
    c = c || {}; const round = roundByDefault(name || c.name);
    return {
      r_top: clampN(c.r_top, 0, 40, round ? 18 : 0),
      r_bottom: clampN(c.r_bottom, 0, 40, 18),
      border_w: clampN(c.border_w, 0, 6, 0),
      border_color: HEX.test(c.border_color || "") ? c.border_color : "#D9D6D0",
      tile: HEX.test(c.tile || "") ? c.tile : "#F1F0EE",
      hover_color: HEX.test(c.hover_color || "") ? c.hover_color : "#6E5848",
      hover_pct: clampN(c.hover_pct, 10, 90, 30),
      hover_op: clampN(c.hover_op, 10, 100, 100),
      shadow: ["none", "soft", "strong"].includes(c.shadow) ? c.shadow : "none",
      lift: clampN(c.lift, 0, 12, 0),
      hover_zoom: clampN(c.hover_zoom, 100, 115, 103),
      text_hover: c.text_hover === "dark" ? "dark" : "light",
      img_fit: ["cover", "contain"].includes(c.img_fit) ? c.img_fit : "auto",
    };
  }
  const SHADOWS = { none: "none", soft: "0 6px 20px rgba(20,20,20,.08)", strong: "0 14px 36px rgba(20,20,20,.18)" };
  function cardStyleVars(st) {
    return `--r-t:${st.r_top}px;--r-b:${st.r_bottom}px;--bw:${st.border_w}px;--bc:${st.border_color};--tile:${st.tile};--hv-color:${st.hover_color};--hv-pct:${st.hover_pct}%;--hv-op:${st.hover_op / 100};--sh:${SHADOWS[st.shadow]};--lift:${st.lift}px;--hz:${st.hover_zoom / 100};--hv-ink:${st.text_hover === "dark" ? "#1D1D1F" : "#fff"};--hv-ink2:${st.text_hover === "dark" ? "rgba(29,29,31,.75)" : "rgba(255,255,255,.85)"}`;
  }
  const PHOTO_BGS = [["white", "White"], ["glass", "Glass"], ["charcoal", "Charcoal"], ["black", "Black gradient"], ["solid", "Black solid"], ["custom", "Custom colour"]];
  // where = "card": the shop card uses its own background if one is set, otherwise the product view's
  function photoBgOf(p, where) {
    const all = (p && p.photo_bg) || {};
    const b = where === "card" && all.card && typeof all.card === "object" && all.card.style ? all.card : all;
    const style = PHOTO_BGS.some(([k]) => k === b.style) ? b.style : "white";
    return { style, color: HEX_RE.test(String(b.color || "")) ? b.color : "#7A5C46", own: b !== all };
  }
  // Per-part colours shown above the description, e.g. Shade — Beige, Frame — Black.
  const partsOf = (p) => (Array.isArray(p && p.parts) ? p.parts : []).filter((x) => x && String(x.color || "").trim());
  /* ---- product choices: two groups — Size (sets the price) and Colour / finish (optional extra charge) ---- */
  const productColors = (p) => (Array.isArray(p && p.colors) ? p.colors : []).filter((c) => c && c.enabled !== false && String(c.name || "").trim());
  const optGroup = (c) => (c && (c.group === "size" || c.group === "finish") ? c.group : c && c.hex ? "finish" : "size");
  const sizesOf = (p) => productColors(p).filter((c) => optGroup(c) === "size");
  // height / width / thickness of a size (or of the product) — only the ones that are filled in
  const dimsOf = (o) => (o && typeof o === "object" ? [["Height", o.h], ["Width", o.w], ["Thickness", o.t]] : []).map(([l, v]) => [l, String(v == null ? "" : v).trim()]).filter(([, v]) => v);
  const finishesOf = (p) => productColors(p).filter((c) => optGroup(c) === "finish");
  const extraOf = (f) => (f ? Math.max(0, num(f.extra)) : 0);
  function pickMedia(all, opt) {
    if (!opt || !Array.isArray(opt.media) || !opt.media.length) return null;
    const set = new Set(opt.media);
    const picked = all.filter((m) => set.has(mediaKey(m)));
    return picked.length ? picked : null;
  }
  /* photos for the current choice: finish photos win, then size photos, else all */
  function selMedia(p, size, finish) { const all = productMedia(p); return pickMedia(all, finish) || pickMedia(all, size) || all; }
  function colorMedia(p, a, b) { return selMedia(p, ...splitSel(a, b)); }
  function splitSel(a, b) { let size = null, finish = null; [a, b].forEach((c) => { if (c) { if (optGroup(c) === "finish") finish = c; else size = c; } }); return [size, finish]; }
  const optLabel = (p) => String((p && p.option_label) || "").trim() || cfg.OPTION_LABEL;
  const OPT = { one: cfg.OPTION_LABEL, many: cfg.OPTION_LABEL_PLURAL };
  const optText = (label, name) => (name ? `${label}: ${name}` : "");
  const selLabel = (size, finish) => [size && size.name, finish && finish.name].filter(Boolean).join(" · ");

  const onSale = (p) => p && p.sale_price != null && num(p.sale_price) > 0 && num(p.sale_price) < num(p.price);
  const unitPrice = (p) => (onSale(p) ? num(p.sale_price) : num(p.price));
  const percentOff = (orig, now) => (orig > 0 && now < orig ? Math.round((1 - now / orig) * 100) : 0);
  /* priced(product, size?, finish?) → {price, original}. A size with its own price replaces the product price; a finish adds its extra. */
  function priced(p, a, b) {
    const [size, finish] = splitSel(a, b);
    let base;
    if (size && num(size.price) > 0) { const o = num(size.price), s = num(size.sale_price); base = { price: s > 0 && s < o ? s : o, original: o }; }
    else base = { price: unitPrice(p), original: num(p.price) };
    const x = extraOf(finish);
    return { price: base.price + x, original: base.original + x };
  }
  function priceRange(p) {
    const sizes = sizesOf(p), fins = finishesOf(p);
    const bases = (sizes.length ? sizes : [null]).map((s) => priced(p, s, null));
    const extras = fins.length ? fins.map(extraOf) : [0];
    const lo = Math.min(...extras), hi = Math.max(...extras);
    const min = Math.min(...bases.map((x) => x.price)) + lo, max = Math.max(...bases.map((x) => x.price)) + hi;
    const maxOff = Math.max(0, ...bases.map((x) => percentOff(x.original, x.price)));
    const single = bases.length === 1 && lo === hi ? { price: bases[0].price + lo, original: bases[0].original + lo } : null;
    return { min, max, varies: min !== max, maxOff, anyOff: maxOff > 0, single };
  }
  function priceHtml(price, original) {
    return original > price
      ? `<span class="price-now">${money(price)}</span> <s class="price-was">${money(original)}</s>`
      : `<span class="price-now">${money(price)}</span>`;
  }
  function cardPriceHtml(p) {
    const r = priceRange(p);
    if (r.varies) return `<span class="price-from">From</span> <span class="price-now">${money(r.min)}</span>`;
    const one = r.single || priced(p);
    return priceHtml(one.price, one.original);
  }
  function swatchesHtml(p, max = 5) {
    const cs = finishesOf(p);
    if (!cs.length) return "";
    const shown = cs.slice(0, max).map((c) => `<span class="swatch" style="background:${swatchBg(c)}" title="${esc(c.name)}"></span>`).join("");
    return `<span class="swatches" aria-label="${cs.length} finishes">${shown}${cs.length > max ? `<span class="swatch-more">+${cs.length - max}</span>` : ""}</span>`;
  }
  function choicesText(p) {
    const s = sizesOf(p).length, f = finishesOf(p).length;
    return [s ? `${s} size${s > 1 ? "s" : ""}` : "", f ? `${f} finish${f > 1 ? "es" : ""}` : ""].filter(Boolean).join(" · ");
  }

  /* ---------- banks ---------- */
  const filled = (v) => String(v || "").trim().length > 0;
  const bankOk = (b) => !!(b && b.enabled && filled(b.bank_name) && (filled(b.account_number) || filled(b.iban)));
  const enabledBanks = (s) => (s && s.allow_transfer === false ? [] : (Array.isArray(s && s.bank_accounts) ? s.bank_accounts : []).filter(bankOk));
  const copyBtnHtml = (value, label) => `<button type="button" class="copy-btn" data-copy="${esc(value)}" aria-label="Copy ${esc(label)}">${ICONS.copy}<span>Copy</span></button>`;
  function bankCardsHtml(banks, selectable, chosen) {
    return banks.map((b, i) => `
      <div class="bank-card${selectable ? " selectable" : ""}${chosen === i ? " chosen" : ""}" ${selectable ? `role="radio" tabindex="0" aria-checked="${chosen === i}" data-bank="${i}"` : ""}>
        <div class="bank-logo">${b.logo_url && safeUrl(b.logo_url) ? `<img class="bank-logo-img" src="${esc(b.logo_url)}" alt="">` : `<span class="bank-logo-ph" aria-hidden="true">${esc(String(b.bank_name || "?").trim().charAt(0).toUpperCase())}</span>`}</div>
        <div class="bank-body">
          <div class="bank-head"><strong class="bank-name">${esc(b.bank_name)}</strong>${selectable ? `<span class="bank-tick">${ICONS.check}</span>` : ""}</div>
          ${filled(b.account_title) ? `<div class="bank-row"><span>Account title</span><b>${esc(b.account_title)}</b></div>` : ""}
          ${filled(b.account_number) ? `<div class="bank-row"><span>Account no.</span><b>${esc(b.account_number)}</b>${copyBtnHtml(b.account_number, "account number")}</div>` : ""}
          ${filled(b.iban) ? `<div class="bank-row"><span>IBAN</span><b class="mono">${esc(b.iban)}</b>${copyBtnHtml(b.iban, "IBAN")}</div>` : ""}
        </div>
      </div>`).join("");
  }
  async function copyText(v) { try { await navigator.clipboard.writeText(v); return true; } catch { const t = document.createElement("textarea"); t.value = v; document.body.appendChild(t); t.select(); const ok = document.execCommand("copy"); t.remove(); return ok; } }
  function flashCopied(btn) { const span = btn.querySelector("span"); const old = span ? span.textContent : ""; btn.classList.add("copied"); if (span) span.textContent = "Copied"; setTimeout(() => { btn.classList.remove("copied"); if (span) span.textContent = old; }, 1500); }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-copy]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (await copyText(b.getAttribute("data-copy"))) flashCopied(b);
  });

  /* ---------- is a photo a white-background product shot? (cached per URL) ---------- */
  const studioCache = new Map();
  function isStudio(url) {
    if (!url) return Promise.resolve(null);
    if (studioCache.has(url)) return studioCache.get(url);
    const job = new Promise((res) => {
      try {
        const probe = new Image(); probe.crossOrigin = "anonymous";
        probe.onload = () => {
          try {
            const c = document.createElement("canvas"), W = 40, H = Math.max(1, Math.round(40 * probe.naturalHeight / probe.naturalWidth));
            c.width = W; c.height = H; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(probe, 0, 0, W, H);
            const pts = [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2], [W >> 1, 1], [1, H >> 1], [W - 2, H >> 1]];
            const light = pts.filter(([px, py]) => { const d = x.getImageData(px, py, 1, 1).data; return d[3] < 20 || (d[0] > 228 && d[1] > 228 && d[2] > 228); }).length;
            res(light >= 6);
          } catch (e) { res(null); }
        };
        probe.onerror = () => res(null);
        probe.src = url;
      } catch (e) { res(null); }
    });
    studioCache.set(url, job); return job;
  }
  // recommended photo shapes (shown in admin)
  const PHOTO_GUIDE = { card: "almost square · 1600 × 1500 px", hero: "16:9 landscape · 2400 × 1350 px", tile: "5:4 · 1500 × 1200 px", logo: "square · 512 × 512 px" };

  /* ---------- brand colour (admin → Settings → Brand colour) ---------- */
  const DEFAULT_BRAND = "#043927";
  const BRAND_KEY = "dv_brand_color";
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const rgbHex = (r) => "#" + r.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
  const lum = (h) => { const c = hexRgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const mixHex = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return rgbHex(A.map((v, i) => v + (B[i] - v) * t)); };
  // every shade the site needs, worked out from one picked colour
  function brandPalette(hex) {
    hex = /^#[0-9a-f]{6}$/i.test(hex || "") ? hex.toUpperCase() : DEFAULT_BRAND;
    const onBlue = contrast(hex, "#FFFFFF") >= 3 ? "#FFFFFF" : "#1D1D1F";
    const hover = lum(hex) > 0.4 ? mixHex(hex, "#000000", 0.12) : mixHex(hex, "#FFFFFF", 0.14);
    // text/links in the brand colour must stay readable on white
    let ink = lum(hex) < 0.02 ? mixHex(hex, "#FFFFFF", 0.22) : hex;
    for (let i = 0; i < 20 && contrast(ink, "#FFFFFF") < 4.6; i++) ink = mixHex(ink, "#000000", 0.08);
    return { blue: hex, hover, ink, onBlue };
  }
  const GRAD_DIRS = { r: "to right", l: "to left", d: "to bottom", u: "to top", dr: "135deg", ur: "45deg", dl: "225deg", ul: "315deg", radial: "radial" };
  function normStyle(st) {
    st = st && typeof st === "object" ? st : {};
    const hx = (v) => (/^#[0-9a-f]{6}$/i.test(v || "") ? v.toUpperCase() : "");
    const f = st.footer && typeof st.footer === "object" ? st.footer : {};
    const footer = { source: f.source === "custom" && hx(f.c1) ? "custom" : "brand", c1: hx(f.c1), gradient: f.gradient !== false, c2: hx(f.c2), dir: GRAD_DIRS[f.dir] ? f.dir : "d" };
    return { mode: st.mode === "gradient" && hx(st.c2) ? "gradient" : "solid", c2: hx(st.c2), dir: GRAD_DIRS[st.dir] ? st.dir : "dr", glass: !!st.glass, footer };
  }
  const gradCss = (a, b, dir) => GRAD_DIRS[dir] === "radial" ? `radial-gradient(circle at 30% 25%, ${a}, ${b})` : `linear-gradient(${GRAD_DIRS[dir] || "135deg"}, ${a}, ${b})`;
  // full look: solid or gradient fill, readable text on it, optional 3D glass buttons
  function brandLook(hex, style) {
    const p = brandPalette(hex), st = normStyle(style);
    let bg = p.blue, bgHover = p.hover, on = p.onBlue;
    if (st.mode === "gradient") {
      const q = brandPalette(st.c2);
      bg = gradCss(p.blue, q.blue, st.dir); bgHover = gradCss(p.hover, q.hover, st.dir);
      on = (contrast(p.blue, "#FFFFFF") + contrast(q.blue, "#FFFFFF")) / 2 >= 2.6 ? "#FFFFFF" : "#1D1D1F";
    }
    // footer: brand colour or its own, with or without a gradient
    const F = st.footer; let fbg, fink;
    if (F.source === "custom") {
      const a1 = F.c1, a2 = F.gradient && F.c2 ? F.c2 : "";
      fbg = a2 ? gradCss(a1, a2, F.dir) : a1;
      fink = (a2 ? (contrast(a1, "#FFFFFF") + contrast(a2, "#FFFFFF")) / 2 : contrast(a1, "#FFFFFF")) >= 2.6 ? "#FFFFFF" : "#1D1D1F";
    } else {
      fbg = F.gradient ? bg : p.blue; fink = F.gradient ? on : p.onBlue;
    }
    return { ...p, onBlue: on, bg, bgHover, style: st, footerBg: fbg, footerInk: fink };
  }
  function applyBrand(hex, remember, style) {
    const p = brandLook(hex, style), r = document.documentElement.style;
    r.setProperty("--blue", p.blue); r.setProperty("--blue-hover", p.hover); r.setProperty("--blue-ink", p.ink); r.setProperty("--on-blue", p.onBlue);
    r.setProperty("--brand-bg", p.bg); r.setProperty("--brand-bg-hover", p.bgHover); r.setProperty("--footer-bg", p.footerBg); r.setProperty("--footer-ink", p.footerInk);
    document.documentElement.classList.toggle("glass3d", p.style.glass);
    // text selection can't read CSS variables in every browser, so write the real colours
    let sel = document.getElementById("brandSel");
    if (!sel) { sel = document.createElement("style"); sel.id = "brandSel"; (document.head || document.documentElement).appendChild(sel); }
    sel.textContent = `::selection{background:${p.blue};color:${p.onBlue}}::-moz-selection{background:${p.blue};color:${p.onBlue}}`;
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", p.blue);
    if (remember !== false) { try { const isDefault = (!hex || hex.toUpperCase() === DEFAULT_BRAND) && p.style.mode === "solid" && !p.style.glass && p.style.footer.source === "brand"; isDefault ? localStorage.removeItem(BRAND_KEY) : localStorage.setItem(BRAND_KEY, JSON.stringify({ c: p.blue, s: p.style })); } catch {} }
    return p;
  }
  // 2.0 pages also take the Design 2.0 colours (assets/theme2.js); the brand colour above is Version Zero's
  const applyBrandFrom = (s, remember) => {
    const de = document.documentElement;
    if (s && window.DivaarTheme && de.dataset && de.dataset.theme2 !== "off") window.DivaarTheme.apply(s.theme2, remember);
    return applyBrand(s && s.brand_color, remember, s && s.brand_style);
  };
  // paint the last known colour straight away (no green flash while settings load)
  try { const c = localStorage.getItem(BRAND_KEY); if (c) { const j = c.startsWith("{") ? JSON.parse(c) : { c }; applyBrand(j.c, false, j.s); } } catch {}

  /* ---------- rich text (admin formatting toolbar → safe HTML) ----------
     # Heading   ## Small heading   **bold**   *italic*   __underline__   ~~strike~~
     - bullet    1. numbered        > quote    --- divider   (blank line = new paragraph) */
  function richInline(t) {
    return t
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>")
      .replace(/__(?=\S)([\s\S]*?\S)__/g, "<u>$1</u>")
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<s>$1</s>")
      .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, "$1<em>$2</em>")
      .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?![\w])/g, "$1<em>$2</em>");
  }
  function richText(src) {
    const lines = esc(String(src || "")).replace(/\r\n?/g, "\n").split("\n");
    const out = []; let para = [], list = null;
    const flushP = () => { if (para.length) { out.push(`<p>${para.map(richInline).join("<br>")}</p>`); para = []; } };
    const flushL = () => { if (list) { out.push(`<${list.t}>${list.items.map((x) => `<li>${richInline(x)}</li>`).join("")}</${list.t}>`); list = null; } };
    for (const raw of lines) {
      const ln = raw.trimEnd();
      let m;
      if (!ln.trim()) { flushP(); flushL(); continue; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(ln)) { flushP(); flushL(); out.push("<hr>"); continue; }
      if ((m = ln.match(/^#{2,6}\s+(.*)$/))) { flushP(); flushL(); out.push(`<h4 class="rt-h2">${richInline(m[1])}</h4>`); continue; }
      if ((m = ln.match(/^#\s+(.*)$/))) { flushP(); flushL(); out.push(`<h3 class="rt-h1">${richInline(m[1])}</h3>`); continue; }
      if ((m = ln.match(/^&gt;\s?(.*)$/))) { flushP(); flushL(); out.push(`<blockquote>${richInline(m[1])}</blockquote>`); continue; }
      if ((m = ln.match(/^\s*[-•]\s+(.*)$/))) { flushP(); if (!list || list.t !== "ul") { flushL(); list = { t: "ul", items: [] }; } list.items.push(m[1]); continue; }
      if ((m = ln.match(/^\s*\d+[.)]\s+(.*)$/))) { flushP(); if (!list || list.t !== "ol") { flushL(); list = { t: "ol", items: [] }; } list.items.push(m[1]); continue; }
      flushL(); para.push(ln);
    }
    flushP(); flushL();
    return out.join("");
  }
  // one-line places (hero subtitle): keep line breaks, inline formatting only
  const richLine = (src) => esc(String(src || "")).split(/\r?\n/).map(richInline).join("<br>");
  const plainText = (src) => String(src || "").replace(/^#{1,6}\s+|^>\s?|^\s*[-•]\s+|^\s*\d+[.)]\s+|^\s*-{3,}\s*$/gm, "").replace(/\*\*|__|~~/g, "").replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*/g, "$1$2");

  /* ---------- payment screenshots ---------- */
  const RECEIPT_TIPS = [
    "Photo must be clear — not blurry, dark or cut off",
    "Transaction ID (TID / reference no.) must be visible",
    "Amount, date & time must be visible",
    "The account you paid into (name / last digits) must be visible",
    "Send the original screenshot — don't edit or crop it",
    "JPG, PNG, WebP or PDF · up to 5 MB"];
  function receiptProblem(file) {
    if (!file) return "Please choose a file.";
    if (!/^(image\/(png|jpeg|webp)|application\/pdf)$/.test(file.type)) return "Please upload a JPG, PNG, WebP or PDF file.";
    if (file.size > 5 * 1024 * 1024) return "That file is larger than 5 MB.";
    return "";
  }
  async function uploadReceipt(file) {
    const p = receiptProblem(file); if (p) throw new Error(p);
    const ext = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `pending/${uid()}.${ext}`;
    const { error } = await client.storage.from("payment-receipts").upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return path;
  }
  function receiptPreviewHtml(file) {
    if (!file) return "";
    if (file.type === "application/pdf") return `<div class="receipt-pdf">PDF · ${esc(file.name)}</div>`;
    return `<img src="${URL.createObjectURL(file)}" alt="Payment screenshot preview">`;
  }
  function mountUploader(box, onFile) {
    const input = box.querySelector("input[type=file]");
    const drop = box.querySelector(".drop");
    const pick = (f) => { const p = receiptProblem(f); if (p) { toast(p, "error"); return; } onFile(f); };
    input.addEventListener("change", () => input.files[0] && pick(input.files[0]));
    ["dragover", "dragenter"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("over")));
    drop.addEventListener("drop", (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) pick(f); });
  }

  /* ---------- reviews ---------- */
  const starsHtml = (n) => `<span class="stars" aria-label="${n} out of 5 stars">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= n ? "on" : ""}">${ICONS.star}</span>`).join("")}</span>`;
  function reviewCardHtml(r, products) {
    const prod = r.product_id && products ? products.find((p) => p.id === r.product_id) : null;
    const photos = (Array.isArray(r.photos) ? r.photos : []).filter((x) => safeUrl(x.url));
    const long = (r.body || "").length > 220;
    return `<article class="review-card">
      <div class="review-top">${starsHtml(r.rating)}<time>${esc(fmtDate(r.review_date))}</time></div>
      ${r.body ? `<div class="review-body rt${long ? " clamp" : ""}">${richText(r.body)}</div>${long ? `<button type="button" class="link-btn read-more">Read more</button>` : ""}` : ""}
      ${photos.length ? `<div class="review-photos">${photos.map((ph, i) => `<button type="button" class="review-photo${isVideo(ph) ? " is-video" : ""}" data-photos='${esc(JSON.stringify(photos.map((x) => x.url)))}' data-index="${i}" aria-label="Open ${isVideo(ph) ? "video" : "photo"} ${i + 1}">${isVideo(ph) ? `<video src="${esc(ph.url)}#t=0.1" muted playsinline preload="metadata"></video><span class="rp-play">${ICONS.play}</span>` : `<img src="${esc(ph.url)}" alt="" loading="lazy">`}</button>`).join("")}</div>` : ""}
      <div class="review-who"><strong>${esc(r.customer_name)}</strong>${r.city ? ` · ${esc(r.city)}` : ""}</div>
      ${prod ? `<div class="review-chip">${esc(prod.name)}</div>` : ""}
    </article>`;
  }
  function reviewSummaryHtml(list) {
    if (!list.length) return "";
    const avg = list.reduce((a, r) => a + num(r.rating), 0) / list.length;
    return `<div class="review-summary"><span class="review-avg">${avg.toFixed(1)}</span>${starsHtml(Math.round(avg))}<span>${list.length} review${list.length === 1 ? "" : "s"}</span></div>`;
  }
  async function fetchReviews() {
    if (!client) return [];
    const { data, error } = await client.from("reviews").select("*").eq("is_visible", true).order("is_pinned", { ascending: false }).order("review_date", { ascending: false }).limit(60);
    return error ? [] : data || [];
  }
  function bindReviewUi(root) {
    root.addEventListener("click", (e) => {
      const rm = e.target.closest(".read-more");
      if (rm) { const p = rm.previousElementSibling; p.classList.toggle("clamp"); rm.textContent = p.classList.contains("clamp") ? "Read more" : "Show less"; return; }
      const ph = e.target.closest(".review-photo");
      if (ph) { try { openPhotos(JSON.parse(ph.dataset.photos), num(ph.dataset.index)); } catch {} }
    });
  }
  async function mountReviewStrip(el, products) {
    const list = await fetchReviews();
    if (!list.length) { el.hidden = true; return []; }
    el.hidden = false;
    el.innerHTML = `<div class="wrap"><div class="section-head"><h2>From our customers</h2>${reviewSummaryHtml(list)}</div><div class="review-row">${list.slice(0, 12).map((r) => reviewCardHtml(r, products)).join("")}</div></div>`;
    bindReviewUi(el);
    return list;
  }

  /* ---------- photo viewer ---------- */
  function openPhotos(urls, start) {
    urls = (urls || []).filter(safeUrl);
    if (!urls.length) return;
    let i = start || 0;
    let dlg = document.getElementById("photoViewer");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "photoViewer"; dlg.className = "viewer";
      dlg.innerHTML = `<button type="button" class="icon-btn viewer-close" aria-label="Close">${ICONS.close}</button><button type="button" class="icon-btn viewer-prev" aria-label="Previous photo">${ICONS.left}</button><img alt="Photo"><video controls playsinline hidden></video><button type="button" class="icon-btn viewer-next" aria-label="Next photo">${ICONS.right}</button><div class="viewer-count"></div>`;
      document.body.appendChild(dlg);
      dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest(".viewer-close")) dlg.close(); });
      dlg.addEventListener("close", () => { const v = dlg.querySelector("video"); if (v) v.pause(); });
    }
    const img = dlg.querySelector("img"), cnt = dlg.querySelector(".viewer-count");
    const vid = dlg.querySelector("video");
    const show = () => { const v = isVideo({ url: urls[i] }); img.hidden = v; vid.hidden = !v; if (v) { vid.src = urls[i]; vid.play().catch(() => {}); } else { vid.pause(); vid.removeAttribute("src"); img.src = urls[i]; } cnt.textContent = urls.length > 1 ? `${i + 1} / ${urls.length}` : ""; dlg.querySelector(".viewer-prev").hidden = dlg.querySelector(".viewer-next").hidden = urls.length < 2; };
    dlg.querySelector(".viewer-prev").onclick = () => { i = (i - 1 + urls.length) % urls.length; show(); };
    dlg.querySelector(".viewer-next").onclick = () => { i = (i + 1) % urls.length; show(); };
    show();
    if (!dlg.open) dlg.showModal();
  }

  /* ---------- visit tracking ---------- */
  const ADMIN_FLAG = storeKey("admin_browser");
  const isAdminBrowser = () => { try { return localStorage.getItem(ADMIN_FLAG) === "1"; } catch { return false; } };
  const setAdminBrowser = (on) => { try { on ? localStorage.setItem(ADMIN_FLAG, "1") : localStorage.removeItem(ADMIN_FLAG); } catch {} };
  function visitorId() {
    try { let v = localStorage.getItem(storeKey("visitor")); if (!v) { v = uid(); localStorage.setItem(storeKey("visitor"), v); } return v; } catch { return "anon-" + uid(); }
  }
  function sessionId() {
    try { let v = sessionStorage.getItem(storeKey("session")); if (!v) { v = uid().slice(0, 18); sessionStorage.setItem(storeKey("session"), v); } return v; } catch { return "s-" + uid().slice(0, 8); }
  }
  function source() {
    try {
      const cached = sessionStorage.getItem(storeKey("source"));
      if (cached) return cached;
      const q = new URLSearchParams(location.search);
      const ua = navigator.userAgent || "";
      let s = q.get("utm_source") || q.get("ref") || q.get("src") || "";
      if (!s) {
        if (/Instagram/i.test(ua)) s = "instagram";
        else if (/FBAN|FBAV|FB_IAB/i.test(ua)) s = "facebook";
        else if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) s = "tiktok";
        else if (/Snapchat/i.test(ua)) s = "snapchat";
        else if (/Pinterest/i.test(ua)) s = "pinterest";
        else if (/LinkedInApp/i.test(ua)) s = "linkedin";
        else if (/Threads/i.test(ua)) s = "threads";
        else if (q.get("fbclid")) s = "facebook";
        else if (q.get("gclid")) s = "google ads";
        else if (q.get("ttclid")) s = "tiktok";
        else if (document.referrer) { try { const h = new URL(document.referrer).hostname.replace(/^www\.|^m\.|^l\./, ""); s = h === location.hostname ? "" : h; } catch {} }
      }
      s = (s || "direct").toLowerCase().slice(0, 60);
      sessionStorage.setItem(storeKey("source"), s);
      return s;
    } catch { return "direct"; }
  }
  const device = () => { const w = Math.min(screen.width || innerWidth, innerWidth); return /iPad|Tablet/i.test(navigator.userAgent) || (w >= 600 && w < 1024 && "ontouchstart" in window) ? "tablet" : w < 600 ? "mobile" : "desktop"; };
  function track(event, extra) {
    if (!client || isAdminBrowser() || /[?&](diag|preview)=/.test(location.search) || navigator.webdriver || /bot|crawl|spider|preview/i.test(navigator.userAgent)) return;
    const payload = Object.assign({ visitor_id: visitorId(), session_id: sessionId(), event, path: location.pathname + (extra && extra.hash ? extra.hash : ""), referrer: source(), device: device() }, extra || {});
    delete payload.hash;
    client.rpc("track_event", { p: payload }).then(() => {}, () => {});
  }

  const COUPON_RE = /^[A-Z0-9]{2,12}-[0-9]{6}-(5|10|15|20|25|30|35|40|45|50)$/;

  /* ---------- menu bar look (Admin → Settings → Menu bar) ---------- */
  const NAV_KEYS = ["home", "categories", "shop", "reviews", "custom", "blog", "contact", "cta"];
  const NAV_LABEL = { home: "Home", categories: "Categories", shop: "Shop", reviews: "Reviews", custom: "Custom", blog: "Blog", contact: "Contact", cta: "" };
  const NAV_DEF = { text: "brand", text_hex: "#1D1D1F", weight: 600, font: 14, brand_size: 19, gap: 2, pad_x: 14, pad_y: 6, radius: 22, tint_hex: "#FFFFFF", tint: 0, cta: "md", labels: {}, hide: {},
    shadow: false, sh_hex: "#000000", sh_blur: 6, sh_y: 2, sh_op: 30, outline: false, ol_hex: "#FFFFFF", ol_w: 1,
    act: "brand", act_hex: "#FFFFFF", act_op: 100, act_text: "auto", act_text_hex: "#FFFFFF" };
  function normNav(v, inner) {
    const o = Object.assign({}, NAV_DEF, v && typeof v === "object" ? v : {});
    // phones can have their own full set of settings; without it they follow the website settings
    o.mobile = !inner && v && v.mobile && typeof v.mobile === "object" ? normNav(v.mobile, true) : null;
    if (inner) delete o.mobile;
    const cl = (x, a, b, d) => { const n = Number(x); return Number.isFinite(n) ? Math.max(a, Math.min(b, Math.round(n))) : d; };
    o.text = ["brand", "dark", "custom"].includes(o.text) ? o.text : "brand";
    o.text_hex = /^#[0-9a-f]{6}$/i.test(o.text_hex) ? o.text_hex : NAV_DEF.text_hex;
    o.tint_hex = /^#[0-9a-f]{6}$/i.test(o.tint_hex) ? o.tint_hex : NAV_DEF.tint_hex;
    o.weight = [400, 500, 600, 700, 800].includes(Number(o.weight)) ? Number(o.weight) : 600;
    o.font = cl(o.font, 12, 18, 14); o.brand_size = cl(o.brand_size, 14, 28, 19); o.gap = cl(o.gap, 0, 28, 2);
    o.pad_x = cl(o.pad_x, 6, 24, 14); o.pad_y = cl(o.pad_y, 2, 16, 6); o.radius = cl(o.radius, 8, 32, 22); o.tint = cl(o.tint, 0, 85, 0);
    o.cta = ["sm", "md", "lg"].includes(o.cta) ? o.cta : "md";
    o.shadow = o.shadow === true; o.outline = o.outline === true;
    o.act = ["brand", "white", "custom"].includes(o.act) ? o.act : "brand"; o.act_text = ["auto", "custom"].includes(o.act_text) ? o.act_text : "auto";
    o.act_hex = /^#[0-9a-f]{6}$/i.test(o.act_hex) ? o.act_hex : NAV_DEF.act_hex; o.act_text_hex = /^#[0-9a-f]{6}$/i.test(o.act_text_hex) ? o.act_text_hex : NAV_DEF.act_text_hex;
    o.act_op = cl(o.act_op, 10, 100, 100);
    o.sh_hex = /^#[0-9a-f]{6}$/i.test(o.sh_hex) ? o.sh_hex : NAV_DEF.sh_hex; o.ol_hex = /^#[0-9a-f]{6}$/i.test(o.ol_hex) ? o.ol_hex : NAV_DEF.ol_hex;
    o.sh_blur = cl(o.sh_blur, 0, 24, 6); o.sh_y = cl(o.sh_y, -6, 10, 2); o.sh_op = cl(o.sh_op, 5, 100, 30); o.ol_w = cl(o.ol_w * 2, 1, 6, 2) / 2;
    const lab = {}, hide = {};
    NAV_KEYS.forEach((k) => { const t = String((o.labels || {})[k] || "").trim().slice(0, 28); if (t) lab[k] = t; if (o.hide && o.hide[k] === true) hide[k] = true; });
    o.labels = lab; o.hide = hide;
    return o;
  }
  function navVars(v) {
    const o = normNav(v);
    const hx = o.tint_hex.slice(1), rgb = [0, 2, 4].map((i) => parseInt(hx.slice(i, i + 2), 16));
    const cta = { sm: ["32px", "13px", "13px"], md: ["36px", "14px", "16px"], lg: ["42px", "15px", "20px"] }[o.cta];
    const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const rgba = (h, a) => `rgba(${[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(",")},${a})`;
    return {
      "--nav-ink": o.text === "brand" ? "var(--blue-ink, var(--blue))" : o.text === "dark" ? "#1D1D1F" : o.text_hex,
      "--nav-fw": String(o.weight), "--nav-fs": o.font + "px", "--nav-brand-fs": o.brand_size + "px",
      "--nav-gap": o.gap + "px", "--nav-px": o.pad_x + "px", "--nav-py": o.pad_y + "px", "--nav-radius": o.radius + "px",
      "--nav-tint": `rgba(${rgb.join(",")},${(o.tint / 100).toFixed(2)})`,
      "--nav-cta-h": cta[0], "--nav-cta-fs": cta[1], "--nav-cta-px": cta[2],
      "--nav-ts": o.shadow ? `0 ${o.sh_y}px ${o.sh_blur}px ${rgba(o.sh_hex, (o.sh_op / 100).toFixed(2))}` : "none",
      "--nav-stroke-w": o.outline ? o.ol_w + "px" : "0px", "--nav-stroke-c": o.outline ? o.ol_hex : "transparent",
      // selected button: a solid pill (brand / white / own colour) with readable text on it
      "--nav-act-bg": o.act === "brand" ? `color-mix(in srgb, var(--blue) ${o.act_op}%, transparent)` : rgba(o.act === "white" ? "#FFFFFF" : o.act_hex, (o.act_op / 100).toFixed(2)),
      "--nav-act-ink": o.act_text === "custom" ? o.act_text_hex : o.act === "brand" ? "var(--on-blue, #fff)" : o.act === "white" ? "#1D1D1F" : (lum(o.act_hex) > 0.55 ? "#1D1D1F" : "#FFFFFF"),
    };
  }

  /* ---------- page addresses (same rules in the shop and in scripts/prerender.mjs) ----------
     divaar.pk/<category>                         e.g. /lamps
     divaar.pk/<category>/<type>                  e.g. /lamps/table-lamps
     divaar.pk/<category>/<type>/<product>        e.g. /lamps/table-lamps/moyo-metal-table-lamp
     divaar.pk/<category>/<product>               (product with no type) */
  const slugify = (x) => String(x || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const RESERVED = new Set(["admin", "receipt", "policy", "policies", "product", "products", "category", "assets", "brand", "supabase", "scripts", "index", "config", "sitemap", "robots", "favicon", "apple-touch-icon", "admin-favicon", "favicon-32", "404", "api", "shop", "blog", "ur"]);
  function siteUrls(products) {
    const list = (products || []).slice().sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.id).localeCompare(String(b.id)));
    const catName = {}, used = new Set(), byId = {};
    const catSlug = (c) => { let s = slugify(c) || "collection"; if (RESERVED.has(s)) s += "-collection"; return s; };
    const cat = (c) => "/" + catSlug(c);
    const sub = (c, t) => `${cat(c)}/${slugify(t) || "type"}`;
    list.forEach((p) => { if (p.category) { used.add(cat(p.category)); if (String(p.subcategory || "").trim()) used.add(sub(p.category, p.subcategory)); } });
    list.forEach((p) => {
      const base = (p.category ? (String(p.subcategory || "").trim() ? sub(p.category, p.subcategory) : cat(p.category)) : "/shop") + "/";
      const name = slugify([p.name, p.variant_name].filter(Boolean).join(" ")).slice(0, 70).replace(/-+$/, "") || "piece";
      let path = base + name, n = 2;
      while (used.has(path)) path = `${base}${name}-${n++}`;
      used.add(path); byId[p.id] = path;
    });
    return { cat, sub, product: (p) => byId[p && p.id] || "/" , slugify };
  }

  /* ---------- page sections: order, hide/show and dividers (Admin → Website look → Page sections) ----------
     Saved in store_settings.page_layout = { home: [...], category: [...], product: [...] }, each a list of
     { k: "<section>" , off?: true } and { k: "divider", id, style, text }. A page with nothing saved keeps the
     standard order. The hero (and on inner pages the page's own content) always stays at the top. */
  const LAYOUT_PAGES = [["home", "Home page"], ["category", "Category pages"], ["product", "Product pages"]];
  const LAYOUT_SECTIONS = [
    ["products", "Find your piece — search & category chips"],
    ["wall", "Wall art row"],
    ["lamps", "Lamps row"],
    ["more", "Furniture & more row"],
    ["spotlight", "Featured pieces & offer cards"],
    ["ticker", "Moving words bar"],
    ["lamptry", "Try our lamp"],
    ["perks", "Why Divaar (4 promises)"],
    ["reviews", "Customer reviews"],
    ["custom", "Custom order form"],
    ["guides", "Ideas & guides (blog)", "home"],
  ];
  const DIVIDER_STYLES = [["ticker", "Moving words bar"], ["glow", "Colour bar"], ["line", "Thin line"], ["stars", "Little stars"], ["space", "Extra space"]];
  const layoutDefault = (page) => LAYOUT_SECTIONS.filter((x) => !x[2] || x[2] === page).map(([k]) => ({ k }));
  // a clean list for one page; null when nothing was saved for it (standard order)
  function pageLayout(raw, page) {
    const list = raw && typeof raw === "object" && Array.isArray(raw[page]) ? raw[page] : null;
    if (!list || !list.length) return null;
    const ok = new Set(LAYOUT_SECTIONS.filter((x) => !x[2] || x[2] === page).map((x) => x[0])), seen = new Set(), out = [];
    list.forEach((it) => {
      if (!it || typeof it !== "object") return;
      if (it.k === "divider") {
        const id = String(it.id || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "d" + Math.random().toString(36).slice(2, 9);
        if (seen.has("d:" + id)) return; seen.add("d:" + id);
        out.push({ k: "divider", id, style: DIVIDER_STYLES.some((d) => d[0] === it.style) ? it.style : "ticker", text: String(it.text || "").slice(0, 300) });
      } else if (ok.has(it.k) && !seen.has(it.k)) { seen.add(it.k); out.push(it.off ? { k: it.k, off: true } : { k: it.k }); }
    });
    // sections added to the site later still show (at the end) until they are placed
    layoutDefault(page).forEach((x) => { if (!seen.has(x.k)) out.push(x); });
    return out;
  }

  // one divider's markup; `words` = the shop's ticker words (used when the divider has no words of its own)
  function dividerHtml(d, words) {
    const own = String(d.text || "").split(/\n|,/).map((x) => x.trim()).filter(Boolean);
    const list = own.length ? own : (words && words.length ? words : ["Handmade in Pakistan"]);
    const attrs = `class="dv-div dv-${d.style}${d.style === "ticker" ? " ticker" : ""}" data-dv-id="${esc(d.id)}" aria-hidden="true"`;
    if (d.style === "ticker") { let l = list.slice(); while (l.length < 8) l = l.concat(list); const run = l.map((w) => `<span>${esc(w)}</span>`).join(""); return `<div ${attrs}><div class="ticker-track">${run}${run}</div></div>`; }
    if (d.style === "line" || d.style === "stars") return `<div ${attrs}><div class="wrap">${d.style === "stars" ? "<i>✦</i><i>✦</i><i>✦</i>" : `${own.length ? `<span>${esc(own.join(" · "))}</span>` : ""}`}</div></div>`;
    return `<div ${attrs}><div class="wrap"><i></i></div></div>`;
  }

  window.Store = {
    slugify, siteUrls, LAYOUT_PAGES, LAYOUT_SECTIONS, DIVIDER_STYLES, layoutDefault, pageLayout, dividerHtml,
    NAV_KEYS, NAV_LABEL, NAV_DEF, normNav, navVars,
    cfg, LOCALE, TIME_ZONE, storeKey, COUPON_PREFIX: cfg.COUPON_PREFIX, OPT, optText, optLabel, client, configured,
    esc, num, money, safeUrl, fmtDate, fmtDateTime, toast, debounce, uid, errText, waNumber, waLink, ICONS,
    socialLinks, socialHtml, productMedia, productImages, isVideo, onSale, unitPrice, percentOff, priceHtml,
    productColors, colorMedia, mediaKey, safeHex, finHexes, swatchBg, partsOf, PHOTO_BGS, photoBgOf, swatchesHtml, priced, priceRange, cardPriceHtml,
    optGroup, sizesOf, dimsOf, finishesOf, extraOf, selMedia, selLabel, choicesText,
    enabledBanks, bankOk, bankCardsHtml, richText, richLine, richInline, plainText, isStudio, PHOTO_GUIDE, applyBrand, applyBrandFrom, brandPalette, brandLook, normStyle, gradCss, GRAD_DIRS, contrast, DEFAULT_BRAND, mediaStyle, cardStyle, cardStyleVars, copyBtnHtml, copyText, flashCopied,
    RECEIPT_TIPS, receiptProblem, uploadReceipt, receiptPreviewHtml, mountUploader,
    starsHtml, reviewCardHtml, reviewSummaryHtml, fetchReviews, bindReviewUi, mountReviewStrip, openPhotos,
    track, source, visitorId, setAdminBrowser, isAdminBrowser, COUPON_RE
  };
})();
