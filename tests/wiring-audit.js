// Static wiring audit: client API calls vs server routes, and rendered data-* hooks vs handlers.
// Usage: node tests/wiring-audit.js
const fs = require('fs'); const path = require('path');
const J = path.join(__dirname, '../public/js'); const S = path.join(__dirname, '../server');
const files = fs.readdirSync(J).filter((f) => f.endsWith('.js'));
const src = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(J, f), 'utf8')]));
const all = Object.values(src).join('\n');

// ---- server routes
const routes = [];
const walk = (d) => fs.readdirSync(d).forEach((f) => { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js')) {
  const s = fs.readFileSync(p, 'utf8'); for (const m of s.matchAll(/\b(?:r|router|app|pub|api)\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/g)) routes.push({ m: m[1] === 'delete' ? 'del' : m[1], p: m[3].replace(/^\/api/, ''), f });
} });
walk(S);
const toRe = (p) => new RegExp('^' + p.replace(/\/:[^/]+\?/g, '(?:/[^/]+)?').replace(/:[^/]+/g, '[^/]+').replace(/\*/g, '.*') + '/?$');
const rx = routes.map((r) => ({ ...r, re: toRe(r.p) }));

// ---- client calls
const missing = [];
for (const [f, s] of Object.entries(src)) {
  for (const m of s.matchAll(/\bG\.(get|post|put|patch|del)\(\s*(['"`])((?:(?!\2).)*)\2/g)) {
    let p = m[3].split('?')[0].replace(/\$\{[^}]*\}/g, 'X');
    if (!p.startsWith('/')) continue;
    if (/X$/.test(p) && m[2] === '`' && /\$\{[^}]*\}$/.test(m[3].split('?')[0]) && !p.endsWith('/X')) p = p.replace(/X$/, ''); // `${base}${q}` style
    const hit = rx.some((r) => (r.m === m[1] || (m[1] === 'patch' && r.m === 'put')) && r.re.test(p));
    if (!hit) missing.push(`${f}:${s.slice(0, m.index).split('\n').length}  ${m[1].toUpperCase()} ${m[3]}`);
  }
}
console.log(`Server routes: ${routes.length}\nClient API calls with NO matching server route (${missing.length}):`); missing.forEach((x) => console.log('  ' + x));

// ---- rendered hooks without a handler anywhere
const camel = (a) => a.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const dead = [];
for (const [f, s] of Object.entries(src)) {
  const attrs = new Set([...s.matchAll(/<[a-z][^<>]*?\b(data-[a-z0-9-]+)(?=[=\s>])/g)].map((m) => m[1]));
  for (const a of attrs) {
    const k = a.slice(5); const esc = a.replace(/[-]/g, '\\-');
    const used = new RegExp(`\\[${esc}(?:[\\]=~^$*|])|dataset\\.${camel(k)}\\b|dataset\\[['"]${camel(k)}['"]\\]|getAttribute\\(['"]${esc}['"]\\)|closest\\(['"][^'"]*${esc}|['"\`]${esc}['"\`]|['"]${camel(k)}['"]\\s+in\\b|\\.${camel(k)}\\b`).test(all);
    if (!used) dead.push(`${f}  ${a}`);
  }
}
console.log(`\nRendered data-* hooks never read by any script (${dead.length}):`); dead.forEach((x) => console.log('  ' + x));

// ---- buttons with no data-* hook, no id, no onclick and not type=submit
const bare = [];
for (const [f, s] of Object.entries(src)) for (const m of s.matchAll(/<button\b([^<>]*)>([^<]{0,40})/g)) {
  const at = m[1]; if (/data-|onclick|type=["']?submit|\bid=|\bname=/.test(at)) continue;
  bare.push(`${f}:${s.slice(0, m.index).split('\n').length}  <button${at.slice(0, 70)}> ${m[2].trim()}`);
}
console.log(`\nButtons with no hook (may be handled via class/position) (${bare.length}):`); bare.forEach((x) => console.log('  ' + x));
