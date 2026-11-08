/* Fort Abbas Poly Clinic — admin colour palettes (main admin + Guides admin).
   Loaded in <head> so the chosen colours are on before anything paints.
   A palette is a ramp of 8 shades, light → dark; every admin colour is worked out from it.
   "Surprise me" makes a new random ramp, always checked so white text stays readable on the main colour.
   The choice is kept on this browser (both admin pages share it); Undo goes back up to 20 steps. */
(function () {
  "use strict";
  const KEY = "fa_admin_palette", HIST = "fa_admin_palette_hist";
  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };

  // the attached palettes, plus a calm blue and a neutral one
  const PRESETS = [
    { id: "sunset", name: "Sunset", ramp: ["#F9D77E", "#F2A65A", "#EB6D45", "#D9493A", "#A8323A", "#7A2433", "#4A1A24", "#2B1218"], a: 3 },
    { id: "indigo", name: "Indigo", ramp: ["#D4DBF7", "#AEBBEF", "#8193E0", "#5B70D4", "#3B4FC4", "#2B3BA0", "#1E2A78", "#141C4E"], a: 4 },
    { id: "forest", name: "Forest", ramp: ["#BFE3C5", "#93CF9E", "#63B374", "#3E9655", "#2C7A43", "#1F5E34", "#163F25", "#0C2416"], a: 4 },
    { id: "lagoon", name: "Lagoon", ramp: ["#A9DCE3", "#73C2CF", "#3FA3B5", "#22849A", "#1A6A80", "#175266", "#133A4A", "#0B1C26"], a: 4 },
    { id: "ember", name: "Ember", ramp: ["#F2C46A", "#EBA14A", "#E4783F", "#DC4F3A", "#C42A3E", "#8F1F33", "#4E1A25", "#1E1A1E"], a: 4 },
    { id: "retro", name: "Retro", ramp: ["#E4AE57", "#D8853D", "#C55E30", "#B53A25", "#8E2E20", "#3A4A45", "#22332E", "#0F1C24"], a: 3 },
    { id: "gilded", name: "Gilded", ramp: ["#F7EBB0", "#EBD27E", "#D6AF55", "#B98B3A", "#93682A", "#6E4C20", "#4A3317", "#2A1D0E"], a: 4 },
    { id: "emerald", name: "Emerald night", ramp: ["#B8DDD3", "#7FC0AF", "#4A9D89", "#2D7F6C", "#1C6455", "#134A40", "#0E332D", "#07201C"], a: 4 },
    { id: "classic", name: "Classic blue", ramp: ["#DCE9FF", "#B2CCFF", "#84ADFF", "#528BFF", "#1570EF", "#175CD3", "#1849A9", "#102A56"], a: 4 },
    { id: "graphite", name: "Graphite", ramp: ["#E7E8EC", "#CDD0D7", "#A3A8B3", "#7A808D", "#4F5562", "#383D48", "#252932", "#14161E"], a: 5 },
  ];

  /* ---------- colour maths ---------- */
  const hex2rgb = (h) => { h = h.replace("#", ""); if (h.length === 3) h = h.replace(/./g, "$&$&"); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgb2hex = (r) => "#" + r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
  const mix = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, i) => v + (y[i] - v) * t)); };
  const lum = (h) => { const c = hex2rgb(h).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const hsl2hex = (h, s, l) => { s /= 100; l /= 100; const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return rgb2hex([f(0) * 255, f(8) * 255, f(4) * 255]); };

  // turn a ramp into every colour the admin uses
  function tokens(p) {
    const r = p.ramp; let a = Math.max(1, Math.min(6, p.a == null ? 4 : p.a));
    while (a < 6 && contrast(r[a], "#FFFFFF") < 4.5) a++; // the main colour must carry white text
    const main = r[a], deeper = r[Math.min(7, a + 1)], light = r[Math.max(0, a - 1)];
    return {
      "--pal-50": mix(r[0], "#FFFFFF", .72), "--pal-100": mix(r[0], "#FFFFFF", .38), "--pal-200": mix(r[1], "#FFFFFF", .2),
      "--pal-500": light, "--pal-600": main, "--pal-700": deeper, "--pal-ink": r[7], "--pal-on": "#FFFFFF",
      "--pal-page": mix(r[0], "#F5F5F6", .9),
      "--pal-s1": r[1], "--pal-s2": r[3], "--pal-s3": r[5], "--pal-s4": r[7],
      "--pal-grad": `linear-gradient(135deg, ${r[0]}, ${r[3]} 50%, ${r[6]})`,
    };
  }
  function apply(p) {
    const t = tokens(p), s = document.documentElement.style;
    Object.keys(t).forEach((k) => s.setProperty(k, t[k]));
    document.documentElement.dataset.palette = p.id || "custom";
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = t["--pal-page"];
  }
  function current() {
    const raw = get(KEY); if (!raw) return PRESETS[0];
    try { const j = JSON.parse(raw); if (j.id && j.id !== "custom") return PRESETS.find((x) => x.id === j.id) || PRESETS[0]; if (Array.isArray(j.ramp) && j.ramp.length === 8) return j; } catch {}
    return PRESETS[0];
  }
  function choose(p, remember = true) {
    if (remember) { const h = history(); h.push(JSON.stringify(current())); set(HIST, JSON.stringify(h.slice(-20))); }
    set(KEY, JSON.stringify(p.id && p.id !== "custom" ? { id: p.id } : p));
    apply(p); paint();
  }
  const history = () => { try { return JSON.parse(get(HIST) || "[]"); } catch { return []; } };
  function undo() { const h = history(); if (!h.length) return; const last = JSON.parse(h.pop()); set(HIST, JSON.stringify(h)); set(KEY, JSON.stringify(last.id && last.id !== "custom" ? { id: last.id } : last)); apply(last); paint(); }

  // a fresh random ramp: one of several families, each kept readable
  const FAMILIES = ["sunset-like", "single", "duo", "earthy", "deep", "pastel"];
  const rnd = (a, b) => a + Math.random() * (b - a);
  function surprise() {
    const fam = FAMILIES[Math.floor(Math.random() * FAMILIES.length)], h = Math.floor(rnd(0, 360));
    const L = [90, 80, 68, 56, 45, 35, 24, 13], ramp = [];
    for (let i = 0; i < 8; i++) {
      let hue = h, sat = 70;
      if (fam === "sunset-like") { hue = (h + i * 9) % 360; sat = 78 - i * 3; }
      else if (fam === "duo") { hue = i < 4 ? h : (h + 150 + rnd(-20, 20)) % 360; sat = 62; }
      else if (fam === "earthy") { hue = (h % 60) + 10 + i * 3; sat = 45 - i * 2; }
      else if (fam === "deep") { sat = 58; }
      else if (fam === "pastel") { sat = 55 - i * 2; }
      else { sat = 66 - i; }
      ramp.push(hsl2hex(hue, Math.max(18, sat), L[i]));
    }
    const names = { "sunset-like": "Glow", single: "Tone", duo: "Duo", earthy: "Earth", deep: "Deep", pastel: "Soft" };
    choose({ id: "custom", name: `${names[fam]} ${h}°`, ramp, a: 4 });
  }

  apply(current()); // straight away, before the page paints

  /* ---------- the picker: a round button in the header, a pop-over with the palettes ---------- */
  let pop, btn;
  const ICON = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2.2a1.8 1.8 0 0 0-1.3 3.1c.4.4.5.9.5 1.4 0 .9-.8 1.5-3 1.5Z"/><circle cx="7.5" cy="10.5" r="1.2"/><circle cx="12" cy="7" r="1.2"/><circle cx="16.5" cy="10.5" r="1.2"/></svg>';
  const strip = (r) => `<span class="pal-strip">${r.map((c) => `<i style="background:${c}"></i>`).join("")}</span>`;
  function paint() {
    if (!pop) return;
    const cur = current(), h = history();
    pop.querySelector(".pal-list").innerHTML = PRESETS.map((p) => `<button type="button" class="pal-opt${cur.id === p.id ? " on" : ""}" data-pal="${p.id}" aria-pressed="${cur.id === p.id}">${strip(p.ramp)}<span class="pal-name">${p.name}</span></button>`).join("")
      + (cur.id === "custom" ? `<button type="button" class="pal-opt on" aria-pressed="true">${strip(cur.ramp)}<span class="pal-name">${cur.name || "Surprise"}</span></button>` : "");
    pop.querySelector("[data-pal-undo]").disabled = !h.length;
  }
  function build() {
    const host = document.querySelector(".topbar-actions"); if (!host || document.getElementById("palBtn")) return;
    btn = document.createElement("button");
    btn.type = "button"; btn.className = "icon-btn pal-btn"; btn.id = "palBtn"; btn.title = "Admin colours"; btn.setAttribute("aria-label", "Admin colours"); btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = ICON;
    host.insertBefore(btn, host.firstChild);
    pop = document.createElement("div");
    pop.className = "pal-pop"; pop.id = "palPop"; pop.hidden = true; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Admin colours");
    pop.innerHTML = `<div class="pal-head"><b>Admin colours</b><span class="muted small">Only this admin panel — the shop doesn't change.</span></div>
      <div class="pal-list"></div>
      <div class="pal-acts"><button type="button" class="btn btn-dark btn-sm" data-pal-surprise>✦ Surprise me</button><button type="button" class="btn btn-soft btn-sm" data-pal-undo>↶ Undo</button></div>`;
    document.body.appendChild(pop);
    const place = () => { const r = btn.getBoundingClientRect(); pop.style.top = r.bottom + 10 + "px"; pop.style.right = Math.max(12, innerWidth - r.right) + "px"; };
    const open = (on) => { pop.hidden = !on; btn.setAttribute("aria-expanded", String(on)); if (on) { place(); paint(); } };
    btn.addEventListener("click", (e) => { e.stopPropagation(); open(pop.hidden); });
    pop.addEventListener("click", (e) => {
      e.stopPropagation();
      const o = e.target.closest("[data-pal]"); if (o) { const p = PRESETS.find((x) => x.id === o.dataset.pal); if (p && current().id !== p.id) choose(p); return; }
      if (e.target.closest("[data-pal-surprise]")) surprise();
      if (e.target.closest("[data-pal-undo]")) undo();
    });
    document.addEventListener("click", () => open(false));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) { open(false); btn.focus(); } });
    addEventListener("resize", () => { if (!pop.hidden) place(); });
    addEventListener("storage", (e) => { if (e.key === KEY) { apply(current()); paint(); } }); // the other admin tab follows
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
  window.DivaarPalette = { PRESETS, choose, surprise, undo, current };
})();
