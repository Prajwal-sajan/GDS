'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'gds-v37-sales-'));
process.env.GDS_RESEED='1';
const app=require('../server/index'),Auth=require('../server/auth'),db=require('../server/db'),U=require('../server/util');
const owner=db.col('users').find(x=>x.role==='owner');
assert.ok(owner,'Seed must contain an operator owner');
const server=app.listen(0);
const base='http://127.0.0.1:'+server.address().port+'/api';
async function get(url,user=owner){
 const token=Auth.sign({uid:user.id,exp:Date.now()+600000});
 const res=await fetch(base+url,{headers:{Authorization:'Bearer '+token}});
 return {status:res.status,body:await res.json()};
}
(async()=>{
 try{
  const facets=await get('/accounts/sales-facets');
  assert.equal(facets.status,200);
  assert.ok(facets.body.sectors.length>=2,'Expected distinct directional routes');
  assert.ok(facets.body.services.length>=2);
  assert.equal(new Set(facets.body.sectors.map(x=>x.value)).size,facets.body.sectors.length);
  assert.ok(facets.body.sectors.every(x=>/^\d+:\d+$/.test(x.value)&&x.label.includes(' → ')));
  assert.ok(facets.body.services.every(x=>facets.body.sectors.some(y=>y.value===x.sector)));
  assert.ok(facets.body.channels.every(x=>typeof x==='string'&&x));
  const from=U.addDays(U.today(),-31),to=U.today();
  const query=(fields)=>'/accounts/analytics?'+new URLSearchParams({from,to,...fields}).toString();
  const all=await get(query({basis:'travel_date',source:'all'}));
  assert.equal(all.status,200);
  assert.ok(all.body.rows.length>=30);
  assert.ok(all.body.totals.net_sales>0,'Seed should have real booking records');
  const total=(rows,key)=>Number(rows.reduce((x,r)=>x+Number(r[key]||0),0).toFixed(2));
  assert.ok(Math.abs(total(all.body.sector_breakdown,'net_sales')-all.body.totals.net_sales)<.03);
  assert.ok(Math.abs(total(all.body.service_breakdown,'net_sales')-all.body.totals.net_sales)<.03);
  const item=all.body.service_breakdown.find(x=>x.bookings>0);
  assert.ok(item,'Expected at least one service with bookings');
  const mapping=facets.body.services.find(x=>x.value===item.value);
  assert.ok(mapping,'Sales service key must appear in dropdown facets');
  const sector=(await get(query({sector:mapping.sector}))).body;
  const service=(await get(query({service:item.value}))).body;
  const both=(await get(query({sector:mapping.sector,service:item.value}))).body;
  assert.equal(both.totals.bookings,service.totals.bookings);
  assert.equal(both.totals.net_sales,service.totals.net_sales);
  assert.ok(service.totals.net_sales<=sector.totals.net_sales+.01);
  assert.ok(sector.totals.net_sales<=all.body.totals.net_sales+.01);
  assert.ok(service.rows.every(x=>Number.isFinite(x.net_sales)));
  assert.equal(service.service_breakdown.length,1);
  assert.equal(service.service_breakdown[0].value,item.value);
  assert.ok(sector.sector_breakdown.every(x=>x.value===mapping.sector));
  const otherSector=facets.body.sectors.find(x=>x.value!==mapping.sector);
  const mismatch=await get(query({sector:otherSector.value,service:item.value}));
  assert.equal(mismatch.status,200);
  assert.equal(mismatch.body.totals.bookings,0);
  assert.equal(mismatch.body.totals.net_sales,0);
  assert.equal(mismatch.body.totals.occupancy_pct,0);
  assert.equal(mismatch.body.service_breakdown.length,0);
  const channel=facets.body.channels[0];
  const sourceOnly=(await get(query({source:channel}))).body;
  const sourceScoped=(await get(query({source:channel,service:item.value}))).body;
  assert.ok(sourceScoped.totals.net_sales<=sourceOnly.totals.net_sales+.01);
  const byBooking=await get(query({basis:'booking_date',sector:mapping.sector}));
  assert.equal(byBooking.status,200);
  assert.equal(byBooking.body.basis,'booking_date');
  assert.ok(byBooking.body.sector_breakdown.every(x=>x.value===mapping.sector));
  assert.ok(Math.abs(total(byBooking.body.sector_breakdown,'net_sales')-byBooking.body.totals.net_sales)<.03);
  const limited=db.col('users').find(x=>!(x.permissions||[]).includes('accounts.view'));
  if(limited){
   assert.equal((await get('/accounts/sales-facets',limited)).status,403);
   assert.equal((await get(query({}),limited)).status,403);
  }
  console.log('PASS v37 API: real directional sectors/services/channels, booking-date/travel-date filters, matching service/sector/cancellation capacity and revenue, source isolation, permission checks');
 }finally{server.closeAllConnections?.();server.close();db.persistNow();fs.rmSync(process.env.GDS_DATA_DIR,{recursive:true,force:true});}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});