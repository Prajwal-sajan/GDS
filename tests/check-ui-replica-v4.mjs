import fs from 'node:fs';
import assert from 'node:assert/strict';
const ui=fs.readFileSync('public/js/savetrip-visual.js','utf8');
const css=fs.readFileSync('public/css/savetrip-visual.css','utf8');
for(const x of ['svRuleBuilder','svDetailedHealth','svAppendDraft','coach-layout','route-stops','fare-rules','route-tags','svAppendDraft(','svForm','save-fare-rule','add-via','upload-via']) assert.ok(ui.includes(x),`Missing: ${x}`);
for(const x of ['.sv-rule-seats','.sv-health-grid','.sv-vitals','.sv-expanded-modal']) assert.ok(css.includes(x),`Missing CSS: ${x}`);
assert.ok(ui.includes('2026-11-21-ui-replica-v4'));
assert.ok(!ui.includes('G.toast(\'Layout regeneration requires confirmation'));
console.log('PASS: interactive UI preview additions and styles');
