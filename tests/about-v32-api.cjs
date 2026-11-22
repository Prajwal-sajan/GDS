'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'about-v32-'));
process.env.GDS_RESEED='1';
process.env.GDS_ENVIRONMENT='uat';
process.env.GDS_BUILD_TIME='2026-11-23T12:34:00Z';
const pkg=require('../package.json');
const app=require('../server/index'),db=require('../server/db'),auth=require('../server/auth');
const {buildInfo}=require('../server/about-v32-build');
const owner=db.col('users').find(x=>x.role==='owner');
assert.ok(owner,'Owner seeded');
const token=auth.sign({uid:owner.id,exp:Date.now()+300000});
const server=app.listen(0);
const url='http://127.0.0.1:'+server.address().port;
(async()=>{
 try{
  const headers={Authorization:'Bearer '+token};
  const r=await fetch(url+'/api/about/build',{headers});
  assert.equal(r.status,200);
  assert.match(r.headers.get('cache-control'),/no-store/);
  assert.match(r.headers.get('vary'),/Authorization/i);
  const data=await r.json();
  assert.equal(data.product,'JourneyOS Operator');
  assert.equal(data.version,pkg.version);
  assert.equal(data.environment,'UAT');
  assert.equal(data.built_at,'2026-11-23T12:34:00.000Z');
  assert.equal(data.update_source,'deployed-server');
  assert.ok(!JSON.stringify(data).includes('SaveTrip Operator'));
  assert.equal(data.build_id,buildInfo.build_id);
  if(data.commit){
   assert.match(data.commit,/^[a-f0-9]{40}$/);
   assert.equal(data.short_commit,data.commit.slice(0,8));
   assert.equal(data.commit_url,'https://github.com/Prajwal-sajan/GDS/commit/'+data.commit);
  }else assert.equal(data.commit_url,null);
  const unauth=await fetch(url+'/api/about/build');
  assert.ok([401,403].includes(unauth.status));
  const html=await fetch(url+'/');
  const htmlSrc=await html.text();
  assert.match(html.headers.get('cache-control'),/no-store/);
  assert.ok(htmlSrc.includes('window.__GDS_SERVED_BUILD__='+JSON.stringify(data.build_id)));
  assert.ok(htmlSrc.includes('/js/about-v32.js?build=32'));
  assert.ok(htmlSrc.includes('/css/about-v32.css?build=32'));
  assert.match(htmlSrc,/rel="manifest"/);
  assert.match(htmlSrc,/journeyos-192.png/);
  const m=await fetch(url+'/manifest.webmanifest');
  assert.equal(m.status,200);
  const manifest=await m.json();
  assert.equal(manifest.name,'JourneyOS Operator');
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.start_url,'/#/');
  assert.equal(manifest.icons.length,2);
  for(const [n,i] of [[192,0],[512,1]]){
   const icon=await fetch(url+manifest.icons[i].src);
   assert.equal(icon.status,200);
   const image=Buffer.from(await icon.arrayBuffer());
   assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a','PNG signature '+n);
   assert.equal(image.readUInt32BE(16),n,'PNG actual width');
   assert.equal(image.readUInt32BE(20),n,'PNG actual height');
  }
  const worker=await fetch(url+'/sw.js');
  assert.equal(worker.status,200);
  assert.match(worker.headers.get('cache-control'),/no-store/);
  const code=await worker.text();
  assert.match(code,/addEventListener\('fetch'/);
  assert.match(code,/respondWith\(fetch\(event.request\)\)/);
  assert.doesNotMatch(code,/caches\.open|CacheStorage|localStorage/,'Do not cache bookings or PNRs');
  console.log('PASS About v32 backend: real metadata, environment, version, no-store, auth, served-page fingerprint, valid 192/512 icon headers, manifest, private-data-safe service worker');
 }finally{
  await new Promise(done=>server.close(done));db.persistNow();
  fs.rmSync(process.env.GDS_DATA_DIR,{recursive:true,force:true});
 }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
