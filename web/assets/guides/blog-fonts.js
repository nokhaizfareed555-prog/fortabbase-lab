/* Fort Abbas Poly Clinic — blog fonts (shared by the public blog pages and Guides admin → Settings → Fonts).
   Every font here is free (Google Fonts, SIL Open Font Licence).
   Four roles per language: headings (article titles, H1), sub-headings (H2/H3, card titles),
   paragraphs (article text) and other text (quick answer, lists, quotes, captions, tables, FAQ).
   Urdu defaults: Gulzar (a Nastaliq made for display) for headings, Noto Nastaliq Urdu Bold for
   sub-headings and Noto Nastaliq Urdu Regular for paragraphs — three different Nastaliq looks. */
(function (root) {
  "use strict";
  // id → [CSS family, Google family name, weights available, label, script, group]
  const FONTS = {
    // Urdu — Nastaliq (the classic Urdu look)
    "gulzar": ["'Gulzar'", "Gulzar", [400], "Gulzar — display Nastaliq", "ur", "Nastaliq"],
    "noto-nastaliq": ["'Noto Nastaliq Urdu'", "Noto Nastaliq Urdu", [400, 500, 600, 700], "Noto Nastaliq Urdu", "ur", "Nastaliq"],
    // Urdu — Naskh (plainer, very easy to read)
    "noto-naskh": ["'Noto Naskh Arabic'", "Noto Naskh Arabic", [400, 500, 600, 700], "Noto Naskh — plain and clear", "ur", "Naskh (plain)"],
    "lateef": ["'Lateef'", "Lateef", [400, 600, 700], "Lateef — light handwritten Naskh", "ur", "Naskh (plain)"],
    "scheherazade": ["'Scheherazade New'", "Scheherazade New", [400, 500, 600, 700], "Scheherazade New — book Naskh", "ur", "Naskh (plain)"],
    "amiri": ["'Amiri'", "Amiri", [400, 700], "Amiri — classic print Naskh", "ur", "Naskh (plain)"],
    "markazi": ["'Markazi Text'", "Markazi Text", [400, 500, 600, 700], "Markazi Text — newspaper style", "ur", "Naskh (plain)"],
    "mirza": ["'Mirza'", "Mirza", [400, 500, 600, 700], "Mirza — elegant Naskh", "ur", "Naskh (plain)"],
    "harmattan": ["'Harmattan'", "Harmattan", [400, 500, 600, 700], "Harmattan — open and round", "ur", "Naskh (plain)"],
    // Urdu — modern sans and display
    "noto-sans-ar": ["'Noto Sans Arabic'", "Noto Sans Arabic", [400, 500, 600, 700, 800], "Noto Sans Arabic — modern, no-frills", "ur", "Modern"],
    "vazirmatn": ["'Vazirmatn'", "Vazirmatn", [400, 500, 600, 700, 800], "Vazirmatn — modern sans", "ur", "Modern"],
    "baloo-bhaijaan": ["'Baloo Bhaijaan 2'", "Baloo Bhaijaan 2", [400, 500, 600, 700, 800], "Baloo Bhaijaan 2 — friendly rounded", "ur", "Modern"],
    "noto-kufi": ["'Noto Kufi Arabic'", "Noto Kufi Arabic", [400, 500, 600, 700, 800], "Noto Kufi — geometric headings", "ur", "Display"],
    "el-messiri": ["'El Messiri'", "El Messiri", [400, 500, 600, 700], "El Messiri — stylish headings", "ur", "Display"],
    "reem-kufi": ["'Reem Kufi'", "Reem Kufi", [400, 500, 600, 700], "Reem Kufi — bold geometric", "ur", "Display"],
    // English
    "site": ["var(--display)", "", [400, 500, 600, 700, 800], "Website font (Outfit)", "en"],
    "fraunces": ["'Fraunces'", "Fraunces", [400, 600, 700, 800], "Fraunces — soft serif", "en"],
    "playfair": ["'Playfair Display'", "Playfair Display", [400, 600, 700, 800], "Playfair Display — elegant serif", "en"],
    "dm-serif": ["'DM Serif Display'", "DM Serif Display", [400], "DM Serif Display — bold serif", "en"],
    "lora": ["'Lora'", "Lora", [400, 500, 600, 700], "Lora — book serif", "en"],
    "source-serif": ["'Source Serif 4'", "Source Serif 4", [400, 600, 700], "Source Serif — reading serif", "en"],
    "inter": ["'Inter'", "Inter", [400, 500, 600, 700, 800], "Inter — clean sans", "en"],
    "manrope": ["'Manrope'", "Manrope", [400, 500, 600, 700, 800], "Manrope — rounded sans", "en"],
  };
  const ROLES = [["heading", "Headings"], ["sub", "Sub-headings"], ["body", "Paragraphs"], ["other", "Other text"]];
  const ROLE_HINT = { heading: "Article titles and page titles", sub: "Section headings inside articles, card titles", body: "The article text", other: "Quick answer, lists, quotes, tables, captions, FAQ" };
  const DEFAULTS = {
    ur: { heading: "gulzar:400", sub: "noto-nastaliq:700", body: "noto-nastaliq:400", other: "noto-nastaliq:500", size: 118, leading: 2.15 },
    en: { heading: "site:800", sub: "site:700", body: "site:400", other: "site:400", size: 100, leading: 1.75 },
  };
  const parse = (v, lang) => {
    const [id, w] = String(v || "").split(":");
    const f = FONTS[id] && FONTS[id][4] === lang ? id : null;
    const fid = f || DEFAULTS[lang].heading.split(":")[0];
    const ws = FONTS[fid][2]; const want = +w || ws[0];
    const weight = ws.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a), ws[0]);
    return { id: fid, weight, family: FONTS[fid][0], google: FONTS[fid][1] };
  };
  // the chosen settings for a language, filled in with defaults and checked
  function pick(typo, lang) {
    const d = DEFAULTS[lang], t = (typo && typo[lang]) || {};
    const out = {};
    ROLES.forEach(([r]) => { const id = String(t[r] || "").split(":")[0]; out[r] = parse(FONTS[id] && FONTS[id][4] === lang ? t[r] : d[r], lang); });
    const size = Math.round(+t.size); out.size = size >= 90 && size <= 140 ? size : d.size;
    const lead = +t.leading; out.leading = lead >= 1.3 && lead <= 2.8 ? Math.round(lead * 100) / 100 : d.leading;
    return out;
  }
  // one Google Fonts address for everything a page needs (only the weights in use)
  function googleHref(sets) {
    const need = {};
    sets.forEach((s) => ROLES.forEach(([r]) => { const f = s[r]; if (f.google) (need[f.google] = need[f.google] || new Set()).add(f.weight); }));
    const fam = Object.keys(need).map((g) => `family=${g.replace(/ /g, "+")}:wght@${[...need[g]].sort((a, b) => a - b).join(";")}`);
    return fam.length ? `https://fonts.googleapis.com/css2?${fam.join("&")}&display=swap` : "";
  }
  // CSS custom properties the blog stylesheet reads
  function cssVars(s) {
    const fb = (f) => f.family.startsWith("var(") ? f.family : `${f.family},var(--body),serif`; // Latin words inside Urdu text use the site font
    s = Object.assign({}, s, ...ROLES.map(([r]) => ({ [r]: Object.assign({}, s[r], { family: fb(s[r]) }) })));
    return `--bf-h:${s.heading.family};--bf-h-w:${s.heading.weight};--bf-sub:${s.sub.family};--bf-sub-w:${s.sub.weight};--bf-body:${s.body.family};--bf-body-w:${s.body.weight};--bf-other:${s.other.family};--bf-other-w:${s.other.weight};--bf-size:${s.size / 100};--bf-lead:${s.leading};`;
  }
  /* ---------- does a font really show Urdu? (browser only) ----------
     Some fonts lack Urdu-only letters (ٹ ڈ ڑ ں ے ھ …); the browser then mixes in another font and the words look broken.
     check() measures each letter with and without the font: if nothing changes, the font doesn't have it.
     guard() runs on Urdu pages before the text is shown and swaps any role whose font fails to one that works. */
  const URDU_TEST = "ٹڈڑںےۓھہکگیپچژۂ";
  const SAFE_UR = ["noto-nastaliq", "noto-naskh", "noto-sans-ar"];   // tried in this order when a chosen font fails
  const nameOf = (fam) => { const m = String(fam || "").match(/^\s*['"]([^'"]+)['"]/); return m ? m[1] : ""; };
  let cv = null;
  function missing(name, weight) {
    if (typeof document === "undefined" || !name) return [];
    cv = cv || document.createElement("canvas").getContext("2d");
    const out = [];
    for (const ch of URDU_TEST) {
      let found = false;
      for (const base of ["monospace", "serif", "sans-serif"]) {
        cv.font = `${weight || 400} 48px ${base}`; const a = cv.measureText(ch).width;
        cv.font = `${weight || 400} 48px "${name}", ${base}`; const b = cv.measureText(ch).width;
        if (Math.abs(a - b) > 0.01) { found = true; break; }
      }
      if (!found) out.push(ch);
    }
    return out;
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function loadFace(name, weight, ms) {
    if (typeof document === "undefined" || !document.fonts || !name) return false;
    try { await Promise.race([document.fonts.load(`${weight || 400} 48px "${name}"`, URDU_TEST), wait(ms || 2500)]); } catch (e) { /* ignore */ }
    return true;
  }
  function addCss(href) {
    if (!href || document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.appendChild(l);
  }
  // check one font: { ok, missing: [letters] }
  async function check(id, weight) {
    const f = FONTS[id]; if (!f || !f[1]) return { ok: true, missing: [] };
    addCss(`https://fonts.googleapis.com/css2?family=${f[1].replace(/ /g, "+")}:wght@${weight || f[2][0]}&display=swap`);
    await wait(30); await loadFace(f[1], weight || f[2][0], 3000);
    const miss = missing(f[1], weight || f[2][0]);
    if (miss.length === [...URDU_TEST].length) return { ok: null, missing: miss };   // didn't load at all — can't judge
    return { ok: !miss.length, missing: miss };
  }
  // Urdu page: make sure every role's font can show Urdu; swap to a safe one if not. Resolves with what was swapped.
  async function guard(el) {
    const swapped = [];
    try {
      if (!el || typeof getComputedStyle === "undefined") return swapped;
      const cs = getComputedStyle(el), vars = [["--bf-h", "--bf-h-w"], ["--bf-sub", "--bf-sub-w"], ["--bf-body", "--bf-body-w"], ["--bf-other", "--bf-other-w"]];
      const roles = vars.map(([v, w]) => ({ v, name: nameOf(cs.getPropertyValue(v)), weight: +cs.getPropertyValue(w) || 400 })).filter((r) => r.name);
      await Promise.all(roles.map((r) => loadFace(r.name, r.weight, 2200)));
      for (const r of roles) {
        const miss = missing(r.name, r.weight);
        if (!miss.length || miss.length === [...URDU_TEST].length) continue;   // works, or still downloading (the browser swaps it in when ready)
        for (const id of SAFE_UR) {
          const f = FONTS[id]; if (f[1] === r.name) continue;
          const w = f[2].reduce((a, b) => (Math.abs(b - r.weight) < Math.abs(a - r.weight) ? b : a), f[2][0]);
          addCss(`https://fonts.googleapis.com/css2?family=${f[1].replace(/ /g, "+")}:wght@${w}&display=swap`);
          await wait(30); await loadFace(f[1], w, 2200);
          if (!missing(f[1], w).length) { el.style.setProperty(r.v, `${f[0]},var(--body),serif`); el.style.setProperty(r.v + "-w", String(w)); swapped.push([r.name, f[1]]); break; }
        }
      }
    } catch (e) { /* never block the page */ }
    return swapped;
  }
  root.BlogFonts = { FONTS, ROLES, ROLE_HINT, DEFAULTS, pick, googleHref, cssVars, URDU_TEST, missing, check, guard };
})(typeof window !== "undefined" ? window : globalThis);
