'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const express=require('express');
const root=path.resolve(__dirname,'..');
const read=x=>fs.readFileSync(path.join(root,x),'utf8');
const C=require('../public/js/coach-2plus2-v47');
const D=require('../server/domain');
const layout=C.build();
const lower=layout.decks[0];

test('2+2 screenshot geometry: 48 numbered positions, 44 bookable seats and 4 fixtures',()=>{
 assert.equal(layout.capacity,44);
 assert.equal(layout.nominal_seater_positions,48);
 assert.deepEqual(C.layoutCounts(layout),{seaters:44,sleepers:0,capacity:44,nominal_seater_positions:48});
 assert.equal(layout.decks.length,1);
 assert.equal(lower.rows,12);assert.equal(lower.cols,5);
 assert.equal(lower.seats.length,44);
 assert.equal(lower.fixtures.length,4);
 assert.deepEqual(lower.seats.map(x=>x.code).slice(0,16),Array.from({length:16},(_,i)=>String(i+1)));
 const codes=new Set(lower.seats.map(s=>s.code));
 for(const missing of ['19','20','23','24'])assert.ok(!codes.has(missing));
 for(const have of ['1','18','21','22','25','26','27','28','29','30','45','46','47','48'])assert.ok(codes.has(have));
 assert.equal(C.isTarget({bus_type:'A/C Seater (2+2)',pattern:'2+2'}),true);
 assert.equal(C.isTarget({bus_type:'A/C Seater',pattern:'2+2'}),true);
 assert.equal(C.isTarget({name:'Pickup Van (2+2)',bus_type:'Non A/C Seater',pattern:'2+2'}),false);
 assert.equal(C.isTarget({bus_type:'A/C Seater/Sleeper',pattern:'2+2'}),false);
 assert.equal(C.isTarget({bus_type:'A/C Seater',pattern:'2+1'}),false);
 assert.equal(D.buildLayout({kind:'seater',pattern:'2+2'}).capacity,40,
  'Legacy generic 2+2 templates such as pickup vans must not change');
 assert.ok(C.validateLayout(layout));
});

test('exact seat coordinates, numbering, exit/toilet/roof/back fixtures, and 48 table entries',()=>{
 const rows=C.tableRows(layout);
 assert.equal(rows.length,48);
 assert.equal(rows.filter(x=>x.kind==='seat').length,44);
 assert.equal(rows.filter(x=>x.kind==='fixture').length,4);
 const get=id=>{const v=rows.find(x=>x.code===id);assert.ok(v,'missing '+id);return v};
 for(const [id,pos] of [
  ['1','R1C1Z0'],['2','R1C2Z0'],['3','R1C4Z0'],['4','R1C5Z0'],
  ['17','R5C1Z0'],['18','R5C2Z0'],['21','R6C1Z0'],['22','R6C2Z0'],
  ['25','R7C1Z0'],['26','R7C2Z0'],['27','R7C4Z0'],['28','R7C5Z0'],
  ['45','R12C1Z0'],['46','R12C2Z0'],['47','R12C4Z0'],['48','R12C5Z0'],
  ['Side Exit','R5C5Z0'],['Toilet','R6C4Z0, R6C5Z0'],
  ['Roof Exit','R8C3Z0'],['Back Exit','R12C3Z0']
 ])assert.equal(get(id).position,pos,id);
 assert.equal(get('Toilet').orientation,'Horizontal');
 assert.equal(get('Toilet').type,'WASH_ROOM');
 assert.equal(get('Side Exit').type,'EE_EXIT');
 assert.equal(get('Roof Exit').type,'ROOF_EXIT');
 assert.equal(get('Back Exit').type,'BACK_EXIT');
 assert.deepEqual(rows.slice(-4).map(x=>x.code),['Side Exit','Toilet','Roof Exit','Back Exit']);
 assert.deepEqual(rows.slice(-4).map(x=>x.deck),['LOWER','LOWER','LOWER','LOWER']);
});

test('reference 2+2 coach deck visual: 5 columns, actual 44 seats, SVG fixtures and seat states',()=>{
 const html=C.renderDiagram(layout);
 assert.equal((html.match(/data-layout-seat=/g)||[]).length,44);
 assert.equal((html.match(/data-cv47-fixture=/g)||[]).length,4);
 assert.match(html,/--cv47-cols:5;--cv47-rows:12/);
 assert.match(html,/LOWER deck/);
 assert.match(html,/Steering wheel/);
 assert.match(html,/Side Exit/);
 assert.match(html,/Toilet/);
 assert.match(html,/Roof Exit/);
 assert.match(html,/Back Exit/);
 assert.match(html,/cv47-toilet/);
 assert.match(html,/cv47-roof/);
 assert.match(html,/cv47-door/);
 assert.match(html,/grid-row:12 \/ span 1;grid-column:5 \/ span 1/);
 assert.ok(!html.includes('>19</b>'));
 assert.ok(!html.includes('>20</b>'));
 assert.ok(!html.includes('>23</b>'));
 assert.ok(!html.includes('>24</b>'));
 const selected=C.renderDiagram(layout,{selected:['0:0']});
 assert.ok(selected.includes('cv47-seat selected'));
 const fake=structuredClone(layout);
 fake.decks[0].seats[0].display_name='<script>alert(1)</script>';
 assert.ok(!C.renderDiagram(fake).includes('<script>'));
 assert.ok(C.renderDiagram(fake).includes('&lt;script&gt;'));
});

test('Add Seat, Remove Seat, fixture deletion, alias editing and geometry validation',()=>{
 const copy=structuredClone(layout);
 assert.throws(()=>C.addSeat(copy,{code:'1'}),/unique/);
 assert.throws(()=>C.addSeat(copy,{code:'80',type:'sleeper'}),/Only LOWER deck seater/);
 const oldSignature=C.structuralSignature(copy);
 copy.decks[0].seats[0].display_name='Seat 1 Premium';
 copy.decks[0].fixtures[0].display_name='Side Emergency Exit';
 assert.equal(C.structuralSignature(copy),oldSignature);
 assert.ok(C.validateLayout(copy));
 copy.decks[0].seats[1].display_name='Seat 1 Premium';
 assert.throws(()=>C.validateLayout(copy),/Display names must be unique/);
 delete copy.decks[0].seats[1].display_name;
 const taken=structuredClone(copy);
 taken.decks[0].fixtures[0].row=0;taken.decks[0].fixtures[0].col=0;
 assert.throws(()=>C.validateLayout(taken),/Overlapping/);
 const deleted=C.removeSeat(copy,'0:0');
 assert.equal(deleted.code,'1');assert.equal(copy.capacity,43);
 const added=C.addSeat(copy,{code:'49',type:'seater',deck:'LOWER'});
 assert.equal(added.code,'49');assert.equal(added.row,0);assert.equal(added.col,0);
 assert.equal(copy.capacity,44);
 copy.decks[0].fixtures.splice(3,1);
 assert.ok(C.validateLayout(copy));
 assert.ok(!C.renderDiagram(copy).includes('cv47-door'));
});

test('source-backed UI controls, scoped CSS, assets and preserved v46 + other coach flows',()=>{
 const ui=read('public/js/vehicles-parity-v9.js'),css=read('public/css/coach-2plus2-v47.css'),
  html=read('public/index.html'),api=read('server/api/master.js');
 new Function(ui);new Function(read('public/js/coach-2plus2-v47.js'));
 for(const label of ['Current Configuration','Layout:','Seaters:','Semi-Sleepers:','Sleepers:',
   'Generate Layout','Seat Configuration','Display Name (Editable)','Position (Grid)','Actions',
   'Male (Booked)','Female (Booked)','No-show','Available','Blocked','Selected',
   'Add Seat','Reset Names','Update Coach','Coach Type','Amenities','Seat Layout'])
  assert.ok(ui.includes(label),label);
 assert.ok(ui.includes("target22()?'2+2 (5 columns with gangway, max 16 rows)'"));
 assert.ok(ui.includes('counts.nominal_seater_positions'));
 assert.ok(ui.includes('if(targetCoach())'));
 assert.ok(ui.includes('coachHelper().validateLayout'));
 assert.ok(ui.includes('record.display_name=t.value'));
 assert.ok(ui.includes('cv47-horizontal'));
 for(const cl of ['.cv47-deck','.cv47-seat','.cv47-fixture','.cv47-toilet','.cv47-roof','.cv47-exit','.cv47-door',
   '.cv47-wheel','.cv47-grid','.cv47-editor','.cv47-target'])assert.ok(css.includes(cl),cl);
 assert.ok(html.includes('/css/coach-2plus2-v47.css?build=47'));
 assert.ok(html.indexOf('/js/coach-2plus1-v46.js?build=46')<
   html.indexOf('/js/coach-2plus2-v47.js?build=47'));
 assert.ok(html.indexOf('/js/coach-2plus2-v47.js?build=47')<
   html.indexOf('/js/vehicles-parity-v9.js?build=46'));
 assert.ok(api.includes('Coach22.validateLayout')||api.includes('futureHelper.validateLayout'));
 assert.ok(api.includes('Coach22.isTarget'));
 assert.ok(read('public/js/coach-2plus1-v46.js').includes('Coach21V46'));
});

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gds-2plus2-v47-'));
process.env.GDS_DATA_DIR=dir;
const db=require('../server/db');
const Auth=require('../server/auth');
require('../server/seed').seed();

test('authenticated API: 44-seat A/C creation, all four fixtures, alias saves, assigned guard and role enforcement',async t=>{
 const owner=db.col('users').find(x=>x.role==='owner');
 assert.ok(owner);
 let actor={id:owner.id,real_user_id:owner.id,role:'owner',permissions:Auth.roles().owner.permissions};
 const app=express();app.use(express.json({limit:'10mb'}));
 app.use('/api',(req,_res,next)=>{req.user=actor;next()});
 app.use('/api',require('../server/api/master'));
 const server=await new Promise(resolve=>{const sv=app.listen(0,'127.0.0.1',()=>resolve(sv))});
 t.after(async()=>{
  await new Promise(resolve=>server.close(resolve));
  await new Promise(resolve=>setTimeout(resolve,450));
  fs.rmSync(dir,{recursive:true,force:true});
 });
 const call=async(method,url,body)=>{
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+url,{
   method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)
  });return {status:r.status,data:await r.json()};
 };
 const pickup=db.col('coaches').find(c=>/Pickup Van/.test(c.name));
 assert.ok(pickup);
 assert.equal(pickup.layout.capacity,40,'Generic pickup van must remain the previous 40-seat layout');
 const created=await call('POST','/coaches',{name:'QA A/C Seater (2+2)',bus_type:'A/C Seater (2+2)',pattern:'2+2'});
 assert.equal(created.status,200);
 assert.equal(created.data.layout.capacity,44);
 assert.equal(created.data.layout.decks[0].fixtures.length,4);
 const id=created.data.id;
 const list=await call('GET','/coaches');
 assert.equal(list.status,200);
 assert.ok(list.data.coaches.some(x=>x.id===id&&x.capacity===44));
 const updated=structuredClone(created.data.layout);
 updated.decks[0].seats[0].display_name='Window Single';
 updated.decks[0].fixtures[1].display_name='Washroom';
 assert.equal((await call('PUT','/coaches/'+id,{layout:updated})).status,200);
 assert.equal(db.col('coaches').get(id).layout.decks[0].seats[0].code,'1');
 assert.equal(db.col('coaches').get(id).layout.decks[0].seats[0].display_name,'Window Single');
 const bad=structuredClone(updated);
 bad.decks[0].seats[1].display_name='Window Single';
 assert.equal((await call('PUT','/coaches/'+id,{layout:bad})).status,400);
 const overlapping=structuredClone(updated);
 overlapping.decks[0].fixtures[1].row=0;overlapping.decks[0].fixtures[1].col=0;
 assert.equal((await call('PUT','/coaches/'+id,{layout:overlapping})).status,400);
 // Simulate an in-use coach. Physical modifications must require an inventory migration.
 const assignedVehicle=db.col('vehicles').all()[0];
 assert.ok(assignedVehicle);
 db.col('vehicles').update(assignedVehicle.id,{coach_template_id:id});
 assert.equal((await call('PUT','/coaches/'+id,{layout:updated})).status,200,
  'Alias edits on assigned coaches should still be safe');
 const mutated=structuredClone(updated);
 mutated.decks[0].seats.pop();mutated.capacity=43;
 assert.equal((await call('PUT','/coaches/'+id,{layout:mutated})).status,409);
 assert.equal(db.col('coaches').get(id).layout.capacity,44);
 actor={...actor,permissions:['fleet.view']};
 assert.equal((await call('PUT','/coaches/'+id,{name:'Blocked edit'})).status,403);
});
