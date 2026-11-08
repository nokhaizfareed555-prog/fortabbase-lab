/* Admin helper: a chat bubble on /admin and /admin/blog. Answers come from the admin-chat function.
   It sends the section list this person can open; the server adds counts allowed by their permissions. */
(function () {
  "use strict";
  const CHAT = "fa_chat_log", MAIN = "fa_chat_main_map", ACC = "var(--accent,#0f6b5c)";
  const BLOG_TABS = [["overview", "Home", "What needs attention and things you can start"], ["articles", "Articles", "Waiting for approval, drafts, scheduled and live"], ["topics", "Topics", "Questions the Planner picks the next article from"], ["pipeline", "Live flow", "Every step of every article, and fixing failures"], ["activity", "Activity log", "What the agents did"], ["performance", "Performance", "Reads, test clicks and Google data"], ["settings", "Settings", "Schedule, writing, AI, alerts"], ["settings/schedule", "Settings: Schedule & approval", "When articles are written and published"], ["settings/writing", "Settings: Writing & look", "Length, voice, Urdu, photos, fonts, categories"], ["settings/ai", "Settings: AI & limits", "AI service, key and call limits"], ["settings/alerts", "Settings: Alerts & Search Console", "Emails and Google link"]];
  const isBlog = () => /\/admin\/blog/.test(location.pathname);
  const load = (s, k, d) => { try { return JSON.parse(s.getItem(k)) ?? d; } catch { return d; } };
  const save = (s, k, v) => { try { s.setItem(k, JSON.stringify(v)); } catch {} };
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const subOf = () => { try { return JSON.parse(atob(FA.session().access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).sub; } catch { return ""; } };
  const blogLine = ([k, t, d]) => `blog:${k} | Blog agent > ${t} | ${d}`;

  function blogMap() {
    const seen = new Set(BLOG_TABS.map(blogLine));
    const idx = (window.DivaarFind && window.DivaarFind.index) || [];
    idx.filter((x) => x.t && x.t.page === "blog" && x.t.tab).slice(0, 260).forEach((x) => {
      const k = x.t.tab + (x.t.sub ? "/" + x.t.sub : "");
      seen.add(`blog:${k} | ${[...(x.path || []), x.title].filter(Boolean).join(" > ")} | ${x.desc || ""}`);
    });
    return [...seen].join("\n");
  }
  function map() {
    if (!isBlog()) {
      if (!window.FAAdmin) return BLOG_TABS.map(blogLine).join("\n");
      const m = window.FAAdmin.map();
      save(localStorage, MAIN, { sub: subOf(), text: m.own });
      return m.own + (m.blog ? "\n" + BLOG_TABS.map(blogLine).join("\n") : "");
    }
    const c = load(localStorage, MAIN, null);
    return blogMap() + (c && c.sub === subOf() ? "\n" + c.text : "");
  }
  function go(key) {
    const [page, rest] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    if (page === "admin") {
      if (!isBlog()) return window.FAAdmin && window.FAAdmin.go(rest);
      try { sessionStorage.setItem("fa_chat_go", rest); } catch {}
      location.href = "/admin"; return;
    }
    const [tab, sub] = rest.split("/");
    if (isBlog() && window.DivaarFind) return window.DivaarFind.go(sub ? { page: "blog", tab, sub } : { page: "blog", tab });
    if (sub) try { sessionStorage.setItem("dv_find_go", JSON.stringify({ page: "blog", tab, sub })); } catch {}
    location.href = "/admin/blog#" + tab;
  }

  const css = `.fac-b{position:fixed;right:18px;bottom:18px;z-index:130;width:54px;height:54px;border:0;border-radius:50%;background:${ACC};color:#fff;cursor:pointer;display:grid;place-items:center;box-shadow:0 8px 24px rgba(14,24,44,.3)}.fac-b:focus-visible,.fac button:focus-visible{outline:3px solid #f5b301;outline-offset:2px}
.fac{padding:0;margin:0;position:fixed;right:18px;bottom:84px;z-index:130;width:min(390px,calc(100vw - 32px));height:min(560px,calc(100dvh - 110px));display:flex;flex-direction:column;background:#fff;color:#1b2a41;border:1px solid #dfe3ea;border-radius:16px;overflow:hidden;box-shadow:0 18px 50px rgba(14,24,44,.28);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}.fac[hidden],.fac-b[hidden]{display:none}
.fac-h{display:flex;align-items:center;gap:8px;padding:12px 14px;background:${ACC};color:#fff}.fac-h b{flex:1;font-size:15px}.fac-h button{background:none;border:0;color:#fff;cursor:pointer;font:inherit;font-size:13px;padding:4px 6px;min-height:32px}
.fac-l{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#f6f7f9}.fac-m{max-width:88%;padding:9px 12px;border-radius:12px;background:#fff;border:1px solid #e6e9ef;white-space:pre-wrap;overflow-wrap:anywhere}.fac-m.u{align-self:flex-end;background:${ACC};color:#fff;border:0}.fac-m.e{background:#fdeeee;border-color:#f3c9c9;color:#8a1c1c}.fac-m button{display:inline-block;margin:3px 0;padding:3px 9px;border:1px solid ${ACC};border-radius:8px;background:#fff;color:${ACC};font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.fac-s{display:flex;flex-wrap:wrap;gap:6px}.fac-s button{padding:6px 10px;border:1px solid #d5dae3;border-radius:16px;background:#fff;color:#1b2a41;font:inherit;font-size:13px;cursor:pointer}
.fac-f{display:flex;gap:8px;padding:10px;border-top:1px solid #e6e9ef}.fac-f textarea{flex:1;resize:none;height:42px;max-height:110px;padding:9px 10px;border:1px solid #d5dae3;border-radius:10px;font:inherit;color:inherit;background:#fff}.fac-f button{border:0;border-radius:10px;padding:0 14px;background:${ACC};color:#fff;font:inherit;font-weight:600;cursor:pointer}.fac-f button:disabled{opacity:.55}.fac-n{margin:0;padding:0 12px 8px;font-size:12px;color:#5d6878}
@media(max-width:520px){.fac{right:16px;bottom:82px}}`;
  const ICON = '<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
  const SUGGEST = ["How many bookings came today?", "Which lab reports need approval?", "Where do I edit lab reports?", "How do I change the logo?"];
  let log = load(sessionStorage, CHAT, []), busy = false, els = null;

  function format(text, keys) {
    return esc(text).replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/\[\[go:([a-z]+:[A-Za-z0-9_\/-]+)\]\]/g, (_, k) => keys[k] ? `<button type="button" data-go-key="${esc(k)}">${esc(keys[k])}</button>` : "");
  }
  function keysOf(m) {
    const o = {};
    m.split("\n").forEach((l) => { const p = l.split(" | "); if (p[1]) o[p[0]] = p[1].split(" > ").pop(); });
    return o;
  }
  function draw() {
    const keys = keysOf(map()), L = els.list;
    L.innerHTML = log.map((m) => `<div class="fac-m ${m.role === "user" ? "u" : m.err ? "e" : ""}">${m.role === "user" ? esc(m.text) : format(m.text, keys)}</div>`).join("") +
      (busy ? '<div class="fac-m" role="status">Thinking…</div>' : "") +
      (!log.length ? `<div class="fac-m">Ask me how to do anything in this admin, or for today's numbers.</div><div class="fac-s">${SUGGEST.map((s) => `<button type="button" data-s="${esc(s)}">${esc(s)}</button>`).join("")}</div>` : "");
    L.scrollTop = L.scrollHeight;
    els.send.disabled = busy;
  }
  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    log.push({ role: "user", text }); busy = true; els.ta.value = ""; draw();
    try {
      const j = await FA.adminChat({ page: isBlog() ? "Blog agent" : "Main admin", map: map(), messages: log.filter((m) => !m.err).map(({ role, text }) => ({ role, text })) });
      log.push({ role: "model", text: j.reply });
    } catch (e) { log.push({ role: "model", err: 1, text: e.message || "Something went wrong. Please try again." }); }
    busy = false; log = log.slice(-30); save(sessionStorage, CHAT, log); draw();
  }
  function build() {
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "fac-b"; btn.hidden = true; btn.setAttribute("aria-label", "Open admin helper"); btn.setAttribute("aria-expanded", "false"); btn.innerHTML = ICON;
    const box = document.createElement("section");
    box.className = "fac"; box.hidden = true; box.setAttribute("aria-label", "Admin helper");
    box.innerHTML = '<div class="fac-h"><b>Admin helper</b><button type="button" data-new>New chat</button><button type="button" data-x aria-label="Close">✕</button></div><div class="fac-l" aria-live="polite"></div><form class="fac-f"><textarea rows="1" maxlength="2000" aria-label="Your question" placeholder="Ask about the admin…"></textarea><button type="submit">Send</button></form><p class="fac-n">Answers come from Google Gemini. Please don\'t type patient details.</p>';
    document.body.append(btn, box);
    els = { btn, box, list: box.querySelector(".fac-l"), ta: box.querySelector("textarea"), send: box.querySelector('[type=submit]') };
    const toggle = (on) => { box.hidden = !on; btn.setAttribute("aria-expanded", String(on)); btn.setAttribute("aria-label", on ? "Close admin helper" : "Open admin helper"); if (on) { draw(); els.ta.focus(); } else btn.focus(); };
    btn.onclick = () => toggle(box.hidden);
    box.querySelector("[data-x]").onclick = () => toggle(false);
    box.querySelector("[data-new]").onclick = () => { log = []; save(sessionStorage, CHAT, log); draw(); els.ta.focus(); };
    box.querySelector("form").onsubmit = (e) => { e.preventDefault(); send(els.ta.value); };
    els.ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(els.ta.value); } });
    box.addEventListener("keydown", (e) => { if (e.key === "Escape") toggle(false); });
    els.list.addEventListener("click", (e) => { const g = e.target.closest("[data-go-key]"), s = e.target.closest("[data-s]"); if (g) go(g.dataset.goKey); if (s) send(s.dataset.s); });
  }
  const ready = () => {
    if (!window.FA || !FA.session() || !FA.session().access_token) return false;
    if (isBlog()) { const a = document.getElementById("app"); return !!a && !a.hidden; }
    return !!document.querySelector(".ad");
  };
  function tick() {
    if (!els) { if (!ready()) return; build(); }
    const on = ready();
    els.btn.hidden = !on;
    if (!on) els.box.hidden = true;
    /* A modal window makes the rest of the page unclickable, so the helper moves inside the one that is open. */
    const open = [...document.querySelectorAll("dialog[open]")].pop() || document.body;
    if (els.btn.parentElement !== open) open.append(els.btn, els.box);
  }
  tick(); setInterval(tick, 500);
})();
