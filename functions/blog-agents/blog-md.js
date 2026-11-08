/* Fort Abbas Poly Clinic — blog article format (a safe, small Markdown).
   Used by the public blog pages (server, lib/blog.mjs), the admin editor preview and the agents' checks.
   Nothing the writer types can become raw HTML: every character is escaped first, then only these shapes
   are turned into markup:

     ## Heading            ### Sub-heading          (a single # is treated as ##; the page title is the only H1)
     paragraphs, - lists, 1. lists, > quotes, ---
     **bold**  *italic*  `code`
     [link text](/lamps/table-lamps)   [source](https://example.org/page)   (only / or http(s) links)
     | table | with | header |
     |-------|------|--------|
     [[product:<product id>]]        on its own line → a card for that shop product (only if it exists)
     ![alt text](https://… "caption"){4:3 top}   on its own line → a picture; the {…} part is optional:
                                     a shape (16:9 21:9 3:2 4:3 1:1 4:5 3:4 2:3 original) and which part
                                     to keep in view (top, bottom, left, right, center, or x,y in %)
*/
(function (root) {
  "use strict";
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const unesc = (s) => String(s).replace(/&(amp|lt|gt|quot|#39);/g, (m, k) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" }[k]));
  const slug = (s) => String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9؀-ۿ]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

  // a link target is allowed if it is a site path or an http(s) address (never javascript:, data:, etc.)
  function cleanHref(raw) {
    const u = unesc(String(raw || "").trim());
    if (/^\/(?!\/)[^\s<>"']*$/.test(u)) return u;
    if (/^https?:\/\/[^\s<>"']+$/i.test(u)) { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (e) { return ""; } }
    return "";
  }

  // picture shapes and focus points (only these values ever reach a style attribute)
  const RATIOS = { "21:9": "21/9", "16:9": "16/9", "3:2": "3/2", "4:3": "4/3", "1:1": "1/1", "4:5": "4/5", "3:4": "3/4", "2:3": "2/3", "original": "auto" };
  const POS = { top: "50% 15%", bottom: "50% 85%", left: "15% 50%", right: "85% 50%", center: "50% 50%" };
  function posCss(p) {
    if (!p) return "";
    if (POS[p]) return POS[p];
    const m = String(p).match(/^(\d{1,3}),(\d{1,3})$/); if (!m) return "";
    const c = (n) => Math.max(0, Math.min(100, +n));
    return `${c(m[1])}% ${c(m[2])}%`;
  }
  const ratioCss = (r) => RATIOS[r] || "";
  function imgOpts(raw) {
    const o = { ratio: "", pos: "" };
    String(raw || "").trim().split(/\s+/).forEach((t) => { if (RATIOS[t]) o.ratio = t; else if (posCss(t)) o.pos = t; });
    return o;
  }
  function figure(url, alt, caption, o, cls) {
    const ar = ratioCss(o.ratio), op = posCss(o.pos);
    const style = [ar ? `--ar:${ar}` : "", op ? `--op:${op}` : ""].filter(Boolean).join(";");
    return `<figure class="${cls || "blog-fig"}${ar && ar !== "auto" ? " has-ratio" : ""}"${style ? ` style="${style}"` : ""}><img src="${esc(url)}" alt="${esc(alt)}" loading="lazy" decoding="async">${caption ? `<figcaption>${esc(caption)}</figcaption>` : ""}</figure>`;
  }

  function inline(text, ctx) {
    // text is already escaped. Protect code spans first.
    const codes = [];
    let s = text.replace(/`([^`\n]+)`/g, (m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = s.replace(/\[([^\]\n]{1,200})\]\(([^)\s]{1,600})\)/g, (m, label, href) => {
      const h = cleanHref(href);
      if (!h || (ctx.linkCheck && !ctx.linkCheck(h))) { ctx.dropped.push(unesc(href)); return label; }
      ctx.links.push(h);
      const ext = /^https?:/i.test(h);
      const attrs = ext ? ' rel="noopener" target="_blank"' : "";
      const pid = ctx.productOfPath && !ext ? ctx.productOfPath(h) : null;
      return `<a href="${esc(h)}"${attrs}${pid ? ` data-blog-product="${esc(pid)}"` : ""}>${label}</a>`;
    });
    s = s.replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, "<strong>$1</strong>")
         .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, "$1<em>$2</em>");
    return s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${codes[+i]}</code>`);
  }

  const isTableSep = (l) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

  function render(src, opts) {
    opts = opts || {};
    const ctx = { links: [], dropped: [], productIds: [], linkCheck: opts.linkCheck, productOfPath: opts.productOfPath };
    const lines = esc(String(src || "")).replace(/\r\n?/g, "\n").split("\n");
    const out = [], toc = [], ids = new Set();
    let para = [], list = null, quote = [];
    const flushP = () => { if (para.length) { out.push(`<p>${inline(para.join(" "), ctx)}</p>`); para = []; } };
    // "- [ ] item" / "- [x] item" → a checklist (ticks are drawn by CSS; nothing clickable)
    const li = (x) => { const c = x.match(/^\[( |x|X)\]\s+(.*)$/); return c ? `<li class="blog-check${c[1] === " " ? "" : " done"}">${inline(c[2], ctx)}</li>` : `<li>${inline(x, ctx)}</li>`; };
    const flushL = () => { if (list) { const chk = list.items.length && list.items.every((x) => /^\[( |x|X)\]\s/.test(x)); out.push(`<${list.t}${chk ? ' class="blog-checklist"' : ""}>${list.items.map(li).join("")}</${list.t}>`); list = null; } };
    const flushQ = () => { if (quote.length) { out.push(`<blockquote><p>${inline(quote.join(" "), ctx)}</p></blockquote>`); quote = []; } };
    const flush = () => { flushP(); flushL(); flushQ(); };
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i].replace(/\s+$/, "");
      let m;
      if (!ln.trim()) { flush(); continue; }
      if ((m = ln.match(/^\[\[product:([A-Za-z0-9_.:-]{1,80})\]\]$/))) {
        flush();
        const card = opts.product ? opts.product(m[1]) : null;
        if (card) { out.push(card); ctx.productIds.push(m[1]); } else ctx.dropped.push("product:" + m[1]);
        continue;
      }
      if ((m = ln.match(/^!\[([^\]\n]{0,200})\]\(([^)\s]{1,800})(?:\s+&quot;(.{0,200}?)&quot;)?\)(?:\{([^}\n]{0,40})\})?$/))) {
        flush();
        const u = cleanHref(m[2]);
        if (u) { out.push(figure(u, unesc(m[1]), m[3] ? unesc(m[3]) : "", imgOpts(m[4]))); ctx.images = (ctx.images || []).concat(u); }
        else ctx.dropped.push("image:" + unesc(m[2]));
        continue;
      }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(ln)) { flush(); out.push("<hr>"); continue; }
      if ((m = ln.match(/^(#{1,4})\s+(.+?)\s*#*$/))) {
        flush();
        const level = m[1].length >= 3 ? 3 : 2;
        const text = m[2];
        let id = slug(unesc(text).replace(/[*`_]/g, "")) || "section", n = 2;
        while (ids.has(id)) id = `${slug(unesc(text))}-${n++}`;
        ids.add(id);
        toc.push({ level, id, text: unesc(text).replace(/\*\*|`/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") });
        out.push(`<h${level} id="${id}">${inline(text, ctx)}</h${level}>`);
        continue;
      }
      // table: header line, separator line, rows
      if (ln.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        flush();
        const head = cells(ln); const rows = [];
        i += 2;
        while (i < lines.length && lines[i].includes("|") && lines[i].trim()) { rows.push(cells(lines[i])); i++; }
        i--;
        out.push(`<div class="blog-table"><table><thead><tr>${head.map((h) => `<th scope="col">${inline(h, ctx)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((h, k) => `<td>${inline(r[k] || "", ctx)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
        continue;
      }
      if ((m = ln.match(/^&gt;\s?(.*)$/))) { flushP(); flushL(); quote.push(m[1]); continue; }
      if ((m = ln.match(/^\s*[-*•]\s+(.*)$/))) { flushP(); flushQ(); if (!list || list.t !== "ul") { flushL(); list = { t: "ul", items: [] }; } list.items.push(m[1]); continue; }
      if ((m = ln.match(/^\s*\d+[.)]\s+(.*)$/))) { flushP(); flushQ(); if (!list || list.t !== "ol") { flushL(); list = { t: "ol", items: [] }; } list.items.push(m[1]); continue; }
      if (list && /^\s{2,}\S/.test(ln)) { list.items[list.items.length - 1] += " " + ln.trim(); continue; }
      flushL(); flushQ(); para.push(ln.trim());
    }
    flush();
    return { html: out.join("\n"), toc, links: ctx.links, dropped: ctx.dropped, productIds: ctx.productIds, images: ctx.images || [] };
  }

  // plain text (meta descriptions, search snippets, word counts)
  function plain(src) {
    return String(src || "")
      .replace(/^\[\[product:[^\]]+\]\]$/gim, " ")
      .replace(/^!\[[^\]]*\]\([^)]*\)(\{[^}]*\})?$/gm, " ")
      .replace(/^\s*\|?\s*:?-{3,}.*$/gm, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^#{1,6}\s+|^>\s?|^\s*[-*•]\s+(\[[ xX]\]\s+)?|^\s*\d+[.)]\s+/gm, "")
      .replace(/\*\*|`|\|/g, " ").replace(/(^|\s)\*(\S)/g, "$1$2").replace(/(\S)\*(\s|$)/g, "$1$2")
      .replace(/\s+/g, " ").trim();
  }

  root.BlogMD = { render, plain, slug, esc, cleanHref, RATIOS, POS, posCss, ratioCss, figure };
})(typeof window !== "undefined" ? window : globalThis);
