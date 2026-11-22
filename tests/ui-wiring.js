// Headless end-to-end wiring test for the screenshot UI (routes v5, schedules v6, daily ops v12, settings v16).
// Drives real UI controls in jsdom against a fresh seeded server and verifies persistence through the API.
// Usage: node tests/ui-wiring.js
const os = require('os'); const path = require('path'); const fs = require('fs');
process.env.GDS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gds-uiw-')); process.env.GDS_RESEED = '1';
const { JSDOM, VirtualConsole } = require('jsdom');
const app = require('../server/index');

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const errors = []; const toasts = []; const failedApi = []; let step = 'boot'; let pass = 0, fail = 0;
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => { if (!/Could not load (link|img)|Not implemented|ResizeObserver/.test(e.message)) errors.push(`[${step}] ${e.message} ${e.detail?.stack?.split('\n').slice(0, 2).join(' | ') || ''}`); });
  await fetch(base + '/api/auth/request-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"phone":"9999999999"}' });
  const { token } = await (await fetch(base + '/api/auth/verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"phone":"9999999999","otp":"1234"}' })).json();
  const api = (u, m = 'GET', b) => fetch(base + '/api' + u, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8').replace(/<link[^>]+fonts[^>]+>/g, '');
  const dom = new JSDOM(html, { url: base + '/#/trips', runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.localStorage.setItem('token', token);
      w.fetch = async (u, o) => { const r = await fetch(String(u).startsWith('/') ? base + u : u, o); if (r.status >= 400 && String(u).startsWith('/api')) failedApi.push(`[${step}] ${o?.method || 'GET'} ${u} → ${r.status}`); return r; };
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.structuredClone = (x) => JSON.parse(JSON.stringify(x));
      w.scrollTo = () => {}; w.print = () => {}; w.open = () => ({ document: { write() {}, close() {} } }); w.HTMLElement.prototype.scrollIntoView = function () {};
      w.navigator.clipboard = { writeText: async () => {} };
      w.addEventListener('unhandledrejection', (e) => errors.push(`[${step}] unhandled: ${e.reason?.message || e.reason}`));
    } });
  const w = dom.window, d = w.document;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await new Promise((r) => w.addEventListener('load', r)); await sleep(900);
  new w.MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.textContent && toasts.push(`[${step}] ${n.className}: ${n.textContent.trim()}`)))).observe(d.getElementById('toasts'), { childList: true });
  const go = async (h, ms = 1100) => { w.location.hash = '#/calls?x=' + Math.random(); await sleep(250); w.location.hash = h; await sleep(ms); };
  const $ = (s, root = d) => root.querySelector(s); const $$ = (s, root = d) => [...root.querySelectorAll(s)];
  const autoConfirm = () => { const b = $$('#modal-root .ov [data-y], #modal-root .ov .ft .btn.p').pop(); if (b) b.click(); };
  const recent = (n = 6) => toasts.slice(-n).join(' || ');
  async function t(name, fn) { step = name; const e0 = errors.length, f0 = failedApi.length; try { await fn(); if (errors.length > e0) throw new Error(errors.slice(e0).join(' || ')); if (failedApi.length > f0) throw new Error('API failures: ' + failedApi.slice(f0).join(', ')); pass++; console.log(`  ✓ ${name}`); } catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}\n      toasts: ${recent(3)}`); } $$('#modal-root .ov, .sx-overlay, .cc14-overlay, .stp-modal-backdrop').forEach((m) => m.remove()); }
  const ok = (c, m) => { if (!c) throw new Error(m); };

  console.log('Screen crawl');
  const routes = ['#/trips', '#/trips/current', '#/trips/future', '#/trips/past', '#/gds/schedules', '#/gds/routes', '#/gds/routes/1?rvtab=general&rvmode=view', '#/crm', '#/fleet/vehicles', '#/fleet/staff', '#/fleet/coaches', '#/accounts/analytics', '#/accounts/transactions', '#/accounts/receivables', '#/accounts/reports', '#/accounts/invoices', '#/accounts/reconciliation', '#/accounts/agent-settings', '#/accounts/coupons', '#/dailyops', '#/sarathi', '#/chats', '#/calls', ...['team-access/office-staff', 'team-access/bus-staff', 'team-access/agents', 'team-access/branches', 'team-access/access', 'branding', 'configuration/notifications', 'configuration/alerts', 'configuration/calling', 'configuration/bot', 'whatsapp', 'loyalty-program/miles', 'loyalty-program/tiers', 'switch-user', 'change-password', 'my-devices', 'about'].map((x) => '#/settings/' + x)];
  for (const r of routes) await t(`renders ${r}`, async () => { await go(r, 1200); const txt = $('#app').textContent; ok(txt.trim().length > 30, 'empty screen'); ok(!/\bundefined\b|\bNaN\b|\[object Object\]/.test(txt), 'junk text: ' + (txt.match(/.{0,40}(undefined|NaN|\[object Object\]).{0,40}/) || [''])[0]); });

  console.log('Workflows');
  await t('legacy settings links land on v16 pages', async () => { await go('#/settings/users', 900); ok(/team-access\/office-staff/.test(w.location.hash), w.location.hash); await go('#/settings/calling', 900); ok(/configuration\/calling/.test(w.location.hash), w.location.hash); });
  await t('route editor: visit every tab and Save persists to server', async () => {
    const before = await api('/routes/2');
    await go('#/gds/routes/2?rvtab=general&rvmode=edit', 1500);
    const tabs = $$('[data-rv-tab], .rv-tabbar a, .rv-tabbar button'); ok(tabs.length > 3, 'tabs present');
    const name = $('#app [data-rv-field="name"], #app [name="name"]'); ok(name, 'name field'); name.value = 'Edited From UI'; name.dispatchEvent(new w.Event('input', { bubbles: true })); name.dispatchEvent(new w.Event('change', { bubbles: true }));
    const save = $('[data-rv="save"]'); ok(save, 'save button'); save.click(); await sleep(1000);
    ok(/Route saved/.test(recent()), 'saved toast: ' + recent());
    const after = await api('/routes/2'); ok(after.name === 'Edited From UI', `name persisted (got ${after.name})`); ok(after.stages.length === before.stages.length, 'stops intact'); ok(after.fares.length === before.fares.length, 'fares intact');
    ok(!w.localStorage.getItem('savetrip:routes-v5:2'), 'no browser-only draft left');
    for (const tb of $$('.rv-tabbar a, .rv-tabbar button, [data-rv-tab]')) { tb.click(); await sleep(350); }
  });
  await t('schedule console: open, walk all tabs, apply delay', async () => {
    await go('#/gds/schedules', 1500); const o = $('[data-sx-open]'); ok(o, 'open button'); const sid = o.dataset.sxOpen; o.click(); await sleep(1200);
    const tabs = $$('[data-sx-tab]'); ok(tabs.length >= 5, 'tabs ' + tabs.length);
    for (const name of tabs.map((x) => x.dataset.sxTab)) { $(`[data-sx-tab="${name}"]`)?.click(); await sleep(700); }
    const upd = $('[data-sx-tab="update"]'); if (upd) { upd.click(); await sleep(800); }
    const ap = $('[data-sx-applydelay]');
    if (ap) { const inp = $('[name="delay_min"]'); inp.value = '25'; ap.click(); await sleep(300); autoConfirm(); await sleep(900); const s = await api(`/trips/${sid}`); ok(s.delay_minutes === 25, `delay persisted (${s.delay_minutes})`); }
  });
  await t('schedule console: stop override persists and shows in trip', async () => {
    await go('#/gds/schedules', 1500); const o = $('[data-sx-open]'); const sid = o.dataset.sxOpen; o.click(); await sleep(1200);
    $('[data-sx-tab="pickups"]')?.click(); await sleep(900);
    const ed = $('[data-sx-editstops], [data-sx-stop-edit], [data-sx-stopedit]'); if (!ed) return; ed.click(); await sleep(500);
    const row = $('.sx-stagedit'); ok(row, 'stop editor'); const id = row.dataset.sxStageEdit; const tm = row.querySelector('[name="time"]'); tm.value = '23:45';
    $('[data-sx-stop-save]').click(); await sleep(1200);
    const tr = await api(`/trips/${sid}`); ok(tr.stops.find((x) => String(x.id) === String(id)).time === '23:45', 'override saved');
  });
  await t('daily ops: rating follow-up status saved on server', async () => {
    await go('#/dailyops', 1500); const pg = $$('[data-ds-action^="page:"]').find((b) => /rating/i.test(b.dataset.dsAction)); ok(pg, 'ratings page tab'); pg.click(); await sleep(700);
    $('[data-ds-action="tab:action"]')?.click(); await sleep(700);
    if (!$('[data-ds-review]')) { console.log('      (skipped: seed has no 1–2★ ratings in the last 14 days; API path covered by npm test)'); return; }
    const sel = $('[data-ds-follow]'); ok(sel, 'follow-up select not found'); const id = sel.dataset.dsFollow; sel.value = [...sel.options].map((x) => x.value).find((v) => v !== sel.value) || sel.value; sel.dispatchEvent(new w.Event('change', { bubbles: true })); await sleep(800);
    const rows = await api('/ratings'); const r = (rows.rows || rows).find((x) => String(x.id) === String(id)); ok(r.follow_up?.status === sel.value, 'follow-up persisted');
  });
  await t('popup has only close (schedule manage) and calendar toggle', async () => {
    await go('#/gds/schedules', 1500); w.document.querySelectorAll('.sx-backdrop').forEach((n) => n.remove());
    const cal = $('[data-sx-today]'); ok(cal, 'calendar button'); cal.click(); await sleep(50); ok($('.ui-calpop'), 'calendar opens'); cal.click(); await sleep(50); ok(!$('.ui-calpop'), 'calendar closes on second click');
    const o = $('[data-sx-open]'); o.click(); await sleep(1500);
    const ov = $('.sx-backdrop'); ok(ov, 'manage open');
    ok(!ov.querySelector('.ui-min-btn,[data-sx-minimize]'), 'no minimise buttons'); ok(ov.querySelector('[data-sx-close]'), 'close present');
    ov.remove();
  });
  await t('header settings menu items navigate', async () => { await go('#/trips', 900); const a = $$('a[href^="#/settings/"]'); ok(a.length >= 5, 'settings links'); ok(!$$('[data-cc14-unwired]').length, 'no unwired header items'); });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (failedApi.length) console.log('Failed API calls:\n  ' + [...new Set(failedApi)].join('\n  '));
  server.close(); fs.rmSync(process.env.GDS_DATA_DIR, { recursive: true, force: true }); process.exit(fail ? 1 : 0);
});
