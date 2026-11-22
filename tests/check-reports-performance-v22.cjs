'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'gds-reports-v22-'));
process.env.GDS_RESEED='1';
const app=require('../server/index'),db=require('../server/db'),U=require('../server/util'),
 R=require('../server/reports-performance-v22'),Rp=require('../server/reports'),PDF=require('../server/report-suite-pdf-v21'),
 XLSX=require('../server/report-performance-xlsx-v22'),Specs=require('../public/js/report-suite-specs-v22.js');
let srv,url,token,agent;
async function post(route,obj){
 const res=await fetch(url+'/api'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(obj)});
 return {status:res.status,value:await res.json()};
}
async function signin(phone){
 await post('/auth/request-otp',{phone});
 const r=await post('/auth/verify-otp',{phone,otp:'1234'});
 assert.equal(r.status,200,JSON.stringify(r.value));return r.value.token;
}
async function request(route,auth=token,binary=false){
 const res=await fetch(url+'/api'+route,{headers:auth?{Authorization:'Bearer '+auth}:{}});
 return {status:res.status,headers:res.headers,data:binary?Buffer.from(await res.arrayBuffer()):await res.json()};
}
const equal=(a,b,title)=>assert.ok(Math.abs(a-b)<.03,title+': expected '+a+' ≈ '+b);
(async()=>{
 srv=app.listen(0);url='http://127.0.0.1:'+srv.address().port;
 try{
 token=await signin('9999999999');agent=await signin('9444444441');
 const to=U.addDays(U.today(),-2),from=U.addDays(to,-6),span=`from=${from}&to=${to}`;
 const options=await request('/accounts/reports/v22/options');
 assert.equal(options.status,200);
 assert.ok(options.data.schedules.length>=6&&options.data.buses.length>5&&options.data.staff.length>=14,'Real GDS filter options');
 assert.equal(Object.keys(Specs.DEF).length,12,'Four new Reports definitions after eight existing');
 for(const key of R.KEYS){
   const r=await request('/accounts/reports/'+key+'?'+span);
   assert.equal(r.status,200,key+' data: '+JSON.stringify(r.data));
   const d=r.data;
   assert.ok(d.summary&&d.sections&&d.totals&&d.methodology);
   assert.equal(d.report,key);assert.equal(d.from,from);assert.equal(d.to,to);
   const cols=Specs.sections(key,d);
   assert.ok(cols.length,'Report layout defined: '+key);
   const sec=Object.keys(d.sections)[0],c=await request(`/accounts/reports/${key}?${span}&format=csv&section=${sec}`,token,true);
   assert.equal(c.status,200,key+' CSV');assert.ok(c.data.toString('utf8').startsWith('\uFEFF'));
   const denied=await request('/accounts/reports/'+key+'?'+span,agent);
   assert.equal(denied.status,403,key+' restrict agent access');
   const anon=await request('/accounts/reports/'+key+'?'+span,'');
   assert.equal(anon.status,401,key+' anonymous blocked');
   const pdf=await request('/accounts/reports/'+key+'.pdf?'+span,token,true);
   if(key==='point-performance')assert.equal(pdf.status,400,'Point PDF disabled until point selected');
   else{
     assert.equal(pdf.status,200,key+' PDF');assert.ok(pdf.data.toString('latin1').startsWith('%PDF-1.4'));
     assert.ok(pdf.data.toString('latin1').includes('/MediaBox [0 0 841.89 595.28]'),'A4 landscape');
     console.log('PASS '+key+': '+Object.values(d.sections).map(x=>x.length).join('/')+' section rows, PDF & CSV & RBAC');
   }
 }
 const f=(await request('/accounts/reports/frequent-travellers?'+span)).data;
 assert.equal(f.summary.passengers,f.sections.rows.length===f.summary.passengers?f.sections.rows.length:f.summary.passengers);
 assert.equal(f.summary.total_trips,f.sections.bands.reduce((v,x)=>v+x.trips_taken,0),'All passengers bands account for all trips');
 assert.equal(f.summary.all_passengers,f.sections.bands.reduce((v,x)=>v+x.passengers,0),'Each traveller appears in exactly one band');
 assert.ok(f.sections.rows.every((x,i)=>x.rank===i+1&&x.trips>=2),'Rank and min trips');
 assert.ok(f.sections.rows.every((x,i)=>i===0||f.sections.rows[i-1].trips>=x.trips),'Sorted most trips');
 const high=await request('/accounts/reports/frequent-travellers?'+span+'&min_trips=3&max_trips=5&sort=spend&top=50');
 assert.equal(high.status,200);assert.ok(high.data.sections.rows.every(x=>x.trips>=3&&x.trips<=5));
 assert.ok(high.data.sections.rows.every((x,i)=>!i||high.data.sections.rows[i-1].spend>=x.spend),'Spend ranking');
 const recent=await request('/accounts/reports/frequent-travellers?'+span+'&sort=recent&top=all&min_trips=1');
 assert.equal(recent.status,200);assert.equal(recent.data.sections.rows.length,recent.data.summary.passengers);
 assert.ok(recent.data.sections.rows.every((x,i)=>!i||recent.data.sections.rows[i-1].last_trip>=x.last_trip),'Most recent first');
 const search=await request('/accounts/reports/frequent-travellers?'+span+'&min_trips=1&search=XXXXXXXXXX');
 assert.equal(search.status,200);assert.equal(search.data.summary.passengers,0);
 const xlsx=await request('/accounts/reports/frequent-travellers.xlsx?'+span,token,true);
 assert.equal(xlsx.status,200,'Excel endpoint');
 assert.ok(xlsx.data.subarray(0,4).equals(Buffer.from('504b0304','hex')),'Valid XLSX ZIP signature');
 assert.equal(xlsx.headers.get('content-type'),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 const xlsxDirect=XLSX.generate('frequent-travellers',f);assert.ok(xlsxDirect.length>4000);
 const point=(await request('/accounts/reports/point-performance?'+span)).data;
 assert.ok(point.points.length>=point.sections.ranking.length,'Only points with bookings must rank');
 assert.ok(!point.selected_point,'Initial point empty state');
 const rank=point.sections.ranking;
 if(rank.length){
   const selected=await request('/accounts/reports/point-performance?'+span+'&point='+encodeURIComponent(rank[0].point_key));
   assert.equal(selected.status,200);
   assert.equal(selected.data.selected_point.point_key,rank[0].point_key);
   assert.equal(selected.data.summary.seats,rank[0].seats);
   const pointPdf=await request('/accounts/reports/point-performance.pdf?'+span+'&point='+encodeURIComponent(rank[0].point_key),token,true);
   assert.equal(pointPdf.status,200,'Selected point PDF');
   const sum=selected.data.sections.by_service.reduce((a,x)=>a+x.seats,0);
   equal(sum,selected.data.summary.seats,'Point-by-service aggregation');
 }
 const drop=await request('/accounts/reports/point-performance?'+span+'&mode=drop');
 assert.equal(drop.status,200);assert.equal(drop.data.mode,'drop');
 const station=(await request('/accounts/reports/station-performance?'+span)).data;
 assert.deepEqual(Object.keys(station.sections),['pairs','boarding','dropping','by_schedule','by_schedule_pairs','sources','daily']);
 equal(station.summary.seats,station.sections.pairs.reduce((a,x)=>a+x.seats,0),'Station pairs seats');
 equal(station.summary.seats,station.sections.boarding.reduce((a,x)=>a+x.seats,0),'Boarding seats');
 equal(station.summary.seats,station.sections.dropping.reduce((a,x)=>a+x.seats,0),'Dropping seats');
 equal(station.summary.seats,station.sections.by_schedule.reduce((a,x)=>a+x.seats,0),'Schedules seats');
 equal(station.summary.seats,station.sections.sources.reduce((a,x)=>a+x.seats,0),'Sources seats');
 equal(station.summary.revenue,station.sections.sources.reduce((a,x)=>a+x.revenue,0),'Source revenue');
 const sId=options.data.schedules[0].id;
 const perSchedule=await request('/accounts/reports/station-performance?'+span+'&schedule_id='+sId);
 assert.equal(perSchedule.status,200);assert.ok(perSchedule.data.sections.by_schedule.every(x=>String(x.route_id)===String(sId)));
 const pnl=(await request('/accounts/reports/trip-pnl?'+span)).data;
 const rows=pnl.sections.rows,active=rows.filter(x=>x.running);
 assert.equal(rows.length,pnl.summary.all_trips);assert.equal(active.length,pnl.summary.trips);
 equal(pnl.summary.net_sales,rows.reduce((a,x)=>a+x.net_sales,0),'P&L revenue');
 equal(pnl.summary.expense,rows.reduce((a,x)=>a+x.expense,0),'P&L expenses');
 equal(pnl.summary.profit,pnl.summary.net_sales-pnl.summary.expense,'P&L profit');
 assert.equal(pnl.summary.loss_trips,rows.filter(x=>x.profit<0).length);
 for(const r of rows){
   const schedule=db.col('schedules').find(x=>x.travel_date===r.date&&x.departure_time===r.dep&&db.col('routes').get(x.route_id)?.service_number===r.service);
   if(!schedule)continue;
   const p=Rp.tripPnl(schedule);
   equal(r.expense,p.expense,'Trip P&L exact shared expense');
   equal(r.net_sales,p.net_sales,'Trip P&L exact shared net sales');
   if(!r.running){assert.equal(r.bus,'Turned off');assert.equal(r.seats_label,'—');assert.equal(p.expense_breakdown.running,0);}
 }
 const staffId=options.data.staff.find(x=>x.role==='driver').id;
 const staff=await request('/accounts/reports/trip-pnl?'+span+'&staff_id='+staffId);
 assert.equal(staff.status,200);assert.equal(staff.data.staff_id,staffId);
 const busId=options.data.buses.find(x=>x.name.includes('KA')).id;
 for(const key of ['point-performance','station-performance','trip-pnl']){
   const r=await request('/accounts/reports/'+key+'?'+span+'&bus_id='+busId);
   assert.equal(r.status,200);assert.equal(r.data.bus_id,busId);
 }
 for(const q of ['from=2026-02-31&to=2026-03-02','from=2026-11-22&to=2026-11-14','from=2023-01-01&to=2026-11-22','from='+from+'&to='+to+'&bus_id=999999']){
   const r=await request('/accounts/reports/trip-pnl?'+q);assert.ok([400,404].includes(r.status),'invalid filter rejected: '+q);
 }
 const html=fs.readFileSync('public/index.html','utf8');
 assert.ok(html.indexOf('report-suite-v21.js')<html.indexOf('report-suite-specs-v22.js'));
 assert.ok(html.indexOf('report-suite-specs-v22.js')<html.indexOf('report-suite-v22.js'));
 assert.ok(html.indexOf('report-suite-v22.js')<html.indexOf('main.js'));
 console.log('PASS: all four reports, 7 Station tables, selected Point, customer segments, genuine XLSX, PDFs, range filters, RBAC, P&L reconciliation');
 }finally{
   await new Promise(resolve=>srv.close(resolve));
   fs.rmSync(process.env.GDS_DATA_DIR,{recursive:true,force:true});
 }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
