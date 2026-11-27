// Print short context for given phrases in a legacy file: node ctx.mjs file "phrase1" "phrase2" ...
import fs from "node:fs";
const [file, ...terms] = process.argv.slice(2);
const src = fs.readFileSync(`D:/GDS/public/js/${file}`, "utf8");
for (const t of terms) {
  const i = src.indexOf(t);
  if (i < 0) { console.log(`-- ${t}: NOT FOUND`); continue; }
  const n = src.split(t).length - 1;
  console.log(`-- ${t} (x${n}): ${src.slice(Math.max(0, i - 160), i + 120).replace(/\s+/g, " ")}`);
}
