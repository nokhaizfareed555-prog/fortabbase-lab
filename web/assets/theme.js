/* Light and dark mode for the website and the admin panel. Runs in <head>, before anything is drawn,
   so a page never flashes white before turning dark. Settings: Admin > Look > Dark mode (key darkMode).
   Modes: device (follow the phone or computer setting), time (dark between two times on the viewer's clock),
   light, dark. If the light/dark button is on, a viewer's own choice is kept on their device. */
(function () {
  if (window.FA_THEME) return;
  var h = document.documentElement, mq = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
  var get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var put = function (k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  var DEF = { site: { mode: "device", from: "19:00", to: "06:30", button: true, place: "nav" }, admin: { mode: "device", from: "19:00", to: "06:30", button: true } };
  var T = { scope: "site", cfg: null, dark: false, timer: 0, ready: false };
  var mins = function (s) { var m = /^(\d{1,2}):(\d{2})/.exec(s || ""); return m ? (+m[1] % 24) * 60 + (+m[2] % 60) : null; };
  function part() { var c = T.cfg || {}, d = DEF[T.scope] || DEF.site, o = {}; for (var k in d) { var v = c[T.scope + k.charAt(0).toUpperCase() + k.slice(1)]; o[k] = v == null || v === "" ? d[k] : v; }
    var f = /[?&]fa_dm=(dark|light)/.exec(location.search); if (f) { o.mode = f[1]; o.button = false; } // admin preview frames
    return o; }
  function auto() {
    var p = part();
    if (p.mode === "dark") return true;
    if (p.mode === "light") return false;
    if (p.mode === "time") {
      var a = mins(p.from), b = mins(p.to), d = new Date(), n = d.getHours() * 60 + d.getMinutes();
      if (a == null || b == null || a === b) return false;
      return a < b ? n >= a && n < b : n >= a || n < b;
    }
    return !!(mq && mq.matches);
  }
  var KEY = function () { return "fa_tm_" + T.scope; };
  function own() { var p = part(); if (!p.button) return null; var v = get(KEY()); return v === "dark" || v === "light" ? v : null; }
  function vars() {
    var c = T.cfg || {}, s = h.style, hex = /^#[0-9a-f]{6}$/i;
    var set = function (n, v) { v ? s.setProperty(n, v) : s.removeProperty(n); };
    set("--dm-bg", hex.test(c.bg || "") ? c.bg : "");
    set("--dm-ink", hex.test(c.ink || "") ? c.ink : "");
    set("--dm-muted", hex.test(c.muted || "") ? c.muted : "");
    set("--dm-sfr", hex.test(c.surface || "") ? [1, 3, 5].map(function (i) { return parseInt(c.surface.substr(i, 2), 16); }).join(" ") : "");
  }
  function meta() {
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement("meta"); m.name = "theme-color"; (document.head || h).appendChild(m); }
    m.content = T.dark ? ((T.cfg && T.cfg.bg) || "#0d131d") : (m.getAttribute("data-light") || "#ffffff");
  }
  function logo() {
    var c = T.cfg || {}, L = c.logo, D = c.logoDark;
    if (!L || !D || !document.body) return;
    var imgs = document.getElementsByTagName("img");
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i], src = im.getAttribute("src") || "";
      if (T.dark && src === L) { im.setAttribute("src", D); im.dataset.faLogo = "1"; }
      else if (!T.dark && im.dataset.faLogo && src === D) im.setAttribute("src", L);
    }
  }
  function apply(fade) {
    var o = own(), was = T.dark;
    T.dark = o ? o === "dark" : auto();
    if (fade && T.ready && was !== T.dark) { h.classList.add("fa-tt"); clearTimeout(T.ft); T.ft = setTimeout(function () { h.classList.remove("fa-tt"); }, 450); }
    h.setAttribute("data-theme", T.dark ? "dark" : "light");
    vars(); meta(); logo(); button();
    if (was !== T.dark && T.ready) { try { window.dispatchEvent(new CustomEvent("fa-theme", { detail: { dark: T.dark } })); } catch (e) {} }
    schedule();
  }
  function schedule() { // time mode: check again at the next minute boundary
    clearTimeout(T.timer);
    if (part().mode === "time") T.timer = setTimeout(function () { apply(true); }, 60000 - (Date.now() % 60000) + 50);
  }
  var SUN = '<svg class="fa-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg>';
  var MOON = '<svg class="fa-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2z"/></svg>';
  function button() {
    if (!document.body) return;
    var p = part(), b = document.querySelector(".fa-tg"), place = T.scope === "admin" ? "admin" : p.place || "nav";
    if (!p.button) { if (b) b.remove(); return; }
    var host = null, before = null;
    if (place === "admin") host = document.querySelector(".topr");
    else if (place === "nav") { var n = document.querySelector("#nav .wrap"); if (n) { host = n; before = n.querySelector(".cartl") || n.querySelector(".mbtn"); } }
    else host = document.body;
    if (!host) return;
    var cls = "fa-tg" + (place === "float-r" ? " fl r" : place === "float-l" ? " fl l" : "");
    if (!b || b.parentNode !== host || b.className !== cls) {
      if (b) b.remove();
      b = document.createElement("button"); b.type = "button"; b.className = cls; b.setAttribute("data-nt", "");
      b.innerHTML = SUN + MOON;
      b.addEventListener("click", function () { FA_THEME.toggle(); });
      if (before && before.parentNode === host) host.insertBefore(b, before); else if (place === "admin") host.insertBefore(b, host.firstChild); else host.appendChild(b);
    }
    var t = T.dark ? "Switch to light mode" : "Switch to dark mode";
    b.setAttribute("aria-label", t); b.title = t;
  }
  var raf = 0, mo = null;
  function watch() { // pages draw their header and logo after loading; keep the button and logo in place
    if (mo || !window.MutationObserver || !document.body) return;
    mo = new MutationObserver(function () { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; button(); logo(); }); });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  function cached() { var c = null; try { c = JSON.parse(get("fa_dm") || "null"); } catch (e) {} if (!c) { try { c = (JSON.parse(get("fa_rows") || "{}") || {}).darkMode || null; } catch (e) {} } return c; }
  window.FA_THEME = {
    init: function (scope, cfg) { T.scope = scope || "site"; T.cfg = cfg || cached() || {}; apply(false);
      if (mq) { var f = function () { apply(true); }; mq.addEventListener ? mq.addEventListener("change", f) : mq.addListener && mq.addListener(f); }
      window.addEventListener("storage", function (e) { if (e.key === KEY()) apply(true); });
      document.addEventListener("visibilitychange", function () { if (!document.hidden) apply(true); });
      var go = function () { T.ready = true; button(); logo(); watch(); };
      document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", go) : go(); },
    /* Called with fresh settings once the page has loaded them (or with a draft from the admin editor). */
    config: function (cfg, keep) { T.cfg = cfg || {}; if (!keep) { try { put("fa_dm", JSON.stringify(T.cfg)); } catch (e) {} } apply(true); },
    toggle: function () { var next = T.dark ? "light" : "dark", o = own(); T.ready = true;
      // choosing what the automatic setting would pick anyway goes back to automatic
      put(KEY(), null); if (auto() !== (next === "dark")) put(KEY(), next); else if (o) put(KEY(), null);
      apply(true); },
    reset: function () { put(KEY(), null); apply(true); },
    get dark() { return T.dark; }, get scope() { return T.scope; }, get own() { return own(); }, get auto() { return auto(); }
  };
})();
