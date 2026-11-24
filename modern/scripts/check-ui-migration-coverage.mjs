#!/usr/bin/env node
/** End-to-end screenshot feature accounting: no untracked features or false verification. */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root=process.cwd();
const csv=readFileSync(resolve(root,"SCREENSHOT_FEATURE_RECONCILIATION.csv"),"utf8");
const manifest=JSON.parse(readFileSync(resolve(root,"modern/ui-feature-evidence.json"),"utf8"));
const errors=[];
function parseCsv(value){
  const rows=[];let cells=[],cell="",quoted=false;
  for(let i=0;i<value.length;i++){
    const c=value[i];
    if(c==='"'){
      if(quoted&&value[i+1]==='"'){cell+='"';i++;}
      else quoted=!quoted;
    }else if(c===','&&!quoted){cells.push(cell);cell="";}
    else if((c==='\n'||c==='\r')&&!quoted){
      if(c==='\r'&&value[i+1]==='\n')i++;
      cells.push(cell);cell="";
      if(cells.some(x=>x!==""))rows.push(cells);
      cells=[];
    }else cell+=c;
  }
  if(quoted)throw new Error("Unclosed CSV string");
  if(cell||cells.length){cells.push(cell);rows.push(cells);}
  return rows;
}
const rows=parseCsv(csv);
const header=rows.shift();
if(JSON.stringify(header)!==JSON.stringify(["index","module","feature","status","evidence"]))
  errors.push("Unexpected legacy screenshot coverage CSV structure");
const ids=new Set();
const statusCounts=new Map();
const byModule=new Map();
let verified=0,implemented=0,partial=0,unmapped=0;
for(const row of rows){
  const id=Number(row[0]);
  if(!Number.isInteger(id)||id<0||ids.has(id))errors.push("Duplicate or invalid feature index: "+row[0]);
  ids.add(id);
  const module=row[1],feature=row[2],e=manifest.features[String(id)];
  statusCounts.set(row[3],(statusCounts.get(row[3])??0)+1);
  if(!byModule.has(module))byModule.set(module,{total:0,verified:0,tracked:0});
  byModule.get(module).total++;
  if(!e){unmapped++;continue;}
  byModule.get(module).tracked++;
  if(!["partial","implemented","verified"].includes(e.status))errors.push(id+": invalid modern status");
  if(!Array.isArray(e.files)||e.files.length===0)errors.push(id+": missing code or workflow evidence");
  for(const name of e.files??[]){
    if(!name.startsWith("modern/")||name.includes("..")||!existsSync(resolve(root,name)))
      errors.push(id+": unresolvable evidence file "+name);
  }
  if(e.status==="verified"){
    verified++;byModule.get(module).verified++;
    if(!Array.isArray(e.screenshotEvidence)||e.screenshotEvidence.length===0)
      errors.push(id+": visual-parity verified but no screenshot comparison evidence");
    for(const name of e.screenshotEvidence??[])
      if(!name.startsWith("modern/")||name.includes("..")||!existsSync(resolve(root,name)))
        errors.push(id+": unresolvable screenshot comparison "+name);
  }else if(e.status==="implemented")implemented++;
  else partial++;
  if(!feature)errors.push(id+": empty feature description");
}
for(const id of Object.keys(manifest.features||{}))if(!ids.has(Number(id)))errors.push("Unknown feature in evidence register: "+id);
if(manifest.schema!==1)errors.push("Unknown evidence schema");
if(rows.length!==145)errors.push("Legacy screenshot-feature count changed: expected 145, got "+rows.length+"; reconcile before release");
console.log("JourneyOS full screenshot feature coverage");
console.log("Total reference features:",rows.length);
console.log("Independently screenshot-verified:",verified);
console.log("Code implemented, screenshot parity still unverified:",implemented);
console.log("Partial UI coverage:",partial);
console.log("Unmapped/unverified:",unmapped);
for(const [name,info] of byModule)console.log(name+": "+info.tracked+"/"+info.total+" tracked, "+info.verified+" visually verified");
if(process.argv.includes("--release")&&verified!==rows.length)
  errors.push("Full UI release blocked: "+(rows.length-verified)+" screenshot features lack independent visual sign-off");
if(errors.length){
  for(const error of errors)console.error("ERROR:",error);
  process.exit(1);
}
if(verified!==rows.length)
  console.log("NOT CERTIFIED: feature register validates its own evidence, but migration/visual parity remains incomplete.");
else console.log("All screenshot features verified; independent platform release-readiness checks remain required.");
