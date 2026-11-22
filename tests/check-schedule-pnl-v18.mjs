import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const vm = require('node:vm');
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'gds-pnl18-'));
process.env.GDS_RESEED='1';
const app=require('../server/index');
let server,base,owner,agent;
async function api(method,url,body,token=owner){
  const res=await fetch(base+'/api'+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:res.status,data:await res.json()};
}
async function login(phone){
  await api('POST','/auth/request-otp',{phone},null);
  const {status,data}=await api('POST','/auth/verify-otp',{phone,otp:'1234'},null);
  assert.equal(status,200);assert.ok(data.token);return data.token;
}
(async()=>{
  server=app.listen(0);
  base='http://127.0.0.1:'+server.address().port;
  try{
    owner=await login('9999999999');
    agent=await login('9444444441');
    const list=await api('GET','/schedules');
    assert.equal(list.status,200);
    const schedule=list.data.schedules.find(s=>s.status==='active');
    assert.ok(schedule,'seeded active schedule');
    const id=schedule.id,url='/schedules/'+id;
    const detail=(await api('GET',url)).data;
    const original=(await api('GET',url+'/pnl')).data;
    assert.ok(original.expense_breakdown&&Array.isArray(original.expense_breakdown.items),'P&L expense breakdown');
    assert.equal((await api('GET',url+'/pnl',undefined,agent)).status,403,'agent cannot view P&L');
    assert.equal((await api('PUT',url+'/pnl-expenses',{expected_version:0,overrides:{},sources:{},manual:[]},agent)).status,403,'agent cannot change P&L');
    const route=original.expense_breakdown.items.find(x=>!x.manual);
    const overrides=route?{[route.edit_key]:Number(route.per_day)+135}:{};
    const sources=route?{[route.edit_key]:'Bank'}:{};
    const payload={expected_version:original.expense_version,overrides,sources,
      manual:[{id:null,type:'running',label:'Fuel variance QA',amount:50.5,source:'Driver'},{id:null,type:'fixed',label:'Permit QA',amount:12.25,source:'Office'}]};
    assert.equal((await api('PUT',url+'/pnl-expenses',{...payload,manual:[{id:null,type:'running',label:'bad',amount:-100,source:'Driver'}]})).status,400,'negative amount rejected');
    assert.equal((await api('PUT',url+'/pnl-expenses',{...payload,overrides:{'unknown:expense':5}})).status,400,'unknown expense rejected');
    const saved=await api('PUT',url+'/pnl-expenses',payload);
    assert.equal(saved.status,200,JSON.stringify(saved.data));
    assert.equal(saved.data.expense_version,original.expense_version+1);
    const changed=saved.data.expense_breakdown.items;
    assert.equal(changed.filter(x=>x.manual).length,2,'two manual expenses saved');
    assert.ok(changed.find(x=>x.manual&&x.label==='Fuel variance QA'&&x.source==='Driver'));
    assert.ok(changed.find(x=>x.manual&&x.label==='Permit QA'&&x.type==='fixed'));
    const expectedDelta=(route?135:0)+50.5+12.25;
    assert.ok(Math.abs(saved.data.expense-original.expense-expectedDelta)<.02,'total expenses reconcile');
    assert.ok(Math.abs(saved.data.profit-original.profit+expectedDelta)<.02,'net profit reconciles');
    assert.equal((await api('PUT',url+'/pnl-expenses',payload)).status,409,'stale tab blocked');
    const after=(await api('GET',url+'/pnl')).data;
    assert.equal(after.expense_version,saved.data.expense_version);
    assert.ok(after.expense_breakdown.items.some(x=>x.manual&&x.label==='Fuel variance QA'));
    assert.equal((await api('POST',url+'/expenses',{label:'Unverified expense',amount:-3})).status,400,'legacy endpoint rejects negative costs');
    assert.equal((await api('POST',url+'/expenses',{label:'Unauthorised',amount:1},agent)).status,403,'legacy expense endpoint checks RBAC');
    const legacy=await api('POST',url+'/expenses',{label:'Legacy v13 expense',amount:17,type:'running'});
    assert.equal(legacy.status,200,'legacy Trip module can still add expenses');
    const afterLegacy=(await api('GET',url+'/pnl')).data;
    assert.equal(afterLegacy.expense_version,after.expense_version+1,'legacy writes invalidate P&L editor version');
    assert.equal((await api('PUT',url+'/pnl-expenses',{...payload,expected_version:after.expense_version})).status,409,'stale P&L editor cannot overwrite legacy expense');
    const routeAfter=(await api('GET','/routes/'+detail.route_id)).data;
    assert.ok(routeAfter,'route still accessible');
    const history=(await api('GET',url+'/history')).data.history;
    assert.ok(history.some(x=>x.section==='pnl_expenses'),'audit history recorded');
    const other=list.data.schedules.find(s=>s.id!==id&&s.status==='active');
    if(other){
      const p=(await api('GET','/schedules/'+other.id+'/pnl')).data;
      assert.equal(p.expense_breakdown.items.some(x=>x.manual&&x.label==='Fuel variance QA'),false,'expense isolated to selected schedule');
    }
    const script=fs.readFileSync(path.join(__dirname,'../public/js/schedule-pnl-v18.js'),'utf8');
    const browser={window:{},console};
    vm.runInNewContext(script,browser,{filename:'schedule-pnl-v18.js'});
    const module=browser.window.SchedulePnlV18;
    assert.ok(module&&typeof module.save==='function');
    const html=module.render({p:after,detail,canEdit:true});
    for(const term of ['TRIP P&L','Fixed Expenses','Running Expenses','INCOME','NET PROFIT','TOTAL EXPENSES','TOTAL INCOME','data-sxp-add="fixed"','data-sxp-add="running"','data-sxp-print'])
      assert.ok(html.includes(term),`missing screenshot feature ${term}`);
    assert.ok(html.includes('Fuel variance QA'));
    const css=fs.readFileSync(path.join(__dirname,'../public/css/schedule-pnl-v18.css'),'utf8');
    assert.ok(css.includes('@media print')&&css.includes('@media(max-width:900px)'),'print and narrow layout present');
    const index=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
    assert.ok(index.indexOf('schedule-pnl-v18.js')<index.indexOf('schedules-screenshot-v6.js'),'module loaded before schedules');
    console.log('PASS P&L v18: API RBAC/validation/versioning/audit, expense persist/isolation/math, UI screenshot controls');
  }finally{
    await new Promise(r=>server.close(r));
    fs.rmSync(process.env.GDS_DATA_DIR,{recursive:true,force:true});
  }
})().then(()=>process.exit(0)).catch(err=>{console.error(err);process.exit(1);});
