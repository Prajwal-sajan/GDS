// Shell: login, layout, navigation, alerts, switch-user, router.
(function () {
  // Icons are the exact SVG paths used by the original SaveTrip header / GDS pills.
  const P = {
    trips: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
    gds: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
    chats: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    calls: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
    schedules: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    routes: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
    crm: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    vehicles: 'M3 6h18v12H3zM3 14h18M7 18v1.5M17 18v1.5',
    accounts: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    staff: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    dailyops: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    sarathi: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
    bell: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
    bus: 'M3 6h18v12H3zM3 14h18',
  };
  const svg = (k) => `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${P[k]}"/></svg>`;
  G.svg = svg;
  // Top menu (4 pills) — order and gating as in the original header.
  const TOP = [['trips', 'Trips', '#/trips', 'trips.view'], ['gds', 'GDS', '#/gds/schedules', 'schedules.view'], ['chats', 'Chats', '#/chats', 'chats.view'], ['calls', 'Calls', '#/calls', 'calls.view']];
  // GDS sub-menu — original order: Schedules, Routes, CRM, Vehicles, Accounts, Staff, Daily Ops, Sarathi.
  const SUB = [['schedules', 'Schedules', '#/gds/schedules', 'schedules.view'], ['routes', 'Routes', '#/gds/routes', 'routes.view'], ['crm', 'CRM', '#/crm', 'crm.view'], ['vehicles', 'Vehicles', '#/fleet/vehicles', 'fleet.view'], ['accounts', 'Accounts', '#/accounts', 'accounts.view'], ['staff', 'Staff', '#/fleet/staff', 'staff.view'], ['dailyops', 'Daily Ops', '#/dailyops', 'dailyops.view'], ['sarathi', 'Sarathi', '#/sarathi', 'sarathi.ask']];
  // Which top pill + GDS sub-pill a route belongs to.
  const sectionOf = (name, tab) => {
    if (name === 'gds') return ['gds', tab === 'routes' ? 'routes' : 'schedules'];
    if (name === 'fleet') return ['gds', ['vehicles', 'coaches'].includes(tab || 'vehicles') ? 'vehicles' : 'staff'];
    if (['crm', 'accounts', 'dailyops', 'sarathi'].includes(name)) return ['gds', name];
    return [name, null];
  };
  const NAV = [...TOP.map((t) => [t[0], '', t[1], t[3]]), ['settings', '', 'Settings', 'settings.view'], ...SUB.map((s) => [s[0], '', s[1], s[3]])];
  let alertsSince = null; let unreadAlerts = []; let pollT = null;

  function loginScreen() {
    clearInterval(pollT);
    $('#app').innerHTML = `<div class="login"><div class="card"><h2 style="margin:0 0 4px">Sign in</h2><p class="muted small">Bus operations GDS</p>
      <div data-s1><label class="f">Mobile number<input data-ph maxlength="10" inputmode="numeric" placeholder="10-digit mobile" value="${esc(localStorage.getItem('lastPhone') || '')}"/></label><button class="btn p" data-otp style="width:100%;margin-top:12px">Get OTP</button></div>
      <div data-s2 style="display:none"><label class="f">Enter OTP<input data-code maxlength="6" inputmode="numeric" placeholder="OTP"/></label><p class="small muted" data-hint></p><button class="btn p" data-ver style="width:100%;margin-top:8px">Verify & continue</button><a href="#" data-back class="small">Change number</a></div></div></div>`;
    const ph = $('[data-ph]'); ph.focus();
    const req = async () => { const phone = ph.value.trim(); if (!/^\d{10}$/.test(phone)) return G.toast('Enter a valid 10-digit number', 'bad'); const r = await G.post('/auth/request-otp', { phone }); localStorage.setItem('lastPhone', phone); $('[data-s1]').style.display = 'none'; $('[data-s2]').style.display = ''; $('[data-hint]').textContent = r.dev_hint ? `Dev OTP: ${r.dev_hint}` : `OTP sent to ${phone}`; $('[data-code]').focus(); };
    const ver = async () => { const r = await G.post('/auth/verify-otp', { phone: ph.value.trim(), otp: $('[data-code]').value.trim() }); localStorage.setItem('token', r.token); localStorage.removeItem('viewAs'); G.viewAs = ''; await boot(); };
    $('[data-otp]').onclick = () => req().catch(G.err); ph.onkeydown = (e) => { if (e.key === 'Enter') req().catch(G.err); };
    $('[data-ver]').onclick = () => ver().catch(G.err); $('[data-code]').onkeydown = (e) => { if (e.key === 'Enter') ver().catch(G.err); };
    $('[data-back]').onclick = (e) => { e.preventDefault(); $('[data-s1]').style.display = ''; $('[data-s2]').style.display = 'none'; };
  }

  function shell() {
    const u = G.user; const op = G.operator || {};
    if (op.brand_hex) document.documentElement.style.setProperty('--brand', op.brand_hex);
    document.title = `${op.operator_name || 'GDS'} · Operations`;
    const initials = (u.name || '?').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
    $('#app').innerHTML = `<div class="app"><header class="iconic-app-header"><div class="hdr-in"><div class="hdr-l">
        <a class="brand" href="#/" title="Home">${op.logo_url ? `<img src="${esc(op.logo_url)}" alt="" style="height:40px;border-radius:.5rem"/>` : `<span class="iconic-brand-logo">${svg('bus')}</span><span class="iconic-brand-name">${esc(op.app_name || op.operator_name || 'Operator')}</span>`}</a>
        <nav class="iconic-nav-cluster">${TOP.filter((t) => can(t[3])).map((t) => `<a class="iconic-tab-pill" data-active="false" data-top="${t[0]}" href="${t[2]}">${svg(t[0])}<span>${t[1]}</span><span class="badge bad" data-cnt="${t[0]}" style="display:none"></span></a>`).join('')}</nav></div>
      <div class="iconic-action-cluster"><button class="icon-btn" data-search title="Search PNR / phone (Ctrl+K)">${svg('gds')}</button><button class="icon-btn" data-bell title="Notifications">${svg('bell')}<span class="dot" data-bc style="display:none"></span></button><button class="icon-btn" data-me title="${esc(u.name)}"><span class="avatar">${esc(initials)}</span></button>
        <div class="menu" data-menu style="display:none"><div class="who"><b>${esc(u.name)}</b><div class="small muted">${esc(G.roles?.[u.role] || u.role)} · ${esc(u.phone)}</div>${G.viewAs ? '<span class="badge warn" style="margin-top:4px">Viewing as this user</span>' : ''}</div>${can('settings.view') ? '<a href="#/settings">⚙ Settings</a>' : ''}<a data-switch>⇄ Switch user</a><a data-logout>⎋ Log out</a></div></div></div></header>
      <div data-sub></div><main class="page" data-content></main></div>`;
    $('[data-search]').onclick = () => G.searchModal();
    $('[data-bell]').onclick = showAlerts;
    const menu = $('[data-menu]');
    $('[data-me]').onclick = (e) => { e.stopPropagation(); menu.style.display = menu.style.display === 'none' ? '' : 'none'; };
    if (!G._menuClose) { G._menuClose = 1; document.addEventListener('click', (e) => { const m = $('[data-menu]'); if (m && !m.contains(e.target)) m.style.display = 'none'; }); }
    $('[data-logout]').onclick = (e) => { e.preventDefault(); localStorage.removeItem('token'); localStorage.removeItem('viewAs'); G.viewAs = ''; G.user = null; location.hash = '#/login'; loginScreen(); };
    $('[data-switch]').onclick = async (e) => { e.preventDefault(); try { const users = await G.get('/auth/switchable-users'); if (!users.length && !G.viewAs) return G.toast('Only owners/admins can switch user', 'bad'); const v = await G.prompt('View app as', [{ name: 'phone', label: 'User', type: 'select', options: [['', '— Myself —'], ...users.map((x) => [x.phone, `${x.name} · ${G.roles?.[x.role] || x.role}`])], value: G.viewAs, full: 1 }], { ok: 'Switch' }); if (!v) return; G.viewAs = v.phone; if (v.phone) localStorage.setItem('viewAs', v.phone); else localStorage.removeItem('viewAs'); await boot(); } catch (er) { G.err(er); } };
    if (!G._keys) { G._keys = 1; document.addEventListener('keydown', (e) => { if (G.user && (e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); G.searchModal(); } }); }
  }

  async function pollAlerts() {
    try {
      const r = await G.get(`/alerts${alertsSince ? `?since=${encodeURIComponent(alertsSince)}` : ''}`);
      if (alertsSince) for (const a of r.alerts.slice().reverse()) G.toast(`🔔 ${a.title || a.message || a.type}`, a.level === 'critical' ? 'bad' : '');
      unreadAlerts = [...r.alerts, ...unreadAlerts].slice(0, 50); alertsSince = r.server_time;
      const bc = $('[data-bc]'); if (bc) { bc.textContent = unreadAlerts.length; bc.style.display = unreadAlerts.length ? '' : 'none'; }
      if (can('chats.view')) { const c = await G.get('/chats').catch(() => null); const el = $('[data-cnt="chats"]'); if (c && el) { el.textContent = c.unread_total; el.style.display = c.unread_total ? '' : 'none'; } }
    } catch (e) { /* ignore transient */ }
  }
  function showAlerts() {
    G.modal({ title: 'Alerts', size: 'lg', body: unreadAlerts.length ? unreadAlerts.map((a) => `<div class="card" style="margin-bottom:6px"><div class="row between"><b>${esc(a.title || a.type)}</b><span class="small muted">${fdt(a.ts)}</span></div><div class="small">${esc(a.message || '')}</div>${a.pnr ? `<a href="#" data-apnr="${esc(a.pnr)}" class="small">Open PNR</a>` : ''}</div>`).join('') : '<div class="empty">You are all caught up</div>', onMount: (m) => G.on(m.el, 'click', '[data-apnr]', (b, e) => { e.preventDefault(); m.close(); G.bookingModal(b.dataset.apnr); }) });
    unreadAlerts = []; const bc = $('[data-bc]'); if (bc) bc.style.display = 'none';
  }

  let routeSeq = 0;
  async function route() {
    if (!G.user) return;
    const [path] = location.hash.replace(/^#\/?/, '').split('?');
    const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
    let name = seg.shift() || '';
    if (name === 'login') { location.hash = '#/'; return; }
    const first = NAV.find((n) => can(n[3]) && G.screens[n[0]]);
    if (!name || !G.screens[name]) name = first ? first[0] : '';
    const params = seg.slice(); params.tab = seg[0]; params.id = ['chats', 'crm'].includes(name) ? seg[0] : seg[1];
    const [top, sub] = sectionOf(name, seg[0]);
    $$('[data-top]').forEach((a) => (a.dataset.active = String(a.dataset.top === top)));
    $('[data-sub]').innerHTML = top === 'gds' ? `<div class="page" style="padding-bottom:0"><nav class="subnav">${SUB.filter((s) => can(s[3])).map((s) => `<a class="iconic-tab-pill iconic-tab-pill--compact" data-active="${s[0] === sub}" href="${s[2]}"><span class="iconic-tab-pill__icon">${svg(s[0])}</span>${s[1]}</a>`).join('')}</nav></div>` : '';
    document.title = `${TOP.concat(SUB).find((x) => x[0] === (sub || top))?.[1] || 'Settings'} · ${G.operator?.app_name || 'GDS'}`;
    const el = $('[data-content]'); const my = ++routeSeq;
    if (!name) { el.innerHTML = '<div class="empty">You have no permissions yet. Ask your administrator.</div>'; return; }
    // Fresh container per navigation so delegated listeners never accumulate.
    const box = document.createElement('div'); box.innerHTML = '<div class="empty">Loading…</div>'; el.innerHTML = ''; el.appendChild(box);
    try { await G.screens[name](box, params); } catch (e) { if (my === routeSeq) box.innerHTML = `<div class="empty">⚠ ${esc(e.message)}</div>`; if (e.status !== 401) G.err(e); }
  }
  G.route = route;

  async function boot() {
    if (!localStorage.getItem('token')) return loginScreen();
    try { const me = await G.get('/auth/me'); G.user = me.user; G.operator = me.operator; G.roles = me.roles; }
    catch (e) { if (G.viewAs) { G.viewAs = ''; localStorage.removeItem('viewAs'); return boot(); } return loginScreen(); }
    shell(); alertsSince = null; unreadAlerts = [];
    await pollAlerts(); clearInterval(pollT); pollT = setInterval(pollAlerts, 30000);
    if (/^#\/?login/.test(location.hash)) location.hash = '#/';
    route();
  }
  window.addEventListener('hashchange', () => { if (!G.user) { if (localStorage.getItem('token')) boot(); else loginScreen(); } else route(); });
  boot();
})();
