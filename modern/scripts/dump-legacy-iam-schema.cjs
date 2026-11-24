// Dumps the legacy Team & access data model (pure data from server/auth.js and the team-access schema / policy modules)
// into JSON embedded by the .NET API, so the role matrix, catalogue and rule templates stay byte-identical to legacy.
// Usage (repo root): node modern/scripts/dump-legacy-iam-schema.cjs
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "../..");
const A = require(path.join(root, "server/auth.js"));
const S = require(path.join(root, "server/team-access-schema-v27.js"));
const P = require(path.join(root, "server/team-access-policy-v28.js"));
const V29 = require(path.join(root, "server/team-access-situation-v29.js"));
const out = {
  catalog: A.CATALOG,
  default_roles: A.DEFAULT_ROLES,
  matrix: S.ROWS,
  role_columns: S.ROLE_COLUMNS,
  role_descriptions: S.ROLE_DESCRIPTIONS,
  role_hues: S.ROLE_HUES,
  limit_fields: S.LIMIT_FIELDS,
  legacy_for: S.legacyFor,
  rule_templates: P.RULE_TEMPLATES,
  read_only: [...P.READ_ONLY],
  situation_fields: V29.FIELDS,
};
const file = path.join(root, "modern/backend/src/JourneyOS.Api/Settings/legacy-iam-schema.json");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
console.log("wrote", file);
