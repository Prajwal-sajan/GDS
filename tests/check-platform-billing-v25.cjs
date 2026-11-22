'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'gds-invoice-v25-'));
process.env.GDS_RESEED='1';
process.env.GDS_PLATFORM_BILLING_KEY='local-platform-billing-service-token-for-test-only-2026';
const app=require('../server/index'),db=require('../server/db'),U=require('../server/util');
const B=require('../server/platform-billing-v25'),KEY=process.env.GDS_PLATFORM_BILLING_KEY;
let server,base;
const request=async(url,{method='GET',token,service=false,body,binary=false}={})=>{
 const headers={};
 if(token)headers.Authorization='Bearer '+token;
 if(service)headers['x-billing-service-key']=KEY;
 if(body!==undefined)headers['Content-Type']='application/json';
 const r=await fetch(base+'/api'+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const data=binary?Buffer.from(await r.arrayBuffer()):await r.json().catch(()=>({}));
 return {status:r.status,data,headers:r.headers};
};
const login=async phone=>{
 await request('/auth/request-otp',{method:'POST',body:{phone}});
 const r=await request('/auth/verify-otp',{method:'POST',body:{phone,otp:'1234'}});
 assert.equal(r.status,200);return r.data.token;
};
const round=n=>Math.round(n*100)/100;
const line=(description,rate,qty=1,sac='998551')=>{
 const taxable=round(rate*qty),tax=round(taxable*.18);
 return {description,rate,qty,sac,gst_rate:18,taxable,total:round(taxable+tax)};
};
(async()=>{
 server=app.listen(0);base='http://127.0.0.1:'+server.address().port;
 try{
 const token=await login('9999999999'),agent=await login('9444444441');
 let d=await request('/accounts/invoices-v25',{token});
 assert.equal(d.status,200);assert.equal(d.data.documents.length,0,'No demo/reference invoices shown as issued');
 assert.equal(d.data.balance.closing_balance,null,'No fabricated outstanding balance');
 assert.equal((await request('/accounts/invoices-v25',{token:agent})).status,403,'Agent lacks financial rights');
 assert.equal((await request('/platform-billing/v25/configure',{method:'POST',token,body:{}})).status,403,'Operator cannot configure issuer');
 assert.equal((await request('/accounts/invoices-v24/documents',{method:'POST',token,body:{type:'tax'}})).status,405,'Old Add document endpoint closed');
 assert.equal((await request('/accounts/invoices-v24/documents/legacy-1/pdf',{method:'POST',token,body:{}})).status,405,'Old PDF upload endpoint closed');
 const conf={issuer:{
  legal_name:'JourneyOS Billing Services Private Limited',address:'Bengaluru, Karnataka, India',
  email:'billing@example.test',phone:'08000000000',gstin:'29ABCDE1234F1Z5',
  bank_name:'Test Bank',bank_account_name:'JourneyOS Billing Services',bank_account_number:'000000000001',bank_ifsc:'TEST0000123'
 },operator:{
  operator_id:1000,legal_name:'Demo Travels Private Limited',address:'Bengaluru, Karnataka, India',
  state:'Karnataka',gstin:'29ABCDE1234F1Z5'
 }};
 assert.equal((await request('/platform-billing/v25/configure',{method:'POST',service:true,body:conf})).status,200);
 const last=U.addDays(U.today().slice(0,7)+'-01',-1).slice(0,7);
 const due=U.addDays(U.today(),30),dts=last+'-10';
 const rows=[
  line('GDS Distribution charges',100),line('Whatsapp Charges',5,2,'998419'),
  line('AI Messages',2,1,'998313'),line('SMS Charges',1,2,'998319'),
  line('Cloud Calling',10,1,'998419'),line('AI Calling',4,1,'998313'),
  line('Cloud Telephony Number Rental',5,1,'998419'),
  line('Bus ticket reservation service (commission)',8,1,'998551')
 ];
 const taxable=round(rows.reduce((s,x)=>s+x.taxable,0)),gst=round(rows.reduce((s,x)=>s+(x.total-x.taxable),0));
 const tax={invoice_meta:{due_date:due},place_of_supply:'Karnataka',line_items:rows,
  totals:{taxable,cgst:round(gst/2),sgst:round(gst/2),total:round(taxable+gst)}};
 const chat={summary_rows:[{label:'Outgoing',count:2,rate:5,amount:10},
  {label:'AI replies',count:1,rate:2,amount:2},{label:'SMS',count:2,rate:1,amount:2}],
  totals:{before_gst:14}};
 const cloud={lines:[{call_id:'T-CLOUD-01',date:dts,time:'10:00:00',from:'1000000001',to:'1000000002',duration:'0:35',charge:10}],
  summary_rows:[{label:'Cloud Calling',calls:1,charge:10,gst:1.8,total:11.8},
    {label:'Business number rental',calls:0,charge:5,gst:.9,total:5.9}],
  totals:{total:17.7}};
 const ai={lines:[{call_id:'T-AI-01',date:dts,time:'10:10:00',from:'1000000003',to:'1000000004',duration:'1:03',charge:4}],
  summary_rows:[{label:'AI Calling',calls:1,charge:4,gst:.72,total:4.72}],totals:{total:4.72}};
 const metro={lines:[{ticket_evidence_id:'ticket-1',date:dts,pnr:'PNR-01',service:'GDS1',
  metro:'Metro Operator',passenger_station:'Station A',exchange_point:'Station B',pax:1,fare_per_pax:20,fare:20}],
  summary_rows:[{provider:'Metro Operator',city:'Bengaluru',billing_basis:'Issued ticket',pnrs:1,passengers:1,metro_fares:20}],
  totals:{metro_fares:20,passengers:1}};
 const platform={channel_summary:[{label:'Net to operator',website:100,paytm:0,offline_sales:0,total:100}],
  lines:[{travel_date:dts,booked_on:dts,channel:'Website',pnr:'PNR-01',status:'Sale',sales:115.5,
    offer:0,net_fare:110,commission:8,gst_on_commission:1.44,cancellation_charge:0}],
  totals:{total_commission:8,net_to_operator:100}};
 const operator={opening_balance:100,summary_rows:[{label:'Opening balance',amount:100},
  {label:'Platform sales',amount:100},{label:'Metro feeder fares',amount:20},{label:'Supplier tax invoice',amount:tax.totals.total}],
  ledger:[{date:dts,type:'Metro',particulars:'Ticket fares',deducted:20,collected:0,balance:80,reference:'Metro-1'},
   {date:dts,type:'Platform Sales',particulars:'Website',deducted:0,collected:100,balance:180,reference:'PSS-1'},
   {date:dts,type:'Invoice',particulars:'Platform services',deducted:tax.totals.total,collected:0,balance:round(180-tax.totals.total),reference:'TAX-1'}],
  posted_closing_balance:round(180-tax.totals.total)};
 const docs={tax,metro,cloud,ai,chat,platform,operator};
 const validRequest=kind=>({type:kind,month:last,operator_id:1000,verified:true,locked:true,
    source_refs:['provider-evidence-'+kind+'-'+last],snapshot:docs[kind]});
 assert.equal((await request('/platform-billing/v25/source',{method:'POST',token,body:validRequest('chat')})).status,403);
 const incorrect=validRequest('tax');incorrect.snapshot={...tax,line_items:tax.line_items.map(x=>({...x}))};
 incorrect.snapshot.line_items[0].taxable=1;
 assert.equal((await request('/platform-billing/v25/source',{method:'POST',service:true,body:incorrect})).status,400,
    'Mismatched tax line rejected');
 const kinds=['tax','metro','cloud','ai','chat','platform','operator'];
 for(const kind of kinds){
   const response=await request('/platform-billing/v25/source',{method:'POST',service:true,body:validRequest(kind)});
   assert.equal(response.status,201,'Ingest '+kind+': '+JSON.stringify(response.data));
   if(kind!=='operator')assert.equal(response.data.issuance.issued.length,0,'Never issue incomplete month');
 }
 d=await request('/accounts/invoices-v25',{token});
 assert.equal(d.status,200);assert.equal(d.data.documents.length,7,'Automatic generation after seventh sealed source');
 assert.equal(new Set(d.data.documents.map(x=>x.type)).size,7,'All seven document families issued');
 assert.ok(d.data.documents.every(x=>x.has_pdf&&!x.is_reference));
 assert.equal(d.data.balance.closing_balance,round(180-tax.totals.total));
 for(const doc of d.data.documents){
  const res=await request('/accounts/invoices-v25/documents/'+doc.key+'/pdf',{token,binary:true});
  assert.equal(res.status,200,'PDF '+doc.type);
  assert.equal(res.data.subarray(0,5).toString(),'%PDF-');
  assert.ok(res.data.subarray(-150).toString().includes('%%EOF'));
  assert.ok(res.data.toString('latin1').includes('Document No.'));
  assert.ok(!res.data.toString('latin1').includes('SAVETRIP TECHNOLOGIES'),'Supplier brand not copied');
  assert.equal((await request('/accounts/invoices-v25/documents/'+doc.key,{token:agent})).status,403);
 }
 const taxDoc=d.data.documents.find(x=>x.type==='tax');
 const taxPdf=(await request('/accounts/invoices-v25/documents/'+taxDoc.key+'/pdf',{token,binary:true})).data.toString('latin1');
 assert.ok(taxPdf.includes('TAX INVOICE')&&taxPdf.includes('SAC')&&taxPdf.includes('CGST')&&taxPdf.includes('SGST')&&taxPdf.includes('Bank details'),'PDF follows uploaded tax structure');
 assert.equal((await request('/accounts/invoices-v25/documents/legacy-1',{token})).status,404,
  'Old reference documents not exposed through issued catalogue');
 assert.equal((await request('/accounts/invoices-v25/current',{token})).status,200);
 const zip=await request('/accounts/invoices-v25/bundle/'+last,{token,binary:true});
 assert.equal(zip.status,200);
 assert.equal(zip.data.subarray(0,4).toString('hex'),'504b0304');
 const count=db.col('billing_documents').filter(x=>x.platform_generated).length;
 assert.equal(count,7);
 assert.equal((await request('/platform-billing/v25/issue-due',{method:'POST',service:true,body:{}})).data.issued.length,0,'Idempotent periodic generation');
 assert.equal(db.col('billing_documents').filter(x=>x.platform_generated).length,count);
 assert.equal((await request('/platform-billing/v25/source',{method:'POST',service:true,body:validRequest('tax')})).data.source.reused,true,'Identical re-ingest no-op');
 const changed=validRequest('tax');changed.source_refs.push('different');
 assert.equal((await request('/platform-billing/v25/source',{method:'POST',service:true,body:changed})).status,409,'Sealed source cannot be overwritten');
 assert.equal((await request('/accounts/invoices-v25/payments',{method:'POST',token,body:{reference:'TEST-UTR-100',amount:10}})).status,400,
   'Positive operator receivable is not operator debt');
 console.log('PASS v25: platform-only issuance, 7 source-backed A4 PDFs, no operator Add/Upload, invoice GST, balance, source locks, idempotency, signed access and complete ZIP');
 }finally{await new Promise(r=>server.close(r));db.persistNow();fs.rmSync(process.env.GDS_DATA_DIR,{recursive:true,force:true});}
})().then(()=>process.exit(0)).catch(err=>{console.error(err);process.exit(1);});
