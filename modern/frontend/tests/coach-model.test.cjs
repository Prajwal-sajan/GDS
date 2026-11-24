"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const raw=fs.readFileSync(path.join(__dirname,"../src/features/coaches/coachModel.ts"),"utf8");
const commonJs=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function("module","exports",commonJs)(mod,mod.exports);
const {buildReferenceCoach,coachCount,checkCoachDraft,addSeatAtVacancy,
  structuralSignature,formatPosition}=mod.exports;
test("2+1 v46 exact 46: 22 lower seaters, 6 lower sleepers and 18 upper sleepers",()=>{
  const d=buildReferenceCoach("2+1"),c=coachCount(d);
  assert.deepEqual(c,{seaters:22,sleepers:24,total:46,upper:18});
  for(let i=1;i<=6;i++)assert.deepEqual(
    [d.seats.find(s=>s.code===String(i)+"L").row,d.seats.find(s=>s.code===String(i)+"L").col],[2*(i-1),0]);
  assert.equal(d.seats.find(s=>s.code==="3U").col,0);
  assert.equal(d.seats.find(s=>s.code==="2U").col,2);
  assert.equal(d.seats.find(s=>s.code==="1U").col,3);
  assert.equal(d.fixtures.length,1);
  assert.equal(d.fixtures[0].code,"Back Exit");
  assert.equal(formatPosition(d.seats.find(s=>s.code==="2L"),"LOWER"),"R3C1Z0, R4C1Z0");
  assert.doesNotThrow(()=>checkCoachDraft(d));
});
test("2+2 v47 48 numbered envelope omits 4 safety positions; 44 passenger seats and 4 fixtures",()=>{
  const d=buildReferenceCoach("2+2");
  assert.equal(d.seats.length,44);assert.equal(d.fixtures.length,4);
  assert.equal(d.nominalSeaterPositions,48);
  for(const id of ["19","20","23","24"])assert.equal(d.seats.some(s=>s.code===id),false);
  assert.equal(d.seats.find(s=>s.code==="17").col,0);
  assert.equal(d.seats.find(s=>s.code==="21").row,5);
  assert.deepEqual(d.fixtures.map(x=>[x.code,x.row,x.col,x.width]),[
    ["Side Exit",4,4,1],["Toilet",5,3,2],["Roof Exit",7,2,1],["Back Exit",11,2,1]
  ]);
  assert.doesNotThrow(()=>checkCoachDraft(d));
});
test("no duplicate seat aliases or overlaps, no toilet/door safety clearance",()=>{
  const d=buildReferenceCoach("2+2");
  d.seats[1].displayName=d.seats[0].displayName;
  assert.throws(()=>checkCoachDraft(d),/Duplicate/);
  d.seats[1].displayName="2";
  d.seats[1].row=d.seats[0].row;d.seats[1].col=d.seats[0].col;
  assert.throws(()=>checkCoachDraft(d),/Overlapping/);
  const next=buildReferenceCoach("2+2");
  next.seats[0].row=4;next.seats[0].col=3;
  assert.throws(()=>checkCoachDraft(next),/clearance/);
});
test("add seat uses free cell, preserves original codes and cannot overlap fixture",()=>{
  const d=buildReferenceCoach("2+2");
  const next=addSeatAtVacancy(d,"A49","LOWER","seater");
  assert.equal(next.seats.length,45);assert.equal(d.seats.length,44);
  assert.equal(next.fixtures.length,4);
  assert.equal(next.seats.some(s=>s.code==="A49"),true);
  assert.doesNotThrow(()=>checkCoachDraft(next));
  assert.throws(()=>addSeatAtVacancy(d,"1","LOWER","seater"),/exists/);
  assert.throws(()=>addSeatAtVacancy(d,"A49","UPPER","seater"),/lower-deck/);
});
test("alias editing preserves immutable booked seat identity in structural signature",()=>{
  const d=buildReferenceCoach("2+1"),sig=structuralSignature(d);
  d.seats[0].displayName="Sleeper One";
  d.fixtures[0].displayName="Rear Door";
  assert.equal(structuralSignature(d),sig);
  assert.doesNotThrow(()=>checkCoachDraft(d));
  d.seats[0].code="CHANGED";
  assert.notEqual(structuralSignature(d),sig);
});
test("old 2+1 stored coordinates can be validated without physically modifying source",()=>{
  const d=buildReferenceCoach("2+1");
  d.seats=d.seats.map(s=>{
    if(s.deck==="LOWER"&&s.seatType==="sleeper")return {...s,col:3};
    if(s.deck==="LOWER"&&s.seatType==="seater")return {...s,col:s.col-2};
    if(s.deck==="UPPER")return {...s,col:s.col===0?3:s.col===2?1:0};
    return s;
  });
  assert.equal(d.seats.find(s=>s.code==="1L").col,3);
  assert.doesNotThrow(()=>checkCoachDraft(d));
  assert.equal(d.seats.find(s=>s.code==="1L").col,3,"projection must not mutate stored coordinate");
});
