'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<html><body><main id="app"></main></body></html>',{
 url:'http://localhost:3000/#/accounts/invoices',runScripts:'outside-only'});
const w=dom.window,root=w.document.getElementById('app'),wait=()=>new Promise(r=>setTimeout(r,10));
w.G={screens:{accounts:async el=>{el.innerHTML='<nav id="accounts-tabs">Sales | Transactions | Receivables | Reports | Invoices | OTA Invoice Verifier | Agent Settings | Loyalty</nav><section data-ac10-page>Legacy</section>';}},
 get:async url=>{
  if(url==='/accounts/invoices-v24')return sample;
  if(url.endsWith('/documents/legacy-1'))return {document:sample.documents[0],snapshot:null};
  return {};
 },post:async()=>({}),viewAs:'',toast:()=>{},err:err=>{throw err}};
w.can=()=>true;w.esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
w.localStorage.setItem('token','test');
const kinds=['tax','metro','cloud','ai','chat','platform','operator'],
 labels=['Tax Invoice','Metro Feeder Statement','Cloud Calling Statement','AI Calling Statement','Chat Statement','Platform Sales Statement','Operator Statement'];
const documents=kinds.map((kind,i)=>({
 key:'legacy-'+(i+1),type:kind,label:labels[i],name:['ST/26-27/11','MFS-2026-00042','CS-2026-00033','CS-2026-00034','CHS-2026-00035','PSS-2026-00091','OS-2026-00132'][i],
 period_month:'2026-10',document_date:'2026-10-31',rank:i,has_pdf:i===0,amount:i===6?121811.93:null
}));
documents.push({key:'issued-1',type:'operator',label:'Operator Statement',name:'OS-2026-00011',period_month:'2026-09',
 document_date:'2026-09-30',rank:6,has_pdf:true});
const sample={documents,balance:{statement:'OS-2026-00132',statement_key:'legacy-7',closing_balance:121811.93,
 payable_by_operator:0,payable_to_operator:121811.93,pending_payments:0},
 types:kinds.map((id,i)=>({id,label:labels[i]})),years:['2026','2025']};
w.eval(fs.readFileSync('public/js/invoices-v24.js','utf8'));
(async()=>{
 await w.G.screens.accounts(root,{tab:'invoices'});
 assert.ok(root.querySelector('#accounts-tabs'),'All top-level Accounts tabs retained');
 assert.ok(root.querySelector('.inv24-outstanding'),'Outstanding panel present');
 assert.equal(root.querySelectorAll('.inv24-month').length,2,'Month groups and separator');
 assert.equal(root.querySelectorAll('.inv24-row').length,8,'All document rows');
 assert.equal(root.querySelectorAll('[data-inv24=view]').length,8,'View per document');
 assert.equal(root.querySelectorAll('[data-inv24=pdf]').length,8,'PDF per document');
 assert.equal(root.querySelectorAll('[data-inv24=all]').length,2,'Download all each month');
 assert.ok(root.querySelector('[data-inv24=current-view]'),'Current statement View');
 assert.ok(root.querySelector('[data-inv24=current-pdf]'),'Current statement PDF');
 assert.ok(root.querySelector('[data-inv24=refresh]'),'Refresh');
 assert.ok(root.querySelector('[data-inv24=pay]'),'Pay action');
 assert.ok(root.querySelector('[data-inv24=new]'),'Add missing document');
 assert.ok(root.querySelector('[name=inv24-type]'),'Document-type selector');
 assert.ok(root.querySelector('[name=inv24-year]'),'Year selector');
 assert.equal(root.querySelector('[name=inv24-type]').options.length,8,'Seven types + All');
 assert.ok(root.textContent.includes('OCTOBER 2026'));
 assert.ok(root.textContent.includes('SEPTEMBER 2026'));
 assert.ok(root.textContent.includes('₹0.00'),'No debt when operator has credit');
 const type=root.querySelector('[name=inv24-type]');type.value='metro';type.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(root.querySelectorAll('.inv24-row').length,1,'Type filters work');
 const year=root.querySelector('[name=inv24-year]');year.value='2025';year.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(root.querySelectorAll('.inv24-row').length,0,'Year filter works');
 year.value='all';year.dispatchEvent(new w.Event('change',{bubbles:true}));
 type.value='all';type.dispatchEvent(new w.Event('change',{bubbles:true}));
 root.querySelector('[data-inv24=pay]').click();await wait();
 assert.ok(root.textContent.includes('No payment due'),'Prevent payment of operator credit');
 root.querySelector('[data-inv24=close]').click();await wait();
 root.querySelector('[data-inv24=new]').click();await wait();
 assert.ok(root.querySelector('[name=name]')&&root.querySelector('[name=month]'),'New document accessible form');
 root.querySelector('[data-inv24=close]').click();await wait();
 const css=fs.readFileSync('public/css/invoices-v24.css','utf8');
 for(const s of ['.inv24-outstanding','.inv24-toolbar','.inv24-month','.inv24-row','.inv24-pdf-frame','@media print'])
 assert.ok(css.includes(s),'CSS coverage '+s);
 const html=fs.readFileSync('public/index.html','utf8');
 assert.ok(html.includes('/css/invoices-v24.css')&&html.includes('/js/invoices-v24.js'));
 assert.ok(html.indexOf('/js/report-suite-v22.js')<html.indexOf('/js/invoices-v24.js'),'Additive overlay loading after v22 Reports');
 console.log('PASS Invoices v24 UI: 8 statements in 2 months, balance, selectors, view/PDF/ZIP/current/pay/refresh, source imports and parity CSS');
})().catch(err=>{console.error(err);process.exitCode=1;});
