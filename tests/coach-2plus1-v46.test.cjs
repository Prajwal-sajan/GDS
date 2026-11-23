'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const express=require('express');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const X=require('../public/js/coach-2plus1-v46');
const D=require('../server/domain');
const template=X.build();
const upper=template.decks[1],lower=template.decks[0];

test('reference geometry: 22 lower seaters + 6 lower sleepers + 18 upper sleepers = 46',()=>{
 assert.deepEqual(X.layoutCounts(template),{seaters:22,sleepers:24,capacity:46});
 assert.equal(lower.rows,12);assert.equal(lower.cols,4);
 assert.equal(upper.rows,12);assert.equal(upper.cols,4);
 assert.equal(lower.seats.length,28);assert.equal(upper.seats.length,18);
 assert.deepEqual(lower.seats.filter(x=>x.type==='sleeper').map(x=>x.code),['1L','2L','3L','4L','5L','6L']);
 assert.deepEqual(lower.seats.filter(x=>x.type==='seater').map(x=>x.code),Array.from({length:22},(_,i)=>String(i+1)));
 assert.deepEqual(upper.seats.slice(0,3).map(x=>x.code),['3U','2U','1U']);
 assert.deepEqual(upper.seats.slice(-3).map(x=>x.code),['18U','17U','16U']);
 assert.deepEqual(lower.fixtures.map(x=>x.name),['Back Exit']);
 assert.ok(X.validateLayout(template));
 assert.equal(D.buildLayout({kind:'seater_sleeper',pattern:'2+1'}).capacity,46);
 assert.equal(D.buildLayout({kind:'sleeper',pattern:'2+1'}).capacity,36);
});
test('exact grid coordinates / vertical two-cell berths / exit row',()=>{
 const rows=X.tableRows(template,['Back Exit']);
 assert.equal(rows.length,47);
 const lookup=key=>rows.find(x=>x.code===key);
 assert.equal(lookup('1L').position,'R1C1Z0, R2C1Z0');
 assert.equal(lookup('2L').position,'R3C1Z0, R4C1Z0');
 assert.equal(lookup('5L').position,'R9C1Z0, R10C1Z0');
 assert.equal(lookup('6L').position,'R11C1Z0, R12C1Z0');
 assert.equal(lookup('1').position,'R1C3Z0');
 assert.equal(lookup('2').position,'R1C4Z0');
 assert.equal(lookup('22').position,'R11C4Z0');
 assert.equal(lookup('3U').position,'R1C1Z1, R2C1Z1');
 assert.equal(lookup('2U').position,'R1C3Z1, R2C3Z1');
 assert.equal(lookup('1U').position,'R1C4Z1, R2C4Z1');
 assert.equal(lookup('18U').position,'R11C1Z1, R12C1Z1');
 assert.equal(lookup('17U').position,'R11C3Z1, R12C3Z1');
 assert.equal(lookup('16U').position,'R11C4Z1, R12C4Z1');
 assert.equal(rows[46].type,'BACK_EXIT');
 assert.equal(rows[46].position,'R12C2Z0');
 assert.equal(rows[46].kind,'fixture');
 assert.equal(rows.filter(x=>x.orientation==='Vertical').length,24);
});
test('diagram contains seat geometry, dashed available tiles, steering wheel, exit and 46 seats',()=>{
 const html=X.renderDiagram(template);
 assert.equal((html.match(/data-layout-seat=/g)||[]).length,46);
 assert.equal((html.match(/cv46-sleeper/g)||[]).length,24);
 assert.equal((html.match(/cv46-seater/g)||[]).length,22);
 assert.ok(html.includes('Steering wheel'));
 assert.ok(html.includes('Emergency exit'));assert.ok(html.includes('Back door'));
 assert.ok(html.includes('cv46-wheel'));
 assert.ok(html.includes('cv46-door'));
 assert.ok(html.includes('grid-row:1/span 2;grid-column:1/span 1'));
 assert.ok(html.includes('grid-row:1/span 1;grid-column:4/span 1'));
 const green=X.renderDiagram(template,{selected:['1:0']});
 assert.ok(green.includes('class="cv46-seat cv46-sleeper selected"'));
 const renamed=structuredClone(template);
 renamed.decks[0].seats[0].display_name='SINGLE-1';
 const diagram=X.renderDiagram(renamed);
 assert.ok(diagram.includes('SINGLE-1'));assert.ok(!diagram.includes('>1L</b>'));
});
test('existing 48-seat legacy layouts render safely without silently dropping seats',()=>{
 const old=structuredClone(template);
 for(const s of old.decks[0].seats){
  if(s.type==='sleeper')s.col=3;
  else s.col-=2;
 }
 for(const s of old.decks[1].seats){
  s.col=s.col===0?3:s.col===2?1:0;
 }
 for(let i=23;i<=24;i++)old.decks[0].seats.push({code:String(i),row:11,col:i===23?0:1,type:'seater',w:1,h:1});
 old.decks[0].fixtures=[];
 old.capacity=48;
 assert.equal(X.isLegacy(old),true);
 assert.equal(X.activeCount(old),48);
 assert.ok(X.validateLayout(old));
 const rows=X.tableRows(old,['Back Exit']);
 assert.equal(rows.length,49);
 assert.equal(rows.find(r=>r.code==='2L').position,'R3C1Z0, R4C1Z0');
 assert.equal(rows.find(r=>r.code==='3U').position,'R1C1Z1, R2C1Z1');
 assert.equal(rows.find(r=>r.code==='2U').position,'R1C3Z1, R2C3Z1');
 assert.equal(rows.find(r=>r.code==='1').position,'R1C3Z0');
 assert.equal((X.renderDiagram(old).match(/data-layout-seat=/g)||[]).length,48);
});
test('display names are aliases, not booking seat IDs; validate duplicates, overlap, and bad geometry',()=>{
 const a=structuredClone(template);
 const signature=X.structuralSignature(a);
 a.decks[0].seats[0].display_name='My sleeper';
 assert.equal(X.structuralSignature(a),signature);
 assert.ok(X.validateLayout(a));
 a.decks[0].seats[1].display_name='My sleeper';
 assert.throws(()=>X.validateLayout(a),/Display names must be unique/);
 a.decks[0].seats[1].display_name='Different';
 a.decks[0].seats[1].col=0;a.decks[0].seats[1].row=0;
 assert.throws(()=>X.validateLayout(a),/Overlapping seats/);
});
test('Add/Delete seat updates geometry safely and validates counts, fixtures and unique codes',()=>{
 const a=structuredClone(template);
 assert.throws(()=>X.addSeat(a,{deck:'LOWER',type:'seater',code:'1'}),/unique seat ID/);
 const removed=X.removeSeat(a,'0:6');
 assert.equal(removed.code,'1');assert.equal(a.capacity,45);
 const newSeat=X.addSeat(a,{deck:'LOWER',type:'seater',code:'25'});
 assert.equal(newSeat.col,2);assert.equal(newSeat.row,0);
 assert.equal(a.capacity,46);assert.ok(X.validateLayout(a));
 assert.throws(()=>X.addSeat(a,{deck:'UPPER',type:'seater',code:'99'}),/No free seater slot/);
});
test('no accidental changes outside coach editor or other coach category',()=>{
 const html=read('public/index.html');
 const vehicles=read('public/js/vehicles-parity-v9.js');
 const css=read('public/css/coach-2plus1-v46.css');
 const backend=read('server/api/master.js');
 for(const text of ['Current Configuration','Generate Layout','Available','Male (Booked)','Female (Booked)',
   'Blocked','No-show','Selected','Seat Configuration','Display Name (Editable)','Type','Deck',
   'Orientation','Position (Grid)','Actions','Add Seat','Reset Names','Update Coach',
   'Coach Type','Amenities','Seat Layout','Search by seat ID or type'])assert.ok(vehicles.includes(text),'missing '+text);
 for(const value of ['cv46-decks','cv46-seat','cv46-seat-table','cv46-kind','cv46-orientation','cv46-remove','cv46-summary',
   'cv46-config-head','cv46-legend','cv46-diagram'])assert.ok(css.includes(value),value);
 assert.ok(css.includes('.vp-overlay-coach'));
 assert.ok(html.indexOf('coach-2plus1-v46.js?build=46')<html.indexOf('vehicles-parity-v9.js?build=46'));
 assert.ok(html.includes('coach-2plus1-v46.css?build=46'));
 assert.ok(vehicles.includes('record.display_name=t.value'));
 assert.ok(vehicles.includes('if(target21())'));
 assert.ok(backend.includes('Coach21.validateLayout'));
 assert.ok(backend.includes('Coach21.structuralSignature'));
 assert.equal(X.isTarget({bus_type:'A/C Seater/Sleeper (2+1)',pattern:'2+1'}),true);
 assert.equal(X.isTarget({bus_type:'A/C Sleeper (2+1)',pattern:'2+1'}),false);
 assert.equal(X.isTarget({bus_type:'A/C Seater/Sleeper (2+2)',pattern:'2+2'}),false);
 new Function(vehicles);new Function(read('server/api/master.js'));
});

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gds-coach-v46-'));
process.env.GDS_DATA_DIR=dir;
const db=require('../server/db');
const Auth=require('../server/auth');
require('../server/seed').seed();
test('API: CRUD, alias persistence, assigned-seat safety, geometry validation and RBAC',async t=>{
 const owner=db.col('users').find(u=>u.role==='owner');
 assert.ok(owner);
 const permissions=Auth.roles().owner.permissions;
 let actor={id:owner.id,real_user_id:owner.id,role:'owner',permissions};
 const app=express();
 app.use(express.json({limit:'10mb'}));
 app.use('/api',(req,res,next)=>{req.user=actor;next()});
 app.use('/api',require('../server/api/master'));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 t.after(async()=>{
  await new Promise(resolve=>server.close(resolve));
  await new Promise(resolve=>setTimeout(resolve,420));
  fs.rmSync(dir,{recursive:true,force:true});
 });
 const base='http://127.0.0.1:'+server.address().port+'/api';
 const call=async(method,url,body)=>{
  const res=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},
   body:body===undefined?undefined:JSON.stringify(body)});
  return{status:res.status,body:await res.json()};
 };
 const coach=db.col('coaches').find(c=>X.isTarget(c));
 assert.ok(coach);
 assert.equal(coach.layout.capacity,46);
 const rec=await call('GET','/coaches');
 assert.equal(rec.status,200);
 assert.ok(rec.body.coaches.some(c=>c.id===coach.id&&c.capacity===46));
 const assigned=db.col('vehicles').count(v=>String(v.coach_template_id)===String(coach.id));
 assert.ok(assigned>0,'Seed coach is assigned');
 const labeled=structuredClone(coach.layout);
 const first=labeled.decks[0].seats[0];
 const oldCode=first.code;
 first.display_name='Lower Single Display';
 const ok=await call('PUT','/coaches/'+coach.id,{layout:labeled});
 assert.equal(ok.status,200);
 assert.equal(db.col('coaches').get(coach.id).layout.decks[0].seats[0].code,oldCode);
 assert.equal(db.col('coaches').get(coach.id).layout.decks[0].seats[0].display_name,'Lower Single Display');
 const structural=structuredClone(labeled);
 structural.decks[0].seats.pop();structural.capacity-=1;
 const denied=await call('PUT','/coaches/'+coach.id,{layout:structural});
 assert.equal(denied.status,409);
 assert.equal(db.col('coaches').get(coach.id).layout.capacity,46);
 const duplicate=structuredClone(labeled);
 duplicate.decks[0].seats[1].display_name='Lower Single Display';
 assert.equal((await call('PUT','/coaches/'+coach.id,{layout:duplicate})).status,400);
 const created=await call('POST','/coaches',{
  name:'QA New 2+1',bus_type:'A/C Seater/Sleeper (2+1)',pattern:'2+1',layout:X.build(),
  emergency_exits:['Back Exit']
 });
 assert.equal(created.status,200);assert.equal(created.body.layout.capacity,46);
 const free=structuredClone(created.body.layout);
 X.removeSeat(free,'0:6');
 assert.equal((await call('PUT','/coaches/'+created.body.id,{layout:free})).status,200);
 const saved=db.col('coaches').get(created.body.id);
 assert.equal(saved.layout.capacity,45);
 actor={...actor,permissions:['fleet.view']};
 const forbidden=await call('PUT','/coaches/'+created.body.id,{name:'Unauthorized'});
 assert.equal(forbidden.status,403);
});
