// node has.mjs <modern-rel-glob-dir> phrase... : counts case-insensitive occurrences of each phrase across modern/frontend/src (or a subfolder)
import fs from "node:fs"; import path from "node:path";
const [dir, ...terms] = process.argv.slice(2);
const base = path.join("D:/GDS/modern/frontend/src", dir === "." ? "" : dir);
const walk = (d) => fs.statSync(d).isFile() ? [d] : fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const text = walk(base).filter((f) => /\.(tsx?)$/.test(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n").toLowerCase();
for (const t of terms) console.log(String(text.split(t.toLowerCase()).length - 1).padStart(4), t);
