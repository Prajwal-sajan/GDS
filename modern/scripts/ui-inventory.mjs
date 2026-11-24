#!/usr/bin/env node
// Generates the UI parity inventory from REAL sources — never hand-edited output:
//   * docs/modernization/qa/legacy/views.json + states.json  (rendered legacy UI, captured by legacy-capture.mjs)
//   * server/**/*.js                                          (legacy Node API surface)
//   * modern/backend/src/**/*.cs                              (ASP.NET Core API surface)
//   * docs/modernization/ui-parity-status.json                (the ONLY hand-maintained input: per-view status + evidence)
// Outputs UI_PARITY_MASTER_MATRIX.md, UI_COMPONENT_INVENTORY.csv, UI_WORKFLOW_MATRIX.csv.
// Usage: node modern/scripts/ui-inventory.mjs   (from D:\GDS)
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "../..");
const DOCS = path.join(ROOT, "docs/modernization");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const walk = (dir, ext) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  if (d.isDirectory()) return ["node_modules", "bin", "obj", "Migrations"].includes(d.name) ? [] : walk(p, ext);
  return p.endsWith(ext) ? [p] : [];
});
const csv = (rows) => rows.map((r) => r.map((v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\n") + "\n";
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, "/");

const views = read("docs/modernization/qa/legacy/views.json");
const states = read("docs/modernization/qa/legacy/states.json");
const status = read("docs/modernization/ui-parity-status.json");
const STATUSES = ["NOT_STARTED", "IMPLEMENTED_UNVERIFIED", "FUNCTIONAL_PASS", "VISUAL_PASS", "VERIFIED_COMPLETE", "BLOCKED"];

// ---- legacy API surface
const legacyApi = [];
for (const f of walk(path.join(ROOT, "server"), ".js")) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/\b(?:app|router|r)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)/g)) {
    const line = src.slice(0, m.index).split("\n").length;
    legacyApi.push({ method: m[1].toUpperCase(), path: m[2], src: `${rel(f)}:${line}` });
  }
}
// ---- .NET API surface (group prefixes resolved per file, in order of appearance)
const netApi = [];
for (const f of walk(path.join(ROOT, "modern/backend/src"), ".cs")) {
  const src = fs.readFileSync(f, "utf8");
  const groups = []; // [{indent var, prefix}]
  for (const m of src.matchAll(/(?:var\s+(\w+)\s*=\s*([\w.]+)\.MapGroup\("([^"]*)"\))|(?:(\w+)\.Map(Get|Post|Put|Delete|Patch)\("([^"]*)")/g)) {
    if (m[1]) { const parent = groups.find((g) => g.name === m[2].split(".")[0]); groups.unshift({ name: m[1], prefix: (parent?.prefix ?? "") + m[3] }); continue; }
    const g = groups.find((x) => x.name === m[4]);
    const line = src.slice(0, m.index).split("\n").length;
    netApi.push({ method: m[5].toUpperCase(), path: (g?.prefix ?? "") + m[6], src: `${rel(f)}:${line}` });
  }
}
const apiMap = status.apiMap ?? {};

// ---- per-view rows
const viewRows = views.views.map((v) => {
  const s = status.views[v.hash] ?? { status: "NOT_STARTED" };
  if (!STATUSES.includes(s.status)) throw new Error(`Bad status ${s.status} for ${v.hash}`);
  const st = states.states.filter((x) => x.view === v.id);
  const interactive = v.elements.filter((e) => ["button", "a", "input", "select", "textarea"].includes(e.tag) && e.zone !== "header");
  return { ...v, s, st, interactive };
});

// ---- UI_COMPONENT_INVENTORY.csv: one row per rendered interactive element of every legacy view
const comp = [["element_id", "view_id", "legacy_hash", "zone", "tag", "type", "label", "data_attrs", "href", "disabled", "legacy_screenshot", "view_status", "react_route"]];
const seen = new Set();
for (const v of viewRows) {
  let n = 0;
  for (const e of v.elements) {
    // Header/subnav are shared: inventory them once (under the first view) so counts are not inflated 49x.
    const shared = e.zone === "header" || e.zone === "subnav";
    const key = `${e.zone}|${e.tag}|${e.label}|${e.data}|${e.href}`;
    if (shared) { if (seen.has(key)) continue; seen.add(key); }
    comp.push([`${shared ? "SHELL" : v.id}-E${String(++n).padStart(3, "0")}`, shared ? "SHELL" : v.id, v.hash, e.zone, e.tag, e.type, e.label, e.data, e.href, e.disabled, v.screenshot, shared ? (status.shell?.status ?? "NOT_STARTED") : v.s.status, v.s.react ?? ""]);
  }
}
fs.writeFileSync(path.join(DOCS, "UI_COMPONENT_INVENTORY.csv"), csv(comp));

// ---- UI_WORKFLOW_MATRIX.csv: legacy endpoint -> UI views that call it -> .NET equivalent
const callers = {};
for (const v of viewRows) for (const a of v.api) (callers[a] ??= new Set()).add(v.id);
for (const s of states.states) for (const a of s.api) (callers[a] ??= new Set()).add(`${s.view}/${s.id}`);
const norm = (p) => p.replace(/^\/api/, "").replace(/:\w+/g, ":id");
const wf = [["workflow_id", "legacy_method", "legacy_path", "legacy_source", "called_by_ui (views/states)", "dotnet_equivalent", "dotnet_source", "status"]];
legacyApi.forEach((l, i) => {
  const k = `${l.method} ${l.path}`;
  const ui = [...(callers[`${l.method} /api${norm(l.path)}`] ?? callers[`${l.method} ${norm(l.path)}`] ?? [])].join(" ");
  const m = apiMap[k];
  const net = m ? netApi.find((n) => `${n.method} ${n.path}` === m.net) : undefined;
  if (m && !net) throw new Error(`apiMap ${k} -> ${m.net} does not exist in .NET source`);
  wf.push([`W${String(i + 1).padStart(3, "0")}`, l.method, l.path, l.src, ui, m?.net ?? "", net?.src ?? "", m?.status ?? "NOT_STARTED"]);
});
fs.writeFileSync(path.join(DOCS, "UI_WORKFLOW_MATRIX.csv"), csv(wf));

// ---- UI_PARITY_MASTER_MATRIX.md
const count = (arr, f) => STATUSES.map((s) => `${s}: ${arr.filter((x) => f(x) === s).length}`).join(" · ");
const wfRows = wf.slice(1);
const md = [];
md.push("# UI parity master matrix", "",
  "> **Generated** by `node modern/scripts/ui-inventory.mjs` from the captured legacy UI (`docs/modernization/qa/legacy/`), the legacy Node routes,",
  "> the ASP.NET Core endpoints and `docs/modernization/ui-parity-status.json`. Do not edit by hand — change the status file and regenerate.", "",
  `Legacy capture: ${views.capturedAt} · ${views.base} · ${views.viewport}. Views: **${viewRows.length}**, captured interaction states: **${states.states.length}**, `
  + `inventoried elements: **${comp.length - 1}**, legacy API endpoints: **${legacyApi.length}**, .NET endpoints: **${netApi.length}**.`, "",
  "## Totals (reproducible from this inventory)", "",
  `- Views — ${count(viewRows, (v) => v.s.status)}`,
  `- Shell (header/nav) — ${status.shell?.status ?? "NOT_STARTED"}`,
  `- Legacy endpoints — ${count(wfRows, (r) => r[7])}`, "",
  "A view is only VERIFIED_COMPLETE when functional *and* visual evidence (against the legacy capture, not a React self-baseline) is recorded below.", "",
  "## Shell", "", `- Status: **${status.shell?.status ?? "NOT_STARTED"}**`, ...(status.shell?.evidence ?? []).map((e) => `- Evidence: ${e}`), "",
  "## Views", "",
  "| ID | Legacy route | Elements (non-header) | States | Legacy API | Status | React | Evidence / gaps |",
  "|---|---|---:|---:|---|---|---|---|");
for (const v of viewRows) {
  md.push(`| ${v.id} | \`${v.hash}\` | ${v.interactive.length} | ${v.st.length} | ${v.api.map((a) => `\`${a}\``).join("<br>") || "—"} | ${v.s.status} | ${v.s.react ? `\`${v.s.react}\`` : "—"} | ${[...(v.s.evidence ?? []), ...(v.s.gaps ?? []).map((g) => `GAP: ${g}`)].join("<br>") || "—"} |`);
}
md.push("", "## Coverage limits of this inventory", "",
  "- Elements are those rendered on each view's initial load at 1440×900 plus the captured interaction states; nested dialogs that need multi-step data (e.g. a specific booking) are only listed where `states.json` captured them.",
  "- Legacy endpoints not called by any captured view are still listed in `UI_WORKFLOW_MATRIX.csv` (column `called_by_ui` empty).", "");
fs.writeFileSync(path.join(DOCS, "UI_PARITY_MASTER_MATRIX.md"), md.join("\n"));
console.log(`views=${viewRows.length} elements=${comp.length - 1} legacyApi=${legacyApi.length} netApi=${netApi.length} mapped=${Object.keys(apiMap).length}`);
