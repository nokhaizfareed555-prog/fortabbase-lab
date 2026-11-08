// Serves every public page as complete HTML, so search engines and AI answer engines read the real content.
// site.js then takes over in the browser, using the same content and URLs.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const SITE = "https://fortabbaspolyclinic.com";
const load = (f) => { const w = {}; vm.runInNewContext(fs.readFileSync(path.join(process.cwd(), "web/assets", f), "utf8"), { window: w }); return w; };
const D = load("defaults.js").FA_DEFAULTS, CFG = load("config.js").FA_CONFIG, FOOTER = load("footer.js").FA_FOOTER;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const merge = (d, v) => { if (v === undefined || v === null) return d; if (Array.isArray(v) || typeof v !== "object" || typeof d !== "object" || Array.isArray(d) || d === null) return v; const o = { ...d }; for (const k in v) o[k] = merge(d[k], v[k]); return o; };
async function content() {
  let rows = {}, ok = false;
  try { const r = await fetch(`${CFG.url}/rest/v1/site_sections?select=key,data`, { headers: { apikey: CFG.anon, authorization: "Bearer " + CFG.anon }, signal: AbortSignal.timeout(4000) }); if (r.ok) { (await r.json()).forEach((x) => (rows[x.key] = x.data)); ok = true; } } catch {}
  const c = {}; for (const k in D) c[k] = merge(D[k], rows[k]); return { c, ok };
}

const PLACE = "Fort Abbas";
const PAGES = {
  home: { url: "/", title: (c) => `${c.brand.short} | Lab, OPD and X-ray in ${PLACE}`, desc: () => `OPD consultations, diagnostic laboratory, digital X-ray and home sample collection in ${PLACE}, Punjab. Open 24 hours.` },
  services: { url: "/services", name: "Services", dt: "Services", ids: ["services"], title: (c) => `Medical Services in ${PLACE} | ${c.brand.short}`, desc: (c) => `OPD, laboratory, digital X-ray and home sample collection at ${c.brand.short}, ${PLACE}.` },
  doctors: { url: "/doctors", name: "Doctors", dt: "Doctors", ids: ["team"], title: (c) => `Doctors in ${PLACE} | ${c.brand.short}`, desc: (c) => `Meet the doctors and specialists at ${c.brand.short} in ${PLACE}, with their qualifications and availability.` },
  tests: { url: "/lab-tests", name: "Lab tests", dt: "Lab Tests", title: (c) => `Book Lab Tests in ${PLACE} | ${c.brand.short}`, desc: () => `Search and book blood, urine, hormone and other lab tests in ${PLACE}. Visit the lab or choose home sample collection.` },
  panels: { url: "/test-panels", name: "Test panels", dt: "Test Panels", ids: ["panels"], title: (c) => `Lab Test Panels in ${PLACE} | ${c.brand.short}`, desc: () => `Lipid profile, liver function, kidney, thyroid and diabetes test panels available to book in ${PLACE}.` },
  gallery: { url: "/gallery", name: "Gallery", dt: "Gallery", ids: ["gallery"], title: (c) => `Clinic Photos | ${c.brand.short}`, desc: (c) => `Photos of the ${c.brand.short} building, laboratory, OPD and X-ray facilities in ${PLACE}.` },
  faq: { url: "/faq", name: "Questions", dt: "Questions", ids: ["faq"], title: (c) => `Frequently Asked Questions | ${c.brand.short}`, desc: (c) => `Answers about timings, appointments, fasting, reports and home sample collection at ${c.brand.short}.` },
  contact: { url: "/contact", name: "Contact", dt: "Contact", ids: ["visit"], title: (c) => `Contact and Directions | ${c.brand.short}`, desc: (c) => `Address, phone, WhatsApp, opening hours and directions for ${c.brand.short} in ${PLACE}.` },
  about: { url: "/about", name: "About", dt: "About", ids: ["trust", "glance"], title: (c) => `About Us and Registrations | ${c.brand.short}`, desc: (c) => `${c.brand.name}: registrations, regulators and key facts about our clinic in ${PLACE}.` },
  reports: { url: "/reports", name: "Reports", dt: "Lab Reports", noindex: true, title: (c) => `Lab Reports | ${c.brand.short}`, desc: () => "Sign in to view your approved lab reports." },
};

function renderers(c) {
  const T = c.tests.items.filter((t) => t.active), byId = Object.fromEntries(c.tests.items.map((t) => [t.id, t])), inc = (t) => t.includes.map((i) => byId[i]?.name).filter(Boolean).join(", ");
  const R = {
    hero() { const h = c.hero; return `<section class="hero"><div class="wrap hero-g solo"><div>${h.eyebrow ? `<div class="eyebrow">${esc(h.eyebrow)}</div>` : ""}<h1>${esc(h.title)}</h1><p class="lead">${esc(h.text)}</p></div></div></section>`; },
    trust() { return `<section id="trust"><div class="wrap"><div class="trust-g">${c.trust.items.map((i) => `<div class="trust-i glass">${i.image ? `<img src="${esc(i.image)}" alt="${esc(i.name)}" loading="lazy">` : ""}<div><b>${esc(i.name)}</b>${i.note ? `<small>${esc(i.note)}</small>` : ""}</div></div>`).join("")}</div></div></section>`; },
    glance() { const g = c.glance, its = g.items.filter((i) => i.on && (i.value || i.label)); return g.on && its.length ? `<section id="glance"><div class="wrap"><h2>${esc(g.heading)}</h2><ul>${its.map((i) => `<li><b>${esc(i.value)}</b> ${esc(i.label)}</li>`).join("")}</ul></div></section>` : ""; },
    services() { const s = c.services; return `<section id="services"><div class="wrap"><h2>${esc(s.heading)}</h2><p class="lead">${esc(s.text)}</p><div class="grid">${s.items.filter((i) => i.on).map((i) => `<article class="card glass"><div class="in"><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p></div></article>`).join("")}</div></div></section>`; },
    vials() { const v = c.vials, its = v.items.filter((i) => i.on && i.name); return its.length ? `<section id="vials"><div class="wrap"><h2>${esc(v.heading)}</h2><p class="lead">${esc(v.text)}</p><ul>${its.map((i) => `<li><h3>${esc(i.name)}</h3><p>${esc([i.capName, i.additive, i.tests, i.note].filter(Boolean).join(". "))}</p></li>`).join("")}</ul></div></section>` : ""; },
    team() { const t = c.team; return `<section id="team"><div class="wrap"><h2>${esc(t.heading)}</h2><p class="lead">${esc(t.text)}</p>${t.roles.map((r) => { const ms = t.members.filter((m) => m.role === r.id && m.name); return ms.length ? `<h3 class="role">${esc(r.name)}</h3><div class="grid">${[...ms.filter((m) => m.lead), ...ms.filter((m) => !m.lead)].map((m) => `<article class="person glass${m.lead ? " lead-doc" : ""}">${m.lead ? '<span class="lead-b">Lead</span>' : ""}<h3>${esc(m.name)}</h3><div class="q">${esc(m.qualifications)}</div><p>${esc(m.title)}</p></article>`).join("")}</div>` : ""; }).join("")}</div></section>`; },
    panels() { const p = T.filter((t) => t.isPanel); return p.length ? `<section id="panels"><div class="wrap"><h2>${esc(c.tests.panelsHeading)}</h2><p class="lead">${esc(c.tests.panelsText)}</p><div class="grid">${p.map((t) => `<article class="card glass"><div class="in"><h3>${esc(t.name)}</h3><p>${esc(inc(t))}</p></div></article>`).join("")}</div></div></section>` : ""; },
    gallery() { const g = c.gallery, its = g.items.filter((i) => i.on && i.image); return its.length ? `<section id="gallery"><div class="wrap"><h2>${esc(g.heading)}</h2><p class="lead">${esc(g.text)}</p><div class="grid">${its.map((i) => `<figure class="gal-i glass"><img src="${esc(i.image)}" alt="${esc(i.caption)}" loading="lazy"><figcaption>${esc(i.caption)}</figcaption></figure>`).join("")}</div></div></section>` : ""; },
    faq() { const f = c.faq; return `<section id="faq"><div class="wrap"><h2>${esc(f.heading)}</h2>${f.items.map((i) => `<details class="glass" open><summary>${esc(i.q)}</summary><p>${esc(i.a)}</p></details>`).join("")}</div></section>`; },
    visit() { const v = c.visit; return `<section id="visit"><div class="wrap"><h2>${esc(v.heading)}</h2><div class="visit glass"><div><small>Address</small><b>${esc(v.address)}</b><p><a href="${esc(v.map)}" rel="noopener">Get directions</a></p></div><div class="visit-side"><div><small>Phone and WhatsApp</small><b><a href="tel:+${esc(v.whatsapp)}">${esc(v.phone)}</a></b></div>${v.email ? `<div><small>Email</small><b><a href="mailto:${esc(v.email)}">${esc(v.email)}</a></b></div>` : ""}<div><small>Hours</small><b>${esc(v.hours)}</b></div></div></div></div></section>`; },
  };
  const tests = () => `<section><div class="wrap"><h1>${esc(c.tests.heading)}</h1><p class="lead">${esc(c.tests.text)}</p><div class="tl"><div id="list">${T.map((t) => `<div class="ti glass"><div><h3>${esc(t.name)}</h3><small>${esc(t.isPanel ? inc(t) : t.description || t.sample)}${t.fasting ? " · Fasting: " + esc(t.fasting) : ""}</small></div></div>`).join("")}</div></div></div></section>`;
  return { R, T, tests, inc };
}

const crumbs = (p) => `<nav class="crumbs wrap" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">›</span><span aria-current="page">${esc(p.name)}</span></nav>`;
const NAV = (c) => [["/services", "Services"], ["/doctors", "Doctors"], ["/lab-tests", "Lab tests"], ...(c.portal.on ? [["/reports", "Reports"]] : []), ["/blog", "Health blog"], ["/contact", "Visit"]];
const FOOT = [["/about", "About"], ["/services", "Services"], ["/doctors", "Doctors"], ["/lab-tests", "Lab tests"], ["/test-panels", "Test panels"], ["/gallery", "Gallery"], ["/faq", "Questions"], ["/blog", "Health blog"], ["/contact", "Contact"]];

function body(key, c) {
  const p = PAGES[key], { R, tests } = renderers(c);
  if (key === "reports") return `<section><div class="wrap"><h1>Lab reports</h1></div></section>`;
  if (key === "tests") return crumbs(p) + tests();
  if (key === "home") return [...c.layout.sections, ...D.layout.sections.filter((x) => !c.layout.sections.some((y) => y.id === x.id))].filter((s) => s.on && R[s.id]).map((s) => R[s.id]()).join("");
  const html = p.ids.map((id) => R[id]()).join("");
  if (key === "about") return crumbs(p) + `<section><div class="wrap"><h1>About ${esc(c.brand.name)}</h1><p class="lead">${esc(c.brand.tagline)}</p></div></section>` + html;
  return crumbs(p) + html.replace("<h2>", "<h1>").replace("</h2>", "</h1>");
}

function schema(key, c) {
  const p = PAGES[key], v = c.visit, { T } = renderers(c), url = SITE + p.url, id = `${SITE}/#clinic`;
  const graph = [
    { "@type": ["MedicalClinic", "DiagnosticLab"], "@id": id, name: c.brand.name, alternateName: c.brand.short, url: SITE, logo: SITE + c.brand.logo, image: SITE + c.brand.logo, telephone: "+" + v.whatsapp, hasMap: v.map, address: { "@type": "PostalAddress", streetAddress: v.address, addressLocality: PLACE, addressRegion: "Punjab", addressCountry: "PK" }, ...(/24 hours/i.test(v.hours) ? { openingHoursSpecification: { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], opens: "00:00", closes: "23:59" } } : {}) },
    { "@type": "WebSite", "@id": `${SITE}/#website`, url: SITE, name: c.brand.name, publisher: { "@id": id } },
    { "@type": key === "faq" ? ["WebPage", "FAQPage"] : key === "contact" ? ["WebPage", "ContactPage"] : key === "about" ? ["WebPage", "AboutPage"] : "MedicalWebPage", "@id": url, url, name: p.title(c), description: p.desc(c), isPartOf: { "@id": `${SITE}/#website` }, about: { "@id": id },
      ...(key === "faq" ? { mainEntity: c.faq.items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })) } : {}) },
  ];
  if (key !== "home") graph.push({ "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" }, { "@type": "ListItem", position: 2, name: p.name, item: url }] });
  const list = (items) => graph.push({ "@type": "ItemList", itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, item })) });
  if (key === "services") list(c.services.items.filter((i) => i.on).map((i) => ({ "@type": "Service", name: i.title, description: i.text, provider: { "@id": id } })));
  if (key === "doctors") list(c.team.members.filter((m) => m.name).map((m) => ({ "@type": "Physician", name: m.name, description: [m.title, m.qualifications].filter(Boolean).join(", "), worksFor: { "@id": id } })));
  if (key === "tests" || key === "panels") list(T.filter((t) => key === "tests" || t.isPanel).map((t) => ({ "@type": "MedicalTest", name: t.name })));
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}

function html(key, c) {
  const p = PAGES[key], url = SITE + p.url, t = esc(p.title(c)), d = esc(p.desc(c)), logo = esc(c.brand.logo);
  const links = (a) => a.map(([h, l]) => `<a href="${h}">${esc(l)}</a>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t}</title><meta name="description" content="${d}">${p.noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}"><meta property="og:type" content="website"><meta property="og:site_name" content="${esc(c.brand.name)}"><meta property="og:title" content="${t}"><meta property="og:description" content="${d}"><meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}${logo}"><meta name="twitter:card" content="summary"><script type="application/ld+json">${schema(key, c)}</script>`}<link rel="icon" href="/favicon.png"><link rel="preconnect" href="${esc(CFG.url)}" crossorigin><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="/assets/site.css?v=20261109bg3"><link rel="stylesheet" href="/assets/glasscards.css?v=20261109gc8">${key === "home" ? '<link rel="stylesheet" href="/assets/labs/vial.css?v=20261108v3"><link rel="stylesheet" href="/assets/labs/report.css?v=20261109b">' : ""}</head>
<body data-page="${key}" data-title="${key === "home" ? "" : esc(p.dt)}"><header class="nav" id="nav"><div class="wrap"><a class="logo" href="/"><img src="${logo}" alt="${esc(c.brand.short)} logo" width="46" height="46"><span>${esc(c.brand.short)}</span></a><div class="links">${links(NAV(c))}</div><a class="btn acc sm" href="/lab-tests">Book a test</a></div></header><main id="main" style="position:relative;z-index:1">${body(key, c)}</main><footer id="foot">${FOOTER.html(c, esc)}</footer><div class="dock" id="dock"></div><script src="/assets/config.js"></script><script src="/assets/defaults.js?v=20261109bg1"></script><script src="/assets/core.js"></script>${key === "reports" ? '<script src="/assets/report-design.js"></script>' : ""}<script src="/assets/footer.js?v=20261108ft1"></script><script src="/assets/site.js?v=20261109bg5"></script></body></html>`;
}

function llms(c) {
  const v = c.visit, { T } = renderers(c), line = ([u, l]) => `- [${l}](${SITE}${u})`;
  return `# ${c.brand.name}\n\n> ${c.brand.tagline} OPD, diagnostic laboratory, digital X-ray and home sample collection in ${PLACE}, Punjab, Pakistan.\n\n- Address: ${v.address}\n- Phone and WhatsApp: ${v.phone}\n- Hours: ${v.hours}\n\n## Pages\n\n${FOOT.map(line).join("\n")}\n\n## Services\n\n${c.services.items.filter((i) => i.on).map((i) => `- ${i.title}: ${i.text}`).join("\n")}\n\n## Lab test panels\n\n${T.filter((t) => t.isPanel).map((t) => `- ${t.name}`).join("\n")}\n\nInformation on this site does not replace advice from a doctor.\n`;
}

export default async function handler(req, res) {
  const key = req.query?.p || "home", { c, ok } = await content();
  res.setHeader("cache-control", ok ? "public, s-maxage=60, stale-while-revalidate=86400" : "public, s-maxage=5");
  if (key === "llms") { res.setHeader("content-type", "text/plain; charset=utf-8"); return res.status(200).send(llms(c)); }
  if (!PAGES[key]) return res.status(404).send("Not found");
  res.setHeader("content-type", "text/html; charset=utf-8");
  return res.status(200).send(html(key, c));
}
