'use strict';
/* v41 integration: authenticated real booking -> ticket metadata / printable PDF. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'ticket-v41-'));
process.env.GDS_RESEED='1';
const app=require('../server/index'),db=require('../server/db'),A=require('../server/auth');
const Ticket=require('../server/booking-ticket-v41');
const D=require('../server/domain');
const owner=db.col('users').find(x=>x.role==='owner');
assert.ok(owner,'Seeded owner required');
const server=app.listen(0);
const base='http://127.0.0.1:'+server.address().port+'/api';
const get=async(url,user=owner,authenticated=true)=>{
 const r=await fetch(base+url,{headers:authenticated?
  {Authorization:'Bearer '+A.sign({uid:user.id,exp:Date.now()+600000})}:{}});
 const type=r.headers.get('content-type')||'';
 return {status:r.status,headers:r.headers,data:type.includes('application/pdf')
  ?Buffer.from(await r.arrayBuffer()):await r.json()};
};
(async()=>{
 try{
  const b=db.col('bookings').find(x=>{
   const r=db.col('routes').get(x.route_id),s=db.col('schedules').get(x.schedule_id);
   return x.status==='confirmed'&&x.passengers.some(p=>p.status!=='cancelled')&&
    !!r?.stages?.find(st=>String(st.id)===String(x.boarding_stage_id))&&
    !!r?.stages?.find(st=>String(st.id)===String(x.dropping_stage_id))&&!!s;
  });
  assert.ok(b,'A confirmed seeded booking with stages is required');
  const url='/bookings/'+encodeURIComponent(b.pnr)+'/ticket/v41';
  let result=await get(url);
  assert.equal(result.status,200,JSON.stringify(result.data));
  const t=result.data;
  assert.equal(t.pnr,b.ticket_number);
  assert.equal(t.booking_id,b.pnr);
  assert.equal(t.operator.name,db.meta('operator').operator_name);
  assert.equal(t.operator.gstin,db.meta('operator').gst_number);
  assert.equal(t.service,db.col('routes').get(b.route_id).service_number);
  assert.equal(t.boarding.id,String(b.boarding_stage_id));
  assert.equal(t.dropping.id,String(b.dropping_stage_id));
  assert.equal(t.passengers.length,b.passengers.filter(p=>p.status!=='cancelled').length);
  assert.equal(t.fare.total,b.fare.total);
  assert.equal(t.fare.gst,b.fare.gst);
  assert.ok(t.terms.some(x=>x.includes('boarding')));
  assert.equal(t.can_update,true);
  assert.ok(t.boarding.time);
  assert.ok(t.dropping.time);
  assert.ok(!JSON.stringify(t).includes('ST261122160518095301'),
   'Reference PNR must never become a hard-coded fixture');
  result=await get(url+'.pdf');
  assert.equal(result.status,200);
  assert.equal(result.headers.get('content-type'),'application/pdf');
  assert.match(result.headers.get('content-disposition'),/^inline; filename=/);
  assert.ok(result.data.subarray(0,5).equals(Buffer.from('%PDF-')));
  assert.equal([...result.data.toString('latin1').matchAll(/\/Type \/Page \/Parent/g)].length,3,
   'Reference ticket printed as three A4 portrait pages');
  for(const text of ['Passenger Detail','Booking ID','BOARDING','DROPPING',
   'CANCELLATION POLICY','TERMS & CONDITIONS','GET IN TOUCH','Secure Payments']){
   assert.ok(result.data.toString('latin1').includes(text),'PDF missing '+text);
  }
  assert.ok(result.data.toString('latin1').includes(b.ticket_number),'Ticket PDF needs actual PNR');
  const download=await get(url+'.pdf?disposition=attachment');
  assert.equal(download.status,200);
  assert.match(download.headers.get('content-disposition'),/^attachment; filename=/);
  assert.deepEqual(download.data.subarray(0,300),result.data.subarray(0,300));
  assert.equal((await get(url,owner,false)).status,401);
  const viewer=db.col('users').find(u=>u.role==='viewer');
  if(viewer)assert.equal((await get(url,viewer)).status,403);
  assert.equal((await get('/bookings/UNKNOWN-v41/ticket/v41')).status,404);
  assert.equal((await get('/bookings/UNKNOWN-v41/ticket/v41.pdf')).status,404);
  assert.match(result.headers.get('cache-control'),/no-store/);
  const raw=Ticket.model({user:{...owner,permissions:A.permsFor(owner)}},b.pnr);
  assert.equal(raw.fare.gross,b.fare.gross);
  const iso=Ticket.stageDate('2026-11-22',{time:'07:45',day:2});
  assert.equal(Ticket.fmtStage(iso),'23 Nov 2026, 07:45');
  console.log('PASS v41 ticket API: secured operator-branded ticket metadata, itinerary, breakdown, 3-page A4 PDF, inline/attachment, auth, no reference PII');
 }finally{
  server.closeAllConnections?.();server.close();db.persistNow();
  fs.rmSync(process.env.GDS_DATA_DIR,{recursive:true,force:true});
 }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
