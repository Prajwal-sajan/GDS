#!/usr/bin/env node
/**
 * Fail-closed production cutover guard. It is intentionally not a substitute
 * for independently verified approvals, but prevents a clean build being
 * mistaken for complete functional, visual and operational readiness.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const data=JSON.parse(readFileSync(resolve("modern/release-readiness.json"),"utf8"));
const problems=[];
if(data.schema!==1)problems.push("Unknown release-readiness manifest schema");
if(data.releaseAllowed!==true)problems.push("Release authorization is not signed off");
for(const item of data.modules||[]){
  if(item.status!=="verified")problems.push("Module "+item.id+": functional "+item.status);
  if(item.visualParity!=="verified")problems.push("Module "+item.id+": visual parity "+item.visualParity);
  if(!Array.isArray(item.workflowEvidence)||item.workflowEvidence.length<1)
    problems.push("Module "+item.id+": no end-to-end workflow evidence");
  if(!Array.isArray(item.screenshotEvidence)||item.screenshotEvidence.length<1)
    problems.push("Module "+item.id+": no independent legacy screenshot evidence");
}
for(const item of data.platform||[]){
  if(item.status!=="verified")problems.push("Platform "+item.id+": "+item.status);
  if(!Array.isArray(item.evidence)||item.evidence.length<1)
    problems.push("Platform "+item.id+": no independent acceptance evidence");
}
if((data.modules||[]).length<15)problems.push("Incomplete module inventory");
if((data.platform||[]).length<10)problems.push("Incomplete platform safety inventory");
console.log("JourneyOS production-readiness gate");
console.log("Modules:",data.modules.length,"Platform gates:",data.platform.length);
console.log("Unmet release gates:",problems.length);
for(const p of problems)console.log("BLOCKED:",p);
if(problems.length){
  console.error("NOT CERTIFIED: keep the legacy application available and do not enable production cutover.");
  process.exit(1);
}
console.log("Manifest complete. Independent release manager must still verify the supplied evidence and sign off.");
