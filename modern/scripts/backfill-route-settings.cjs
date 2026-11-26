// One-off backfill: copies legacy route General-tab settings into routes.settings_json where still empty (never overwrites edits).
const d = require("../../data/db.json");
const K = ["hub", "business_rules", "call_settings", "escalation_contacts", "cabs", "assignments", "tags", "run_pattern"];
for (const r of d.routes) {
  const o = {};
  for (const k of K) if (r[k] != null) o[k] = r[k];
  const j = JSON.stringify(o).replace(/'/g, "''");
  console.log(`UPDATE routes SET settings_json='${j}'::jsonb WHERE id=${Number(r.id)} AND settings_json IS NULL AND tenant_id=(SELECT id FROM tenants WHERE code='demo');`);
}
