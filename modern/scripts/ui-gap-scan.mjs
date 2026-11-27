// Gap scan: extract user-visible strings + action hooks from each legacy UI module and report those absent in modern/frontend/src.
import fs from "node:fs"; import path from "node:path";
const root = "D:/GDS";
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const modern = walk(`${root}/modern/frontend/src`).filter((f) => /\.(tsx?|css)$/.test(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
const M = norm(modern);
const skip = /^(true|false|null|undefined|none|auto|left|right|center|ok|bad|warn|get|post|put|delete|div|span|button|input|select|option|svg|path|json|utf-8|text\/.*|image\/.*|application\/.*)$/i;
const out = {}; let total = 0;
for (const f of fs.readdirSync(`${root}/public/js`).filter((f) => f.endsWith(".js"))) {
  const src = fs.readFileSync(`${root}/public/js/${f}`, "utf8");
  const found = new Set();
  // data-* hooks
  for (const m of src.matchAll(/data-([a-z0-9]+(?:-[a-z0-9]+)+)/g)) {
    const h = "data-" + m[1];
    const rendered = new RegExp(`<[^<>]*${h}(?![a-z0-9-])`).test(src) || new RegExp(`'${h}'|"${h}"`).test(src) && src.split(h).length > 2;
    if (rendered) found.add("[hook] " + h);
  }
  // visible strings: '…' or "…" or `…` without ${ containing a letter+space, 3..80 chars, not css/url
  for (const m of src.matchAll(/(['"`])((?:(?!\1)[^\\\n]){3,90})\1/g)) {
    const s = m[2].trim();
    if (!/[A-Za-z]{3}/.test(s) || /[<>{}=;]|\$\{|^\/|^\.|^#|https?:|\\|^[a-z0-9_.-]+$|^[a-z]+[A-Z]/.test(s) || skip.test(s)) continue;
    if (!/^[A-Z₹0-9]/.test(s) && !/ /.test(s)) continue;
    found.add(s);
  }
  // text between tags: >Label<
  for (const m of src.matchAll(/>([A-Z][A-Za-z0-9 &/.,:()'₹%+-]{2,60})</g)) found.add(m[1].trim());
  const miss = [...found].filter((s) => {
    const k = s.startsWith("[hook] ") ? s.slice(7) : s;
    return !M.includes(norm(k));
  });
  if (miss.length) { out[f] = miss; total += miss.length; }
}
fs.writeFileSync(`${process.env.TEMP}/ui-gaps.json`, JSON.stringify(out, null, 1));
for (const [f, m] of Object.entries(out).sort((a, b) => b[1].length - a[1].length)) console.log(String(m.length).padStart(4), f);
console.log("TOTAL", total);
