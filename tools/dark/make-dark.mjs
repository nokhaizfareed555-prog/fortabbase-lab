// Builds web/assets/dark.css: the dark mode version of every stylesheet the site and the admin use.
// Run after changing any of the stylesheets below:  node tools/dark/make-dark.mjs
//
// How it works: base.css (hand written, in this folder) sets the dark colour variables. Then every rule
// in the stylesheets is read, and each colour that only suits a light page (white panels, navy text,
// pale borders) is turned into its dark counterpart. The result is scoped to html[data-theme=dark],
// so light mode is untouched and the browser only uses these rules while dark mode is on.
// fix.css (hand written) comes last, for the few places the automatic pass cannot judge.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
// Two bundles, each with the stylesheets of its pages in the order the pages load them.
const BUNDLES = { "dark.css": ["site.css", "glasscards.css", "loyalty.css", "labs/vial.css", "labs/report.css"], "dark-admin.css": ["site.css", "admin.css", "conversations.css", "panels.css"] };
const P = "html[data-theme=dark]";

/* ---------- colours ---------- */
const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1] };
const COL = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+%?\s*)?\)|\b(?:white|black)\b/g;
function parse(s) {
  if (NAMED[s]) return NAMED[s].slice();
  if (s[0] === "#") {
    let h = s.slice(1);
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    const n = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16));
    return [...n, h.length === 8 ? parseInt(h.substr(6, 2), 16) / 255 : 1];
  }
  const m = s.match(/[\d.]+%?/g).map((x) => (x.endsWith("%") ? parseFloat(x) / 100 : +x));
  return [m[0], m[1], m[2], m[3] ?? 1];
}
const hsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, s, l]; };
const rgb = (h, s, l) => { if (!s) return [l, l, l].map((v) => Math.round(v * 255)); const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255)); };
const out = (c, a) => { const hex = "#" + c.map((v) => v.toString(16).padStart(2, "0")).join(""); return a >= 1 ? hex : `rgba(${c.join(",")},${+a.toFixed(3)})`; };
const isWhite = (c) => c[0] === 255 && c[1] === 255 && c[2] === 255;

// A colour used as a background or panel
function surface(s, kind) {
  const c = parse(s), a = c[3], [h, sat, l] = hsl(c);
  if (a === 0) return s;
  if (isWhite(c)) {
    if (kind === "shadow") return out([255, 255, 255], a * .35); // light glints stay, much softer
    if (a < .35 && kind === "grad") return out([255, 255, 255], a * .4);
    return a >= 1 ? "var(--sf)" : `rgb(var(--sfr) / ${+a.toFixed(3)})`;
  }
  if (kind === "shadow") return s;
  if (l >= .8) { // pale tints: dark tint of the same hue
    const L = kind === "border" ? .2 + (1 - l) * .5 : .11 + (1 - l) * .6;
    return out(rgb(h, sat * .45, L), a);
  }
  return s;
}
// A colour used for text or icons
function ink(s) {
  const c = parse(s), a = c[3], [h, sat, l] = hsl(c);
  if (a === 0 || isWhite(c)) return s;
  if (l <= .45 && !(sat > .6 && l > .35)) return out(rgb(h, sat * .75, Math.min(.93, .95 - l * .45)), a);
  return s;
}

const TEXT = /^(color|fill|stroke|caret-color|-webkit-text-fill-color|text-decoration-color|column-rule-color)$/;
const BORDER = /^(border|border-(top|right|bottom|left|block|inline)(-color)?|border-color|outline|outline-color)$/;
const BG = /^(background|background-color|background-image)$/;
const SHADOW = /^(box-shadow|text-shadow|filter|-webkit-box-shadow)$/;

const CHANGED = new Set();
const isColourProp = (p) => !p.startsWith("--") && (TEXT.test(p) || BG.test(p) || BORDER.test(p) || SHADOW.test(p));
function convert(prop, val) {
  if (prop.startsWith("--")) return null;
  const imp = /!important\s*$/.test(val), v0 = val.replace(/\s*!important\s*$/, "");
  let v = v0;
  if (TEXT.test(prop)) {
    v = v.replace(/var\(--base\)/g, "var(--base-t)").replace(/var\(--accent\)/g, "var(--accent-t)");
    // inside color-mix, white is "towards the page", which is now dark
    v = v.replace(/color-mix\([^()]*(?:\([^()]*\)[^()]*)*\)/g, (m) => m.replace(/#fff\b|#ffffff\b|\bwhite\b/g, "var(--sf)"));
    v = v.replace(COL, (m) => ink(m));
  } else if (BG.test(prop) || BORDER.test(prop) || SHADOW.test(prop)) {
    if (/url\(/.test(v) && BG.test(prop)) v = v.replace(/url\([^)]*\)/g, (u) => "\u0000" + Buffer.from(u).toString("base64") + "\u0000");
    const kind = SHADOW.test(prop) ? "shadow" : BORDER.test(prop) ? "border" : /gradient/.test(v) ? "grad" : "bg";
    v = v.replace(/color-mix\([^()]*(?:\([^()]*\)[^()]*)*\)/g, (m) => "\u0001" + Buffer.from(m.replace(/#fff\b|#ffffff\b|\bwhite\b/g, "var(--sf)")).toString("base64") + "\u0001");
    v = v.replace(COL, (m) => surface(m, kind));
    v = v.replace(/\u0001([^\u0001]*)\u0001/g, (_, b) => Buffer.from(b, "base64").toString());
    v = v.replace(/\u0000([^\u0000]*)\u0000/g, (_, b) => Buffer.from(b, "base64").toString());
  } else return null;
  return v === v0 ? null : v + (imp ? "!important" : "");
}

/* ---------- a small CSS reader ---------- */
function splitTop(s, ch) { const r = []; let d = 0, q = null, cur = ""; for (const c of s) { if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === "(" || c === "[") d++; else if (c === ")" || c === "]") d--; else if (c === ch && !d) { r.push(cur); cur = ""; continue; } cur += c; } r.push(cur); return r; }
function blocks(css) { // returns [{pre, body}] at the top level
  const r = []; let i = 0, d = 0, start = 0, pre = "", q = null;
  for (; i < css.length; i++) { const c = css[i];
    if (q) { if (c === q && css[i - 1] !== "\\") q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === "{") { if (!d) { pre = css.slice(start, i).trim(); start = i + 1; } d++; }
    else if (c === "}") { d--; if (!d) { r.push({ pre, body: css.slice(start, i) }); start = i + 1; } }
    else if (c === ";" && !d) { start = i + 1; } }
  return r;
}
// Classes the scripts put on <html> itself (lite, no-glass, ...): ".lite .nav" must also match as html.lite
const ROOTCLS = new Set();
for (const f of ["core.js", "site.js", "admin.js", "dna.js", "nation.js", "labs/vial.js"]) {
  const s = fs.readFileSync(path.join(ROOT, "web/assets", f), "utf8");
  for (const m of s.matchAll(/(?:documentElement|root|\bh)\.classList\.(?:add|toggle|remove)\(\s*'([\w-]+)'/g)) ROOTCLS.add(m[1]);
}
// :where() adds no specificity, so each dark rule weighs exactly what its light rule weighs.
// Together with keeping every colour declaration in the original order (see rules()), the cascade
// picks the same winner in dark mode as in light mode.
const W = ":where(html[data-theme=dark])";
const scope = (sel) => splitTop(sel, ",").flatMap((s) => { s = s.trim(); if (!s) return [];
  if (s.startsWith(":root")) return ["html:where([data-theme=dark])" + s.slice(5)];
  if (/^html(?![\w-])/.test(s)) return ["html:where([data-theme=dark])" + s.slice(4)];
  const lead = s.match(/^((?:\.[\w-]+)+)/);
  if (lead && lead[1].split(".").filter(Boolean).some((c) => ROOTCLS.has(c))) return [W + s, W + " " + s];
  return [W + " " + s]; }).join(",");
function rules(css) {
  let o = "";
  for (const { pre, body } of blocks(css)) {
    if (/^@(-webkit-)?keyframes|^@font-face|^@property|^@page/.test(pre)) continue;
    if (/^@media\s+print/.test(pre)) continue;
    if (pre.startsWith("@")) { const inner = rules(body); if (inner) o += `${pre}{${inner}}\n`; continue; }
    if (/^(from|to|\d+%)/.test(pre)) continue;
    const decl = [];
    let changed = false;
    for (const d of splitTop(body, ";")) { const k = d.indexOf(":"); if (k < 0) continue; const prop = d.slice(0, k).trim().toLowerCase(), val = d.slice(k + 1).trim();
      if (!isColourProp(prop)) continue; const v = convert(prop, val);
      if (v) { decl.push(`${prop}:${v}`); changed = true; CHANGED.add(prop); }
      else if (CHANGED.has(prop) || CHANGED.has(prop.split("-")[0])) decl.push(`${prop}:${val}`); } // unchanged, repeated so it still wins over earlier dark rules
    if (decl.length && (changed || decl.length)) o += `${scope(pre)}{${decl.join(";")}}\n`;
  }
  return o;
}

for (const [name, files] of Object.entries(BUNDLES)) {
  CHANGED.clear();
  let css = `/* Dark mode. Built by tools/dark/make-dark.mjs: edit base.css or fix.css in tools/dark, not this file. */\n`;
  css += fs.readFileSync(path.join(ROOT, "tools/dark/base.css"), "utf8") + "\n";
  for (const f of files) css += `/* ${f} */\n` + rules(fs.readFileSync(path.join(ROOT, "web/assets", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, ""));
  css += fs.readFileSync(path.join(ROOT, "tools/dark/fix.css"), "utf8") + "\n";
  fs.writeFileSync(path.join(ROOT, "web/assets", name), css);
  console.log(name, css.length, "bytes");
}
