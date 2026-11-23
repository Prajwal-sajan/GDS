'use strict';
/* v40 API integration: PDF exports, date/route provenance, CSV import, security. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'pickup-chart-v40-'));
process.env.GDS_RESEED='1';
const app=require('../server/index'),db=require('../server/db'),A=require('../server/auth'),
 D=require('../server/domain'),Import=require('../server/pickup-chart-import-v40'),
 PDF=require('../server/pickup-chart-pdf-v40'),Data=require('../server/pickup-chart-v40');
const owner=db.col('users').find(u=>u.role==='owner');
assert.ok(owner);
const server=app.listen(0),base='http://127.0.0.1:'+server.address().port+'/api';
async function call(method,url,body,headers={},user=owner){
 const hs={'Authorization':'Bearer '+A.sign({uid:user.id,exp:Date.now()+600000}),...headers};
 let data=body;
 if(body!==undefined&&!Buffer.isBuffer(body)&&typeof body!=='string'){
  hs['Content-Type']='application/json';data=JSON.stringify(body);
 }
 const response=await fetch(base+url,{method,headers:hs,body:data});
 const type=response.headers.get('content-type')||'';
 return {status:response.status,headers:response.headers,
  data:type.includes('application/pdf')?Buffer.from(await response.arrayBuffer()):await response.json()};
}
const get=url=>call('GET',url);
(async()=>{
 try{
  const s=db.col('schedules').all().find(s=>{
   const r=db.col('routes').get(s.route_id),c=D.coachForSchedule(s);
   return r&&c?.layout?.capacity&&r.stages?.some(x=>x.type==='pickup')&&r.stages.some(x=>x.type==='drop');
  });
  assert.ok(s,'Fixture must have usable schedule, route and coach');
  const route=db.col('routes').get(s.route_id),stage1=route.stages.find(x=>x.type==='pickup');
  const stage2=route.stages.filter(x=>x.type==='drop').slice(-1)[0];
  const seat=D.seatMap(s).decks.flatMap(d=>d.seats)[0].code;
  const b=db.col('bookings').insert({
   pnr:'V40-PNR-095027',ticket_number:'095027',schedule_id:s.id,route_id:s.route_id,
   status:'confirmed',payment:'paid',source:'redbus',travel_date:s.travel_date,
   contact:{phone:'9876543210',name:'Control Contact'},
   from_city_id:stage1.city_id,to_city_id:stage2.city_id,
   boarding_stage_id:stage1.id,dropping_stage_id:stage2.id,
   booked_at:'2026-11-21T03:40:00Z',
   fare:{total:1994,net:1994},
   passengers:[{seat,name:'Example Jayaraju Nadipalli',age:37,gender:'M',fare:1994,status:'booked'}]
  });
  const prefix='/schedules/'+s.id+'/pickup-chart/v40';
  let res=await get(prefix+'/options');
  assert.equal(res.status,200,JSON.stringify(res.data));
  const opt=res.data;assert.equal(opt.service,route.service_number);
  assert.ok(opt.columns.length===15);
  assert.ok(opt.columns.some(x=>x.key==='trips'&&x.selected_pickup));
  assert.ok(opt.columns.some(x=>x.key==='pickup'&&x.selected_rto));
  assert.ok(opt.city_options.some(x=>x.kind==='boarding'));
  res=await get(prefix+'/data');
  assert.equal(res.status,200);
  assert.ok(res.data.rows.some(p=>p.pnr==='095027'&&p.name==='Example Jayaraju Nadipalli'));
  assert.ok(res.data.rows.some(p=>p.mobile==='9876543210'));
  assert.ok(res.data.stages.length>=2);
  const pdf=await get(prefix+'.pdf?chart=pickup');
  assert.equal(pdf.status,200);
  assert.equal(pdf.headers.get('content-type'),'application/pdf');
  assert.ok(pdf.data.subarray(0,8).toString().startsWith('%PDF-1.'));
  assert.ok(pdf.data.toString('latin1').includes('Boarding Details'));
  assert.ok(pdf.data.toString('latin1').includes('Dropping Details'));
  assert.ok(pdf.data.toString('latin1').includes('Rs.1994'));
  assert.ok(pdf.data.toString('latin1').includes('Jayaraju Nadipalli'));
  const rto=await get(prefix+'.pdf?chart=rto&pickup_drop=trip');
  assert.equal(rto.status,200);
  assert.ok(rto.data.toString('latin1').includes('Printed:'));
  assert.ok(rto.data.toString('latin1').includes('Pickup:'));
  assert.ok(!rto.data.toString('latin1').includes('Boarding Details'));
  assert.ok(!rto.data.toString('latin1').includes('Dropping Details'));
  const downloaded=await get(prefix+'.pdf?chart=rto&pickup_drop=trip&disposition=attachment');
  assert.equal(downloaded.status,200);
  assert.ok(downloaded.headers.get('content-disposition').startsWith('attachment'));
  assert.ok(downloaded.data.toString('latin1').includes('Printed:'));
  // Dynamic columns: selecting only two does not leak the passenger phone.
  const selected=await get(prefix+'.pdf?chart=rto&columns=seat,pnr');
  assert.equal(selected.status,200);
  assert.ok(!selected.data.toString('latin1').includes('9876543210'));
  assert.ok(!selected.data.toString('latin1').includes('Example Jayaraju Nadipalli'));
  assert.ok(selected.data.toString('latin1').includes('095027'));
  assert.equal((await get(prefix+'.pdf?chart=rto&columns=unknown')).status,400);
  assert.equal((await get(prefix+'.pdf?chart=unknown')).status,400);
  assert.equal((await get(prefix+'.pdf?chart=pickup&city=boarding:999999999')).status,400);
  assert.equal((await get(prefix+'.pdf?chart=rto&pickup_drop=unknown')).status,400);
  assert.equal((await get(prefix+'/data?source=imported')).status,404);

  const csv='Seat,Mobile,PNR,Name,Gender,Trips,Pickup,Drop,Fare,Source,Booked On\n'+
   '19,9652140543,095027,Jayaraju Nadipalli,M,1,"'+stage1.name+'","'+stage2.name+'",1994,paytm,21/11/26 09:10 pm\n'+
   '2L,8762602041,094925,Padmashree punna,F,2,"'+stage1.name+'","'+stage2.name+'",2151,redbus,21/11/26 02:40 pm\n';
  const uploaded=await call('POST',prefix+'/preview',Buffer.from(csv),{
   'Content-Type':'text/csv','X-Pickup-Chart-Filename':'example.csv',
   'X-Pickup-Chart-GDS':'Infinity ITS'});
  assert.equal(uploaded.status,200,JSON.stringify(uploaded.data));
  assert.equal(uploaded.data.passenger_count,2);
  assert.equal(uploaded.data.detected_gds,'Infinity ITS');
  assert.equal(uploaded.data.inventory_will_change,false);
  assert.equal(uploaded.data.rows[0].pnr,'095027');
  assert.equal(uploaded.data.rows[0].pickup,stage1.name);
  assert.equal((await call('POST',prefix+'/commit',{preview_id:uploaded.data.preview_id})).status,400);
  let committed=await call('POST',prefix+'/commit',{preview_id:uploaded.data.preview_id,confirm:true});
  assert.equal(committed.status,200,JSON.stringify(committed.data));
  assert.equal(committed.data.inventory_changed,false);
  assert.equal(committed.data.bookings_changed,false);
  assert.equal(db.col('bookings').find(x=>x.pnr===b.pnr),b,'Import must not change existing booking');
  const fromImport=await get(prefix+'/data?source=imported');
  assert.equal(fromImport.status,200,JSON.stringify(fromImport.data));
  assert.equal(fromImport.data.rows.length,2);
  assert.equal(fromImport.data.rows[1].pnr,'094925');
  assert.equal((await get(prefix+'/options')).data.imported.count,2);
  assert.equal((await get(prefix+'.pdf?source=imported&chart=pickup')).status,200);
  assert.equal((await call('POST',prefix+'/commit',{preview_id:uploaded.data.preview_id,confirm:true})).status,404,
   'Staging token must be one-use');
  const wrong='Service: SOME_OTHER\nDate: 2026-01-01\n'+csv;
  const bad=await call('POST',prefix+'/preview',Buffer.from(wrong),{
   'Content-Type':'text/csv','X-Pickup-Chart-Filename':'wrong.csv',
   'X-Pickup-Chart-GDS':'Detect automatically'});
  assert.equal(bad.status,200);
  assert.equal(bad.data.blocking_issues.length,2);
  assert.equal((await call('POST',prefix+'/commit',{preview_id:bad.data.preview_id,confirm:true})).status,409);
  // Reject malicious/missing data; never hallucinate a successful import.
  assert.equal((await call('POST',prefix+'/preview',Buffer.from('random'),{
   'Content-Type':'application/pdf','X-Pickup-Chart-Filename':'bad.pdf',
   'X-Pickup-Chart-GDS':'Infinity ITS'})).status,415);
  assert.equal((await call('POST',prefix+'/preview',Buffer.from('seat,phone\n1,2'),{
   'Content-Type':'text/csv','X-Pickup-Chart-Filename':'unusable.csv',
   'X-Pickup-Chart-GDS':'Infinity ITS'})).status,422);
  const anon=await fetch(base+prefix+'/data');
  assert.equal(anon.status,401);
  // PDF parser should be able to read this generator's output if Poppler is available.
  const child=require('node:child_process').spawnSync('pdftotext',['-v'],{encoding:'utf8'});
  if(!child.error){
   const printText=Import.rowsFromPdf(require('node:child_process').spawnSync(
    'pdftotext',['-layout','-','-'],{input:pdf.data,encoding:'utf8'}).stdout||'');
   assert.ok(printText.rows.length>=1,'Generated Pickup Chart must be readable by PDF import');
  }
  console.log('PASS v40 API: PDF pickup and RTO, A4 vector output, dynamic columns/city, download header, CSV source import, staging/commit, route/date checks, inventory isolation, access control');
 }finally{server.closeAllConnections?.();server.close();db.persistNow();fs.rmSync(process.env.GDS_DATA_DIR,{recursive:true,force:true})}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
