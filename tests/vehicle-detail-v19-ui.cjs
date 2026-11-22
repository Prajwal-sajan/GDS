const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync('public/js/vehicle-detail-v19.js','utf8');
const dom=new JSDOM('<!doctype html><html><body><main id="host"></main></body></html>',{url:'http://localhost:3000',runScripts:'outside-only'});
const w=dom.window;w.HTMLElement.prototype.scrollIntoView=()=>{};
w.structuredClone=global.structuredClone;
const sample={
 vehicle:{id:5,registration_number:'AR 01 Q 7827',coach_template_id:1,coach:'A/C Seater/Sleeper (2+1)',
  vehicle_number:'',phone_number:'9113209461',ownership_type:'permanent',vehicle_role:'main',gps_enabled:true,
  dms_enabled:true,model_name:'Bharat Benz',manufacture_year:2022,odometer_reading:760281,
  tags:{},status:'active'},
 coaches:[{id:1,name:'A/C Seater/Sleeper (2+1)'},{id:2,name:'A/C Sleeper'}],
 documents:[{id:101,document_type:'RC',document_name:'Registration Certificate (RC)',visibility:'public',
  expiry_date:'2026-11-30',has_file:true,file_name:'RC.pdf'}],
 maintenance:[],service:{last_service_date:null,next_service_date:null,status:'Active',odometer_reading:760281,next_service_km:null},
 archive:[]
};
const changes=[],toasts=[];
w.can=()=>true;
w.G={
 get:async()=>structuredClone(sample),
 put:async(url,payload)=>{changes.push({url,payload});Object.assign(sample.vehicle,payload);return {vehicle:sample.vehicle};},
 post:async()=>({}),del:async()=>({}),toast:(text)=>toasts.push(text),
 err:e=>{throw e;},confirm:async()=>true
};
w.eval(html);
const delay=()=>new Promise(resolve=>setTimeout(resolve,30));
(async()=>{
 const host=w.document.getElementById('host');
 await w.VehicleDetailV19.open({id:5,mode:'view',host,onDone:async()=>{host.innerHTML='Back to list';}});
 assert.match(host.textContent,/View Vehicle Details/);
 assert.match(host.textContent,/GPS & DRIVER MONITORING/);
 assert.match(host.textContent,/VEHICLE SPECIFICATIONS/);
 assert.equal(host.querySelectorAll('[role=tab]').length,4);
 assert.equal(host.querySelector('[data-vd19-save]'),null);
 host.querySelector('[data-vd19-tab="documents"]').click();await delay();
 assert.match(host.textContent,/AITP Form 2/);
 assert.match(host.textContent,/VLTD/);
 assert.match(host.textContent,/FDSS/);
 assert.equal(host.querySelector('[data-vd19-doc-upload]'),null,'view is read-only');
 host.querySelector('[data-vd19-tab="maintenance"]').click();await delay();
 assert.match(host.textContent,/No maintenance records yet/);
 host.querySelector('[data-vd19-tab="archive"]').click();await delay();
 assert.match(host.textContent,/Nothing archived yet/);
 host.querySelector('[data-vd19-archive-filter="documents"]').click();await delay();
 assert.ok(host.querySelector('[data-vd19-archive-filter="documents"].active'));
 host.querySelector('[data-vd19-mode="edit"]').click();await delay();
 assert.match(host.textContent,/Edit Vehicle/);
 host.querySelector('[data-vd19-tab="documents"]').click();await delay();
 assert.ok(host.querySelector('[data-vd19-doc-upload="RC"]'),'replace action available in edit');
 assert.ok(host.querySelector('[data-vd19-doc-archive="101"]'),'archive action available in edit');
 assert.ok(host.querySelector('[data-vd19-doc-delete="101"]'),'delete action available in edit');
 host.querySelector('[data-vd19-tab="details"]').click();await delay();
 const reg=host.querySelector('[data-vd19-field="vehicle_number"]');
 assert.ok(reg);reg.value='TEST-FLEET-19';reg.dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal(host.querySelector('[data-vd19-save]').disabled,false);
 host.querySelector('[data-vd19-tag-add]'); // tag inputs must remain functional
 host.querySelector('[name="tag_name"]').value='depot';
 host.querySelector('[name="tag_value"]').value='mangaluru';
 host.querySelector('[data-vd19-tag-add]').click();await delay();
 assert.match(host.textContent,/depot = mangaluru/);
 host.querySelector('[data-vd19-save]').click();await delay();
 assert.ok(changes.some(x=>x.url.includes('/detail-v19')&&x.payload.vehicle_number==='TEST-FLEET-19'),'full editor save wired');
 assert.ok(changes.some(x=>x.payload.tags?.depot==='mangaluru'),'tags persisted');
 host.querySelector('[data-vd19-back]').click();await delay();
 assert.match(host.textContent,/Back to list/);
 console.log('PASS v19 UI browser DOM: View/Edit navigation, four tabs, document actions, tags, save, and back');
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
