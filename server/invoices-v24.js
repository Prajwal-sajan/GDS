'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const db=require('./db'),U=require('./util');
const TYPES={
 tax:{label:'Tax Invoice',title:'TAX INVOICE',rank:0},
 metro:{label:'Metro Feeder Statement',title:'METRO FEEDER SERVICE STATEMENT',rank:1},
 cloud:{label:'Cloud Calling Statement',title:'CLOUD CALLS USAGE STATEMENT',rank:2},
 ai:{label:'AI Calling Statement',title:'AI VOICE CALLS USAGE STATEMENT',rank:3},
 chat:{label:'Chat Statement',title:'WHATSAPP, AI MESSAGES & SMS USAGE STATEMENT',rank:4},
 platform:{label:'Platform Sales Statement',title:'PLATFORM SALES STATEMENT',rank:5},
 operator:{label:'Operator Statement',title:'STATEMENT OF ACCOUNT',rank:6}
};
const money=x=>Math.round((Number(x)||0)*100)/100;
const bad=(message,status=400)=>Object.assign(new Error(message),{status});
const validMonth=x=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(x||''));
const validDate=x=>/^\d{4}-(0[1-9]|1[0-2])-[0-3]\d$/.test(String(x||''))&&!Number.isNaN(new Date(x+'T12:00:00Z').getTime())&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
const typeOf=d=>{
 const k=String(d.type||d.kind||'').toLowerCase();
 if(TYPES[k])return k;
 const l=String(d.label||'').toLowerCase();
 if(k==='invoice'||l.includes('tax invoice'))return 'tax';
 if(k==='metro'||l.includes('metro feeder'))return 'metro';
 if(k==='chats'||l.includes('chat statement'))return 'chat';
 if(k==='platform'||l.includes('platform sales'))return 'platform';
 if(k==='operator'||l.includes('operator statement'))return 'operator';
 if(k==='calls'||l.includes('calling'))return /\bai\b/i.test(l)?'ai':'cloud';
 return null;
};
const asDoc=(r,source)=>{
 const type=typeOf(r);if(!type)return null;
 const month=r.month||String(r.statement_date||r.date||'').slice(0,7);
 const hasPdf=!!r.pdf_sha256,hasSnapshot=!!r.snapshot&&typeof r.snapshot==='object';
 return {key:source+'-'+r.id,id:r.id,type,label:TYPES[type].label,name:r.name||r.number||'',
  period_month:month,document_date:r.statement_date||r.date||'',period_start:r.period_start||month+'-01',
  period_end:r.period_end||'',status:r.status||null,amount:r.amount??r.snapshot?.total??null,
  is_reference:!!(r.reference_only||r.is_demo_reference),has_pdf:hasPdf,has_snapshot:hasSnapshot,pdf_sha256:hasPdf?r.pdf_sha256:null,
  original_filename:r.original_filename||null,source,rank:TYPES[type].rank,
  imported_at:r.pdf_uploaded_at||null};
};
const resolve=key=>{
 const m=/^(legacy|issued)-(\d{1,9})$/.exec(String(key));
 if(!m)throw bad('Invalid document reference',404);
 const table=m[1]==='legacy'?'invoices':'billing_documents',r=db.col(table).get(Number(m[2]));
 if(!r||!typeOf(r))throw bad('Document not found',404);
 return {row:r,table,key:m[0],document:asDoc(r,m[1])};
};
const catalogue=()=>{
 const l=db.col('invoices').all().map(r=>asDoc(r,'legacy')).filter(Boolean);
 const v=db.col('billing_documents').all().map(r=>asDoc(r,'issued')).filter(Boolean);
 return [...l,...v].sort((a,b)=>b.period_month.localeCompare(a.period_month)||
   (b.document_date||'').localeCompare(a.document_date||'')||a.rank-b.rank||a.key.localeCompare(b.key));
};
const latestStatement=()=>{
 const docs=catalogue().filter(d=>d.type==='operator'&&!d.is_reference);
 return docs.sort((a,b)=>b.document_date.localeCompare(a.document_date)||b.period_month.localeCompare(a.period_month))[0]||null;
};
const balance=()=>{
 const statement=latestStatement(),r=statement?resolve(statement.key).row:null;
 const snap=r?.snapshot||{};
 // The operator statement is authoritative. Do not double subtract unverified UTRs,
 // and do not interpret positive (payable TO operator) as a debt BY operator.
 const close=r?(snap.posted_closing_balance??snap.closing_balance??r.amount):null;
 const amount=close===null||close===undefined?null:money(close);
 const pending=db.col('invoice_payments').filter(x=>x.status==='pending_verification').length;
 return {statement:statement?.name||null,statement_key:statement?.key||null,statement_date:statement?.document_date||null,
  closing_balance:amount,payable_to_operator:amount===null?null:money(Math.max(0,amount)),
  payable_by_operator:amount===null?null:money(Math.max(0,-amount)),pending_payments:pending,
  statement_type: 'posted',has_evidence:!!r};
};
const list=()=>({documents:catalogue(),balance:balance(),types:Object.entries(TYPES).map(([id,x])=>({id,label:x.label})),
  years:[...new Set(catalogue().map(x=>x.period_month.slice(0,4)).filter(Boolean))].sort().reverse()});
const pdfDir=path.join(path.dirname(db.DB_FILE),'invoice-pdfs');
const pdfFile=row=>{
 if(!row.pdf_sha256)return null;
 const name=row.pdf_sha256+'.pdf';
 return path.join(pdfDir,name);
};
function attachPdf(key,base64,filename,user){
 const {row,table}=resolve(key);
 if(typeof base64!=='string'||base64.length>17_000_000)throw bad('PDF exceeds the 12 MB document limit',413);
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)||base64.length%4!==0)throw bad('Invalid PDF encoding');
 const buf=Buffer.from(base64,'base64');
 if(buf.length<100||buf.length>12*1024*1024||buf.subarray(0,5).toString()!=='%PDF-'||
   !buf.subarray(Math.max(0,buf.length-4096)).toString('latin1').includes('%%EOF'))throw bad('Upload a complete valid PDF (maximum 12 MB)');
 const digest=crypto.createHash('sha256').update(buf).digest('hex');
 fs.mkdirSync(pdfDir,{recursive:true,mode:0o700});
 const dest=path.join(pdfDir,digest+'.pdf');
 if(!fs.existsSync(dest))fs.writeFileSync(dest,buf,{flag:'wx',mode:0o600});
 const current=Array.isArray(row.pdf_history)?row.pdf_history.slice():[];
 if(row.pdf_sha256&&row.pdf_sha256!==digest)current.push({sha256:row.pdf_sha256,
   filename:row.original_filename,uploaded_at:row.pdf_uploaded_at,uploaded_by:row.pdf_uploaded_by});
 db.col(table).update(row.id,{pdf_sha256:digest,
   original_filename:path.basename(String(filename||'invoice.pdf')).slice(0,150),
   pdf_uploaded_at:new Date().toISOString(),pdf_uploaded_by:user?.id||user?.name||'operator',
   pdf_bytes:buf.length,pdf_history:current});
 return {document:asDoc(row,key.split('-')[0]),sha256:digest,bytes:buf.length};
}
const getPdf=key=>{
 const {row,document}=resolve(key);const file=pdfFile(row);
 if(!file||!fs.existsSync(file))throw bad('Original PDF not uploaded yet. Import the provider-issued PDF to enable exact viewing and download.',409);
 const bytes=fs.readFileSync(file);
 const digest=crypto.createHash('sha256').update(bytes).digest('hex');
 if(digest!==row.pdf_sha256)throw bad('Document integrity verification failed',500);
 return {bytes,document};
};
const supportedSnapshotFields={
 tax:['line_items','totals','billing_address','shipping_address','place_of_supply','bank'],
 metro:['summary_rows','lines','totals','notes'],
 cloud:['lines','summary_rows','totals','notes'],
 ai:['lines','summary_rows','totals','notes'],
 chat:['summary_rows','totals','notes'],
 platform:['channel_summary','lines','totals','notes'],
 operator:['summary_rows','ledger','totals','notes']
};
function validateSnapshot(type,snapshot){
 if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))throw bad('Structured statement snapshot must be an object');
 const result={};
 for(const k of supportedSnapshotFields[type])if(snapshot[k]!==undefined){
   const v=snapshot[k];
   if(['line_items','summary_rows','lines','ledger','channel_summary','notes'].includes(k)){
     if(!Array.isArray(v)||v.length>20000)throw bad(k+' must be an array with at most 20,000 rows');
     if(v.some(x=>typeof x==='object'&&JSON.stringify(x).length>4000))throw bad('An oversized statement row was supplied');
   }else if(typeof v!=='object'&&typeof v!=='string')throw bad('Invalid '+k);
   result[k]=v;
 }
 for(const x of ['opening_balance','closing_balance','posted_closing_balance','provisional_balance']){
  if(snapshot[x]!==undefined){
   if(!Number.isFinite(Number(snapshot[x])))throw bad('Invalid '+x);
   result[x]=money(snapshot[x]);
  }
 }
 if(type==='operator'&&Array.isArray(result.ledger)){
   let running=money(result.opening_balance||0);
   for(const row of result.ledger){
     const debit=Number(row.deducted||0),credit=Number(row.collected||0);
     if(!Number.isFinite(debit)||!Number.isFinite(credit)||debit<0||credit<0)throw bad('Invalid ledger debit or credit');
     running=money(running+credit-debit);
     if(row.balance!==undefined&&Math.abs(running-Number(row.balance))>.011)throw bad('Ledger running balance does not reconcile');
   }
   if(result.posted_closing_balance!==undefined&&Math.abs(running-result.posted_closing_balance)>.011)throw bad('Posted closing balance does not reconcile');
 }
 if(type==='chat'&&Array.isArray(result.summary_rows)){
   for(const r of result.summary_rows){
     if(!Number.isFinite(Number(r.count))||!Number.isFinite(Number(r.rate))||
       Math.abs(money(Number(r.count)*Number(r.rate))-Number(r.amount))>.011)throw bad('Chat message count × rate does not match amount');
   }
 }
 return result;
}
function create(body,user){
 const type=String(body.type||'');
 if(!TYPES[type])throw bad('Unknown document type');
 const month=body.month,when=body.date||month+'-28';
 if(!validMonth(month)||!validDate(when)||when.slice(0,7)!==month)throw bad('Valid document month and date required');
 const name=String(body.name||'').trim();
 if(!name||name.length>80||!/^[A-Za-z0-9/_. -]+$/.test(name))throw bad('Valid document reference required');
 if(catalogue().some(x=>x.name===name&&x.period_month===month&&x.type===type))throw bad('A document with this reference already exists',409);
 const snapshot=body.snapshot===undefined?null:validateSnapshot(type,body.snapshot);
 const referenceOnly=body.reference_only!==false&&body.reference_only!=='false';
 if(type==='operator'&&!referenceOnly&&(!snapshot||snapshot.posted_closing_balance===undefined||!Array.isArray(snapshot.ledger)))throw bad('Operational operator statements require an auditable, reconciled ledger snapshot');
 const record=db.col('billing_documents').insert({type,label:TYPES[type].label,kind:type,name,month,date:when,
   period_start:validDate(body.period_start)?body.period_start:month+'-01',
   period_end:validDate(body.period_end)?body.period_end:when,
   amount:snapshot?.posted_closing_balance??snapshot?.closing_balance??snapshot?.totals?.total??null,
   snapshot,reference_only:referenceOnly,status:'import_pending',created_by:user?.id||user?.name||null});
 return asDoc(record,'issued');
}
function recordPayment(body,user){
 const due=balance().payable_by_operator;
 if(!(due>0))throw bad('No payable-by-operator balance is recorded. A positive statement balance is payable to the operator.');
 const amount=money(body.amount),reference=String(body.reference||'').trim();
 if(amount<=0||amount>due+.01)throw bad('Amount exceeds the outstanding amount payable by the operator');
 if(reference.length<5||reference.length>120)throw bad('A valid payment UTR/reference is required');
 if(db.col('invoice_payments').find(x=>x.reference.toLowerCase()===reference.toLowerCase()))throw bad('This UTR/reference was already submitted',409);
 return db.col('invoice_payments').insert({amount,reference,date:U.today(),by:user?.name||user?.id,
   status:'pending_verification',statement_key:balance().statement_key});
}
// ZIP "store" method deliberately avoids dependencies; preserves original PDFs byte for byte.
const crcTable=Array.from({length:256},(_,i)=>{let v=i;for(let j=0;j<8;j++)v=v&1?0xedb88320^(v>>>1):v>>>1;return v>>>0;});
const crc32=buf=>{let n=0xffffffff;for(const b of buf)n=crcTable[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;};
function zip(files){
 const parts=[],centers=[];let offset=0;
 for(const [name,buf] of files){
   const fn=Buffer.from(name),hdr=Buffer.alloc(30),crc=crc32(buf);
   hdr.writeUInt32LE(0x04034b50,0);hdr.writeUInt16LE(20,4);hdr.writeUInt32LE(crc,14);
   hdr.writeUInt32LE(buf.length,18);hdr.writeUInt32LE(buf.length,22);hdr.writeUInt16LE(fn.length,26);
   parts.push(hdr,fn,buf);
   const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);
   c.writeUInt16LE(20,6);c.writeUInt32LE(crc,16);c.writeUInt32LE(buf.length,20);c.writeUInt32LE(buf.length,24);
   c.writeUInt16LE(fn.length,28);c.writeUInt32LE(offset,42);centers.push(c,fn);offset+=hdr.length+fn.length+buf.length;
 }
 const cat=Buffer.concat(centers),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);
 end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cat.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...parts,cat,end]);
}
function bundle(month){
 if(!validMonth(month))throw bad('Choose a valid invoice month');
 const listMonth=catalogue().filter(x=>x.period_month===month);
 if(!listMonth.length)throw bad('No documents for this month',404);
 const missing=listMonth.filter(x=>!x.has_pdf).map(x=>x.name);
 if(missing.length)throw bad('Import all original PDFs before downloading this month: '+missing.join(', '),409);
 return zip(listMonth.map(x=>{
   const b=getPdf(x.key).bytes;return [x.name.replace(/[/\\]/g,'-')+'.pdf',b];
 }));
}
module.exports={TYPES,typeOf,asDoc,catalogue,latestStatement,balance,list,resolve,create,attachPdf,getPdf,
 validateSnapshot,recordPayment,bundle,zip,validMonth};
