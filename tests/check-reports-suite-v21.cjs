'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'gds-reports-v21-'));
process.env.GDS_RESEED='1';
const app=require('../server/index'),db=require('../server/db'),U=require('../server/util'),
  reports=require('../server/reports-suite-v21'),pdf=require('../server/report-suite-pdf-v21');
let srv,url,token,agent;
async function call(route,{t=token,binary=false}={}){
 const response=await fetch(url+'/api'+route,{headers:t?{Authorization:'Bearer '+t}:{}});
 return {status:response.status,response,data:binary?Buffer.from(await response.arrayBuffer()):await response.json()};
}
async function signin(phone){
 const post=async(route,body)=>{
  const r=await fetch(url+'/api'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {status:r.status,body:await r.json()};
 };
 await post('/auth/request-otp',{phone});
 const r=await post('/auth/verify-otp',{phone,otp:'1234'});
 assert.equal(r.status,200,JSON.stringify(r.body));return r.body.token;
}
(async()=>{
 srv=app.listen(0);url='http://127.0.0.1:'+srv.address().port;
 try{
 token=await signin('9999999999');agent=await signin('9444444441');
 const to=U.addDays(U.today(),-2),from=U.addDays(to,-6),qs=`from=${from}&to=${to}`;
 const options=await call('/accounts/reports/v21/options');
 assert.equal(options.status,200);
 assert.ok(options.data.buses.length>=5&&options.data.staff.length>=14,'Filter options must come from GDS');
 const reportsByName={};
 for(const key of reports.keys){
   const response=await call('/accounts/reports/'+key+'?'+qs);
   assert.equal(response.status,200,`Unexpected ${key}: ${JSON.stringify(response.data)}`);
   const d=response.data;reportsByName[key]=d;
   assert.equal(d.report,key);assert.equal(d.from,from);assert.equal(d.to,to);
   assert.ok(d.summary&&d.sections&&d.totals,`Missing report body for ${key}`);
   assert.ok(d.methodology?.length>0,`Methodology missing ${key}`);
   const file=await call('/accounts/reports/'+key+'.pdf?'+qs,{binary:true});
   if(key==='staff-duty'){assert.equal(file.status,400,'Staff duty PDF must require a selected staff member');continue;}
   assert.equal(file.status,200,`${key} PDF download`);
   assert.match(file.response.headers.get('content-type'),/application\/pdf/);
   assert.ok(file.data.toString('latin1').startsWith('%PDF-1.4'));
   const pages=(file.data.toString('latin1').match(/\/Type \/Page \/Parent/g)||[]).length;
   assert.ok(pages>=1&&pages<100,`${key}: page count ${pages}`);
   const box=key==='point-usage'?'595.28 841.89':'841.89 595.28';
   assert.ok(file.data.toString('latin1').includes('/MediaBox [0 0 '+box+']'),`Wrong orientation: ${key}`);
   const denied=await call('/accounts/reports/'+key+'.pdf?'+qs,{t:agent});
   assert.equal(denied.status,403,`${key} pdf RBAC`);
   const notoken=await call('/accounts/reports/'+key+'?'+qs,{t:''});
   assert.equal(notoken.status,401,`${key} data auth`);
   const section=Object.keys(d.sections)[0];
   const csv=await call('/accounts/reports/'+key+'?'+qs+'&format=csv&section='+section,{binary:true});
   assert.equal(csv.status,200,`${key} CSV`);
   assert.match(csv.response.headers.get('content-type'),/text\/csv/);
   console.log(`PASS ${key}: ${Object.values(d.sections).map(x=>x.length).join('/')} rows, ${pages} PDF pages, RBAC and CSV`);
 }
 const p=reportsByName['point-usage'];
 assert.equal(p.summary.bookings,p.sections.boarding.reduce((a,x)=>a+x.bookings,0));
 assert.equal(p.summary.bookings,p.sections.dropping.reduce((a,x)=>a+x.bookings,0));
 assert.equal(p.summary.bookings,p.sections.pairs.reduce((a,x)=>a+x.bookings,0),'All pairs included, not truncated');
 assert.equal(p.summary.seats,p.sections.boarding.reduce((a,x)=>a+x.seats,0));
 const c=reportsByName.cancellations;
 assert.equal(c.summary.cancellations,c.sections.rows.length);
 assert.equal(c.summary.seats_resold,c.sections.rows.reduce((a,x)=>a+x.resold,0));
 assert.ok(c.sections.rows.every(x=>x.seats>=x.resold&&x.resold>=0));
 const b=reportsByName['driver-behavior'];
 assert.equal(b.summary.drivers,b.sections.drivers.length);
 assert.ok(b.sections.drivers.every((x,i)=>!i||(b.sections.drivers[i-1].score??101)<=(x.score??101)));
 const e=reportsByName.expenses;
 assert.equal(e.summary.trips,e.sections.rows.filter(x=>!x.off).length);
 assert.ok(Math.abs(e.summary.total_expense-e.sections.rows.reduce((n,x)=>n+x.total,0))<1,'Expense trip reconciliation');
 assert.ok(Math.abs(e.summary.total_expense-e.sections.categories.reduce((n,x)=>n+x.amount,0))<2,'Expense category reconciliation');
 assert.ok(Math.abs(e.summary.total_expense-e.sections.by_bus.reduce((n,x)=>n+x.total,0))<2,'Expense bus reconciliation');
 assert.ok(e.sections.rows.filter(x=>x.off).every(x=>x.total>=0),'Turned-off trips have fixed-only costs');
 const no=reportsByName['no-shows'];
 assert.equal(no.sections.rows.length,no.summary.no_shows);
 const metro=reportsByName['metro-bookings'];
 assert.equal(metro.summary.metro_pnrs,metro.sections.rows.length);
 assert.equal(metro.summary.billed_metro_legs,0,'Do not invent Metro ticket billing');
 assert.equal(metro.summary.metro_fare,0,'No fabricated 20-rupee metro fares');
 const pick=await call('/accounts/reports/metro-bookings?'+qs+'&mode=pickup');
 assert.equal(pick.status,200);
 assert.ok(pick.data.sections.rows.every(x=>x.pickup));
 const drop=await call('/accounts/reports/metro-bookings?'+qs+'&mode=drop');
 assert.equal(drop.status,200);
 assert.ok(drop.data.sections.rows.every(x=>x.drop));
 const v=reportsByName['van-bookings'];
 assert.ok(v.summary.van_pnrs>=0);
 assert.ok(v.sections.rows.every(x=>x.type==='Van'));
 const staffId=db.col('staff').all().find(x=>x.role==='driver').id;
 const staffed=await call('/accounts/reports/staff-duty?'+qs+'&staff_id='+staffId);
 assert.equal(staffed.status,200);
 assert.ok(staffed.data.staff.id===staffId,'Selected staff identity');
 assert.ok(staffed.data.sections.rows.every(x=>x.date>=from&&x.date<=to));
 const staffPdf=await call('/accounts/reports/staff-duty.pdf?'+qs+'&staff_id='+staffId,{binary:true});
 assert.equal(staffPdf.status,200,'Selected staff PDF');
 assert.ok(staffPdf.data.toString('latin1').includes('Staff Duty Statement'));
 const busId=options.data.buses[0].id;
 for(const key of ['point-usage','cancellations','no-shows','driver-behavior','metro-bookings','van-bookings','expenses']){
   const filtered=await call('/accounts/reports/'+key+'?'+qs+'&bus_id='+busId);
   assert.equal(filtered.status,200,`bus filter ${key}`);
   assert.equal(filtered.data.bus_id,busId);
 }
 for(const suffix of ['from=2026-02-31&to=2026-03-02','from=2026-11-22&to=2026-11-14','from=2025-01-01&to=2026-11-22','from=2026-11-01&to=2026-11-22&bus_id=9999999']){
   const r=await call('/accounts/reports/expenses?'+suffix);assert.ok([400,404].includes(r.status),`Invalid report query ${suffix} got ${r.status}`);
 }
 const html=fs.readFileSync('public/index.html','utf8');
 assert.ok(html.indexOf('fleet-operations-v20.js')<html.indexOf('report-suite-v21.js'));
 assert.ok(html.indexOf('report-suite-specs-v21.js')<html.indexOf('report-suite-v21.js'));
 assert.ok(html.indexOf('report-suite-v21.js')<html.indexOf('main.js'));
 console.log('PASS: eight report data engines, multi-PDF delivery, calculations, filters, staff selection, access control, CSV');
 }finally{
 await new Promise(resolve=>srv.close(resolve));
 fs.rmSync(process.env.GDS_DATA_DIR,{recursive:true,force:true});
 }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
