/* Fort Abbas Poly Clinic — Guides admin (/admin/blog): articles, topics, the AI agent team, performance and settings.
   Uses the same sign-in as the main admin (Store.client from shared.js). Only owners and full-access admins
   can use it; every table behind it is protected by row-level security (supabase/blog.sql). The AI key and the
   Search Console key are write-only from here — they are never sent back to the browser. */
(function () {
  "use strict";
  const S = window.Store, MD = window.BlogMD, client = S && S.client;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const esc = S.esc, toast = S.toast;
  const B = { me: null, s: null, sec: {}, cats: [], posts: [], topics: [], jobs: [], logs: [], products: [], U: null, ov: {}, edit: null, artF: "review", topF: "open", jobF: "active" };
  const fail = (e) => { console.error(e); toast((e && (e.message || e.error_description)) || String(e), "error"); };
  const when = (d) => (d ? S.fmtDateTime(d) : "");
  const ago = (d) => { if (!d) return ""; const s = (Date.now() - new Date(d)) / 1000; if (s < 60) return "just now"; if (s < 3600) return `${Math.round(s / 60)} min ago`; if (s < 86400) return `${Math.round(s / 3600)} h ago`; return `${Math.round(s / 86400)} d ago`; };
  const lines = (t) => String(t || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const AGENTS = {
    planner: ["Planner", "Picks the next topics for your publishing slots and starts each article."],
    scout: ["Topic Scout", "Finds questions people search for and adds the best ones to the backlog."],
    researcher: ["Source Researcher", "Fetches reference pages and prepares a brief with facts that can be cited."],
    writer: ["Writer", "Drafts the article from the brief: quick answer, sections, table, FAQ."],
    linker: ["SEO & Linker", "Adds internal links and relevant test cards; writes the search title and description."],
    imager: ["Image Curator", "Chooses a cover: your clinic photo or an openly licensed photo with credit."],
    reviewer: ["Quality Reviewer", "Checks links, facts against sources, duplicates and safety; flags what a person must read."],
    publisher: ["Publisher", "Schedules or publishes — or holds the article for your approval."],
    translator: ["Translator", "Makes an Urdu version for review (when Urdu is on)."],
    monitor: ["Performance Monitor", "Weekly: reads, test clicks, Search Console data and improvement ideas."],
    refresher: ["Refresher", "Rewrites an article to improve it; live articles get a proposal you apply."],
    ping: ["Connection test", "Checks the AI key and lists the models it can use."]
  };
  const FLOW = ["scout", "planner", "researcher", "writer", "linker", "imager", "reviewer", "publisher", "translator", "monitor"];
  const STATUS = { draft: ["Draft", "badge-soft"], review: ["Needs your approval", "badge-amber"], scheduled: ["Scheduled", "badge-blue"], published: ["Published", "badge-ok"], unpublished: ["Unpublished", "badge-dark"] };
  const JOB = { queued: ["Waiting", "badge-soft"], running: ["Working…", "badge-blue"], done: ["Done", "badge-ok"], failed: ["Failed", "badge-danger"], cancelled: ["Cancelled", "badge-dark"] };
  const badge = (map, k) => `<span class="badge ${(map[k] || ["", "badge-soft"])[1]}">${esc((map[k] || [k])[0])}</span>`;

  /* =============================== confirm =============================== */
  function confirmBox(title, text, ok = "OK", danger = false) {
    return new Promise((resolve) => {
      const d = $("#confirmDlg");
      $("#confirmTitle").textContent = title; $("#confirmText").textContent = text || "";
      $("#confirmOk").textContent = ok; $("#confirmOk").className = "btn " + (danger ? "btn-danger" : "btn-dark");
      const done = (v) => { d.close(); resolve(v); };
      $("#confirmCancel").onclick = () => done(false);
      $("#confirmForm").onsubmit = (e) => { e.preventDefault(); done(true); };
      d.oncancel = () => resolve(false);
      d.showModal();
    });
  }

  /* =============================== sign in =============================== */
  function showLogin(msg) { $("#app").hidden = true; $("#login").hidden = false; $("#loginErr").textContent = msg || ""; }
  async function enter() {
    const { data: ok } = await client.rpc("is_admin");
    const role = ok ? "admin" : null;
    if (!role) { showLogin("Your account doesn't have the Blog agent permission. Ask an owner to give it to you in Users."); return; }
    const { data: prof } = await client.rpc("my_profile");
    if (prof && prof.must_change_password) { location.href = "/admin"; return; }
    const { data: u } = await client.auth.getUser();
    B.me = { role, email: u && u.user && u.user.email };
    $("#login").hidden = true; $("#app").hidden = false;
    await loadAll();
    subscribe();
    route();
    setInterval(() => { if (!document.hidden) refreshLight(); }, 60000);
    loadUsage(); setInterval(paintMeter, 1000); setInterval(() => { if (!document.hidden) loadUsage(); }, 6000);
  }
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target; $("#loginBtn").disabled = true; $("#loginErr").textContent = "";
    const { error } = await client.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
    $("#loginBtn").disabled = false;
    if (error) { $("#loginErr").textContent = error.message === "Invalid login credentials" ? "Wrong email or password." : error.message; return; }
    f.password.value = ""; enter();
  });
  $("#logoutBtn").addEventListener("click", async () => { await client.auth.signOut(); showLogin(); });

  /* =============================== tabs =============================== */
  const TABS = ["overview", "articles", "topics", "pipeline", "activity", "performance", "settings"];
  const META = {
    overview: ["Work", "Home", "What needs you right now, and things you can start."],
    articles: ["Work", "Articles", "Every guide — waiting for your approval, drafts, scheduled and live."],
    topics: ["Work", "Topics", "Questions people search for. The Planner picks the next article from this list."],
    pipeline: ["Team", "Live flow", "Watch every step of every article as it happens, and fix anything that failed."],
    activity: ["Team", "Activity log", "A diary of everything the agents did, newest first."],
    performance: ["Results", "Performance", "Reads, test clicks and Google data for each published guide."],
    settings: ["Setup", "Settings", ""]
  };
  const SUBS = {
    schedule: ["Schedule & approval", "When articles are written and published, and whether you approve each one."],
    writing: ["Writing & look", "How articles read and look: length, test cards, voice, Urdu, photos, fonts and categories."],
    ai: ["AI & limits", "Which AI service writes, its key, and how many AI calls it may make per minute and per month."],
    alerts: ["Alerts & Search Console", "Who gets emails about new drafts and failures, and the Google Search Console link."]
  };
  function route() {
    const parts = (location.hash || "#overview").slice(1).split("/");
    let t = parts[0] === "flow" ? "pipeline" : parts[0];
    if (!TABS.includes(t)) t = "overview";
    TABS.forEach((x) => { const el = $(`#panel-${x}`); if (el) el.hidden = x !== t; });
    $$("#tabs [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
    const m = META[t]; let title = m[1], desc = m[2];
    if (t === "settings") {
      const sub = SUBS[parts[1]] ? parts[1] : "schedule";
      $$("#panel-settings [data-ss]").forEach((c) => { if (!c.closest("#setSub")) c.hidden = c.dataset.ss !== sub; });
      $$("#setSub [data-ss]").forEach((b) => b.classList.toggle("on", b.dataset.ss === sub));
      $$("#setKids [data-ss]").forEach((a) => a.classList.toggle("on", a.dataset.ss === sub));
      title = SUBS[sub][0]; desc = SUBS[sub][1];
    }
    $("#setKids").hidden = t !== "settings";
    $("#crumbGroup").textContent = m[0]; $("#crumbPage").textContent = title; $("#pageTitle").textContent = title; $("#pageDesc").textContent = desc;
    document.title = title + " · Blog agent";
    sideClose();
    if (t === "performance") loadPerformance();
    const id = parts[1] || "";
    if (t === "articles" && id && (!B.edit || B.edit.id !== id)) openEditor(id);
  }
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) location.hash = b.dataset.tab; });
  $("#setSub").addEventListener("click", (e) => { const b = e.target.closest("[data-ss]"); if (b) location.hash = "settings/" + b.dataset.ss; });
  // phone: the menu slides in
  function sideClose() { $("#app").classList.remove("side-open"); $("#sideScrim").hidden = true; document.documentElement.classList.remove("side-lock"); }
  $("#sideOpen").addEventListener("click", () => { $("#app").classList.add("side-open"); $("#sideScrim").hidden = false; document.documentElement.classList.add("side-lock"); });
  $("#sideScrim").addEventListener("click", sideClose);
  window.addEventListener("hashchange", route);

  /* =============================== data =============================== */
  async function q(p) { const { data, error } = await p; if (error) throw error; return data; }
  async function loadAll() {
    try {
      const [s, cats, site] = await Promise.all([
        q(client.from("blog_settings").select("*").eq("id", 1).single()),
        q(client.from("blog_categories").select("*").order("sort")),
        FA.content()
      ]);
      const products = (site.tests.items || []).filter((t) => t.active !== false).map((t) => ({ id: t.id, name: t.name, variant_name: "", category: t.category, subcategory: "", images: [], image_url: "", stock: 1 }));
      B.s = s; B.cats = cats; B.products = products; B.U = { product: (p) => "/tests.html?book=" + encodeURIComponent(p.id), cat: () => "/tests.html", sub: () => "/tests.html" };
      await Promise.all([loadSecrets(), loadPosts(), loadTopics(), loadJobs(), loadOverview()]);
      fillCatSelects(); fillSettings(); renderCats();
    } catch (e) { fail(e); }
  }
  async function refreshLight() { try { await Promise.all([loadOverview(), loadJobs(), loadPosts()]); } catch (e) { console.warn(e); } }
  async function loadSecrets() { const { data } = await client.rpc("blog_secret_status"); B.sec = data || {}; renderSecrets(); renderOverview(); }
  async function loadPosts() {
    B.posts = await q(client.from("blog_posts").select("id,slug,lang,title,status,needs_review,review_notes,quality,published_at,scheduled_at,updated_at,created_at,category_id,ai_generated,word_count,translation_of,is_pillar,featured").order("updated_at", { ascending: false }).limit(1000));
    renderArticles(); renderBadges(); paintPubNow();
  }
  async function loadTopics() { B.topics = await q(client.from("blog_topics").select("*").order("score", { ascending: false }).limit(1000)); renderTopics(); paintPubNow(); }
  async function loadJobs() {
    const [jobs, logs] = await Promise.all([
      q(client.from("blog_jobs").select("id,agent,status,payload,result,error,attempts,max_attempts,created_at,started_at,finished_at,run_after,post_id,topic_id,run_id,created_by,parent_id").order("created_at", { ascending: false }).limit(300)),
      q(client.from("blog_logs").select("*").order("id", { ascending: false }).limit(300))
    ]);
    B.jobs = jobs; B.logs = logs; renderJobs(); renderLogs(); renderFlow(); renderBadges(); paintMeter();
  }
  async function loadOverview() { const { data, error } = await client.rpc("blog_overview"); if (!error) { B.ov = data || {}; renderOverview(); renderBadges(); } }

  let liveTimer = null;
  function subscribe() {
    const again = () => { clearTimeout(liveTimer); liveTimer = setTimeout(async () => { try { await Promise.all([loadJobs(), loadPosts(), loadOverview()]); if (!$("#panel-topics").hidden) await loadTopics(); } catch (e) { console.warn(e); } }, 700); };
    client.channel("blog-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "blog_jobs" }, () => { again(); loadUsage(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "blog_logs" }, again)
      .subscribe((st) => { $("#liveDot").hidden = st !== "SUBSCRIBED"; });
  }

  /* =============================== AI pace: counter + check =============================== */
  // AI calls each step makes. Steps not listed don't call the AI.
  const AI_USE = { scout: 1, researcher: 1, writer: 1, linker: 1, reviewer: 1, translator: 1, refresher: 1, ping: 1 };
  const ARTICLE = ["researcher", "writer", "linker", "imager", "reviewer", "publisher", "translator"];
  const urduOn = () => !!(B.s && B.s.urdu_enabled);
  // AI calls a job will still make: its own and those of the steps it hands over to
  function callsAhead(agent, only) {
    if (only) return AI_USE[agent] || 0;
    const i = ARTICLE.indexOf(agent);
    if (i >= 0) return ARTICLE.slice(i).filter((a) => a !== "translator" || urduOn()).reduce((n, a) => n + (AI_USE[a] || 0), 0);
    if (agent === "refresher") return 1 + callsAhead("linker") - (urduOn() ? 1 : 0);   // a refreshed article keeps its Urdu copy
    if (agent === "planner") return callsAhead("researcher");                            // at least one article, usually
    return AI_USE[agent] || 0;
  }
  const U = { rows: [] };
  async function loadUsage() {
    const { data, error } = await client.from("blog_ai_usage").select("id,job_id,agent,created_at").gt("created_at", new Date(Date.now() - 70000).toISOString()).order("created_at", { ascending: false }).limit(200);
    if (!error) { U.rows = data || []; paintMeter(); }
  }
  const lastMinute = () => { const t = Date.now() - 60000; return U.rows.filter((r) => new Date(r.created_at).getTime() > t); };
  // was this job (or the job that started it) started by a person pressing a button?
  function byPerson(jobId) {
    let j = B.jobs.find((x) => x.id === jobId), hops = 0;
    while (j && hops++ < 12) { if (String(j.created_by || "").includes("@")) return true; j = j.parent_id && B.jobs.find((x) => x.id === j.parent_id); }
    return false;
  }
  function pendingCalls() {
    return B.jobs.filter((j) => ["queued", "running"].includes(j.status)).reduce((n, j) => n + callsAhead(j.agent, j.payload && j.payload.only) - (j.status === "running" ? 0 : 0), 0);
  }
  const AI_TABS = ["overview", "articles", "topics", "pipeline", "settings"];
  function paintMeter() {
    if (!B.s) return;
    const rows = lastMinute(), n = rows.length, lim = Math.max(1, Number(B.s.max_calls_per_minute) || 4);
    const mine = rows.filter((r) => byPerson(r.job_id)).length, ahead = pendingCalls();
    const st = n > lim ? "over" : n >= lim ? "full" : n >= lim - 1 && n ? "near" : n ? "used" : "idle";
    const m = $("#aiMeter"); if (!m) return;
    m.className = "ai-meter st-" + st;
    $("#aiMeterN").textContent = `${n} / ${lim}`;
    $("#aiMeterPips").innerHTML = Array.from({ length: Math.min(lim, 12) }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("") + (n > lim ? `<em>+${n - lim}</em>` : "");
    m.title = `AI calls in the last 60 seconds: ${n} of your ${lim}-a-minute limit` + (n ? ` (${mine} from buttons you pressed, ${n - mine} from scheduled work)` : "") + (ahead ? `. About ${ahead} more are waiting in Live flow.` : ".") + " Steps over the limit wait their turn by themselves. Click to change the limit.";
    $$("#tabs [data-tab]").forEach((b) => { const c = b.querySelector("[data-ain]"); if (!c) return; const show = n > 0 && AI_TABS.includes(b.dataset.tab); c.hidden = !show; c.textContent = n; c.className = "ai-n st-" + st; c.title = `${n} AI call${n === 1 ? "" : "s"} in the last minute (limit ${lim})`; });
  }
  // a button press that would go past the per-minute pace asks once — buttons only, nothing to type
  async function aiOk(est, what) {
    if (!est || !B.s) return true;
    const used = lastMinute().length, ahead = pendingCalls(), lim = Math.max(1, Number(B.s.max_calls_per_minute) || 4);
    if (used + ahead + est <= lim) return true;
    return new Promise((resolve) => {
      const d = $("#aiDlg"), tot = Math.max(lim, used + ahead + est), pct = (x) => (x / tot * 100).toFixed(1) + "%";
      $("#aiDlgMeter").innerHTML = `<div class="gd-ai-bar"><span class="u" style="width:${pct(used)}"></span><span class="a" style="width:${pct(ahead)}"></span><span class="t" style="width:${pct(est)}"></span><b style="left:${pct(lim)}" title="Your limit"></b></div>
        <div class="gd-ai-key"><span class="u">Last minute: ${used}</span>${ahead ? `<span class="a">Already waiting: ${ahead}</span>` : ""}<span class="t">This: ≈${est}</span><span class="l">Limit: ${lim} a minute</span></div>`;
      $("#aiDlgText").innerHTML = `<b>${esc(what)}</b> needs about ${est} AI call${est === 1 ? "" : "s"}. That's more than your usual ${lim} a minute. If you go ahead nothing breaks — the steps over the limit wait their turn and carry on by themselves about a minute later.`;
      const done = (v) => { d.close(); resolve(v); };
      $("#aiDlgYes").onclick = () => done(true); $("#aiDlgNo").onclick = () => done(false);
      d.oncancel = (e) => { e.preventDefault(); done(false); };
      d.showModal(); $("#aiDlgNo").focus();
    });
  }

  /* =============================== run an agent =============================== */
  // what pressing a button does, and where to watch it
  const TELL = {
    scout: ["The Topic Scout is looking for questions people search. New ideas appear in Topics → To write in 1–2 minutes.", "topics", "Open Topics"],
    planner: ["The Planner is checking your publishing slots for the next 2 days. Any article it starts shows in Live flow.", "pipeline", "Watch in Live flow"],
    monitor: ["Performance check started. New ideas appear in Performance → Recommendations in about a minute.", "performance", "Open Performance"],
    researcher: ["Writing started: research → draft → links → photo → checks. Watch each step in Live flow (about 3–6 minutes).", "pipeline", "Watch in Live flow"],
    reviewer: ["Re-checking this article. New notes appear in its checks in about a minute.", "pipeline", "Watch in Live flow"],
    refresher: ["Improving this article. A live article gets a proposal you apply here; others are updated directly.", "pipeline", "Watch in Live flow"],
    translator: ["Making the Urdu version. It appears in Articles (اردو) for your review in 1–2 minutes.", "pipeline", "Watch in Live flow"],
    imager: ["Looking for a new cover photo. It appears on this article in about a minute.", "pipeline", "Watch in Live flow"]
  };
  async function run(agent, payload, quiet, what) {
    const est = callsAhead(agent, payload && payload.only);
    if (!(await aiOk(est, what || (AGENTS[agent] || [agent])[0]))) return null;
    const { data, error } = await client.rpc("blog_enqueue", { p_agent: agent, p_payload: payload || {} });
    if (error) { fail(error); return null; }
    if (!quiet) { const t = TELL[agent]; toast(t ? t[0] : `${(AGENTS[agent] || [agent])[0]} started — watch it in Live flow.`, "ok", t ? { label: t[2], href: "#" + t[1] } : { label: "Watch in Live flow", href: "#pipeline" }); }
    loadJobs().catch(() => {}); setTimeout(loadUsage, 4000);
    return data;
  }
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-run]"); if (b) { if (!B.sec.ai_key_set && b.dataset.run !== "monitor") { toast("Add an AI key first — Settings → AI & limits.", "error", { label: "Open AI & limits", href: "#settings/ai" }); return; } run(b.dataset.run, {}, false, b.closest(".gd-act") ? b.closest(".gd-act").querySelector("b").textContent : b.textContent.replace(/\s*(≈.*|No AI|\d+ AI)$/, "").trim()); } });
  $("#wakeAgents").addEventListener("click", async () => {
    const waiting = B.jobs.filter((j) => j.status === "queued");
    if (!waiting.length) { toast("Nothing is waiting, so there's nothing to start. New jobs appear here when your schedule or a button starts them.", "info"); return; }
    const j = waiting[0];
    const { error } = await client.rpc("blog_job_action", { p_job: j.id, p_action: "kick" }); if (error) return fail(error);
    const full = lastMinute().length >= (Number(B.s.max_calls_per_minute) || 4);
    toast(`Started — ${waiting.length} waiting job${waiting.length > 1 ? "s are" : " is"} being picked up now. They turn blue (Working) in this list within a few seconds.${full ? " AI steps wait a moment because this minute's AI calls are used up." : ""}`, "ok");
    B.jobF = "active"; renderJobs(); setTimeout(() => loadJobs().catch(() => {}), 3000);
  });
  $("#toggleAgents").addEventListener("click", async () => {
    const on = !B.s.agents_enabled;
    const { error } = await client.from("blog_settings").update({ agents_enabled: on }).eq("id", 1);
    if (error) return fail(error);
    B.s.agents_enabled = on; fillSettings(); renderOverview(); renderBadges();
    toast(on ? "Agents are on. The Planner checks your schedule now and starts any article that's due." : "Agents paused. Nothing new will start — not even your schedule — until you turn them on again. Jobs already running finish first.", on ? "ok" : "info", on ? { label: "Watch in Live flow", href: "#pipeline" } : null);
    if (on && B.sec.ai_key_set) run("planner", {}, true);
  });

  /* =============================== publish a guide now =============================== */
  // what pressing the button will do right now (same order as public.blog_publish_next)
  function pubNowPlan() {
    const en = B.posts.filter((p) => p.lang === "en");
    const sched = en.filter((p) => p.status === "scheduled").sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)))[0];
    const ready = en.filter((p) => p.status === "review" && !p.needs_review).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
    const busy = B.jobs.find((j) => ["queued", "running"].includes(j.status) && ["researcher", "writer", "linker", "imager", "reviewer", "publisher"].includes(j.agent));
    if (sched) return { kind: "post", post: sched, text: `Publishes “${sched.title}” now (it was scheduled for ${when(sched.scheduled_at)}). Its slot goes to the next topic, which the planner starts automatically.` };
    if (ready) return { kind: "post", post: ready, text: `Publishes “${ready.title}” now — it passed every check and was waiting for your approval.` };
    if (busy) return { kind: "busy", text: `A guide is already being written (${(AGENTS[busy.agent] || [busy.agent])[0]} step). It will be published the moment it passes the checks.` };
    const t = B.topics.filter((x) => ["approved", "idea"].includes(x.status)).sort((a, b) => (b.status === "approved") - (a.status === "approved") || b.score - a.score)[0];
    if (t) return { kind: "write", text: `Writes a new guide now about “${t.title_idea || t.query}” and publishes it as soon as it passes the checks (about 3–6 minutes). If anything is flagged, it waits for you instead.` };
    return { kind: "scout", text: "Finds topics people search for, then writes the best one and publishes it when it passes the checks (about 5–10 minutes)." };
  }
  function paintPubNow() {
    const h = $("#pubNowHint"); if (!h || !B.s) return; const p = pubNowPlan(); h.textContent = p.text;
    const n = p.kind === "write" ? callsAhead("researcher") : p.kind === "scout" ? 1 + callsAhead("researcher") : 0;
    $$("[data-pubai]").forEach((c) => { c.textContent = n ? `≈${n} AI` : "No AI"; c.classList.toggle("free", !n); });
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-pubnow]"); if (!b) return;
    if (!B.sec.ai_key_set && pubNowPlan().kind !== "post") { toast("Add an AI key in Settings first.", "error"); location.hash = "settings/ai"; return; }
    const plan = pubNowPlan();
    const est = plan.kind === "write" ? callsAhead("researcher") : plan.kind === "scout" ? 1 + callsAhead("researcher") : 0;
    if (!(await aiOk(est, "Publish a guide now"))) return;
    if (plan.kind !== "post" && !B.s.agents_enabled) {
      if (!(await confirmBox("Turn the agents on?", "They're paused. To write a guide now they need to be on — they'll also follow your schedule from now on.", "Turn on & write"))) return;
      const { error } = await client.from("blog_settings").update({ agents_enabled: true }).eq("id", 1); if (error) return fail(error);
      B.s.agents_enabled = true; fillSettings();
    } else if (!(await confirmBox("Publish a guide now?", plan.text, plan.kind === "post" ? "Publish now" : "Write & publish"))) return;
    b.disabled = true;
    const { data, error } = await client.rpc("blog_publish_next"); b.disabled = false;
    if (error) return fail(error);
    const r = data || {};
    if (r.action === "published") toast(`Published: “${r.title}”. It's on the blog within a minute; the planner is lining up the next topic.`, "ok");
    else if (r.action === "in_progress") toast("A guide is already being written — it will go live as soon as it passes the checks.", "ok");
    else if (r.action === "writing") toast(`Writing “${r.topic}” now — it goes live by itself when it passes the checks.`, "ok", { label: "Watch in Live flow", href: "#pipeline" });
    else toast("Finding topics first, then writing the best one.", "ok", { label: "Watch in Live flow", href: "#pipeline" });
    await Promise.all([loadPosts(), loadJobs()]).catch(() => {});
    renderOverview();
  });

  /* =============================== overview =============================== */
  function renderBadges() {
    const review = B.posts.filter((p) => p.status === "review" || (p.status === "draft" && p.needs_review)).length;
    $("#tcReview").textContent = review; $("#tcReview").hidden = !review;
    const failed = B.ov.failed_24h || 0; $("#tcFailed").textContent = failed; $("#tcFailed").hidden = !failed;
    const reco = B.ov.open_recos || 0; $("#tcReco").textContent = reco; $("#tcReco").hidden = !reco;
    const st = $("#agentState");
    if (B.s) { st.hidden = false; st.textContent = B.s.agents_enabled ? "● Agents on" : "❚❚ Agents paused"; st.className = "ba-agent-state " + (B.s.agents_enabled ? "on" : "off"); }
  }
  function renderOverview() {
    if (!B.s) return;
    const o = B.ov || {}, p = o.posts || {}, t = o.topics || {}, m = o.month || {};
    const steps = [];
    if (!B.sec.ai_key_set) steps.push(`<div class="ba-callout"><b>Step 1 — add an AI key.</b> Pick a service in Settings → AI (Google Gemini, Groq and others have free tiers) and paste its key. Until then the agents wait. <button type="button" class="btn btn-primary btn-sm" data-go="settings/ai">Open AI &amp; limits</button></div>`);
    else if (!B.s.agents_enabled) steps.push(`<div class="ba-callout"><b>The agents are paused.</b> Nothing new will be written until you turn them on. <button type="button" class="btn btn-primary btn-sm" id="ovEnable">Turn agents on</button></div>`);
    if (o.failed_24h) steps.push(`<div class="ba-callout bad"><b>${o.failed_24h} job${o.failed_24h > 1 ? "s" : ""} failed in the last 24 hours.</b> <button type="button" class="btn btn-soft btn-sm" data-go="pipeline">Open Live flow</button></div>`);
    $("#setupBox").innerHTML = steps.join("");
    const review = B.posts.filter((x) => x.status === "review" || (x.status === "draft" && x.needs_review)).length;
    const limit = B.s.monthly_call_limit;
    $("#ovTiles").innerHTML = [
      ["Needs your approval", review, "articles"], ["Scheduled", p.scheduled || 0, "articles"], ["Published", p.published || 0, "articles"], ["Topics waiting", (t.idea || 0) + (t.approved || 0), "topics"],
      ["Reads (30 days)", o.reads_30d || 0, "performance"], ["Test clicks (30 days)", o.product_clicks_30d || 0, "performance"], ["Visits from AI assistants", o.ai_referrals_30d || 0, "performance"],
      ["AI calls this month", `${m.calls || 0}${limit ? ` / ${limit}` : ""}`, "settings/ai"]
    ].map(([l, v, go]) => `<button type="button" class="tile${l.startsWith("Needs") && v ? " hot" : ""}" data-go="${go}"><span>${esc(l)}</span><b>${esc(v)}</b></button>`).join("");
    $("#toggleAgents").textContent = B.s.agents_enabled ? "Pause agents" : "Turn agents on";
    $("#toggleTitle").textContent = B.s.agents_enabled ? "Pause the agents" : "Turn the agents on";
    $("#toggleText").textContent = B.s.agents_enabled ? "Stops all new work, including your schedule. Jobs already running finish first. Nothing is deleted." : "They're paused now. Turning them on starts your schedule again — the Planner checks for due articles straight away.";
    $("#ovLog").innerHTML = logHtml(B.logs.slice(0, 6));
    paintPubNow();
    const en = $("#ovEnable"); if (en) en.onclick = () => $("#toggleAgents").click();
  }
  document.addEventListener("click", (e) => { const g = e.target.closest("[data-go]"); if (g) { e.preventDefault(); if (g.dataset.go === "articles" && /approval/i.test(g.textContent)) B.artF = "review"; location.hash = g.dataset.go; } });
  /* each agent / job gets one clear state: working, waiting, done, failed or idle */
  const SICON = {
    running: '<svg viewBox="0 0 24 24" class="spin" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 3a9 9 0 1 1-9 9"/></svg>',
    queued: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    failed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 7v6M12 16.5v.01"/></svg>',
    cancelled: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M7 12h10"/></svg>'
  };
  const SLABEL = { running: "Working now", queued: "Waiting its turn", done: "Done", failed: "Failed", cancelled: "Cancelled", idle: "Not run yet" };
  function agentState(a) {
    if (B.jobs.some((j) => j.agent === a && j.status === "running")) return "running";
    if (B.jobs.some((j) => j.agent === a && j.status === "queued")) return "queued";
    const last = B.jobs.find((j) => j.agent === a);
    return last ? last.status : "idle";
  }
  const HANDS = {
    scout: "new ideas → Topics list", planner: "an article → Source Researcher", researcher: "a fact brief → Writer", writer: "the draft → SEO & Linker",
    linker: "links + test cards → Image Curator", imager: "the cover → Quality Reviewer", reviewer: "score + checks → Publisher",
    publisher: "Needs review, Scheduled or Live", translator: "Urdu copy → Articles (needs review)", monitor: "ideas → Performance", refresher: "the rewrite → SEO & Linker again", ping: "result → Settings → AI"
  };
  function node(a) {
    const st = a === "translator" && !urduOn() ? "off" : agentState(a), last = B.jobs.find((j) => j.agent === a);
    const n = B.jobs.filter((j) => j.agent === a && ["running", "queued"].includes(j.status)).length;
    const when_ = last && st !== "idle" && st !== "off" ? ago(last.finished_at || last.started_at || last.created_at) : "";
    const calls = AI_USE[a] ? `${AI_USE[a]} AI call` : "No AI";
    return `<button type="button" class="gd-node st-${st}${B.jobAgent === a ? " sel" : ""}" data-node="${a}" aria-pressed="${B.jobAgent === a}">
      <span class="gd-node-top"><span class="ba-step-ic" aria-hidden="true">${SICON[st] || SICON.cancelled}</span><b>${esc(AGENTS[a][0])}</b>${n ? `<span class="gd-node-n" title="${n} job(s) running or waiting">${n}</span>` : ""}</span>
      <span class="gd-node-d">${esc(AGENTS[a][1])}</span>
      <span class="gd-node-f"><span class="ba-step-state">${esc(st === "off" ? "Off (Urdu is off)" : SLABEL[st] || st)}${when_ ? " · " + esc(when_) : ""}</span><span class="ai-chip${AI_USE[a] ? "" : " free"}">${calls}</span></span>
      <span class="gd-node-h">Hands over: ${esc(HANDS[a] || "")}</span>
      ${st === "running" ? '<span class="ba-step-bar" aria-hidden="true"></span>' : ""}</button>`;
  }
  function renderFlow() {
    const el = $("#ovFlow"); if (!el) return;
    const down = '<span class="gd-link" aria-hidden="true"><i></i></span>';
    el.innerHTML = `<div class="gd-lane"><p class="gd-lane-t"><b>1</b> Find &amp; plan <span>Daily, and when topics run low</span></p>
        <div class="gd-pair">${node("scout")}<span class="gd-link h" aria-hidden="true"><i></i></span>${node("planner")}</div></div>
      ${down}
      <div class="gd-lane"><p class="gd-lane-t"><b>2</b> Write one article <span>About 2 days before each publishing slot · ≈${callsAhead("researcher")} AI calls</span></p>
        <div class="gd-col">${ARTICLE.map(node).join(down)}</div></div>
      <div class="gd-lane gd-lane-side"><p class="gd-lane-t"><b>+</b> On their own <span>Not part of an article's flow</span></p>
        <div class="gd-trio">${["monitor", "refresher", "ping"].map(node).join("")}</div></div>`;
  }
  $("#ovFlow").addEventListener("click", (e) => {
    const n = e.target.closest("[data-node]"); if (!n) return;
    B.jobAgent = B.jobAgent === n.dataset.node ? "" : n.dataset.node;
    if (B.jobAgent) B.jobF = "all";
    renderFlow(); renderJobs();
    if (B.jobAgent && matchMedia("(max-width: 1100px)").matches) $(".gd-jobs").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* =============================== articles =============================== */
  const catName = (id) => (B.cats.find((c) => c.id === id) || {}).name || "";
  function renderArticles() {
    $$("#artFilter button").forEach((b) => b.classList.toggle("on", b.dataset.f === B.artF));
    const term = $("#artSearch").value.trim().toLowerCase(), lang = $("#artLang").value;
    const list = B.posts.filter((p) => {
      const f = B.artF;
      if (f === "review" && !(p.status === "review" || (p.status === "draft" && p.needs_review))) return false;
      if (["draft", "scheduled", "published", "unpublished"].includes(f) && p.status !== f) return false;
      if (lang && p.lang !== lang) return false;
      return !term || p.title.toLowerCase().includes(term);
    });
    $("#artList").innerHTML = list.length ? list.map((p) => {
      const checks = (p.review_notes || []).filter((n) => n.level === "check").length;
      const score = p.quality && p.quality.score;
      return `<button type="button" class="ba-row" data-open="${esc(p.id)}">
        <span class="ba-row-main"><b>${esc(p.title)}</b><span class="muted small">${esc(catName(p.category_id))}${p.lang === "ur" ? " · اردو" : ""}${p.is_pillar ? " · Pillar guide" : ""} · ${p.word_count || 0} words${p.ai_generated ? " · AI draft" : ""}${p.quality && p.quality.proposed ? " · <b>update proposed</b>" : ""}</span></span>
        <span class="ba-row-side">${badge(STATUS, p.status)}${p.needs_review ? `<span class="badge badge-warn">${checks || "!"} to check</span>` : ""}${score ? `<span class="badge badge-soft" title="Fact-check score">${score}/100</span>` : ""}<span class="muted small">${esc(p.status === "scheduled" ? "for " + when(p.scheduled_at) : p.status === "published" ? when(p.published_at) : ago(p.updated_at))}</span></span></button>`;
    }).join("") : `<p class="empty">${B.artF === "review" ? "Nothing waiting for you. New drafts appear here when the agents finish them." : "No articles here yet."}</p>`;
  }
  $("#artFilter").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (b) { B.artF = b.dataset.f; renderArticles(); } });
  $("#artSearch").addEventListener("input", S.debounce(renderArticles, 150));
  $("#artLang").addEventListener("change", renderArticles);
  $("#artList").addEventListener("click", (e) => { const b = e.target.closest("[data-open]"); if (b) location.hash = "articles/" + b.dataset.open; });
  $("#newArticle").addEventListener("click", () => openEditor(null));

  /* ---------- editor ---------- */
  const dlg = $("#editDlg"), F = $("#edForm");
  function fillCatSelects() {
    const opts = B.cats.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}${c.active ? "" : " (hidden)"}</option>`).join("");
    $$(".ba-catid-select").forEach((s) => (s.innerHTML = '<option value="">— none —</option>' + opts));
    $$(".ba-cat-select").forEach((s) => (s.innerHTML = '<option value="">Let the agents decide</option>' + B.cats.map((c) => `<option value="${esc(c.slug)}">${esc(c.name)}</option>`).join("")));
  }
  async function openEditor(id) {
    let p;
    if (id) {
      const { data, error } = await client.from("blog_posts").select("*").eq("id", id).single();
      if (error || !data) { toast("That article no longer exists.", "error"); location.hash = "articles"; return; }
      p = data;
    } else p = { id: null, title: "", slug: "", lang: "en", status: "draft", excerpt: "", answer_summary: "", body_md: "## First section\n\n", faq: [], tags: [], sources: [], cover_image: {}, review_notes: [], quality: {}, product_ids: [] };
    B.edit = p;
    F.title.value = p.title; F.excerpt.value = p.excerpt || ""; F.answer_summary.value = p.answer_summary || ""; F.body_md.value = p.body_md || "";
    F.slug.value = p.slug || ""; F.category_id.value = p.category_id || ""; F.lang.value = p.lang; F.seo_title.value = p.seo_title || ""; F.meta_description.value = p.meta_description || "";
    F.focus_query.value = p.focus_query || ""; F.tags.value = (p.tags || []).join(", "); F.is_pillar.checked = !!p.is_pillar; F.featured.checked = !!p.featured; F.noindex.checked = !!p.noindex;
    const pillars = B.posts.filter((x) => x.is_pillar && x.id !== p.id && x.lang === p.lang);
    $("#edPillar").innerHTML = '<option value="">— none —</option>' + pillars.map((x) => `<option value="${esc(x.id)}">${esc(x.title)}</option>`).join("");
    F.pillar_id.value = p.pillar_id || "";
    const c = p.cover_image || {};
    F.cv_url.value = c.url || ""; F.cv_alt.value = c.alt || ""; F.cv_credit.value = c.credit || ""; F.cv_license.value = c.license || ""; F.cv_license_url.value = c.license_url || ""; F.cv_source_url.value = c.source_url || "";
    F.cv_ratio.value = c.ratio || ""; F.cv_pos.value = c.pos || ""; paintCover();
    renderFaq(p.faq || []); renderSources(p.sources || []); renderNotes(); renderProposed();
    $("#edStatus").className = "badge " + (STATUS[p.status] || ["", "badge-soft"])[1]; $("#edStatus").textContent = (STATUS[p.status] || [p.status])[0];
    $("#edMeta").textContent = p.id ? `${p.ai_generated ? "AI draft · " : ""}updated ${ago(p.updated_at)}${p.reviewed_at ? ` · approved by ${p.reviewed_by || "admin"}` : ""}` : "New article";
    const live = $("#edLive"); live.hidden = p.status !== "published"; live.href = (p.lang === "ur" ? "/ur/blog/" : "/blog/") + p.slug;
    $('[data-act="unpublish"]').hidden = !["published", "scheduled"].includes(p.status);
    $('[data-act="publish"]').textContent = p.needs_review ? "Approve & publish now" : p.status === "published" ? "Update live article" : "Publish now";
    $('[data-act="translate"]').hidden = p.lang !== "en" || !p.id;
    // this article in its other language: one tap to switch between them
    const twin = p.id ? B.posts.find((x) => (p.lang === "en" ? x.translation_of === p.id : x.id === p.translation_of)) : null;
    const el = $("#edLang"); el.hidden = !twin;
    if (twin) { const en = p.lang === "en", btn = (on, id, label, lang) => `<button type="button" lang="${lang}"${on ? ' class="on" aria-pressed="true"' : ` data-twin="${esc(id)}"`}>${label}</button>`; el.innerHTML = btn(en, en ? p.id : twin.id, "English", "en") + btn(!en, en ? twin.id : p.id, "اردو", "ur"); }
    $$('[data-act="recheck"],[data-act="improve"],[data-act="delete"],#findPhoto').forEach((b) => (b.disabled = !p.id));
    const planned = p.scheduled_at || (p.quality && p.quality.planned_for ? new Date(p.quality.planned_for).toISOString() : null);
    $("#edWhen").value = planned ? toLocalInput(planned) : "";
    dlg.classList.toggle("is-ur", p.lang === "ur");
    $$("input[name=title],input[name=excerpt],textarea[name=answer_summary],#edBody,input[name=seo_title],textarea[name=meta_description]", F).forEach((x) => (x.dir = p.lang === "ur" ? "rtl" : "auto"));
    setView("edit"); counters(); words(); scriptCheck();
    if (!dlg.open) dlg.showModal();
  }
  const toLocalInput = (iso) => { const d = new Date(iso); const z = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
  // Urdu articles: words written in the wrong alphabet (Hindi, Bengali, Korean…) can't be shown as Urdu by any font
  const FOREIGN = /\S*[\u0370-\u05FF\u0900-\u1DFF\u3000-\u9FFF\uAC00-\uD7AF]\S*/g;
  function foreignNow() {
    if (!B.edit || F.lang.value !== "ur") return [];
    const txt = [F.title.value, F.excerpt.value, F.answer_summary.value, F.body_md.value, F.seo_title.value, F.meta_description.value, ...$$("#edFaq input, #edFaq textarea").map((x) => x.value)].join(" ");
    return [...new Set(txt.match(FOREIGN) || [])];
  }
  function scriptCheck() {
    const bad = foreignNow(), el = $("#edScript"); el.hidden = !bad.length;
    if (bad.length) el.innerHTML = `<b>${bad.length} word${bad.length > 1 ? "s are" : " is"} in the wrong alphabet</b> — Hindi, Bengali or Korean letters that no Urdu font can show. Retype ${bad.length > 1 ? "them" : "it"} in Urdu: ${bad.slice(0, 12).map((w) => `<code>${esc(w)}</code>`).join(" ")}${bad.length > 12 ? " …" : ""}`;
    return bad;
  }
  F.addEventListener("input", S.debounce(scriptCheck, 400));
  function closeEditor() { if (dlg.open) dlg.close(); B.edit = null; if (location.hash.startsWith("#articles/")) history.replaceState(null, "", "#articles"); }
  dlg.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeEditor(); const t = e.target.closest("[data-twin]"); if (t) location.hash = "articles/" + t.dataset.twin; });
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeEditor(); });

  function renderNotes() {
    const notes = (B.edit.review_notes || []);
    const q = B.edit.quality || {};
    const checks = notes.filter((n) => n.level === "check"), other = notes.filter((n) => n.level !== "check");
    $("#edNotes").innerHTML = (checks.length || other.length || q.score) ? `<div class="ba-callout${checks.length ? "" : " ok"}">
      <b>${checks.length ? `Please check ${checks.length} item${checks.length > 1 ? "s" : ""} before publishing` : "Automatic checks passed"}</b>${q.score ? ` · fact-check score ${q.score}/100` : ""}${q.verdict ? ` — ${esc(q.verdict)}` : ""}
      ${checks.length ? `<ul>${checks.map((n) => `<li>${esc(n.message)}</li>`).join("")}</ul>` : ""}
      ${other.length ? `<details><summary class="small">${other.length} automatic fix${other.length > 1 ? "es" : ""} and note${other.length > 1 ? "s" : ""}</summary><ul class="small">${other.map((n) => `<li>${esc(n.message)}</li>`).join("")}</ul></details>` : ""}</div>` : "";
  }
  function renderProposed() {
    const pr = B.edit.quality && B.edit.quality.proposed;
    $("#edProposed").innerHTML = pr ? `<div class="ba-callout"><b>The Refresher proposed an update</b> (${esc(ago(pr.at))}). ${esc(pr.change_summary || "")} <div class="toolbar"><button type="button" class="btn btn-primary btn-sm" id="applyProp">Load it into the editor</button><button type="button" class="btn btn-soft btn-sm" id="dropProp">Discard</button></div></div>` : "";
    if (!pr) return;
    $("#applyProp").onclick = () => { F.title.value = pr.title; F.excerpt.value = pr.excerpt || ""; F.answer_summary.value = pr.answer_summary || ""; F.body_md.value = pr.body_md; renderFaq(pr.faq || []); if ((pr.sources || []).length) renderSources(pr.sources); B.edit._applyProp = true; toast("Loaded. Read it, then press Update live article (or Save) to keep it.", "ok"); words(); };
    $("#dropProp").onclick = async () => { const qy = { ...(B.edit.quality || {}) }; delete qy.proposed; const { error } = await client.from("blog_posts").update({ quality: qy }).eq("id", B.edit.id); if (error) return fail(error); B.edit.quality = qy; renderProposed(); loadPosts(); };
  }
  function renderFaq(list) {
    $("#edFaq").innerHTML = list.map((f, i) => `<div class="ba-faq"><input class="input" data-fq value="${esc(f.q)}" placeholder="Question"><textarea class="input" data-fa rows="2" placeholder="Answer">${esc(f.a)}</textarea><button type="button" class="link-btn" data-rm-faq="${i}">Remove</button></div>`).join("");
  }
  const readFaq = () => $$("#edFaq .ba-faq").map((r) => ({ q: $("[data-fq]", r).value.trim(), a: $("[data-fa]", r).value.trim() })).filter((f) => f.q && f.a);
  $("#addFaq").addEventListener("click", () => { renderFaq([...readFaq(), { q: "", a: "" }]); });
  $("#edFaq").addEventListener("click", (e) => { const b = e.target.closest("[data-rm-faq]"); if (b) { const l = readFaq(); l.splice(+b.dataset.rmFaq, 1); renderFaq(l); } });
  function renderSources(list) {
    $("#edSources").innerHTML = list.map((s) => `<div class="form-row ba-src"><input class="input" data-st value="${esc(s.title || "")}" placeholder="Title"><input class="input" data-su value="${esc(s.url || "")}" placeholder="https://…" type="url"><input class="input" data-sp value="${esc(s.publisher || "")}" placeholder="Publisher"><button type="button" class="link-btn" data-rm-src>Remove</button></div>`).join("");
  }
  const readSources = () => $$("#edSources .ba-src").map((r) => ({ title: $("[data-st]", r).value.trim(), url: $("[data-su]", r).value.trim(), publisher: $("[data-sp]", r).value.trim() })).filter((s) => S.safeUrl(s.url));
  $("#addSource").addEventListener("click", () => renderSources([...readSources(), { title: "", url: "", publisher: "" }]));
  $("#edSources").addEventListener("click", (e) => { if (e.target.closest("[data-rm-src]")) { e.target.closest(".ba-src").remove(); } });

  function setView(v) {
    $$("#edView button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
    $$("[data-pane]", dlg).forEach((p) => (p.hidden = p.dataset.pane !== v));
    if (v === "preview") preview();
    if (v === "history") loadVersions();
  }
  $("#edView").addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) setView(b.dataset.v); });

  // pages an article may link to (the public page drops any other internal link)
  function validPaths() {
    const set = new Set(["/", "/blog", "/blog/editorial-standards", "/tests.html", "/reports.html"]);
    B.products.forEach((p) => { set.add(B.U.product(p)); if (p.category) { set.add(B.U.cat(p.category)); if (p.subcategory) set.add(B.U.sub(p.category, p.subcategory)); } });
    B.cats.forEach((c) => set.add("/blog/category/" + c.slug));
    B.posts.filter((p) => p.status === "published").forEach((p) => set.add((p.lang === "ur" ? "/ur/blog/" : "/blog/") + p.slug));
    return set;
  }
  function productCard(id) {
    const p = B.products.find((x) => x.id === id); if (!p) return null;
    const img = S.productImages(p)[0];
    return `<aside class="blog-product"><span class="blog-product-img">${img ? `<img src="${esc(img.thumb || img.url)}" alt="">` : ""}</span><div class="blog-product-info"><span class="blog-product-kicker">Lab test at Fort Abbas Poly Clinic</span><span class="blog-product-name">${esc(p.name)}</span><span class="blog-product-price">${"Book this test"}</span></div></aside>`;
  }
  function preview() {
    const ok = validPaths();
    const r = MD.render(F.body_md.value, { linkCheck: (u) => /^https?:/i.test(u) || ok.has(u.split(/[?#]/)[0]), product: productCard });
    $("#pvTitle").textContent = F.title.value; $("#pvDek").textContent = F.excerpt.value;
    $("#pvAnswer").hidden = !F.answer_summary.value.trim(); $("#pvAnswer div").innerHTML = MD.render(F.answer_summary.value).html;
    $("#pvBody").innerHTML = r.html + (r.dropped.length ? `<p class="ba-callout bad small">Left out on the live page: ${r.dropped.map(esc).join(", ")}</p>` : "");
    const faq = readFaq(); $("#pvFaq").innerHTML = faq.length ? `<h2>Frequently asked questions</h2>${faq.map((f) => `<details><summary>${esc(f.q)}</summary><div>${MD.render(f.a).html}</div></details>`).join("")}` : "";
    const pvAr = MD.ratioCss(F.cv_ratio.value), pvOp = MD.posCss(F.cv_pos.value);
    $("#pvCover").innerHTML = S.safeUrl(F.cv_url.value) ? `<figure class="blog-cover${pvAr ? " has-ratio" : ""}"${pvAr ? ` style="--ar:${pvAr}"` : ""}><img class="blog-cover-img" src="${esc(F.cv_url.value)}" alt="${esc(F.cv_alt.value)}"${pvOp ? ` style="object-position:${pvOp}"` : ""}>${F.cv_credit.value ? `<figcaption>${esc(F.cv_credit.value)}${F.cv_license.value ? " · " + esc(F.cv_license.value) : ""}</figcaption>` : ""}</figure>` : "";
  }
  function counters() {
    const t = F.seo_title.value || F.title.value, d = F.meta_description.value;
    $("#cntSeo").textContent = `${(F.seo_title.value || "").length}/60`; $("#cntMeta").textContent = `${d.length}/158`;
    $("#serp").innerHTML = `<span class="ba-serp-url">fortabbaspolyclinic.com › blog › ${esc(F.slug.value || "…")}</span><span class="ba-serp-title">${esc(t.length > 60 ? t.slice(0, 58) + "…" : t)}</span><span class="ba-serp-desc">${esc(d || F.excerpt.value || "Add a meta description.")}</span>`;
  }
  ["seo_title", "meta_description", "slug", "title", "excerpt"].forEach((n) => F[n].addEventListener("input", counters));
  function words() { const n = MD.plain(F.body_md.value).split(/\s+/).filter(Boolean).length; $("#edWords").textContent = `${n} words · ${Math.max(1, Math.round(n / 220))} min read`; }
  F.body_md.addEventListener("input", S.debounce(words, 200));
  F.title.addEventListener("input", () => { if (!B.edit.id && !B.edit._slugTouched) F.slug.value = MD.slug(F.title.value).replace(/[^a-z0-9-]/g, "").slice(0, 70).replace(/-+$/, ""); });
  F.slug.addEventListener("input", () => (B.edit._slugTouched = true));

  // formatting toolbar
  function wrapSel(before, after, placeholder) {
    const ta = F.body_md, s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e) || placeholder || "";
    ta.setRangeText(before + sel + (after || ""), s, e, "end"); ta.focus(); words();
  }
  function linePrefix(prefix) {
    const ta = F.body_md, s = ta.value.lastIndexOf("\n", ta.selectionStart - 1) + 1;
    ta.setRangeText(prefix, s, s, "end"); ta.focus();
  }
  $("#mdTools").addEventListener("click", (e) => {
    const b = e.target.closest("[data-md]"); if (!b) return;
    const k = b.dataset.md;
    if (k === "h2") linePrefix("## "); else if (k === "h3") linePrefix("### "); else if (k === "b") wrapSel("**", "**", "bold text"); else if (k === "i") wrapSel("*", "*", "italic text");
    else if (k === "ul") linePrefix("- "); else if (k === "ol") linePrefix("1. "); else if (k === "quote") linePrefix("> ");
    else if (k === "link") { const u = prompt("Link address (a page on this site like /tests.html, or https://… for a source)"); if (u) { if (!MD.cleanHref(u)) return toast("That isn't a valid link.", "error"); wrapSel("[", `](${u.trim()})`, "link text"); } }
    else if (k === "table") wrapSel("\n| Option | Good for | Watch out for |\n|---|---|---|\n| | | |\n| | | |\n", "", "");
    else if (k === "product") openProducts();
    else if (k === "image") insertPicture();
  });
  // a picture inside the article: chosen and framed in the picture pop-up, added on its own line
  async function insertPicture() {
    const ta = F.body_md, at = ta.selectionStart;
    const v = await window.BlogMedia.pick({ kind: "body" }); if (!v) return;
    const opts = [v.ratio, v.pos].filter(Boolean).join(" ");
    const line = `![${v.alt.replace(/[\[\]\n]/g, " ")}](${v.url}${v.caption ? ` "${v.caption.replace(/["\n]/g, "'")}"` : ""})${opts ? `{${opts}}` : ""}`;
    const before = ta.value.slice(0, at), after = ta.value.slice(at);
    const pre = !before || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const post = after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
    ta.setRangeText(pre + line + post, at, at, "end"); ta.focus(); words();
    toast("Picture added — see it in Preview.", "ok");
  }
  // the cover picture at the top of the Write tab: change it, re-frame it, remove it
  function paintCover() {
    const u = F.cv_url.value.trim(), ok = S.safeUrl(u);
    const ar = MD.ratioCss(F.cv_ratio.value) || "21/9", op = MD.posCss(F.cv_pos.value) || "50% 50%";
    const shape = (window.BlogMedia.RATIOS.find((r) => r[0] === (F.cv_ratio.value || "21:9")) || [0, "Wide 21:9"])[1];
    $("#edCover").innerHTML = ok
      ? `<div class="ba-cover-img" style="aspect-ratio:${ar === "auto" ? "16/9" : ar}"><img src="${esc(u)}" alt="${esc(F.cv_alt.value)}" style="object-position:${op};object-fit:${ar === "auto" ? "contain" : "cover"}"></div>
         <div class="ba-cover-bar"><span class="ba-cover-l"><b>Cover picture</b><span class="muted small">${esc(shape)} · ${esc(F.cv_alt.value || "no description yet")}</span></span><span class="ba-cover-acts"><button type="button" class="btn btn-soft btn-sm" data-cv="reframe">Shape &amp; framing</button><button type="button" class="btn btn-soft btn-sm" data-cv="change">Change picture</button><button type="button" class="btn btn-soft btn-sm ba-danger-text" data-cv="remove">Remove</button></span></div>`
      : `<button type="button" class="ba-cover-add" data-cv="change"><span aria-hidden="true">🖼</span><b>Add a cover picture</b><span class="muted small">From clinic photos, the gallery, your device or a web address — then pick its shape.</span></button>`;
  }
  $("#edCover").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-cv]"); if (!b) return;
    if (b.dataset.cv === "remove") { ["cv_url", "cv_alt", "cv_credit", "cv_license", "cv_license_url", "cv_source_url", "cv_ratio", "cv_pos"].forEach((k) => (F[k].value = "")); return paintCover(); }
    const cur = { url: F.cv_url.value.trim(), alt: F.cv_alt.value, ratio: F.cv_ratio.value || "21:9", pos: F.cv_pos.value };
    const v = await window.BlogMedia.pick({ kind: "cover", current: cur, reframe: b.dataset.cv === "reframe" }); if (!v) return;
    if (v.url !== cur.url) { F.cv_credit.value = ""; F.cv_license.value = ""; F.cv_license_url.value = ""; F.cv_source_url.value = ""; if (B.edit.cover_image) B.edit.cover_image.kind = "manual"; }
    F.cv_url.value = v.url; F.cv_alt.value = v.alt; F.cv_ratio.value = v.ratio === "21:9" ? "" : v.ratio; F.cv_pos.value = v.pos;
    paintCover();
  });
  ["cv_url", "cv_alt"].forEach((n) => F[n].addEventListener("input", S.debounce(paintCover, 250)));
  function openProducts() {
    $("#prodList").innerHTML = B.products.length ? B.products.map((p) => { const img = S.productImages(p)[0]; return `<button type="button" class="ba-row" data-pick="${esc(p.id)}"><span class="ba-thumb">${img ? `<img src="${esc(img.thumb || img.url)}" alt="">` : ""}</span><span class="ba-row-main"><b>${esc(p.name)}${p.variant_name ? " — " + esc(p.variant_name) : ""}</b><span class="muted small">${esc(p.category || "")}${p.subcategory ? " › " + esc(p.subcategory) : ""}</span></span></button>`; }).join("") : '<p class="empty">No live products.</p>';
    $("#prodDlg").showModal();
  }
  $("#prodDlg").addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) return $("#prodDlg").close();
    const b = e.target.closest("[data-pick]"); if (!b) return;
    const ta = F.body_md, at = ta.value.indexOf("\n\n", ta.selectionStart); const pos = at < 0 ? ta.value.length : at;
    ta.setRangeText(`\n\n[[product:${b.dataset.pick}]]\n`, pos, pos, "end"); $("#prodDlg").close(); ta.focus(); toast("Product card added after this paragraph.", "ok");
  });

  function collect() {
    const ok = F.slug.value.trim();
    if (!F.title.value.trim() || F.title.value.trim().length < 5) throw new Error("Give the article a title (5+ characters).");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(ok)) throw new Error("The address may only use lowercase letters, numbers and single dashes (SEO & details).");
    const cover = S.safeUrl(F.cv_url.value) ? { url: F.cv_url.value.trim(), alt: F.cv_alt.value.trim(), credit: F.cv_credit.value.trim(), license: F.cv_license.value.trim(), license_url: S.safeUrl(F.cv_license_url.value) ? F.cv_license_url.value.trim() : "", source_url: S.safeUrl(F.cv_source_url.value) ? F.cv_source_url.value.trim() : "", kind: (B.edit.cover_image || {}).kind || "manual", ratio: F.cv_ratio.value || undefined, pos: F.cv_pos.value || undefined } : {};
    if (cover.url && !cover.alt) throw new Error("Describe the cover photo in the alt text (SEO & details).");
    const body = F.body_md.value;
    const ids = [...new Set([...body.matchAll(/^\[\[product:([A-Za-z0-9_.:-]{1,80})\]\]$/gm)].map((m) => m[1]))].filter((id) => B.products.some((p) => p.id === id));
    const extra = (B.edit.product_ids || []).filter((id) => !ids.includes(id) && B.products.some((p) => p.id === id));
    const patch = {
      title: F.title.value.trim(), slug: ok, excerpt: F.excerpt.value.trim(), answer_summary: F.answer_summary.value.trim(), body_md: body,
      seo_title: F.seo_title.value.trim(), meta_description: F.meta_description.value.trim(), focus_query: F.focus_query.value.trim(),
      tags: F.tags.value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10), category_id: F.category_id.value || null,
      pillar_id: F.pillar_id.value || null, is_pillar: F.is_pillar.checked, featured: F.featured.checked, noindex: F.noindex.checked,
      faq: readFaq(), sources: readSources(), cover_image: cover, product_ids: [...ids, ...extra].slice(0, 6)
    };
    if (B.edit._applyProp) { const qy = { ...(B.edit.quality || {}) }; delete qy.proposed; patch.quality = qy; }
    return patch;
  }
  async function save(extra) {
    let patch;
    try { patch = Object.assign(collect(), extra || {}); } catch (e) { toast(e.message, "error"); return false; }
    let res;
    if (B.edit.id) res = await client.from("blog_posts").update(patch).eq("id", B.edit.id).select("*").single();
    else res = await client.from("blog_posts").insert(Object.assign({ lang: "en", status: "draft", author_name: B.s.author_name }, patch)).select("*").single();
    if (res.error) { fail(/duplicate key/.test(res.error.message) ? new Error("Another article already uses that address. Change it in SEO & details.") : res.error); return false; }
    B.edit = res.data; await loadPosts();
    if (!location.hash.includes(res.data.id)) history.replaceState(null, "", "#articles/" + res.data.id);
    openEditor(res.data.id);
    return true;
  }
  dlg.querySelector(".ba-ed-foot").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act, p = B.edit;
    const approve = () => (p.needs_review ? { needs_review: false, reviewed_by: B.me.email || "admin", reviewed_at: new Date().toISOString() } : p.reviewed_at ? {} : { reviewed_by: B.me.email || "admin", reviewed_at: new Date().toISOString() });
    if (["publish", "schedule"].includes(act) && scriptCheck().length) { $("#edScript").scrollIntoView({ behavior: "smooth", block: "center" }); return toast("Fix the words in the wrong alphabet first (listed at the top) — readers would see broken letters.", "error"); }
    if (act === "save") { if (await save()) toast("Saved.", "ok"); }
    else if (act === "publish") {
      if (p.needs_review && !(await confirmBox("Approve and publish?", "You've read the flagged items above and are happy for this to go live.", "Approve & publish"))) return;
      if (p.status === "published") { if (await save(approve())) toast("Live article updated — the page refreshes within a minute.", "ok"); return; }
      if (!(await save(approve()))) return;
      const { error } = await client.rpc("blog_publish_post", { p_post: B.edit.id }); if (error) return fail(error);
      await loadPosts(); openEditor(B.edit.id);
      toast(p.status === "scheduled" ? "Published early — the planner gives its slot to the next topic." : "Published — it appears on the blog and in the sitemap within a minute.", "ok");
    } else if (act === "schedule") {
      const v = $("#edWhen").value; if (!v) return toast("Pick a date and time first.", "error");
      const at = new Date(v); if (at < new Date()) return toast("Pick a time in the future (or use Publish now).", "error");
      if (p.needs_review && !(await confirmBox("Approve and schedule?", "You've read the flagged items and are happy for this to go live at the chosen time.", "Approve & schedule"))) return;
      if (await save(Object.assign(approve(), { status: "scheduled", scheduled_at: at.toISOString() }))) toast(`Scheduled for ${when(at)}.`, "ok");
    } else if (act === "unpublish") {
      if (!(await confirmBox("Unpublish this article?", "It disappears from the blog and the sitemap within a minute. You can publish it again later.", "Unpublish", true))) return;
      if (await save({ status: "unpublished" })) toast("Unpublished.", "ok");
    } else if (act === "delete") {
      if (!(await confirmBox("Delete this article?", "This can't be undone. Consider Unpublish instead if it was ever live — its address would otherwise start returning 'not found'.", "Delete", true))) return;
      const { error } = await client.from("blog_posts").delete().eq("id", p.id); if (error) return fail(error);
      closeEditor(); await loadPosts(); toast("Deleted.", "ok");
    } else if (act === "recheck") { if (await save()) run("reviewer", { post_id: p.id, only: true }); }
    else if (act === "improve") {
      const reason = prompt("What should be improved? (e.g. 'add a section on bulbs for UPS power cuts', 'make the title clearer')", "Make it more useful and up to date.");
      if (reason === null) return; if (await save()) run("refresher", { post_id: p.id, reason: reason.slice(0, 500) });
    } else if (act === "translate") { if (await save()) run("translator", { post_id: p.id }); }
  });
  $("#findPhoto").addEventListener("click", async () => { if (await save()) run("imager", { post_id: B.edit.id, replace: true, only: true }); });

  async function loadVersions() {
    if (!B.edit.id) { $("#edVersions").innerHTML = '<p class="empty">Save the article first.</p>'; return; }
    const { data, error } = await client.from("blog_post_versions").select("id,snapshot,saved_by,created_at").eq("post_id", B.edit.id).order("created_at", { ascending: false }).limit(25);
    if (error) return fail(error);
    $("#edVersions").innerHTML = (data || []).length ? data.map((v) => `<div class="ba-row"><span class="ba-row-main"><b>${esc(v.snapshot.title)}</b><span class="muted small">${esc(when(v.created_at))} · before an edit by ${esc(v.saved_by || "?")} · ${MD.plain(v.snapshot.body_md).split(/\s+/).length} words</span></span><button type="button" class="btn btn-soft btn-sm" data-restore="${v.id}">Load into editor</button></div>`).join("") : '<p class="empty">No earlier versions yet. Each time the words change, the previous version is kept here.</p>';
    $("#edVersions").onclick = (e) => {
      const b = e.target.closest("[data-restore]"); if (!b) return;
      const v = data.find((x) => String(x.id) === b.dataset.restore).snapshot;
      F.title.value = v.title; F.excerpt.value = v.excerpt || ""; F.answer_summary.value = v.answer_summary || ""; F.body_md.value = v.body_md; F.seo_title.value = v.seo_title || ""; F.meta_description.value = v.meta_description || "";
      renderFaq(v.faq || []); if (v.sources) renderSources(v.sources);
      setView("edit"); toast("Earlier version loaded — press Save to keep it.", "ok");
    };
  }

  /* =============================== topics =============================== */
  function renderTopics() {
    $$("#topicFilter button").forEach((b) => b.classList.toggle("on", b.dataset.f === B.topF));
    const want = { open: ["idea", "approved", "queued"], writing: ["writing"], done: ["done"], rejected: ["rejected", "duplicate"] }[B.topF];
    const list = B.topics.filter((t) => want.includes(t.status)).sort((a, b) => (b.status === "approved") - (a.status === "approved") || b.score - a.score);
    const cat = (slug) => (B.cats.find((c) => c.slug === slug) || {}).name || "Any category";
    $("#topicList").innerHTML = list.length ? list.map((t) => `<div class="ba-row">
      <span class="ba-score" title="Priority score">${t.score}</span>
      <span class="ba-row-main"><b>${esc(t.title_idea || t.query)}</b><span class="muted small">“${esc(t.query)}” · ${esc(cat(t.category_slug))}${t.cluster ? " · " + esc(t.cluster) : ""}${t.is_pillar ? " · <b>pillar</b>" : ""} · from ${esc(t.source)}${t.notes ? " — " + esc(t.notes) : ""}</span></span>
      <span class="ba-row-side">${t.status === "approved" ? '<span class="badge badge-ok">Approved</span>' : t.status === "queued" ? '<span class="badge badge-blue">Queued</span>' : t.status === "writing" ? '<span class="badge badge-blue">Being written</span>' : ""}
        ${t.post_id ? `<button type="button" class="btn btn-soft btn-sm" data-topen="${esc(t.post_id)}">Open article</button>` : ""}
        ${["idea", "approved"].includes(t.status) ? `<span class="ai-chip">≈${callsAhead("researcher")} AI</span><button type="button" class="btn btn-dark btn-sm" data-twrite="${t.id}">Write now</button>` : ""}
        ${t.status === "idea" ? `<button type="button" class="btn btn-soft btn-sm" data-tset="approved" data-id="${t.id}">Approve</button>` : ""}
        ${["idea", "approved"].includes(t.status) ? `<button type="button" class="btn btn-soft btn-sm" data-tset="rejected" data-id="${t.id}">Reject</button>` : ""}
        ${["rejected", "duplicate"].includes(t.status) ? `<button type="button" class="btn btn-soft btn-sm" data-tset="idea" data-id="${t.id}">Restore</button>` : ""}</span></div>`).join("")
      : `<p class="empty">${B.topF === "open" ? "No topics waiting. Press “Find more topics” — the Topic Scout looks up what people search for." : "Nothing here."}</p>`;
  }
  $("#topicFilter").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (b) { B.topF = b.dataset.f; renderTopics(); } });
  $("#topicList").addEventListener("click", async (e) => {
    const set = e.target.closest("[data-tset]"), w = e.target.closest("[data-twrite]"), o = e.target.closest("[data-topen]");
    if (o) { location.hash = "articles/" + o.dataset.topen; return; }
    if (set) { const { error } = await client.from("blog_topics").update({ status: set.dataset.tset }).eq("id", set.dataset.id); if (error) return fail(error); await loadTopics(); }
    if (w) { if (!B.sec.ai_key_set) { toast("Add an AI key in Settings first.", "error"); return; } if (await run("researcher", { topic_id: w.dataset.twrite }, false, "Write this topic now")) loadTopics(); }
  });
  async function addTopic(writeNow) {
    const f = $("#topicForm");
    if (!f.query.value.trim()) { f.query.focus(); return; }
    const urls = lines(f.reference_urls.value).filter((u) => /^https:\/\//.test(u));
    const { data, error } = await client.from("blog_topics").insert({ query: f.query.value.trim(), title_idea: f.title_idea.value.trim(), category_slug: f.category_slug.value || null, is_pillar: f.is_pillar.checked, reference_urls: urls, status: "approved", score: 80, source: "manual" }).select("id").single();
    if (error) return fail(error);
    f.reset(); await loadTopics();
    if (writeNow) { if (!B.sec.ai_key_set) return toast("Topic saved. Add an AI key in Settings to start writing.", "error"); await run("researcher", { topic_id: data.id }, false, "Add & write now"); }
    else toast("Topic added and approved — the planner will pick it for the next free slot.", "ok");
  }
  $("#topicForm").addEventListener("submit", (e) => { e.preventDefault(); addTopic(false); });
  $("#topicWriteNow").addEventListener("click", () => addTopic(true));

  /* =============================== pipeline =============================== */
  function jobTarget(j) {
    const p = j.post_id && B.posts.find((x) => x.id === j.post_id);
    if (p) return `<a href="#articles/${esc(p.id)}">${esc(p.title)}</a>`;
    const t = j.topic_id && B.topics.find((x) => x.id === j.topic_id);
    return t ? esc(t.title_idea || t.query) : "";
  }
  function jobResult(j) {
    const r = j.result || {};
    if (j.agent === "ping" && j.status === "done") return `Model replied: “${esc(r.says)}”. ${(r.models || []).length} model(s) available.`;
    if (j.agent === "scout") return r.added != null ? `${r.added} new topic(s) from ${r.found || 0} search questions` : "";
    if (j.agent === "planner") return r.started ? (r.started.length ? `Started: ${r.started.map(esc).join("; ")}` : "Schedule full — nothing to start") : r.skipped ? esc(r.skipped) : "";
    if (j.agent === "reviewer" && r.score != null) return `Score ${r.score}/100${r.needs_review ? " · needs a person" : ""}`;
    if (j.agent === "publisher" && r.status) return `${esc(STATUS[r.status] ? STATUS[r.status][0] : r.status)} — ${esc(r.why || "")}`;
    if (j.agent === "linker" && r.links) return `${r.links.length} link(s), ${(r.products || []).length} test card(s)`;
    if (j.agent === "monitor" && r.recommendations != null) return `${r.recommendations} recommendation(s), ${r.topics_added || 0} topic idea(s)${r.gsc ? "" : " · Search Console not connected"}`;
    return "";
  }
  // the steps one article goes through — shown as a small track on each job
  const PIPE = ["researcher", "writer", "linker", "imager", "reviewer", "publisher", "translator"];
  function jobTrack(j) {
    const i = PIPE.indexOf(j.agent); if (i < 0) return "";
    const steps = PIPE.filter((a) => a !== "translator" || B.s && B.s.urdu_enabled || j.agent === "translator");
    const k = steps.indexOf(j.agent);
    return `<span class="ba-track" aria-label="Step ${k + 1} of ${steps.length}">${steps.map((a, x) => `<span class="ba-tk ${x < k ? "past" : x === k ? "now st-" + j.status : "next"}" title="${esc(AGENTS[a][0])}"><i></i><em>${esc(AGENTS[a][0].split(" ")[0])}</em></span>`).join("")}</span>`;
  }
  function renderJobs() {
    $$("#jobFilter button").forEach((b) => b.classList.toggle("on", b.dataset.f === B.jobF));
    const f = B.jobF;
    const list = B.jobs.filter((j) => (!B.jobAgent || j.agent === B.jobAgent) && (f === "all" || (f === "active" ? ["queued", "running"].includes(j.status) : j.status === f))).slice(0, 120);
    const chip = $("#jobAgentChip"); chip.hidden = !B.jobAgent;
    if (B.jobAgent) chip.innerHTML = `Showing only <b>${esc(AGENTS[B.jobAgent][0])}</b> <button type="button" class="btn btn-ghost btn-sm" data-allagents>Show all steps</button>`;
    const waiting = B.jobs.filter((j) => j.status === "queued").length;
    $("#wakeAgents").disabled = !waiting; $("#wakeAgents").textContent = waiting ? `Start now (${waiting})` : "Nothing waiting";
    $("#jobList").innerHTML = list.length ? list.map((j) => `<div class="ba-row ba-job st-${j.status} ${j.status}">
      <span class="ba-step-ic" aria-hidden="true">${SICON[j.status] || ""}</span>
      <span class="ba-row-main"><span class="ba-job-head"><b>${esc((AGENTS[j.agent] || [j.agent])[0])}</b> <span class="ba-job-state">${esc(SLABEL[j.status] || j.status)}</span></span>
        <span class="muted small">${j.attempts}/${j.max_attempts} tries · ${esc(j.status === "queued" && new Date(j.run_after) > new Date() ? "next try " + when(j.run_after) : ago(j.finished_at || j.started_at || j.created_at))}${j.created_by && j.created_by !== "system" ? " · started by " + esc(j.created_by) : ""}</span>
        ${jobTarget(j) ? `<span class="small ba-job-target">${jobTarget(j)}</span>` : ""}${jobTrack(j)}${jobResult(j) ? `<span class="small muted">${jobResult(j)}</span>` : ""}${j.error ? `<span class="small ba-err">${esc(j.error)}</span>` : ""}</span>
      <span class="ba-row-side">${["failed", "cancelled"].includes(j.status) ? `<button type="button" class="btn btn-soft btn-sm" data-jact="retry" data-id="${j.id}">Retry</button>` : ""}${["queued", "running"].includes(j.status) ? `<button type="button" class="btn btn-soft btn-sm" data-jact="cancel" data-id="${j.id}">Cancel</button>` : ""}</span>
      ${j.status === "running" ? '<span class="ba-step-bar" aria-hidden="true"></span>' : ""}</div>`).join("")
      : `<p class="empty">${f === "active" ? "Nothing running or waiting right now. Work appears here when your schedule or a button starts it." : "Nothing here."}</p>`;
  }
  $("#jobAgentChip").addEventListener("click", (e) => { if (e.target.closest("[data-allagents]")) { B.jobAgent = ""; renderFlow(); renderJobs(); } });
  $("#jobFilter").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (b) { B.jobF = b.dataset.f; renderJobs(); } });
  $("#jobList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-jact]"); if (!b) return;
    const { error } = await client.rpc("blog_job_action", { p_job: b.dataset.id, p_action: b.dataset.jact }); if (error) return fail(error);
    toast(b.dataset.jact === "retry" ? "Queued again — it starts within 2 minutes (or press Start now)." : "Cancelled. The steps after it won't run.", "ok"); loadJobs();
  });
  const logHtml = (list) => list.length ? list.map((l) => `<div class="ba-log-row ${l.level}"><span class="muted small">${esc(when(l.created_at))}</span><b class="small">${esc((AGENTS[l.agent] || [l.agent])[0])}</b><span>${esc(l.message)}</span></div>`).join("") : '<p class="muted small">No activity yet.</p>';
  function renderLogs() { const lv = $("#logLevel").value; $("#logList").innerHTML = logHtml(B.logs.filter((l) => !lv || (lv === "warn" ? l.level !== "info" : l.level === lv)).slice(0, 150)); $("#ovLog").innerHTML = logHtml(B.logs.slice(0, 6)); }
  $("#logLevel").addEventListener("change", renderLogs);

  /* =============================== performance =============================== */
  async function loadPerformance() {
    try {
      const [rows, recos] = await Promise.all([q(client.rpc("blog_performance", { p_days: 28 })), q(client.from("blog_recommendations").select("*").in("status", ["open", "queued"]).order("created_at", { ascending: false }).limit(100))]);
      const sum = (k) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
      $("#perfTiles").innerHTML = [["Reads", sum("reads")], ["Test clicks", sum("product_clicks")], ["From AI assistants", sum("ai_referrals")], ["Google clicks", B.sec.gsc_set ? sum("gsc_clicks") : "—"], ["Google impressions", B.sec.gsc_set ? sum("gsc_impressions") : "—"]]
        .map(([l, v]) => `<div class="tile"><span>${esc(l)} (28 days)</span><b>${esc(v)}</b></div>`).join("");
      $("#perfTable").innerHTML = rows.length ? `<thead><tr><th>Article</th><th>Reads</th><th>Test clicks</th><th>AI visits</th><th>Google clicks</th><th>Impressions</th><th>Avg. position</th></tr></thead><tbody>${rows.map((r) => `<tr><td><a href="#articles/${esc(r.post_id)}">${esc(r.title)}</a> ${r.status === "unpublished" ? '<span class="badge badge-dark">Unpublished</span>' : ""}<div class="muted small">${esc(when(r.published_at))}</div></td><td>${r.reads}</td><td>${r.product_clicks}</td><td>${r.ai_referrals}</td><td>${B.sec.gsc_set ? r.gsc_clicks : "—"}</td><td>${B.sec.gsc_set ? r.gsc_impressions : "—"}</td><td>${r.gsc_position != null ? r.gsc_position : "—"}</td></tr>`).join("")}</tbody>` : '<tbody><tr><td class="muted">No published articles yet.</td></tr></tbody>';
      const title = (id) => (B.posts.find((p) => p.id === id) || {}).title || "";
      $("#recoList").innerHTML = recos.length ? recos.map((r) => `<div class="ba-row"><span class="ba-row-main"><b>${esc(title(r.post_id) || "New topic idea")}</b><span class="small">${esc(r.message)}</span></span><span class="ba-row-side">${r.status === "queued" ? '<span class="badge badge-blue">Being improved</span>' : r.post_id ? `<button type="button" class="btn btn-dark btn-sm" data-rimp="${r.id}">Improve with AI</button>` : ""}<button type="button" class="btn btn-soft btn-sm" data-rdis="${r.id}">Dismiss</button></span></div>`).join("") : '<p class="muted small">No recommendations right now. The Performance Monitor checks every Monday.</p>';
      $("#recoList").onclick = async (e) => {
        const imp = e.target.closest("[data-rimp]"), dis = e.target.closest("[data-rdis]");
        if (dis) { await client.from("blog_recommendations").update({ status: "dismissed" }).eq("id", dis.dataset.rdis); loadPerformance(); loadOverview(); }
        if (imp) { const r = recos.find((x) => x.id === imp.dataset.rimp); if (await run("refresher", { post_id: r.post_id, reason: r.message, reco_id: r.id })) { await client.from("blog_recommendations").update({ status: "queued" }).eq("id", r.id); loadPerformance(); } }
      };
    } catch (e) { fail(e); }
  }

  /* =============================== settings =============================== */
  const SF = $("#setForm");
  // AI services: where to get a key, a sensible starting model, and a few model names to pick from.
  // "Test & list models" replaces the suggestions with the live list from the provider.
  const PROV = {
    gemini: { name: "Google Gemini", key: "https://aistudio.google.com/apikey", free: true, model: "gemini-flash-lite-latest", models: ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-2.5-flash", "gemini-2.5-pro"] },
    anthropic: { name: "Anthropic Claude", key: "https://console.anthropic.com/settings/keys", model: "claude-haiku-5-5", models: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"] },
    openai: { name: "OpenAI", key: "https://platform.openai.com/api-keys", model: "gpt-4.1-mini", models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"] },
    xai: { name: "xAI Grok", key: "https://console.x.ai", model: "grok-3-mini", models: ["grok-3-mini", "grok-3", "grok-4"] },
    deepseek: { name: "DeepSeek", key: "https://platform.deepseek.com/api_keys", model: "deepseek-chat", models: ["deepseek-chat", "deepseek-reasoner"] },
    mistral: { name: "Mistral AI", key: "https://console.mistral.ai/api-keys", free: true, model: "mistral-small-latest", models: ["mistral-small-latest", "mistral-medium-latest", "mistral-large-latest"] },
    cohere: { name: "Cohere", key: "https://dashboard.cohere.com/api-keys", model: "command-a-03-2025", models: ["command-a-03-2025", "command-r-plus", "command-r"] },
    perplexity: { name: "Perplexity", key: "https://www.perplexity.ai/settings/api", model: "sonar", models: ["sonar", "sonar-pro"], note: "Perplexity doesn't publish a model list, so \"Test\" only checks the key." },
    moonshot: { name: "Moonshot Kimi", key: "https://platform.moonshot.ai/console/api-keys", model: "kimi-latest", models: ["kimi-latest", "moonshot-v1-32k"] },
    qwen: { name: "Alibaba Qwen", key: "https://modelstudio.console.alibabacloud.com/", model: "qwen-plus", models: ["qwen-plus", "qwen-turbo", "qwen-max"] },
    zai: { name: "Z.ai GLM", key: "https://z.ai/manage-apikey/apikey-list", free: true, model: "glm-4.5-flash", models: ["glm-4.5-flash", "glm-4.5-air", "glm-4.5"] },
    groq: { name: "Groq", key: "https://console.groq.com/keys", free: true, model: "llama-3.3-70b-versatile", models: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "qwen/qwen3-32b"] },
    cerebras: { name: "Cerebras", key: "https://cloud.cerebras.ai", free: true, model: "llama-3.3-70b", models: ["llama-3.3-70b", "gpt-oss-120b", "qwen-3-32b"] },
    together: { name: "Together AI", key: "https://api.together.ai/settings/api-keys", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo", models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct-Turbo"] },
    fireworks: { name: "Fireworks AI", key: "https://fireworks.ai/account/api-keys", model: "accounts/fireworks/models/llama-v3p3-70b-instruct", models: ["accounts/fireworks/models/llama-v3p3-70b-instruct", "accounts/fireworks/models/deepseek-v3"] },
    nvidia: { name: "NVIDIA NIM", key: "https://build.nvidia.com", free: true, model: "meta/llama-3.3-70b-instruct", models: ["meta/llama-3.3-70b-instruct", "deepseek-ai/deepseek-r1"] },
    huggingface: { name: "Hugging Face", key: "https://huggingface.co/settings/tokens", free: true, model: "meta-llama/Llama-3.3-70B-Instruct", models: ["meta-llama/Llama-3.3-70B-Instruct", "Qwen/Qwen2.5-72B-Instruct", "deepseek-ai/DeepSeek-V3"] },
    openrouter: { name: "OpenRouter", key: "https://openrouter.ai/keys", free: true, model: "meta-llama/llama-3.3-70b-instruct:free", models: ["meta-llama/llama-3.3-70b-instruct:free", "deepseek/deepseek-chat", "anthropic/claude-haiku-5-5", "openai/gpt-4.1-mini", "x-ai/grok-3-mini"] },
    github: { name: "GitHub Models", key: "https://github.com/settings/personal-access-tokens", free: true, model: "openai/gpt-4.1-mini", models: ["openai/gpt-4.1-mini", "openai/gpt-4.1", "meta/Llama-3.3-70B-Instruct", "deepseek/DeepSeek-V3-0324"], note: "Use a GitHub token with the \"Models\" permission." },
    openai_compat: { name: "your OpenAI-compatible API", key: "", model: "", models: [] }
  };
  const provOf = (v) => PROV[v] || PROV.openai_compat;
  function paintProvider(v) {
    const p = provOf(v);
    $("#baseUrlWrap").hidden = v !== "openai_compat";
    $("#modelList").innerHTML = p.models.map((m) => `<option value="${esc(m)}">`).join("");
    $("#keyFor").textContent = p.name;
    $("#provInfo").innerHTML = (p.key ? `Get a key: <a href="${esc(p.key)}" target="_blank" rel="noopener">${esc(p.key.replace(/^https:\/\//, "").replace(/\/.*$/, ""))} ↗</a>` : "Enter the service's API address (it must end where /chat/completions starts, e.g. https://api.example.com/v1).")
      + (p.free ? " · has a free tier" : p.key ? " · paid (set the prices below to track spending)" : "") + (p.note ? ` · ${esc(p.note)}` : "");
    paintKey();
  }
  function paintKey() {
    const keys = (B.sec && B.sec.ai_keys) || {}, v = SF.provider.value, hint = keys[v];
    $("#keyHint").textContent = hint ? `(saved ${hint === "saved" ? "" : hint})` : "(not set yet)";
    $("#removeKey").hidden = !hint;
    const names = Object.keys(keys).map((k) => provOf(k).name);
    $("#keysSaved").textContent = names.length ? `Keys saved for: ${names.join(", ")}.` : "";
  }
  /* ---------- Fonts: four roles per language, with a live sample ---------- */
  const BF = window.BlogFonts; let FT = {}, FLANG = "ur";
  const WNAME = { 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold" };
  const SAMPLE = {
    ur: { h: "اپنے کمرے کے لیے صحیح لیمپ کیسے چنیں", sub: "روشنی کی گرمائش", p: "شام کے وقت گرم روشنی کمرے کو پُرسکون بناتی ہے۔ دھات کا شیڈ روشنی کو نیچے کی طرف رکھتا ہے، جبکہ کپڑے کا شیڈ اسے پورے کمرے میں پھیلاتا ہے۔", o: "فوری جواب: میز جتنا اونچا لیمپ عموماً سب سے اچھا لگتا ہے۔" },
    en: { h: "What your blood test report is telling you", sub: "Reading the numbers", p: "In the evening, warm light makes a room feel calm. A metal shade points the light down, while a linen shade spreads it across the room.", o: "Quick answer: your doctor reads results together with your history." },
  };
  function cleanFonts() {
    const out = {};
    ["ur", "en"].forEach((l) => { const t = FT[l]; if (!t) return; const o = {}; BF.ROLES.forEach(([r]) => { if (t[r]) o[r] = String(t[r]).slice(0, 40); }); if (t.size) o.size = +t.size; if (t.leading) o.leading = +t.leading; out[l] = o; });
    return out;
  }
  function loadFontCss(set) { const href = BF.googleHref([set]); if (!href || document.querySelector(`link[data-bf="${CSS.escape(href)}"]`)) return; const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.dataset.bf = href; document.head.appendChild(l); }
  function paintFonts() {
    if (!BF || !$("#fontCtrls")) return;
    const lang = FLANG, set = BF.pick(FT, lang), t = FT[lang] || {};
    $$("#fontLang [data-flang]").forEach((b) => b.classList.toggle("on", b.dataset.flang === lang));
    const fonts = Object.entries(BF.FONTS).filter(([, f]) => f[4] === lang);
    const groups = [...new Set(fonts.map(([, f]) => f[5] || ""))];
    const optHtml = (r) => groups.map((g) => { const inner = fonts.filter(([, f]) => (f[5] || "") === g).flatMap(([id, f]) => f[2].map((w) => { const v = `${id}:${w}`, bad = FCHK[id] && FCHK[id].ok === false; return `<option value="${v}"${v === `${set[r].id}:${set[r].weight}` ? " selected" : ""}>${esc(f[3])}${f[2].length > 1 ? " · " + WNAME[w] : ""}${bad ? " — ✕ missing Urdu letters" : ""}</option>`; })).join(""); return g ? `<optgroup label="${esc(g)}">${inner}</optgroup>` : inner; }).join("");
    $("#fontCtrls").innerHTML = BF.ROLES.map(([r, label]) => `<label class="field"><span>${label} <span class="muted small">— ${esc(BF.ROLE_HINT[r])}</span></span><select class="input" data-frole="${r}">${optHtml(r)}</select>${lang === "ur" ? `<span class="gd-fcheck" data-fchk="${r}">Checking…</span>` : ""}</label>`).join("")
      + `<div class="form-row"><label class="field grow"><span>Text size <b id="fsVal">${set.size}%</b></span><input type="range" min="90" max="140" step="2" value="${set.size}" data-fnum="size"></label><label class="field grow"><span>Line spacing <b id="flVal">${set.leading}</b></span><input type="range" min="1.3" max="2.8" step="0.05" value="${set.leading}" data-fnum="leading"></label></div>`;
    const prev = $("#fontPrev"), sm = SAMPLE[lang];
    prev.setAttribute("lang", lang); prev.setAttribute("dir", lang === "ur" ? "rtl" : "ltr");
    prev.setAttribute("style", BF.cssVars(set));
    prev.innerHTML = `<div class="bp-head"><h1>${sm.h}</h1></div><div class="blog-body"><h2>${sm.sub}</h2><p>${sm.p}</p><ul><li>${sm.o}</li></ul></div>`;
    loadFontCss(set);
    $("#fontGallery").hidden = lang !== "ur";
    if (lang === "ur") { checkRoles(set); paintGallery(); }
  }
  // does each chosen Urdu font really show every Urdu letter? (the live blog swaps any that don't)
  const FCHK = {};
  async function checkRoles(set) {
    for (const [r] of BF.ROLES) {
      const f = set[r], el = $(`[data-fchk="${r}"]`); if (!el) continue;
      const res = FCHK[f.id] && FCHK[f.id].full ? FCHK[f.id] : Object.assign(await BF.check(f.id, f.weight), { full: true });
      FCHK[f.id] = res;
      const now = $(`[data-fchk="${r}"]`); if (!now || BF.pick(FT, "ur")[r].id !== f.id) continue;
      now.className = "gd-fcheck " + (res.ok ? "ok" : res.ok === null ? "" : "bad");
      now.textContent = res.ok ? "✓ Shows every Urdu letter" : res.ok === null ? "Couldn't load this font to test it right now (check the connection). The blog still checks it before showing the page." : `✕ Can't show ${res.missing.slice(0, 6).join(" ")} — the blog switches this to Noto Nastaliq Urdu by itself. Better pick another font.`;
    }
  }
  // every Urdu font, written in itself, with a ✓/✕ — click one to use it
  let GROLE = "body", galleryLoaded = false;
  const GSAMPLE = "لیمپ کی گرم روشنی";
  async function paintGallery() {
    const fonts = Object.entries(BF.FONTS).filter(([, f]) => f[4] === "ur");
    if (!galleryLoaded) {
      galleryLoaded = true;
      const href = `https://fonts.googleapis.com/css2?${fonts.map(([, f]) => `family=${f[1].replace(/ /g, "+")}:wght@${f[2].includes(400) ? 400 : f[2][0]}`).join("&")}&text=${encodeURIComponent(GSAMPLE + BF.URDU_TEST)}&display=swap`;
      const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.appendChild(l);
    }
    const set = BF.pick(FT, "ur");
    $$("#fontGallery [data-grole]").forEach((b) => b.classList.toggle("on", b.dataset.grole === GROLE));
    const box = $("#fontTiles");
    const paint = () => { box.innerHTML = fonts.map(([id, f]) => { const c = FCHK[id]; const st = !c || c.ok === null ? "" : c.ok ? "ok" : "bad";
      return `<button type="button" class="gd-ftile ${st}${set[GROLE].id === id ? " on" : ""}" data-gfont="${id}" title="${esc(f[3])}"><span class="gd-ftile-s" lang="ur" dir="rtl" style="font-family:${esc(f[0])},serif">${GSAMPLE}</span><span class="gd-ftile-n">${esc(f[3])}</span><span class="gd-ftile-g">${esc(f[5] || "")}${!c ? " · checking…" : c.ok === null ? " · couldn't load to test" : c.ok ? " · ✓ all Urdu letters" : " · ✕ missing " + c.missing.slice(0, 4).join(" ")}</span></button>`; }).join(""); };
    paint();
    for (const [id, f] of fonts) {
      if (FCHK[id]) continue;
      const w = f[2].includes(400) ? 400 : f[2][0];
      try { await Promise.race([document.fonts.load(`${w} 48px "${f[1]}"`, BF.URDU_TEST), new Promise((r) => setTimeout(r, 3000))]); } catch (e) { /* ignore */ }
      const miss = BF.missing(f[1], w); FCHK[id] = { ok: miss.length === [...BF.URDU_TEST].length ? null : !miss.length, missing: miss };
      paint();
    }
  }
  if ($("#fontCtrls")) {
    $("#fontGallery").addEventListener("click", (e) => {
      const r = e.target.closest("[data-grole]"); if (r) { GROLE = r.dataset.grole; paintGallery(); return; }
      const t = e.target.closest("[data-gfont]"); if (!t) return;
      const f = BF.FONTS[t.dataset.gfont], cur = BF.pick(FT, "ur")[GROLE].weight;
      const w = f[2].reduce((a, b) => (Math.abs(b - cur) < Math.abs(a - cur) ? b : a), f[2][0]);
      (FT.ur = FT.ur || {})[GROLE] = `${t.dataset.gfont}:${w}`; paintFonts(); SF.dispatchEvent(new Event("input", { bubbles: true }));
      toast(`${f[3].split(" — ")[0]} is now used for ${BF.ROLES.find(([k]) => k === GROLE)[1].toLowerCase()}. Press Save settings to keep it.`, "info");
    });
    $("#fontLang").addEventListener("click", (e) => { const b = e.target.closest("[data-flang]"); if (b) { FLANG = b.dataset.flang; paintFonts(); } });
    $("#fontCtrls").addEventListener("change", (e) => { const s2 = e.target.closest("[data-frole]"); if (s2) { (FT[FLANG] = FT[FLANG] || {})[s2.dataset.frole] = s2.value; paintFonts(); SF.dispatchEvent(new Event("input", { bubbles: true })); } });
    $("#fontCtrls").addEventListener("input", (e) => { const r = e.target.closest("[data-fnum]"); if (!r) return; (FT[FLANG] = FT[FLANG] || {})[r.dataset.fnum] = +r.value; const set = BF.pick(FT, FLANG); $("#fontPrev").setAttribute("style", BF.cssVars(set)); $(r.dataset.fnum === "size" ? "#fsVal" : "#flVal").textContent = r.dataset.fnum === "size" ? set.size + "%" : set.leading; });
    $("#fontReset").addEventListener("click", () => { delete FT[FLANG]; paintFonts(); SF.dispatchEvent(new Event("input", { bubbles: true })); toast("Default fonts back — press Save settings to keep them.", "ok"); });
  }

  function fillSettings() {
    const s = B.s; if (!s) return;
    SF.publish_hour.innerHTML = Array.from({ length: 24 }, (_, h) => `<option value="${h}">${String(h).padStart(2, "0")}:00</option>`).join("");
    ["email_from", "articles_per_week", "publish_hour", "length_pref", "promo_level", "max_product_links", "author_name", "author_bio", "writing_style", "provider", "model", "base_url", "image_source", "max_calls_per_minute", "monthly_call_limit", "monthly_token_limit", "price_in_per_m", "price_out_per_m", "monthly_cost_limit", "notify_email"]
      .forEach((k) => { if (SF[k]) SF[k].value = s[k] == null ? "" : s[k]; });
    ["agents_enabled", "manual_approval", "auto_publish", "urdu_enabled"].forEach((k) => (SF[k].checked = !!s[k]));
    if (SF.writing_style && $("#voiceCount")) $("#voiceCount").textContent = `${SF.writing_style.value.length.toLocaleString()} / 4,000`;
    SF.research_seeds.value = (s.research_seeds || []).join("\n"); SF.trusted_sources.value = (s.trusted_sources || []).join("\n");
    $("#pubDays").innerHTML = DAYS.map((d, i) => `<label class="ba-day"><input type="checkbox" value="${i}"${(s.publish_days || []).includes(i) ? " checked" : ""}><span>${d}</span></label>`).join("");
    $("#setCats").innerHTML = B.cats.filter((c) => c.active).map((c) => `<label class="ba-chk"><input type="checkbox" data-cat value="${esc(c.slug)}"${(s.enabled_categories || []).includes(c.slug) ? " checked" : ""}> ${esc(c.name)}</label>`).join("");
    $("#setPrio").innerHTML = B.cats.filter((c) => c.active).map((c) => `<label class="ba-chk"><input type="checkbox" data-prio value="${esc(c.slug)}"${(s.priority_categories || []).includes(c.slug) ? " checked" : ""}> ${esc(c.name)}</label>`).join("");
    paintProvider(s.provider);
    FT = JSON.parse(JSON.stringify(s.typography || {})); paintFonts();
    const m = (B.ov && B.ov.month) || {};
    $("#usageNow").innerHTML = `<p class="small">This month so far: <b>${m.calls || 0}</b> AI calls · <b>${Number(m.tokens || 0).toLocaleString()}</b> tokens · <b>$${Number(m.cost || 0).toFixed(2)}</b> estimated.</p>`;
    renderBadges();
  }
  // Writing style: a starter example, the built-in voice (same text as supabase/functions/blog-agents/agents.ts → DEFAULT_VOICE), a character count
  const HOUSE_VOICE = `The writer is a careful health writer who sounds like a kind, clear-headed doctor friend:
• Opens with a relatable situation or a surprising truth, then answers straight away.
• Talks to one reader ("you"), plain words, explains every medical term.
• Says what a test or condition is, what it can and cannot tell you, and when to see a doctor.
• Every heading is a mini-hook, never "Introduction" or "Conclusion".
• Easy to scan: short paragraphs, one bold takeaway per section, lists, one caution box.
• Calm and respectful: no fear to get clicks, no shame, no promised cures.
• Facts and numbers only from cited sources. Never tells anyone what dose to take or to stop a medicine.
• Ends with "The short version", including when to see a doctor.`;
  const VOICE_SAMPLE = `Write for families in Fort Abbas and across Pakistan who may have never read a lab report.
Use everyday examples: fasting before a test in Ramadan, dengue season, sugar in the family.
Be reassuring and practical, like a doctor who has time to explain.
Mention booking a test at the clinic only where it is truly useful, once, near the end.`;
  if (SF.writing_style) {
    const cnt = () => { $("#voiceCount").textContent = `${SF.writing_style.value.length.toLocaleString()} / 4,000`; };
    SF.writing_style.addEventListener("input", cnt);
    $("#voiceSample").addEventListener("click", () => { if (SF.writing_style.value.trim() && !confirm("Replace what's in the box with the starter example?")) return; SF.writing_style.value = VOICE_SAMPLE; cnt(); SF.writing_style.focus(); });
    $("#voiceShow").addEventListener("click", () => { const pre = $("#voiceDefault"); pre.textContent = HOUSE_VOICE; pre.hidden = !pre.hidden; $("#voiceShow").textContent = pre.hidden ? "See the built-in house voice" : "Hide the house voice"; });
    setTimeout(cnt, 0);
  }
  SF.provider.addEventListener("change", () => {
    const v = SF.provider.value, p = provOf(v);
    // switching service: start from that service's suggested model unless the box already holds one of its models
    if (p.model && !p.models.includes(SF.model.value.trim())) SF.model.value = p.model;
    paintProvider(v);
  });
  SF.auto_publish.addEventListener("change", () => { if (SF.auto_publish.checked && SF.manual_approval.checked) toast("Manual approval is still on, so every article waits for you. Turn it off to let clean articles publish themselves.", "info"); });
  SF.addEventListener("submit", async (e) => {
    e.preventDefault();
    const days = $$("#pubDays input:checked").map((x) => +x.value);
    if (!days.length && +SF.articles_per_week.value > 0) return toast("Pick at least one publishing day.", "error");
    const num = (k) => Number(SF[k].value || 0);
    const patch = {
      articles_per_week: num("articles_per_week"), publish_hour: num("publish_hour"), publish_days: days,
      agents_enabled: SF.agents_enabled.checked, manual_approval: SF.manual_approval.checked, auto_publish: SF.auto_publish.checked, urdu_enabled: SF.urdu_enabled.checked,
      languages: SF.urdu_enabled.checked ? ["en", "ur"] : ["en"],
      length_pref: SF.length_pref.value, promo_level: SF.promo_level.value, max_product_links: num("max_product_links"),
      enabled_categories: $$("#setCats [data-cat]:checked").map((x) => x.value), priority_categories: $$("#setPrio [data-prio]:checked").map((x) => x.value),
      research_seeds: lines(SF.research_seeds.value).slice(0, 40), trusted_sources: lines(SF.trusted_sources.value).map((d) => d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase()).filter(Boolean).slice(0, 80),
      author_name: SF.author_name.value.trim(), author_bio: SF.author_bio.value.trim(), writing_style: SF.writing_style ? SF.writing_style.value.trim().slice(0, 4000) : "",
      provider: SF.provider.value, model: SF.model.value.trim(), base_url: SF.provider.value === "openai_compat" ? SF.base_url.value.trim() : "",
      image_source: SF.image_source.value, max_calls_per_minute: num("max_calls_per_minute"), monthly_call_limit: num("monthly_call_limit"), monthly_token_limit: num("monthly_token_limit"),
      price_in_per_m: num("price_in_per_m"), price_out_per_m: num("price_out_per_m"), monthly_cost_limit: num("monthly_cost_limit"), notify_email: SF.notify_email.value.trim(), email_from: SF.email_from.value.trim(),
      typography: cleanFonts()
    };
    if (patch.provider === "openai_compat" && !/^https:\/\//.test(patch.base_url)) return toast("Enter the API address (starting with https://).", "error");
    const wasOn = B.s && B.s.agents_enabled;
    const { data, error } = await client.from("blog_settings").update(patch).eq("id", 1).select("*").single();
    if (error) return fail(error);
    if (data.agents_enabled && !wasOn && B.sec.ai_key_set) run("planner", {}, true);
    B.s = data; fillSettings(); loadSecrets(); toast("Settings saved.", "ok");
  });
  function renderSecrets() {
    if (SF.provider) paintKey();
    $("#gscHint").textContent = B.sec.gsc_set ? `(connected: ${B.sec.gsc_email})` : "(not connected)";
    $("#gscProp").value = B.sec.gsc_property || "";
  }
  $("#saveKey").addEventListener("click", async () => {
    const v = $("#aiKey").value.trim(); if (!v) return toast("Paste the key first.", "error");
    const prov = SF.provider.value;
    if (B.s && B.s.provider !== prov) { SF.requestSubmit(); await new Promise((r) => setTimeout(r, 900)); }   // make this the service the agents use
    const { data, error } = await client.rpc("blog_set_secret", { p_name: "ai_key:" + prov, p_value: v }); if (error) return fail(error);
    $("#aiKey").value = ""; B.sec = data; renderSecrets(); renderOverview(); toast(`Key for ${provOf(prov).name} saved on the server. Press Test to check it.`, "ok");
  });
  $("#removeKey").addEventListener("click", async () => {
    const prov = SF.provider.value;
    if (!(await confirmBox(`Remove the ${provOf(prov).name} key?`, "The agents can't use this service until you add a key again.", "Remove", true))) return;
    const { data, error } = await client.rpc("blog_set_secret", { p_name: "ai_key:" + prov, p_value: "" }); if (error) return fail(error);
    B.sec = data; renderSecrets(); renderOverview(); toast("Key removed.", "ok");
  });
  $("#testAi").addEventListener("click", async () => {
    if (!((B.sec.ai_keys || {})[SF.provider.value])) return toast(`Save a key for ${provOf(SF.provider.value).name} first.`, "error");
    const out = $("#testOut"); out.textContent = "Testing… (saving the provider and model first)";
    SF.requestSubmit(); await new Promise((r) => setTimeout(r, 900));
    const id = await run("ping", {}, true); if (!id) { out.textContent = ""; return; }
    for (let i = 0; i < 45; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const { data } = await client.from("blog_jobs").select("status,result,error").eq("id", id).single();
      if (!data || ["queued", "running"].includes(data.status)) { out.textContent = `Testing… ${i * 2}s`; continue; }
      if (data.status === "done") {
        out.innerHTML = `<span class="ba-ok">✓ Works.</span> The model says: “${esc(data.result.says)}”`;
        $("#modelList").innerHTML = (data.result.models || []).map((m) => `<option value="${esc(m)}">`).join("");
        if ((data.result.models || []).length) out.innerHTML += ` · ${data.result.models.length} models available (type in the Model box to pick one)`;
      } else out.innerHTML = `<span class="ba-err">✕ ${esc(data.error || data.status)}</span>`;
      return;
    }
    out.textContent = "Still waiting — the agents may be busy. Check Live flow.";
  });
  $("#saveGsc").addEventListener("click", async () => {
    const prop = $("#gscProp").value.trim(), key = $("#gscKey").value.trim();
    if (!/^(sc-domain:[a-z0-9.-]+|https:\/\/\S+\/)$/.test(prop)) return toast('Property must look like "sc-domain:fortabbaspolyclinic.com" or "https://fortabbaspolyclinic.com/".', "error");
    let r = await client.rpc("blog_set_secret", { p_name: "gsc_property", p_value: prop }); if (r.error) return fail(r.error);
    if (key) { r = await client.rpc("blog_set_secret", { p_name: "gsc_service_account", p_value: key }); if (r.error) return fail(r.error); }
    $("#gscKey").value = ""; B.sec = r.data; renderSecrets(); toast("Search Console saved. The Performance Monitor will use it on its next run (or press Check now).", "ok");
  });
  $("#clearGsc").addEventListener("click", async () => {
    if (!(await confirmBox("Disconnect Search Console?", "The agents will stop reading Google data. Saved numbers stay.", "Disconnect", true))) return;
    const r = await client.rpc("blog_set_secret", { p_name: "gsc_service_account", p_value: "" }); if (r.error) return fail(r.error);
    B.sec = r.data; renderSecrets(); toast("Disconnected.", "ok");
  });

  /* ---------- categories ---------- */
  function renderCats() {
    $("#catList").innerHTML = B.cats.map((c) => `<form class="ba-cat form-row" data-cat-id="${esc(c.id)}">
      <label class="field"><span>Name</span><input name="name" value="${esc(c.name)}" required maxlength="80"></label>
      <label class="field"><span>Address</span><input name="slug" value="${esc(c.slug)}" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="80"></label>
      <label class="field grow"><span>Description (shown on the category page)</span><input name="description" value="${esc(c.description)}" maxlength="400"></label>
      <label class="field ba-w-sm"><span>Order</span><input name="sort" type="number" value="${c.sort}"></label>
      <label class="switch"><input type="checkbox" name="active"${c.active ? " checked" : ""}> Shown</label>
      <button class="btn btn-soft btn-sm" type="submit">Save</button></form>`).join("");
  }
  $("#catList").addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target, id = f.dataset.catId;
    const patch = { name: f.name.value.trim(), slug: f.slug.value.trim(), description: f.description.value.trim(), sort: +f.sort.value || 100, active: f.active.checked };
    const { error } = id ? await client.from("blog_categories").update(patch).eq("id", id) : await client.from("blog_categories").insert(patch);
    if (error) return fail(/duplicate/.test(error.message) ? new Error("Another category already uses that address.") : error);
    B.cats = await q(client.from("blog_categories").select("*").order("sort")); renderCats(); fillCatSelects(); fillSettings(); toast("Category saved.", "ok");
  });
  $("#addCat").addEventListener("click", () => {
    const f = document.createElement("form"); f.className = "ba-cat form-row";
    f.innerHTML = `<label class="field"><span>Name</span><input name="name" required maxlength="80"></label><label class="field"><span>Address</span><input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="80"></label><label class="field grow"><span>Description</span><input name="description" maxlength="400"></label><label class="field ba-w-sm"><span>Order</span><input name="sort" type="number" value="200"></label><label class="switch"><input type="checkbox" name="active" checked> Shown</label><button class="btn btn-dark btn-sm" type="submit">Add</button>`;
    f.name.addEventListener("input", () => (f.slug.value = MD.slug(f.name.value).replace(/[^a-z0-9-]/g, "")));
    $("#catList").prepend(f); f.name.focus();
  });

  /* =============================== suggestions ===============================
     A "✨ Suggest" button on every Settings card fills it with a ready-made, working option and says why it
     fits. Each click moves to the next option. Nothing is saved until you press Save. */
  const SEEDS_LAB = ["cbc blood test", "hba1c test", "lipid profile test", "liver function test", "thyroid test", "urine routine examination", "diabetes symptoms", "high blood pressure", "vitamin d deficiency", "anemia", "dengue test", "typhoid test"];
  const TRUSTED = ["medlineplus.gov", "nih.gov", "who.int", "cdc.gov", "nhs.uk", "mayoclinic.org", "clevelandclinic.org", "heart.org", "diabetes.org", "cancer.org", "en.wikipedia.org"];
  const BIO = "The Fort Abbas Poly Clinic team provides OPD consultations, laboratory tests, digital X-ray and home sample collection, and writes general health information to help you talk to your doctor.";
  const SG = {
    schedule: [
      { name: "Steady start", why: "3 guides a week — Monday, Wednesday and Friday at 10:00 — and you approve each one. A good pace for a new blog: regular enough for Google, light enough to review properly.", v: { per: 3, hour: 10, days: [1, 3, 5], manual: true, auto: false } },
      { name: "Light", why: "1 guide a week, Thursday at 11:00, approved by you. For busy weeks.", v: { per: 1, hour: 11, days: [4], manual: true, auto: false } },
      { name: "Growth", why: "5 guides a week, weekdays at 9:00, approved by you. Builds the library fast — plan about 15 minutes a day for reviews.", v: { per: 5, hour: 9, days: [1, 2, 3, 4, 5], manual: true, auto: false } },
      { name: "Weekend readers", why: "2 guides a week, Saturday and Sunday at 18:00 — when people browse home ideas.", v: { per: 2, hour: 18, days: [6, 0], manual: true, auto: false } },
      { name: "Hands-off", why: "3 a week. Articles go live by themselves after the checks; unverified sentences and dose instructions are removed first, and only serious safety concerns wait for you.", v: { per: 3, hour: 10, days: [1, 3, 5], manual: false, auto: true } }
    ],
    content: [
      { name: "Lab tests explained", why: "Standard-length articles on what tests measure and how to read them, with a test card where it helps. Closest to what the clinic does.", v: { len: "standard", promo: "light", max: 2, prio: ["lab-tests-explained", "prevention-screening", "diabetes-heart"], seeds: SEEDS_LAB, trusted: TRUSTED } },
      { name: "Health myths", why: "Shorter articles that check common beliefs against reliable sources. Easy to share.", v: { len: "short", promo: "off", max: 0, prio: ["health-myths", "nutrition-lifestyle"], seeds: ["health myths", "diabetes myths", "fever myths", "blood pressure myths", "vaccine myths"], trusted: TRUSTED } },
      { name: "Seasonal illness", why: "Dengue, typhoid, flu and heat: signs, tests and prevention for readers in Pakistan.", v: { len: "standard", promo: "light", max: 2, prio: ["infections-seasonal", "childrens-health"], seeds: ["dengue symptoms", "typhoid symptoms", "heat stroke", "seasonal flu", "malaria test"], trusted: TRUSTED } }
    ],
    ai: [
      { name: "Gemini Flash-Lite (free)", why: "Free daily quota, fast, good enough for most guides. The easiest start.", v: { provider: "gemini", model: "gemini-flash-lite-latest" } },
      { name: "Gemini Flash (free)", why: "Free too, writes a little better than Flash-Lite; the free daily quota is smaller.", v: { provider: "gemini", model: "gemini-flash-latest" } },
      { name: "Groq · Llama 3.3 70B (free)", why: "Free tier and very fast. A good backup when the Gemini quota runs out.", v: { provider: "groq", model: "llama-3.3-70b-versatile" } },
      { name: "OpenRouter free model", why: "One OpenRouter key reaches many companies' models; models ending in :free cost nothing (with daily limits).", v: { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free" } },
      { name: "Claude Haiku (paid, careful writing)", why: "Paid per use, but careful with facts and good at following the writing rules. Set a monthly budget in Limits & costs.", v: { provider: "anthropic", model: "claude-haiku-5-5" } },
      { name: "DeepSeek (low cost)", why: "Paid, but among the cheapest. Set a monthly budget in Limits & costs.", v: { provider: "deepseek", model: "deepseek-chat" } }
    ],
    images: [
      { name: "Clinic photos first", why: "Uses a clinic photo when the guide shows one of your products, otherwise an openly licensed photo with credit. Best balance.", v: "products_then_openverse" },
      { name: "Only clinic photos", why: "Every cover is your own clinic photo; guides with no product get no cover.", v: "products" },
      { name: "Only licensed photos", why: "Covers always come from Openverse (CC0 / CC BY …) with the photographer's credit shown.", v: "openverse" },
      { name: "No covers", why: "Text-only guides. Fastest pages, but less attractive in search and when shared.", v: "none" }
    ],
    limits: [
      { name: "Free tier, safe", why: "4 AI calls a minute and 600 a month (~100 guides). Stays well inside free quotas.", v: { cpm: 4, calls: 600, tokens: 4000000, budget: 0, free: true } },
      { name: "Free tier, busier", why: "10 calls a minute, 1,500 a month — for 5 guides a week plus Urdu versions on a free tier.", v: { cpm: 10, calls: 1500, tokens: 10000000, budget: 0, free: true } },
      { name: "Paid model, $5 a month", why: "The agents stop when this month's estimated cost reaches $5. Enter your model's prices (per 1M tokens, from its pricing page) so the cost can be counted.", v: { cpm: 10, calls: 1500, tokens: 10000000, budget: 5 } },
      { name: "Paid model, $15 a month", why: "Room for daily guides on a paid model, capped at $15. Enter your model's prices so the cost can be counted.", v: { cpm: 20, calls: 3000, tokens: 20000000, budget: 15 } }
    ]
  };
  const CAT_IDEAS = [
    ["Mental Health", "Stress, sleep and when to ask for help."],
    ["Older Adults", "Staying well in later life, and tests that matter."],
    ["Skin & Allergies", "Common skin problems and allergy testing."],
    ["Ramadan & Health", "Fasting safely with long-term conditions."]
  ];
  const sgAt = {};
  function sgNote(box, i, n, name, why, extra) {
    let note = box.querySelector(".ba-sg-note");
    if (!note) { note = document.createElement("div"); note.className = "ba-sg-note"; const h = box.querySelector(":scope > .ba-sg-head") || box.firstElementChild; h.after(note); }
    note.innerHTML = `<b>Suggestion ${i + 1} of ${n} · ${esc(name)}</b><span>${esc(why)}</span>${extra || ""}<small>Press <b>✨ Suggest</b> again for another option${box.closest("#setForm") ? ", or <b>Save settings</b> to keep this one" : ""}.</small>`;
    box.classList.remove("ba-sg-flash"); void box.offsetWidth; box.classList.add("ba-sg-flash");
  }
  const setDays = (days) => $$("#pubDays input").forEach((x) => (x.checked = days.includes(+x.value)));
  const setChecks = (sel, slugs) => $$(sel).forEach((x) => (x.checked = slugs.includes(x.value)));
  async function suggest(key, box) {
    if (!B.s) return;
    const list = SG[key], i = sgAt[key] = sgAt[key] == null ? 0 : (sgAt[key] + 1) % (list ? list.length : 1000), o = list && list[i];
    if (key === "schedule") {
      SF.articles_per_week.value = o.v.per; SF.publish_hour.value = o.v.hour; setDays(o.v.days);
      SF.manual_approval.checked = o.v.manual; SF.auto_publish.checked = o.v.auto;
      return sgNote(box, i, list.length, o.name, o.why);
    }
    if (key === "content") {
      SF.length_pref.value = o.v.len; SF.promo_level.value = o.v.promo; SF.max_product_links.value = o.v.max;
      setChecks("#setPrio [data-prio]", o.v.prio); SF.research_seeds.value = o.v.seeds.join("\n"); SF.trusted_sources.value = o.v.trusted.join("\n");
      if (!SF.author_name.value.trim()) SF.author_name.value = "Fort Abbas Poly Clinic Editorial Team";
      if (!SF.author_bio.value.trim()) SF.author_bio.value = BIO;
      return sgNote(box, i, list.length, o.name, o.why);
    }
    if (key === "ai") {
      SF.provider.value = o.v.provider; SF.model.value = o.v.model; paintProvider(o.v.provider);
      const has = ((B.sec && B.sec.ai_keys) || {})[o.v.provider], p = provOf(o.v.provider);
      const extra = has ? `<span class="ba-ok">✓ A key for ${esc(p.name)} is already saved.</span>` : `<span>You'll need a ${esc(p.name)} key: <a href="${esc(p.key)}" target="_blank" rel="noopener">get one here ↗</a>, paste it below and press Save key.</span>`;
      return sgNote(box, i, list.length, o.name, o.why, extra);
    }
    if (key === "images") { SF.image_source.value = o.v; return sgNote(box, i, list.length, o.name, o.why); }
    if (key === "limits") {
      SF.max_calls_per_minute.value = o.v.cpm; SF.monthly_call_limit.value = o.v.calls; SF.monthly_token_limit.value = o.v.tokens; SF.monthly_cost_limit.value = o.v.budget;
      if (o.v.free) { SF.price_in_per_m.value = 0; SF.price_out_per_m.value = 0; }
      const warn = !o.v.free && !(Number(SF.price_in_per_m.value) + Number(SF.price_out_per_m.value)) ? `<span class="ba-err">Prices are still 0 — the budget only works once you enter them.</span>` : "";
      return sgNote(box, i, list.length, o.name, o.why, warn);
    }
    if (key === "notify") {
      const opts = [];
      const add = (email, name, why) => { email = String(email || "").trim(); if (email && !opts.some((x) => x.email === email)) opts.push({ email, name, why }); };
      add(B.me && B.me.email, "Your sign-in email", "Review requests and failures go to the email you sign in with.");
            opts.push({ email: "", name: "No email", why: "Leave it empty: no emails are sent. Alerts still show on this page." });
      const j = sgAt[key] = (sgAt[key] || 0) % opts.length, x = opts[j];
      SF.notify_email.value = x.email;
      return sgNote(box, j, opts.length, x.name, x.why + (x.email ? ` (${x.email})` : ""));
    }
    if (key === "gsc") {
      const h0 = location.hostname.replace(/^www\./, ""), host = /[a-z]\.[a-z]{2,}$/i.test(h0) && !/vercel\.app$/.test(h0) ? h0 : "fortabbaspolyclinic.com";
      const props = [[`sc-domain:${host}`, "Domain property", `Covers every address of ${host} (with and without www, http and https). Use this if you verified the domain in Search Console with a DNS record.`],
        [`https://www.${host}/`, "Website address property", "Use this if you added the site in Search Console by its web address (URL-prefix)."]];
      const j = sgAt[key] = (sgAt[key] || 0) % props.length;
      $("#gscProp").value = props[j][0];
      const steps = `<ol class="ba-sg-steps">
        <li>In <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">Google Cloud ↗</a> create a project (any name, free).</li>
        <li>Turn on the <a href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com" target="_blank" rel="noopener">Search Console API ↗</a> for that project.</li>
        <li>Open <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener">Service accounts ↗</a> → <b>Create service account</b> (no roles needed) → open it → <b>Keys</b> → <b>Add key</b> → <b>JSON</b>. A file downloads.</li>
        <li>In <a href="https://search.google.com/search-console/users" target="_blank" rel="noopener">Search Console → Users and permissions ↗</a> add the service account's email (it ends in <code>.iam.gserviceaccount.com</code>) as a <b>Restricted</b> user.</li>
        <li>Open the downloaded file in Notepad, copy everything, paste it in the box below and press <b>Save Search Console</b>.</li></ol>`;
      return sgNote(box, j, props.length, props[j][1], props[j][2], steps);
    }
    if (key === "cats") {
      const have = new Set(B.cats.map((c) => c.name.toLowerCase()));
      const ideas = CAT_IDEAS.filter(([n]) => !have.has(n.toLowerCase()));
      if (!ideas.length) return sgNote(box, 0, 1, "All set", "You already have every category we'd suggest.");
      const j = sgAt[key] = (sgAt[key] || 0) % ideas.length, [name, desc] = ideas[j];
      let f = $("#catList form.ba-cat-new");
      if (!f) { $("#addCat").click(); f = $("#catList form.ba-cat:first-child"); f.classList.add("ba-cat-new"); }
      f.name.value = name; f.slug.value = MD.slug(name).replace(/[^a-z0-9-]/g, ""); f.description.value = desc;
      return sgNote(box, j, ideas.length, name, `A new category for guides about this: “${desc}” Press Add on the new row to create it.`);
    }
  }
  $$("#panel-settings [data-sg]").forEach((box) => {
    const h3 = box.querySelector("h3");
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "btn btn-soft btn-sm ba-suggest"; btn.textContent = "✨ Suggest";
    btn.title = "Fill this section with a ready-made option — click again for another";
    const row = h3.parentElement.classList.contains("ba-row-head") ? h3.parentElement : null;
    if (row) row.querySelector(".btn, button") ? row.lastElementChild.before(btn) : row.append(btn);
    else { const head = document.createElement("div"); head.className = "ba-row-head ba-sg-head"; h3.before(head); head.append(h3, btn); }
    btn.addEventListener("click", () => suggest(box.dataset.sg, box).catch(fail));
  });

  /* email alerts through Resend (optional) */
  (function () {
    const btn = $("#saveResend"); if (!btn) return;
    btn.addEventListener("click", async () => { const v = $("#resendKey").value.trim(); if (!v) return toast("Paste a Resend key first.", "error"); const { data, error } = await client.rpc("blog_set_secret", { p_name: "resend_api_key", p_value: v }); if (error) return fail(error); B.sec = data || B.sec; $("#resendKey").value = ""; toast("Email key saved.", "ok"); });
  })();

  /* =============================== start =============================== */
  (async function boot() {
    if (!client) { showLogin("The store database isn't connected (check config.js)."); return; }
    const { data } = await client.auth.getSession();
    if (data && data.session) enter(); else showLogin();
  })();
})();
