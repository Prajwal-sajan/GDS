'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'fleet-ops-v20-'));
process.env.GDS_RESEED='1';
const app=require('../server/index');
const db=require('../server/db');
const U=require('../server/util');
const Fleet=require('../server/fleet-operations-v20');
const pdf=require('../server/fleet-operations-pdf-v20');
let server,base,owner,agent;
async function api(url,token=owner,{binary=false}={}){
 const res=await fetch(base+'/api'+url,{headers:{...(token?{Authorization:'Bearer '+token}:{})}});
 return {status:res.status,body:binary?Buffer.from(await res.arrayBuffer()):await res.json(),headers:res.headers};
}
async function auth(phone){
 const send=async(path,data)=>{
  const response=await fetch(base+'/api'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  return {status:response.status,json:await response.json()};
 };
 await send('/auth/request-otp',{phone});
 const login=await send('/auth/verify-otp',{phone,otp:'1234'});
 assert.equal(login.status,200,JSON.stringify(login.json));
 return login.json.token;
}
(async()=>{
 server=app.listen(0);base='http://127.0.0.1:'+server.address().port;
 try{
 owner=await auth('9999999999');agent=await auth('9444444441');
 const to=U.addDays(U.today(),-2),from=U.addDays(to,-6);
 const query=`from=${from}&to=${to}`;
 let r=await api('/accounts/reports/fleet-operations?'+query);
 assert.equal(r.status,200,JSON.stringify(r.body));const d=r.body;
 assert.deepEqual([d.from,d.to],[from,to]);
 for(const key of ['summary','by_bus','by_driver','driver_by_bus','daily','rows','totals','methodology'])
   assert.ok(d[key],`Missing ${key}`);
 assert.equal(d.daily.length,7);
 assert.ok(d.rows.length>0,'Seeded seven-day period has trips');
 assert.equal(d.summary.trips,d.rows.length);
 assert.equal(d.summary.trips,d.daily.reduce((n,x)=>n+x.trips,0));
 assert.equal(d.totals.daily.trips,d.summary.trips);
 assert.equal(d.summary.trips_without_driver,d.rows.filter(x=>x.drivers.length===0).length);
 assert.equal(d.summary.trips_turned_off,db.col('schedules').filter(x=>x.travel_date>=from&&x.travel_date<=to&&x.status!=='active').length);
 assert.equal(d.by_driver.reduce((n,x)=>n+x.trips,0),d.rows.reduce((n,x)=>n+x.drivers.length,0),
   'Each assigned driver receives full trip count');
 const km=d.rows.reduce((n,x)=>n+x.km,0),fuel=d.rows.reduce((n,x)=>n+x.fuel_l,0);
 assert.ok(Math.abs(d.summary.km-km)<.1,'Fleet km reconcile');
 assert.ok(Math.abs(d.summary.fuel_l-fuel)<.1,'Fleet litres reconcile');
 const pairs=d.rows.filter(x=>x.km_reported&&x.fuel_reported);
 if(pairs.length){
   const ratio=pairs.reduce((a,x)=>a+x.km,0)/pairs.reduce((a,x)=>a+x.fuel_l,0);
   assert.ok(Math.abs(d.summary.kmpl-ratio)<.01,'Mileage uses paired readings only');
 }
 assert.ok(d.by_bus.some(x=>x.days_idle>0)||d.summary.idle_bus_days>=0,'Idle days calculated');
 assert.ok(d.by_bus.every(x=>x.trips>=x.days_ran),'Bus days distinct from trip count');
 assert.ok(d.by_bus.every(x=>x.diesel>=0),'Diesel sources non-negative');
 const options=await api('/accounts/reports/fleet-operations/options');
 assert.equal(options.status,200);
 assert.ok(options.body.staff.length>0&&options.body.buses.length>0,'Filter dropdown data');
 assert.ok(options.body.staff[0].id&&options.body.buses[0].registration_number);
 const chosen=d.by_bus.find(x=>x.trips>0);
 assert.ok(chosen);
 const busResult=(await api('/accounts/reports/fleet-operations?'+query+'&bus_id='+chosen.vehicle_id)).body;
 assert.ok(busResult.rows.every(x=>Number(x.vehicle_id)===Number(chosen.vehicle_id)));
 assert.equal(busResult.by_bus.length,1);
 const drv=d.by_driver[0];assert.ok(drv);
 const filtered=(await api('/accounts/reports/fleet-operations?'+query+'&staff_id='+drv.driver_id)).body;
 assert.equal(filtered.summary.fleet_util_pct,null,'Staff filtered utilization must be suppressed');
 assert.ok(filtered.rows.length>0);
 assert.ok(filtered.rows.every(x=>x.drivers.some(y=>Number(y.id)===Number(drv.driver_id))),'Driver filter enforced in rows');
 const dataPdf=await api('/accounts/reports/fleet-operations.pdf?'+query,owner,{binary:true});
 assert.equal(dataPdf.status,200);
 assert.match(dataPdf.headers.get('content-type'),/application\/pdf/);
 assert.match(dataPdf.headers.get('content-disposition'),new RegExp(`fleet-operations_${from}_${to}`));
 const bytes=dataPdf.body,ascii=bytes.toString('latin1');
 assert.ok(ascii.startsWith('%PDF-1.4'),'PDF magic bytes');
 assert.match(ascii,/\/MediaBox \[0 0 841\.89 595\.28\]/,'A4 landscape page');
 assert.match(ascii,/Fleet Operations/,'Title in PDF content stream');
 for(const title of ['By bus','By driver','Driver x bus','Daily','Trip-wise'])
   assert.ok(ascii.includes(title),'Missing PDF section '+title);
 assert.ok(ascii.includes('xref')&&ascii.includes('startxref')&&ascii.includes('%%EOF'),'PDF trailer');
 const preview=path.join(process.env.GDS_DATA_DIR,'fleet-report-a4.pdf');
 fs.writeFileSync(preview,bytes);
 const {spawnSync}=require('node:child_process');
 const pop=spawnSync('pdfinfo',[preview],{encoding:'utf8'});
 if(pop.status===0){
   assert.match(pop.stdout,/Page size:\s*841\.89 x 595\.28 pts \(A4\)/,'Poppler confirms landscape A4 PDF');
   assert.ok(Number((pop.stdout.match(/Pages:\s*(\d+)/)||[])[1])>=2,'Poppler confirms multiple pages');
   const textPDF=spawnSync('pdftotext',['-layout',preview,'-'],{encoding:'utf8'});
   if(textPDF.status===0){for(const sec of ['Fleet Operations','By bus','By driver','Daily','Trip-wise'])assert.ok(textPDF.stdout.includes(sec),'PDF extracted text missing '+sec);}
 }else{console.log('Poppler utilities not available, checking structural PDF markers only');}
 const pageCount=(ascii.match(/\/Type \/Page \/Parent/g)||[]).length;
 assert.ok(pageCount>=2&&pageCount<30,`Paginated report expected; got ${pageCount} pages`);
 const pdf2=pdf.generate(Fleet.compute({from,to,bus_id:chosen.vehicle_id}));
 assert.ok(pdf2.length>1500,'Filtered PDF generation');
 const unauthorized=await api('/accounts/reports/fleet-operations.pdf?'+query,agent);
 assert.equal(unauthorized.status,403,'Agent cannot download operational PDF');
 assert.equal((await api('/accounts/reports/fleet-operations?from=2026-02-32&to=2026-03-01')).status,400);
 assert.equal((await api('/accounts/reports/fleet-operations?from='+to+'&to='+from)).status,400);
 assert.equal((await api('/accounts/reports/fleet-operations?from=2025-01-01&to=2026-11-20')).status,400);
 assert.equal((await api('/accounts/reports/fleet-operations?'+query+'&bus_id=999999999')).status,404);
 const csv=await api('/accounts/reports/fleet-operations?'+query+'&format=csv',owner,{binary:true});
 assert.equal(csv.status,200);assert.match(csv.headers.get('content-type'),/text\/csv/);
 assert.ok(csv.body.toString('utf8').includes('departure_time'),'Existing CSV export preserved');
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 assert.ok(html.indexOf('accounts-parity-v10.js')<html.indexOf('fleet-operations-v20.js'));
 assert.ok(html.indexOf('fleet-operations-v20.js')<html.indexOf('main.js'));
 console.log(`PASS Fleet Operations v20: ${d.rows.length} trips, ${d.by_bus.length} buses, ${d.by_driver.length} drivers, ${pageCount}-page PDF, filters, totals, RBAC, CSV`);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(process.env.GDS_DATA_DIR,{recursive:true,force:true});
 }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
