'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const test=require('node:test');
const ts=require('typescript');
const file=fs.readFileSync(path.join(__dirname,'../src/features/schedules/seatLayoutModel.ts'),'utf8');
const output=ts.transpileModule(file,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function('module','exports',output)(mod,mod.exports);
const {visualStatus,physicalGeometry,groupDecks,seatPosterSvg,titleFor,formatDate,validateLayout}=mod.exports;
function layout(){
 const seats=[];
 const at=(deck,seatCode,row,col,seatType,length=1,state='available',gender=null)=>
  seats.push({deck,seatCode,row,col,width:1,length,seatType,state,gender,ladiesOnly:false,malesOnly:false,fare:750});
 for(let i=0;i<6;i++)at('LOWER',(i+1)+'L',i*2,0,'sleeper',2);
 for(let i=0;i<22;i++)at('LOWER',String(i+1),Math.floor(i/2),i%2+2,'seater');
 for(let i=0;i<6;i++)for(let j=0;j<3;j++)
  at('UPPER',String(i*3+3-j)+'U',i*2,[0,2,3][j],'sleeper',2);
 seats.find(s=>s.seatCode==='1L').state='booked';
 seats.find(s=>s.seatCode==='1L').gender='M';
 seats.find(s=>s.seatCode==='2L').state='booked';
 seats.find(s=>s.seatCode==='2L').gender='F';
 seats.find(s=>s.seatCode==='3U').state='blocked';
 seats.find(s=>s.seatCode==='2U').state='held';
 return {tripId:100,travelDate:'2026-11-22',status:'active',bookable:true,
  serviceNumber:'NTHB1',routeName:'HYD BNG',coachName:'A/C Seater/Sleeper (2+1)',
  fromSequence:0,toSequence:2,
  stops:[{sequence:0,cityId:107258,name:'Hyderabad',day:1,time:'17:30'},
   {sequence:1,cityId:123,name:'Kurnool',day:1,time:'22:30'},
   {sequence:2,cityId:102257,name:'Bengaluru',day:2,time:'07:55'}],
  stages:[],seats};
}
test('reference 46-seat 2+1 has exact 28 lower / 18 upper, berth spans and aisle',()=>{
 const l=layout(),decks=groupDecks(l);
 assert.deepEqual(decks.map(d=>[d.name,d.seats.length,d.rows,d.cols]),
   [['LOWER',28,12,4],['UPPER',18,12,4]]);
 assert.equal(l.seats.find(s=>s.seatCode==='1L').length,2);
 assert.equal(l.seats.find(s=>s.seatCode==='1').col,2);
 assert.equal(l.seats.find(s=>s.seatCode==='2').col,3);
 assert.equal(l.seats.find(s=>s.seatCode==='3U').col,0);
});
test('legacy 2+1 physical geometry is projected without mutating inventory code or status',()=>{
 const l=layout(), old=l.seats.map(s=>({...s}));
 for(const s of old){
  if(s.deck==='LOWER')s.col=s.seatType==='sleeper'?3:s.col-2;
  if(s.deck==='UPPER')s.col=s.col===0?3:s.col===2?1:0;
 }
 assert.equal(old.find(s=>s.seatCode==='1L').col,3);
 const projected=physicalGeometry(old);
 assert.equal(projected.find(s=>s.seatCode==='1L').col,0);
 assert.equal(projected.find(s=>s.seatCode==='1').col,2);
 assert.equal(projected.find(s=>s.seatCode==='2').col,3);
 assert.equal(projected.find(s=>s.seatCode==='3U').col,0);
 assert.equal(projected.find(s=>s.seatCode==='2U').col,2);
 assert.equal(projected.find(s=>s.seatCode==='1U').col,3);
 assert.equal(old.find(s=>s.seatCode==='1L').col,3,'original immutable');
});
test('occupied gender is safely classified; holds/blocks/unknown gender are never sold as available',()=>{
 const l=layout(),get=code=>l.seats.find(s=>s.seatCode===code);
 assert.equal(visualStatus(get('1L')),'male');
 assert.equal(visualStatus(get('2L')),'female');
 assert.equal(visualStatus(get('3U')),'unavailable');
 assert.equal(visualStatus(get('2U')),'unavailable');
 get('1L').gender='unknown';assert.equal(visualStatus(get('1L')),'unavailable');
 get('1L').state='held';assert.equal(visualStatus(get('1L')),'unavailable');
 assert.equal(visualStatus(get('4L')),'available');
});
test('poster matches user title/date, both deck panels, four legends, steering and exit',()=>{
 const l=layout(),svg=seatPosterSvg(l);
 assert.equal(titleFor(l),'Hyderabad → Bengaluru');
 assert.equal(formatDate(l.travelDate),'Sun, 22 Nov, 2026');
 assert.ok(svg.includes('Hyderabad → Bengaluru'));
 assert.ok(svg.includes('Sun, 22 Nov, 2026 · NTHB1'));
 assert.equal((svg.match(/data-seat=/g)||[]).length,46);
 assert.ok(svg.includes('data-deck="LOWER"'));
 assert.ok(svg.includes('data-deck="UPPER"'));
 for(const key of ['Available','Male','Female','Not available'])assert.ok(svg.includes(key),key);
 assert.ok(svg.includes('Seat availability at the time of copy'));
 assert.ok(svg.includes('id="wheel"'));
 assert.ok(svg.includes('data-seat="1L" data-status="male"'));
 assert.ok(svg.includes('data-seat="2L" data-status="female"'));
 assert.ok(svg.includes('data-seat="3U" data-status="unavailable"'));
 assert.ok(!svg.includes('fake-pnr'));
});
test('never leak customer records or execute dangerous markup in poster',()=>{
 const l=layout();
 l.stops[0].name='<script>alert("x")</script>';
 l.seats[0].seatCode='S<1';
 l.seats[0].passenger={name:'PRIVATE CUSTOMER',pnr:'FAKE-PNR',mobile:'9090909090'};
 const svg=seatPosterSvg(l);
 assert.ok(svg.includes('&lt;script&gt;'));
 assert.ok(svg.includes('S&lt;1'));
 assert.ok(!svg.includes('<script>'));
 assert.ok(!svg.includes('PRIVATE CUSTOMER'));
 assert.ok(!svg.includes('FAKE-PNR'));
 assert.ok(!svg.includes('9090909090'));
});
test('invalid coordinates/duplicate ids and empty layouts fail safely',()=>{
 const a=layout(),b=layout();
 a.seats[0].row=99;
 assert.throws(()=>seatPosterSvg(a),/Invalid seat geometry/);
 b.seats[0].seatCode=b.seats[1].seatCode;
 assert.throws(()=>validateLayout(b),/Invalid seat geometry/);
 assert.throws(()=>groupDecks({...b,seats:[]}),/No valid/);
});
test('new .NET endpoint validates real route segments and reuses transactional inventory service',()=>{
 const cs=fs.readFileSync(path.join(__dirname,'../../../backend/src/JourneyOS.Api/Admin/OperationsEndpoints.cs'),'utf8');
 for(const txt of ['"/trips/{id:long}/seat-layout"','SeatStatesAsync(trip, route, from, to)',
  'a.FromSeq < to && from < a.ToSeq','"Choose an ordered pair of route cities"',
  '.RequireAuthorization(ops)','"/trips/{id:long}/booking-chart"'])assert.ok(cs.includes(txt),txt);
 const app=fs.readFileSync(path.join(__dirname,'../src/App.tsx'),'utf8');
 assert.ok(app.includes('SchedulesPanel'));
 assert.ok(app.includes('tab === "schedules"'));
});
