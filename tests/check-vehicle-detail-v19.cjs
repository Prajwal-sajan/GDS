const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'v19-test-'));
process.env.GDS_RESEED='1';
const app=require('../server/index'),db=require('../server/db');
let srv,base,owner,acct;
async function req(method,url,body,token=owner,file=false){
 const res=await fetch(base+'/api'+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:res.status,data:file?await res.arrayBuffer():await res.json()};
}
async function login(phone){
 await req('POST','/auth/request-otp',{phone},null);
 const r=await req('POST','/auth/verify-otp',{phone,otp:'1234'},null);
 assert.equal(r.status,200);
 return r.data.token;
}
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9ZV2go8AAAAASUVORK5CYII=';
(async()=>{
 srv=app.listen(0);base='http://127.0.0.1:'+srv.address().port;
 try{
 owner=await login('9999999999');acct=await login('9666666666');
 const vehicles=(await req('GET','/vehicles')).data.vehicles;
 assert.ok(vehicles.length>=2);
 const v=vehicles[0],url='/vehicles/'+v.id;
 const detail=(await req('GET',url+'/detail-v19')).data;
 assert.ok(detail.documents.length>=5);
 assert.equal((await req('GET',url+'/detail-v19',undefined,acct)).status,200);
 assert.equal((await req('PUT',url+'/detail-v19',{notes:'X'},acct)).status,403);
 assert.equal((await req('PUT',url+'/detail-v19',{purchased_date:'2026-02-32'})).status,400);
 assert.equal((await req('PUT',url+'/detail-v19',{registration_number:vehicles[1].registration_number})).status,409);
 const result=await req('PUT',url+'/detail-v19',{
  coach_template_id:v.coach_template_id,registration_number:v.registration_number,
  phone_number:'9113209461',vehicle_number:'FLEET-001',ownership_type:'temporary',
  vehicle_role:'main',gps_enabled:false,dms_enabled:true,gps_device_id:'GPS-12345',
  gps_provider:'Fleetx',notes:'Vehicle QA',tags:{depot:'mangaluru'},odometer_reading:125000.5});
 assert.equal(result.status,200,JSON.stringify(result.data));
 const updated=(await req('GET',url+'/detail-v19')).data;
 assert.equal(updated.vehicle.vehicle_number,'FLEET-001');
 assert.equal(updated.vehicle.tags.depot,'mangaluru');
 assert.equal(updated.vehicle.gps_enabled,false);
 const original=updated.documents.find(d=>d.document_type==='RC');
 const uploaded=await req('POST',url+'/documents-v19',{document_type:'RC',
   file_name:'rc.png',file_data:png,visibility:'private',expiry_date:'2027-11-30'});
 assert.equal(uploaded.status,200,JSON.stringify(uploaded.data));
 const id=uploaded.data.document.id;
 let now=(await req('GET',url+'/detail-v19')).data;
 assert.ok(now.archive.some(d=>d.id===original.id&&d.archive_reason==='replaced'));
 assert.ok(now.documents.some(d=>d.id===id&&d.visibility==='private'));
 assert.equal((await req('GET','/vehicles/'+vehicles[1].id+'/documents-v19/'+id+'/file')).status,404);
 assert.equal((await req('PUT',url+'/documents-v19/'+id,{visibility:'public',expiry_date:'2028-01-02'})).status,200);
 const image=await req('GET',url+'/documents-v19/'+id+'/file',undefined,owner,true);
 assert.equal(image.status,200);assert.ok(image.data.byteLength>20);
 assert.equal((await req('POST',url+'/documents-v19/'+id+'/archive',{})).status,200);
 now=(await req('GET',url+'/detail-v19')).data;
 assert.ok(now.archive.some(d=>d.id===id&&d.archive_reason==='manual'));
 assert.ok(!now.documents.some(d=>d.id===id));
 const vltd=await req('POST',url+'/documents-v19',{document_type:'VLTD',file_name:'vltd.png',file_data:png});
 assert.equal(vltd.status,200);
 assert.equal((await req('DELETE',url+'/documents-v19/'+vltd.data.document.id)).status,200);
 const m=await req('POST',url+'/maintenance-v19',{label:'Engine service',type:'service',
   service_date:'2026-11-20',next_due_date:'2027-05-20',next_due_km:140000,
   odometer_km:125000.5,cost:5500,file_name:'jobcard.png',file_data:png});
 assert.equal(m.status,200,JSON.stringify(m.data));
 const mid=m.data.record.id;
 now=(await req('GET',url+'/detail-v19')).data;
 assert.equal(now.service.last_service_date,'2026-11-20');
 assert.equal(now.service.next_service_km,140000);
 assert.ok(now.maintenance.some(r=>r.id===mid&&r.has_file));
 assert.equal((await req('PUT',url+'/maintenance-v19/'+mid,{cost:6000})).status,200);
 assert.equal((await req('GET',url+'/maintenance-v19/'+mid+'/file',undefined,owner,true)).status,200);
 assert.equal((await req('POST',url+'/maintenance-v19/'+mid+'/archive',{})).status,200);
 now=(await req('GET',url+'/detail-v19')).data;
 assert.ok(now.archive.some(r=>r.kind==='maintenance'&&r.id===mid));
 assert.equal((await req('PUT',url+'/maintenance-v19/'+mid,{cost:7})).status,404);
 assert.equal((await req('POST',url+'/maintenance-v19',{label:'Bad',type:'service',cost:-1})).status,400);
 assert.equal((await req('POST',url+'/maintenance-v19',{label:'Not allowed'},acct)).status,403);
 assert.equal((await req('POST',url+'/documents-v19',{document_type:'RC',file_name:'a.png',file_data:png},acct)).status,403);
 assert.ok(db.col('edit_history').filter(x=>x.entity==='vehicle').some(x=>x.section==='maintenance'));
 const ui=fs.readFileSync(path.join(__dirname,'../public/js/vehicle-detail-v19.js'),'utf8');
 new vm.Script(ui);
 for(const txt of ['View Vehicle Details','Edit Vehicle','Coach Type','GPS & DRIVER MONITORING','VEHICLE SPECIFICATIONS','Tags','Document','Maintenance','Archive',
  'Registration Certificate (RC)','AITP Form 2','AITP Form 3','VLTD','FDSS','Replace','Public','Private','No maintenance records yet','Nothing archived yet','Save Vehicle'])
  assert.ok(ui.includes(txt),'Missing screenshot UI '+txt);
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 assert.ok(html.indexOf('vehicles-parity-v9.js')<html.indexOf('vehicle-detail-v19.js'));
 assert.ok(html.indexOf('vehicle-detail-v19.js')<html.indexOf('main.js'));
 console.log('PASS Vehicles v19: CRUD, validation, permissions, document lifecycle/files, maintenance and screenshot controls');
 }finally{await new Promise(done=>srv.close(done));fs.rmSync(process.env.GDS_DATA_DIR,{recursive:true,force:true});}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
