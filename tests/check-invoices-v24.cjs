'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'gds-invoice24-'));
process.env.GDS_RESEED='1';
const app=require('../server/index');
const S=require('../server/invoices-v24'),db=require('../server/db'),U=require('../server/util');
let server,base;
const send=async(url,{method='GET',token='',body=null,binary=false}={})=>{
 const h={};if(token)h.Authorization='Bearer '+token;if(body!==null)h['Content-Type']='application/json';
 const r=await fetch(base+'/api'+url,{method,headers:h,body:body===null?undefined:JSON.stringify(body)});
 const data=binary?Buffer.from(await r.arrayBuffer()):await r.json();
 return {status:r.status,data,headers:r.headers};
};
const login=async phone=>{
 await send('/auth/request-otp',{method:'POST',body:{phone}});
 const r=await send('/auth/verify-otp',{method:'POST',body:{phone,otp:'1234'}});
 assert.equal(r.status,200,JSON.stringify(r.data));return r.data.token;
};
(async()=>{
 server=app.listen(0);base='http://127.0.0.1:'+server.address().port;
 try{
 const admin=await login('9999999999'),agent=await login('9444444441');
 let d=await send('/accounts/invoices-v24',{token:admin});
 assert.equal(d.status,200);
 const docs=d.data.documents;
 const types=[...new Set(docs.map(x=>x.type))].sort();
 assert.deepEqual(types,['ai','chat','cloud','metro','operator','platform','tax']);
 assert.ok(d.data.years.includes(new Date(U.addDays(U.today().slice(0,7)+'-01',-1)+'T12:00:00').getFullYear().toString()));
 assert.equal(d.data.balance.statement,null);
 assert.equal(d.data.balance.payable_by_operator,null);
 assert.equal(d.data.balance.payable_to_operator,null);
 assert.equal((await send('/accounts/invoices-v24',{token:agent})).status,403,'Agent cannot access operator invoices');
 assert.equal((await send('/accounts/documents',{token:agent})).status,403,'Legacy API cannot bypass finance permission');
 assert.equal((await send('/accounts/invoices-v24')).status,401);
 assert.equal((await send('/accounts/invoices-v24/payments',{method:'POST',token:admin,
  body:{amount:1,reference:'UTR-TEST-INVOICE'}})).status,400,'Cannot pay positive operator credit');
 const first=docs.find(x=>x.type==='tax');
 assert.equal((await send('/accounts/invoices-v24/documents/'+first.key+'/pdf',{token:admin})).status,409,'No fake provider PDF');
 const invalid=await send('/accounts/invoices-v24/documents/'+first.key+'/pdf',{method:'POST',token:admin,
  body:{filename:'fake.pdf',base64:Buffer.from('not PDF').toString('base64')}});
 assert.equal(invalid.status,400);
 // Supplied original is never committed; verify byte-perfect upload/download with a valid generated PDF fixture.
 const Pdf=require('../server/report-suite-pdf-v21');
 require('../public/js/report-suite-specs-v22.js');
 const V21=require('../server/reports-suite-v21');
 const date=U.addDays(U.today(),-2),from=U.addDays(date,-6);
 const sample=Pdf.generate('no-shows',V21.compute('no-shows',{from,to:date}));
 assert.ok(sample.subarray(0,5).toString()==='%PDF-');
 assert.ok(sample.subarray(-150).toString().includes('%%EOF'));
 for(const doc of docs){
   const up=await send('/accounts/invoices-v24/documents/'+doc.key+'/pdf',{method:'POST',token:admin,
    body:{filename:doc.name.replaceAll('/','-')+'.pdf',base64:sample.toString('base64')}});
   assert.equal(up.status,200,'Upload '+doc.label+' '+JSON.stringify(up.data));
   assert.equal(up.data.sha256,crypto.createHash('sha256').update(sample).digest('hex'));
   const pdf=await send('/accounts/invoices-v24/documents/'+doc.key+'/pdf',{token:admin,binary:true});
   assert.equal(pdf.status,200);
   assert.ok(pdf.data.equals(sample),'Byte-for-byte PDF exactness '+doc.label);
   assert.equal(pdf.headers.get('cache-control'),'private, no-store, max-age=0');
   assert.match(pdf.headers.get('content-disposition'),/inline/);
   const att=await send('/accounts/invoices-v24/documents/'+doc.key+'/pdf?download=1',{token:admin,binary:true});
   assert.match(att.headers.get('content-disposition'),/attachment/);
   assert.equal(att.data.length,sample.length);
 }
 const month=docs[0].period_month;
 const zip=await send('/accounts/invoices-v24/bundle/'+month,{token:admin,binary:true});
 assert.equal(zip.status,200);
 assert.ok(zip.data.subarray(0,4).equals(Buffer.from('504b0304','hex')),'True ZIP signature');
 assert.ok(zip.data.length>docs.length*sample.length,'All original PDFs in month');
 const cur=await send('/accounts/invoices-v24/current',{token:admin});
 assert.equal(cur.status,404);
 // A later signed operator statement can be imported with reconciled credit/debit entries.
 const now=U.today(),mon=now.slice(0,7);
 const newDoc=await send('/accounts/invoices-v24/documents',{method:'POST',token:admin,body:{
  type:'operator',name:'OS-QA-NEW',month:mon,date:now,reference_only:false,
  snapshot:{opening_balance:100,ledger:[{date:now,type:'Invoice',particulars:'Platform charge',
    deducted:350,collected:0,balance:-250}],posted_closing_balance:-250,
    summary_rows:[{label:'Closing balance',amount:-250}]}}});
 assert.equal(newDoc.status,201,JSON.stringify(newDoc.data));
 assert.equal((await send('/accounts/invoices-v24/current',{token:admin})).data.document.name,'OS-QA-NEW');
 const after=await send('/accounts/invoices-v24',{token:admin});
 assert.equal(after.data.balance.payable_to_operator,0);
 assert.equal(after.data.balance.payable_by_operator,250);
 const pay=await send('/accounts/invoices-v24/payments',{method:'POST',token:admin,body:{amount:100,reference:'UTR-INVOICE-2026'}});
 assert.equal(pay.status,202);assert.equal(pay.data.status,'pending_verification');
 assert.equal((await send('/accounts/invoices-v24',{token:admin})).data.balance.payable_by_operator,250,'Do not treat pending UTR as paid');
 assert.equal((await send('/accounts/invoices-v24/payments',{method:'POST',token:admin,body:{amount:100,reference:'UTR-INVOICE-2026'}})).status,409);
 const incorrectLedger=await send('/accounts/invoices-v24/documents',{method:'POST',token:admin,
  body:{type:'operator',name:'OS-QA-BAD',month:mon,date:now,reference_only:false,
   snapshot:{opening_balance:100,ledger:[{deducted:60,collected:0,balance:60}],posted_closing_balance:50}}});
 assert.equal(incorrectLedger.status,400,'Reject non-reconciling ledger');
 const badChat=await send('/accounts/invoices-v24/documents',{method:'POST',token:admin,
  body:{type:'chat',name:'CHS-QA-BAD',month:mon,date:now,snapshot:{summary_rows:[{label:'SMS',count:4,rate:.25,amount:2}]}}});
 assert.equal(badChat.status,400,'Message count×rate validation');
 assert.equal((await send('/accounts/invoices-v24/bundle/'+mon,{token:admin})).status,409,'No silent partial archive');
 assert.equal((await send('/accounts/invoices-v24/documents/legacy-999999',{token:admin})).status,404);
 console.log('PASS Invoices v24: seven types, privacy RBAC, exact original PDF bytes, ZIP all, current statement, signed payable, pending UTR, ledger and chat validation');
 }finally{
  await new Promise(resolve=>server.close(resolve));
  db.persistNow();
  fs.rmSync(process.env.GDS_DATA_DIR,{recursive:true,force:true});
 }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
