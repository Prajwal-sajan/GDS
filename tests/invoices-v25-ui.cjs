'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<body><main id="app"></main></body>',{url:'http://localhost:3000/#/accounts/invoices',runScripts:'outside-only'});
const w=dom.window,root=w.document.getElementById('app');
const types=['tax','metro','cloud','ai','chat','platform','operator'];
const labels=['Tax Invoice','Metro Feeder Statement','Cloud Calling Statement','AI Calling Statement','Chat Statement',
 'Platform Sales Statement','Operator Statement'];
const docs=types.map((type,i)=>({key:'issued-'+(i+1),name:'BILL-2026-'+String(i+1).padStart(5,'0'),
 type,label:labels[i],period_month:'2026-10',document_date:'2026-11-01',status:'issued',platform_generated:true,has_pdf:true,is_reference:false}));
docs.push({...docs[6],key:'issued-8',name:'BILL-2026-00008',period_month:'2026-09'});
const data={documents:docs,types:types.map((id,i)=>({id,label:labels[i]})),years:['2026'],
 balance:{statement:'BILL-2026-00007',statement_key:'issued-7',closing_balance:120,
  payable_to_operator:120,payable_by_operator:0,pending_payments:0},reference_current:null,auto_issued:true};
let standardCalls=0,lastPath='';
w.G={screens:{accounts:async(el)=>{el.innerHTML='<nav>Sales · Transactions · Receivables · Reports · Invoices · OTA Invoice Verifier · Agent Settings · Loyalty</nav><section data-ac10-page>Old</section>';}},
 get:async p=>{lastPath=p;return data},post:async()=>({}),viewAs:'',err:e=>{throw e},toast:()=>{},
 niceSelect:sel=>{standardCalls++;sel.classList.add('ui-dd-native');const b=w.document.createElement('button');b.className='ui-dd-btn';b.textContent=sel.options[sel.selectedIndex].text;sel.after(b)}};
w.can=()=>true;w.localStorage.setItem('token','test');
w.eval(fs.readFileSync('public/js/invoices-v24.js','utf8'));
(async()=>{
 await w.G.screens.accounts(root,{tab:'invoices'});
 assert.equal(lastPath,'/accounts/invoices-v25','Operator automatically reads newly platform-issued documents only');
 assert.ok(root.querySelector('.inv24-outstanding'));
 assert.equal(root.querySelectorAll('.inv24-row').length,8);
 assert.equal(root.querySelectorAll('[data-inv24=view]').length,8);
 assert.equal(root.querySelectorAll('[data-inv24=pdf]').length,8);
 assert.equal(root.querySelectorAll('[data-inv24=all]').length,2);
 assert.ok(root.querySelector('[data-inv24=current-view]'));
 assert.ok(root.querySelector('[data-inv24=current-pdf]'));
 assert.ok(root.querySelector('[data-inv24=refresh]'));
 assert.ok(root.querySelector('[data-inv24=pay]'));
 assert.equal(root.querySelectorAll('[data-inv24=new]').length,0);
 assert.equal(root.querySelectorAll('[data-inv24=upload]').length,0);
 assert.equal(root.querySelectorAll('[data-inv24-file]').length,0);
 assert.ok(!root.textContent.includes('Add document')&&!root.textContent.includes('Import PDF'));
 assert.ok(root.textContent.includes('Issued by our platform'));
 assert.equal(standardCalls,2,'Both filters are initialized with the shared standard dropdown');
 assert.equal(root.querySelectorAll('.inv25-filter .ui-dd-btn').length,2);
 assert.equal(root.querySelectorAll('.inv25-filter select').length,2);
 const type=root.querySelector('[name=inv24-type]');type.value='metro';type.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(root.querySelectorAll('.inv24-row').length,1,'Type filter remains functional');
 const year=root.querySelector('[name=inv24-year]');year.value='2026';year.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(root.querySelectorAll('.inv24-row').length,1,'Year filter remains functional');
 assert.ok(root.querySelectorAll('.ui-dd-btn').length>=2);
 const css=fs.readFileSync('public/css/invoices-v24.css','utf8');
 assert.ok(css.includes('.inv25-filter .ui-dd-btn'));
 assert.ok(css.includes('.inv25-type')&&css.includes('.inv25-year'));
 assert.ok(css.includes('.ui-dd-btn'));
 const source=fs.readFileSync('public/js/invoices-v24.js','utf8');
 assert.ok(!source.includes('async function addDocument(')&&!source.includes('async function upload('));
 console.log('PASS v25 UI: no Add document/Import PDF; both selectors use standard G.niceSelect, seven types, year filter, read-only monthly document list');
})().catch(e=>{console.error(e);process.exitCode=1;});
