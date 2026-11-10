/* Admin panels: switcher at the top of the admin (like GoHighLevel's sub-account switcher) and the
   Setup > Admin panels page. Owners only; the database returns nothing to anyone else.
   Picking a panel asks the Edge Function panel-pass for a one-time sign-in link to that panel's admin.
   Panels without a saved key simply open, and you sign in there once. */
(function () {
  'use strict';
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const svg = (p, w = 16) => `<svg viewBox="0 0 24 24" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const CHEV = svg('<path d="m7 10 5 5 5-5"/>', 15), CHECK = svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 15), KEYI = svg('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>', 13),
    EXT = svg('<path d="M14 4h6v6M10 14 20 4M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>', 13), GEAR = svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 14),
    SRCH = svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', 15);
  let list = null, loading = null, ctx = {}, menu = null, btn = null;

  const demo = () => !!(window.FA && FA.demo);
  async function load(force) {
    if (list && !force) return list;
    if (loading && !force) return loading;
    loading = (async () => {
      if (demo()) return (list = [{ id: 'demo-d', name: 'Divaar.pk', line: 'divaar.pk admin', mark: 'D', color: '#4f46e5', admin_url: 'https://www.divaar.pk/admin', sb_url: '', has_key: false, active: true, sort: 1 },
        { id: 'demo-m', name: 'Minzu Crafts', line: 'minzucrafts.com admin', mark: 'M', color: '#b4532a', admin_url: 'https://minzucrafts.com/admin', sb_url: '', has_key: false, active: true, sort: 2 }]);
      try { list = (await FA.rpc('admin_panels_list')) || []; } catch { list = []; }
      return list;
    })();
    return loading;
  }
  const markH = (p, cls = 'pp-mk') => p.logo ? `<span class="${cls}" style="--pc:${esc(p.color)}"><img src="${esc(p.logo)}" alt=""></span>`
    : `<span class="${cls}" style="--pc:${esc(p.color || '#14396f')}">${esc((p.mark || p.name || '?').slice(0, 2))}</span>`;
  const host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return u; } };
  const here = () => ({ name: (ctx.live && ctx.live.brand && ctx.live.brand.name) || 'Fort Abbas Poly Clinic', logo: ctx.live && ctx.live.brand && ctx.live.brand.logo, color: getComputedStyle(document.documentElement).getPropertyValue('--base').trim() || '#14396f', line: location.host.replace(/^www\./, '') + ' admin' });

  async function go(p, newTab) {
    const w = newTab ? window.open('about:blank', '_blank') : null;
    const send = (u) => { if (w) w.location.href = u; else location.href = u; };
    if (!p.has_key || demo()) return send(p.admin_url);
    toastIt(`Signing you in to ${p.name}…`);
    try {
      const c = window.FA_CONFIG, r = await fetch(`${c.url}/functions/v1/panel-pass`, { method: 'POST', headers: { apikey: c.anon, authorization: 'Bearer ' + await FA.token(), 'content-type': 'application/json' }, body: JSON.stringify({ id: p.id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.url) throw new Error(j.error || 'Could not sign you in');
      send(j.url);
    } catch (er) {
      if (w) w.close();
      toastIt(er.message + ' Opening the sign-in page instead.');
      setTimeout(() => send(p.admin_url), 1600);
    }
  }
  const toastIt = (m) => (ctx.toast ? ctx.toast(m) : alert(m));

  /* ---------- switcher ---------- */
  function close() { if (menu) { menu.remove(); menu = null; } if (btn) btn.setAttribute('aria-expanded', 'false'); }
  function paintList(q) {
    const box = menu && menu.querySelector('.pp-list'); if (!box) return;
    const s = (q || '').trim().toLowerCase(), cur = here();
    const others = list.filter((p) => p.active && (!s || (p.name + ' ' + p.line + ' ' + p.admin_url).toLowerCase().includes(s)));
    box.innerHTML = ((!s || cur.name.toLowerCase().includes(s)) ? `<div class="pp-it cur" aria-current="true">${markH(cur)}<span class="pp-t"><b>${esc(cur.name)}</b><small>${esc(cur.line)} · you're here</small></span><span class="pp-ok">${CHECK}</span></div>` : '')
      + others.map((p) => `<div class="pp-row"><button type="button" class="pp-it" data-pp="${esc(p.id)}" role="menuitem">${markH(p)}<span class="pp-t"><b>${esc(p.name)}</b><small>${esc(p.line || host(p.admin_url))}</small></span>${p.has_key ? `<span class="pp-tag" title="Signs you in by itself">${KEYI}One click</span>` : `<span class="pp-tag off" title="Opens the sign-in page of that panel">Sign in there</span>`}</button><button type="button" class="pp-nt" data-ppn="${esc(p.id)}" title="Open in a new tab" aria-label="Open ${esc(p.name)} in a new tab">${EXT}</button></div>`).join('')
      + (!others.length && s ? '<p class="pp-none">No panel matches.</p>' : '');
  }
  function open() {
    if (menu) return close();
    btn.setAttribute('aria-expanded', 'true');
    menu = document.createElement('div'); menu.className = 'pp-menu'; menu.setAttribute('role', 'menu');
    menu.innerHTML = `<div class="pp-h"><span>Switch admin panel</span><small>${list.filter((p) => p.active).length + 1} panels</small></div>`
      + (list.length > 4 ? `<label class="pp-s">${SRCH}<input type="search" placeholder="Find a panel" aria-label="Find a panel"></label>` : '')
      + `<div class="pp-list"></div><button type="button" class="pp-mg">${GEAR}<span>Manage admin panels</span></button>`;
    document.body.appendChild(menu);
    paintList('');
    const r = btn.getBoundingClientRect(), w = Math.min(340, innerWidth - 16);
    menu.style.width = w + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    menu.style.top = (r.bottom + 8) + 'px';
    const inp = menu.querySelector('.pp-s input'); if (inp) { inp.oninput = () => paintList(inp.value); setTimeout(() => inp.focus(), 30); }
    menu.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const a = ev.target.closest('[data-pp]'), n = ev.target.closest('[data-ppn]');
      if (a || n) { const p = list.find((x) => x.id === (a ? a.dataset.pp : n.dataset.ppn)); close(); if (p) go(p, !!n); return; }
      if (ev.target.closest('.pp-mg')) { close(); window.FAAdmin && FAAdmin.go('panels'); }
    });
    requestAnimationFrame(() => menu && menu.classList.add('in'));
  }
  async function mount(el, c) {
    ctx = c || ctx;
    if (!el || !ctx.me || ctx.me.real_role !== 'owner') return;
    await load();
    if (!el.isConnected) return;
    const cur = here();
    el.innerHTML = `<button type="button" class="pp-btn" aria-haspopup="menu" aria-expanded="false" title="Switch admin panel">${markH(cur, 'pp-mk sm')}<span class="pp-bn">${esc(cur.name)}</span><span class="pp-cv">${CHEV}</span></button>`;
    btn = el.querySelector('.pp-btn');
    btn.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); open(); });
  }
  document.addEventListener('click', (ev) => { if (menu && !ev.target.closest('.pp-menu')) close(); });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') close();
    if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && (ev.key === 'P' || ev.key === 'p') && btn && btn.isConnected) { ev.preventDefault(); open(); }
  });
  addEventListener('resize', close);
  document.addEventListener('scroll', (ev) => { if (menu && !menu.contains(ev.target)) close(); }, true);

  /* ---------- Setup > Admin panels page ---------- */
  async function page(p, c) {
    ctx = { ...ctx, ...c };
    const e = esc;
    if (!ctx.me || ctx.me.real_role !== 'owner') { p.innerHTML = '<h2>Admin panels</h2><div class="pnl glass"><p>Only an owner account can manage admin panels.</p></div>'; return; }
    p.innerHTML = '<h2>Admin panels</h2><p class="psub">Loading…</p>';
    await load(true);
    const cur = here();
    p.innerHTML = `<div class="pp-wrap"><h2>Admin panels</h2>
      <p class="psub">Your other admin panels, in the switcher at the top left of every page (Ctrl+Shift+P). Panels with a saved key open already signed in, so you only sign in once, here.</p>
      <div class="pp-pg">
        <div class="pp-card cur">${markH(cur)}<div class="pp-t"><b>${e(cur.name)}</b><small>${e(cur.line)} · this panel</small></div><span class="pp-tag">You're here</span></div>
        ${list.map((x, i) => `<div class="pp-card ${x.active ? '' : 'off'}">${markH(x)}<div class="pp-t"><b>${e(x.name)}</b><small>${e(host(x.admin_url))}${x.sign_in_email ? ' · signs in as ' + e(x.sign_in_email) : ''}</small></div>
          <span class="pp-tag ${x.has_key ? '' : 'off'}">${x.has_key ? KEYI + 'One-click sign-in' : 'Sign in there'}</span>${x.active ? '' : '<span class="pp-tag off">Hidden</span>'}
          <div class="pp-acts"><button class="btn ghost sm" data-pp-up="${i}" ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button class="btn ghost sm" data-pp-dn="${i}" ${i < list.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button>
          ${x.has_key ? `<button class="btn ghost sm" data-pp-test="${e(x.id)}">Test sign-in</button>` : ''}<button class="btn ghost sm" data-pp-open="${e(x.id)}">Open</button><button class="btn ghost sm" data-pp-edit="${e(x.id)}">Edit</button></div></div>`).join('')}
      </div>
      <div class="acts" style="margin-top:14px"><button class="btn acc sm" data-pp-add>+ Add admin panel</button></div>
      <div class="pnl glass pp-help"><h3>How one-click sign-in works</h3>
        <ol><li>In the other project's Supabase dashboard open <b>Project Settings → API Keys</b> and copy the <b>secret</b> key (or the older <b>service_role</b> key).</li>
        <li>Paste it under <b>Edit → Service key</b> here. It is stored on the server and is never shown again or sent to any browser.</li>
        <li>In that project open <b>Authentication → URL Configuration</b> and add the panel's admin address (for example https://www.divaar.pk/admin) under <b>Redirect URLs</b>, so the sign-in lands on the admin and not the shop's home page.</li>
        <li>Press <b>Test sign-in</b>. You need an admin account with the same email there (or set <b>Sign in as</b>).</li></ol>
        <p class="psub" style="margin:0">The secret key gives full control of that project, so only owner accounts can use this page and every switch is written to the Audit log.</p></div></div>`;
    p.querySelector('.pp-wrap').onclick = async (ev) => {
      const t = ev.target.closest('button'); if (!t) return;
      ev.stopPropagation();
      const d = t.dataset, byId = (id) => list.find((x) => x.id === id);
      if ('ppAdd' in d) return edit(null, p);
      if (d.ppEdit) return edit(byId(d.ppEdit), p);
      if (d.ppOpen) return go(byId(d.ppOpen), true);
      if (d.ppUp || d.ppDn) {
        const i = +(d.ppUp || d.ppDn), j = d.ppUp ? i - 1 : i + 1, ids = list.map((x) => x.id);
        [ids[i], ids[j]] = [ids[j], ids[i]];
        try { if (!demo()) await FA.rpc('admin_panels_order', { p_ids: ids }); else list.splice(j, 0, list.splice(i, 1)[0]); } catch (er) { return toastIt(er.message); }
        return page(p, {});
      }
      if (d.ppTest) {
        t.disabled = true; t.textContent = 'Checking…';
        try {
          const cf = window.FA_CONFIG, r = await fetch(`${cf.url}/functions/v1/panel-pass`, { method: 'POST', headers: { apikey: cf.anon, authorization: 'Bearer ' + await FA.token(), 'content-type': 'application/json' }, body: JSON.stringify({ id: d.ppTest, action: 'check' }) });
          const j = await r.json().catch(() => ({}));
          toastIt(r.ok && j.ok ? `Works: you will be signed in as ${j.email}.` : (j.error || 'The check failed'));
        } catch (er) { toastIt(er.message); }
        t.disabled = false; t.textContent = 'Test sign-in';
      }
    };
  }

  function edit(x, p) {
    const e = esc, n = !x; x = x || { name: '', line: '', mark: '', color: '#4f46e5', logo: '', admin_url: 'https://', sb_url: '', sign_in_email: '', active: true, has_key: false };
    const f = (k, l, v, ty = 'text', ph = '', hint = '') => `<div class="fld"><label for="pp_${k}">${l}</label><input id="pp_${k}" type="${ty}" value="${e(v)}" placeholder="${e(ph)}" autocomplete="off">${hint ? `<small class="psub" style="display:block;margin:4px 0 0">${hint}</small>` : ''}</div>`;
    ctx.pop(`<h3>${n ? 'Add admin panel' : 'Edit ' + e(x.name)}</h3><div class="pp-form">
      ${f('name', 'Name', x.name, 'text', 'e.g. Divaar.pk')}${f('line', 'Short line under the name', x.line, 'text', 'e.g. Furniture shop')}
      <div class="pp-2">${f('mark', 'Letters (1 or 2)', x.mark, 'text', 'D')}<div class="fld"><label for="pp_color">Colour</label><input id="pp_color" type="color" value="${e(x.color || '#4f46e5')}"></div></div>
      ${f('logo', 'Logo address (optional)', x.logo, 'text', 'https://…/logo.png', 'Shown instead of the letters.')}
      ${f('admin_url', 'Admin page address', x.admin_url, 'text', 'https://www.example.com/admin')}
      ${f('sb_url', 'Supabase project address (for one-click sign-in)', x.sb_url, 'text', 'https://abcd.supabase.co')}
      ${f('key', 'Service key', '', 'password', x.has_key ? 'Saved. Leave blank to keep it' : 'sb_secret_… or the service_role key', 'Project Settings → API Keys in that project. Stored on the server only.')}
      ${x.has_key ? '<label class="pp-ck"><input type="checkbox" id="pp_rmkey"> Remove the saved key</label>' : ''}
      ${f('email', 'Sign in as (optional)', x.sign_in_email, 'email', 'Blank uses your own email', 'Only if your admin account there has a different email.')}
      <label class="pp-ck"><input type="checkbox" id="pp_active" ${x.active ? 'checked' : ''}> Show in the switcher</label>
      <p class="err" id="pp_err"></p></div>
      <div class="acts">${n ? '' : '<button class="btn ghost sm" id="pp_del" style="margin-inline-end:auto">Remove</button>'}<button class="btn ghost sm" id="pp_no">Cancel</button><button class="btn acc sm" id="pp_ok">${n ? 'Add panel' : 'Save'}</button></div>`, (box) => {
      const $ = (s) => box.querySelector(s);
      $('#pp_no').onclick = ctx.close;
      if ($('#pp_del')) $('#pp_del').onclick = () => ctx.confirm2('Remove ' + e(x.name) + '?', 'It disappears from the switcher and its saved key is deleted. The other website is not touched.', 'Remove', async () => {
        try { if (!demo()) await FA.rpc('admin_panel_delete', { p_id: x.id }); else list = list.filter((y) => y.id !== x.id); ctx.close(); await refresh(p); } catch (er) { toastIt(er.message); }
      }, true);
      $('#pp_ok').onclick = async () => {
        const body = { id: n ? '' : x.id, name: $('#pp_name').value, line: $('#pp_line').value, mark: $('#pp_mark').value.trim(), color: $('#pp_color').value,
          logo: $('#pp_logo').value.trim(), admin_url: $('#pp_admin_url').value.trim(), sb_url: $('#pp_sb_url').value.trim(), sign_in_email: $('#pp_email').value.trim(), active: $('#pp_active').checked };
        const k = $('#pp_key').value.trim();
        if (k) body.service_key = k; else if ($('#pp_rmkey') && $('#pp_rmkey').checked) body.service_key = '';
        if (k && !body.sb_url) { $('#pp_err').textContent = 'Add the Supabase project address too, so the key knows where to sign you in.'; return; }
        if (k && k.startsWith('sb_publishable')) { $('#pp_err').textContent = 'That is the publishable key. Copy the secret key instead.'; return; }
        $('#pp_ok').disabled = true;
        try { if (!demo()) await FA.rpc('admin_panel_save', { p: body }); else { body.id = body.id || 'demo-' + Date.now(); body.has_key = !!k; list = [...list.filter((y) => y.id !== body.id), body]; } ctx.close(); await refresh(p); toastIt(n ? 'Panel added' : 'Saved'); }
        catch (er) { $('#pp_err').textContent = er.message; $('#pp_ok').disabled = false; }
      };
    });
  }
  async function refresh(p) {
    if (!demo()) await load(true);
    await page(p, {});
    const el = document.getElementById('psw'); if (el) mount(el);
  }

  window.FAPanels = { mount, page, load };
})();
