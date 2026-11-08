/* Fort Abbas Poly Clinic — Guides admin: choose a picture and frame it.
   BlogMedia.pick({ kind: "cover" | "body", current }) opens a pop-up where you choose a picture from your shop
   clinic photos, the media gallery, an upload from your device or a web address — then pick its shape
   (Original, 21:9, 16:9, 3:2, 4:3, 1:1, 4:5, 3:4) and tap the part that must stay in view.
   It resolves with { url, alt, caption, ratio, pos } or null when closed. Uploads go to the same storage as
   product photos, in a "blog" folder, shrunk to at most 2000 px as WebP. */
(function () {
  "use strict";
  const S = window.Store, client = S && S.client, MD = window.BlogMD;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const esc = (v) => S.esc(v);
  const RATIOS = [["original", "Original"], ["21:9", "Wide 21:9"], ["16:9", "16:9"], ["3:2", "3:2"], ["4:3", "4:3"], ["1:1", "Square"], ["4:5", "Portrait 4:5"], ["3:4", "3:4"]];
  const BUCKET = "media";
  const pubUrl = (p) => client.storage.from(BUCKET).getPublicUrl(p).data.publicUrl;
  let dlg, state, done, cache = { products: null, gallery: null };

  function build() {
    dlg = document.createElement("dialog"); dlg.id = "mediaDlg"; dlg.className = "bottom bm-dlg";
    dlg.innerHTML = `<div class="sheet bm-sheet">
      <header class="sheet-head bm-head"><div><h2 id="bmTitle">Choose a picture</h2><p class="muted small" id="bmSub"></p></div><button type="button" class="icon-btn" data-bm-close aria-label="Close">✕</button></header>
      <div class="sheet-body">
        <section data-step="choose">
          <div class="seg bm-tabs" role="tablist"><button type="button" data-src="products" class="on">Clinic photos</button><button type="button" data-src="gallery">Gallery</button><button type="button" data-src="upload">Upload</button><button type="button" data-src="url">Web address</button></div>
          <input type="search" class="input bm-q" id="bmQ" placeholder="Search photos…" autocomplete="off">
          <div class="bm-grid" id="bmGrid"></div>
          <div class="bm-upload" id="bmUpload" hidden><label class="bm-drop"><input type="file" id="bmFile" accept="image/jpeg,image/png,image/webp"><b>Choose a photo from your device</b><span class="muted small">JPG, PNG or WebP. Big photos are shrunk to 2000 px automatically.</span></label><p class="muted small" id="bmUpState"></p></div>
          <div class="bm-url" id="bmUrl" hidden><label class="field"><span>Picture address (https://…)</span><input id="bmUrlIn" type="url" placeholder="https://"></label><p class="muted small">Only use pictures you own or that are licensed for reuse — add the credit in the caption.</p><button type="button" class="btn btn-dark btn-sm" id="bmUrlGo">Use this address</button></div>
        </section>
        <section data-step="frame" hidden>
          <div class="bm-frame-wrap"><div class="bm-frame" id="bmFrame"><img id="bmImg" alt=""><span class="bm-focus" id="bmFocus" aria-hidden="true"></span></div></div>
          <p class="muted small bm-tip">Tap the picture on the part that must always stay in view.</p>
          <div class="bm-row"><span class="bm-lbl">Shape</span><div class="bm-chips" id="bmRatios">${RATIOS.map(([v, l]) => `<button type="button" data-ratio="${v}">${l}</button>`).join("")}</div></div>
          <div class="bm-row"><span class="bm-lbl">Keep in view</span><div class="bm-chips" id="bmPos"><button type="button" data-pos="top">Top</button><button type="button" data-pos="center">Middle</button><button type="button" data-pos="bottom">Bottom</button><button type="button" data-pos="left">Left</button><button type="button" data-pos="right">Right</button></div></div>
          <label class="field"><span>Describe the picture (for Google and screen readers)</span><input id="bmAlt" maxlength="200" placeholder="e.g. Brass table lamp glowing on a walnut side table"></label>
          <label class="field" id="bmCapWrap"><span>Caption under the picture (optional)</span><input id="bmCap" maxlength="200"></label>
        </section>
      </div>
      <footer class="sheet-foot bm-foot"><button type="button" class="btn btn-soft" id="bmBack" hidden>← Choose another</button><span class="grow"></span><button type="button" class="btn btn-primary" id="bmUse" hidden>Use this picture</button></footer>
    </div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg || e.target.closest("[data-bm-close]")) return close(null);
      const t = e.target.closest("[data-src]"); if (t) return showSrc(t.dataset.src);
      const g = e.target.closest("[data-pick]"); if (g) return frame(g.dataset.pick, g.dataset.alt || "");
      const r = e.target.closest("[data-ratio]"); if (r) { state.ratio = r.dataset.ratio; paintFrame(); }
      const p = e.target.closest("[data-pos]"); if (p) { state.pos = p.dataset.pos; paintFrame(); }
    });
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(null); });
    $("#bmQ", dlg).addEventListener("input", paintGrid);
    $("#bmBack", dlg).addEventListener("click", () => step("choose"));
    $("#bmUse", dlg).addEventListener("click", use);
    $("#bmUrlGo", dlg).addEventListener("click", () => { const u = $("#bmUrlIn", dlg).value.trim(); if (!MD.cleanHref(u) || !/^https:\/\//i.test(u)) return S.toast("Enter an address that starts with https://", "error"); frame(u, ""); });
    $("#bmFile", dlg).addEventListener("change", upload);
    // tap / drag on the picture to set the part that stays in view
    const fr = $("#bmFrame", dlg); let drag = false;
    const setAt = (ev) => { const b = fr.getBoundingClientRect(); const x = Math.round(Math.max(0, Math.min(1, (ev.clientX - b.left) / b.width)) * 100), y = Math.round(Math.max(0, Math.min(1, (ev.clientY - b.top) / b.height)) * 100); state.pos = `${x},${y}`; paintFrame(); };
    fr.addEventListener("pointerdown", (ev) => { drag = true; fr.setPointerCapture(ev.pointerId); setAt(ev); });
    fr.addEventListener("pointermove", (ev) => { if (drag) setAt(ev); });
    fr.addEventListener("pointerup", () => (drag = false));
  }
  function step(s) {
    $$("[data-step]", dlg).forEach((x) => (x.hidden = x.dataset.step !== s));
    $("#bmBack", dlg).hidden = s !== "frame"; $("#bmUse", dlg).hidden = s !== "frame";
    $("#bmTitle", dlg).textContent = s === "frame" ? "Frame the picture" : "Choose a picture";
  }
  async function showSrc(src) {
    state.src = src;
    $$("[data-src]", dlg).forEach((b) => b.classList.toggle("on", b.dataset.src === src));
    $("#bmGrid", dlg).hidden = $("#bmQ", dlg).hidden = !(src === "products" || src === "gallery");
    $("#bmUpload", dlg).hidden = src !== "upload"; $("#bmUrl", dlg).hidden = src !== "url";
    if (src === "products" && !cache.products) {
      $("#bmGrid", dlg).innerHTML = '<p class="muted">Loading…</p>';
      const c = await FA.content(); cache.products = [];
      const add = (url, name) => { if (url && !cache.products.some((x) => x.url === url)) cache.products.push({ url, thumb: url, name: name || "Clinic photo" }); };
      (c.gallery.items || []).forEach((x) => add(x.image, x.caption)); (c.services.items || []).forEach((x) => add(x.image, x.title)); add(c.hero.image, "Clinic");
    }
    if (src === "gallery" && !cache.gallery) {
      $("#bmGrid", dlg).innerHTML = '<p class="muted">Loading…</p>';
      const { data, error } = await client.rpc("media_library");
      cache.gallery = error ? [] : (data || []).filter((f) => /^image\//.test(f.type || "") && !/^thumbs\//.test(f.path)).map((f) => ({ url: pubUrl(f.path), thumb: pubUrl(f.path), full: pubUrl(f.path), name: f.path.split("/").pop() }));
    }
    paintGrid();
  }
  function paintGrid() {
    const list = (state.src === "gallery" ? cache.gallery : cache.products) || [];
    const q = $("#bmQ", dlg).value.trim().toLowerCase();
    const shown = list.filter((x) => !q || x.name.toLowerCase().includes(q)).slice(0, 240);
    $("#bmGrid", dlg).innerHTML = shown.length ? shown.map((x) => `<button type="button" class="bm-tile" data-pick="${esc(x.url)}" data-alt="${esc(state.src === "products" ? x.name : "")}" title="${esc(x.name)}"><img src="${esc(x.thumb)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${esc(x.url)}'"><span>${esc(x.name)}</span></button>`).join("")
      : `<p class="muted">${list.length ? "Nothing matches." : state.src === "gallery" ? "No photos in the gallery yet — use Upload." : "No clinic photos yet."}</p>`;
  }
  async function upload() {
    const f = $("#bmFile", dlg).files[0]; if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return S.toast("Please use a JPG, PNG or WebP photo.", "error");
    const st = $("#bmUpState", dlg); st.textContent = "Uploading…";
    try {
      const blob = await shrink(f);
      const path = `blog/${Date.now()}-${S.uid().slice(0, 8)}.${blob.type === "image/webp" ? "webp" : (f.name.split(".").pop() || "jpg").toLowerCase()}`;
      const { error } = await client.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
      if (error) throw error;
      cache.gallery = null; st.textContent = "";
      frame(pubUrl(path), "");
    } catch (e) { st.textContent = ""; S.toast((e && e.message) || "Upload failed.", "error"); }
    $("#bmFile", dlg).value = "";
  }
  async function shrink(file) {
    try {
      const bmp = await createImageBitmap(file); const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(bmp, 0, 0, c.width, c.height);
      const out = await new Promise((r) => c.toBlob(r, "image/webp", 0.85));
      return out && out.size < file.size ? out : file;
    } catch { return file; }
  }
  function frame(url, alt) {
    state.url = url; if (alt && !$("#bmAlt", dlg).value) $("#bmAlt", dlg).value = alt;
    $("#bmImg", dlg).src = url; step("frame"); paintFrame();
  }
  function paintFrame() {
    const ar = MD.ratioCss(state.ratio) || "auto";
    const fr = $("#bmFrame", dlg);
    fr.style.aspectRatio = ar === "auto" ? "" : ar; fr.classList.toggle("is-auto", ar === "auto");
    // keep the true shape on screen: as wide as fits, never taller than about half the window
    if (ar !== "auto") { const [a, b] = ar.split("/").map(Number), W = (fr.parentElement.clientWidth || 600) - 28, H = innerHeight * .46; fr.style.width = Math.round(Math.min(W, H * a / b)) + "px"; } else fr.style.width = "";
    const op = MD.posCss(state.pos) || "50% 50%";
    $("#bmImg", dlg).style.objectPosition = op;
    const [x, y] = op.split(" "); const f = $("#bmFocus", dlg); f.style.left = x; f.style.top = y; f.hidden = ar === "auto";
    $$("[data-ratio]", dlg).forEach((b) => b.classList.toggle("on", b.dataset.ratio === state.ratio));
    $$("[data-pos]", dlg).forEach((b) => b.classList.toggle("on", b.dataset.pos === state.pos));
  }
  function use() {
    const alt = $("#bmAlt", dlg).value.trim();
    if (!alt) { $("#bmAlt", dlg).focus(); return S.toast("Describe the picture first — it helps Google and screen readers.", "error"); }
    close({ url: state.url, alt, caption: $("#bmCap", dlg).value.trim(), ratio: state.ratio === "original" ? (state.kind === "cover" ? "original" : "") : state.ratio, pos: state.pos === "center" ? "" : state.pos });
  }
  function close(v) { if (dlg.open) dlg.close(); const d = done; done = null; if (d) d(v); }

  function pick(opts) {
    opts = opts || {};
    if (!dlg) build();
    const cur = opts.current || {};
    state = { kind: opts.kind || "body", src: "products", url: cur.url || "", ratio: cur.ratio || (opts.kind === "cover" ? "21:9" : "original"), pos: cur.pos || "center" };
    $("#bmSub", dlg).textContent = state.kind === "cover" ? "The big picture at the top of the article. Cards on the blog use the same part of the picture." : "Goes into the article on its own line, where your cursor is.";
    $("#bmCapWrap", dlg).hidden = state.kind === "cover";
    $("#bmAlt", dlg).value = cur.alt || ""; $("#bmCap", dlg).value = cur.caption || ""; $("#bmQ", dlg).value = ""; $("#bmUrlIn", dlg).value = "";
    if (opts.reframe && cur.url) frame(cur.url, cur.alt || ""); else { step("choose"); showSrc("products"); }
    dlg.showModal();
    return new Promise((r) => (done = r));
  }
  window.BlogMedia = { pick, RATIOS };
})();
