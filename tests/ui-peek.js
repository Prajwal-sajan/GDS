// Dev helper: render one hash route headlessly and print its text / html.
// Usage: node tests/ui-peek.js "#/trips/current" [selector] [--html]
const os = require('os'); const path = require('path'); const fs = require('fs');
process.env.GDS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gds-peek-')); process.env.GDS_RESEED = '1';
const { JSDOM, VirtualConsole } = require('jsdom');
const app = require('../server/index');
const [hash = '#/trips', sel = '#app'] = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const HTML = process.argv.includes('--html');
const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => console.log('ERR', e.message, e.detail?.stack?.split('\n').slice(0, 3).join(' | ') || '')); vc.on('error', (...a) => console.log('console.error', ...a));
  await fetch(base + '/api/auth/request-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"phone":"9999999999"}' });
  const { token } = await (await fetch(base + '/api/auth/verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"phone":"9999999999","otp":"1234"}' })).json();
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8').replace(/<link[^>]+fonts[^>]+>/g, '');
  const dom = new JSDOM(html, { url: base + '/' + hash, runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { w.localStorage.setItem('token', token); w.fetch = (u, o) => fetch(String(u).startsWith('/') ? base + u : u, o); w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }); w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {}; } });
  await new Promise((r) => dom.window.addEventListener('load', r)); await new Promise((r) => setTimeout(r, 1500));
  const el = dom.window.document.querySelector(sel);
  console.log(el ? (HTML ? el.outerHTML : el.textContent.replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ')).slice(0, 6000) : 'NO MATCH');
  server.close(); process.exit(0);
});
