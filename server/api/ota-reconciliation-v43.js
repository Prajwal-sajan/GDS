'use strict';
const express=require('express');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const db=require('../db');
const {can}=require('../auth');
const reconcile=require('../ota-reconciliation-v43');
const r=express.Router();
const LIMIT=7*1024*1024;
const dir=path.join(process.env.GDS_DATA_DIR||path.join(__dirname,'..','..','data'),'ota-invoices');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const wrap=fn=>(req,res)=>Promise.resolve().then(()=>fn(req,res)).catch(e=>{if(!res.headersSent)res.status(e.status||500).json({success:false,message:e.status?e.message:'Invoice processing failed',detail:process.env.NODE_ENV==='test'?e.message:undefined})});
const pick=(doc)=>{const {lines,parsed_rows,source_path,...meta}=doc;return meta};
const lookup=req=>{const doc=db.col('ota_invoices_v43').get(req.params.id);if(!doc)throw fail(404,'Invoice not found');return doc};
function authorizeInvoice(doc){
 const gst=String(db.meta('operator')?.gst_number||'').trim().toUpperCase();
 return !gst||!doc.operator_gstin||gst===doc.operator_gstin.toUpperCase();
}
function rebuild(doc){
 const cfg=(db.meta('reconciliation_config')||[]).find(x=>x.ota_slug===doc.ota_slug)||{ota_slug:doc.ota_slug,commission_percent:0,gst_on_commission_percent:18,match_tolerance:1};
 const parsed={...doc,rows:doc.parsed_rows};
 const current=reconcile.compareInvoice(parsed,db.col('bookings').all(),cfg);
 const previous=new Map((doc.lines||[]).map(line=>[line.id,line.resolution]));
 doc.lines=current.rows.map(line=>({...line,resolution:previous.get(line.id)||null}));
 doc.totals=current.totals;doc.section_stats=current.section_stats;
 doc.status=doc.parse_warnings.length?'review_required':'parsed';
 doc.updated_at=new Date().toISOString();
 // Uploaded third-party data is never certified against a different operator's demo GDS.
 if(!doc.operator_matches_gds){
  doc.lines.forEach(line=>{if(line.verified){line.verified=false;line.status='needs_review';line.why='Operator GSTIN does not match this GDS'}});
  doc.totals.verified=0;doc.totals.matched=0;
  doc.totals.needs_review=doc.lines.filter(x=>x.status==='needs_review').length;
 }
 doc.totals.resolved=doc.lines.filter(x=>x.resolution?.action).length;
 doc.totals.outstanding_issue_count=doc.lines.filter(x=>x.status!=='matched'&&!x.resolution?.action).length;
 return doc;
}
r.get('/reconciliation/v43/invoices',can('accounts.reconciliation'),wrap(async(req,res)=>{
 res.json({imports:db.col('ota_invoices_v43').all().slice().reverse().map(pick)});
}));
r.post('/reconciliation/v43/invoices',can('accounts.reconciliation'),wrap(async(req,res)=>{
 const b=req.body||{},name=String(b.file_name||'').replace(/[^\w.()\s-]/g,'_').slice(0,120);
 if(String(b.ota_slug||'').toLowerCase()!=='redbus')throw fail(400,'This PDF adapter supports redBus Payment Advice; choose redBus');
 if(!/\.pdf$/i.test(name))throw fail(400,'Select a redBus Payment Advice PDF');
 if(typeof b.base64!=='string'||b.base64.length>LIMIT*1.38)throw fail(413,'PDF upload exceeds 7 MB');
 const buf=Buffer.from(b.base64,'base64');
 if(buf.length<100||buf.length>LIMIT||buf.subarray(0,5).toString()!=='%PDF-')throw fail(400,'Invalid or oversized PDF');
 const digest=crypto.createHash('sha256').update(buf).digest('hex');
 const found=db.col('ota_invoices_v43').find(x=>x.sha256===digest&&x.ota_slug==='redbus');
 if(found)return res.json({id:found.id,duplicate:true,...pick(found)});
 let parsed;
 try{parsed=reconcile.parsePaymentAdviceText(await reconcile.extractPdf(buf))}
 catch(err){throw fail(422,'Cannot read redBus payment advice: '+err.message)}
 if(parsed.rows.length>15000)throw fail(413,'Invoice contains too many PNR rows');
 const conflict=db.col('ota_invoices_v43').find(x=>x.ota_slug==='redbus'&&x.operator_code===parsed.operator_code&&x.invoice_number===parsed.invoice_number);
 if(conflict)throw fail(409,'This invoice number already exists with a different PDF');
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const filename=digest+'.pdf',loc=path.join(dir,filename);
 fs.writeFileSync(loc,buf,{flag:'wx',mode:0o600});
 const doc=db.col('ota_invoices_v43').insert({
  ota_slug:'redbus',file_name:name,sha256:digest,source_path:filename,
  operator_name:parsed.operator_name,operator_code:parsed.operator_code,operator_gstin:parsed.operator_gstin,
  invoice_number:parsed.invoice_number,issue_date:parsed.issue_date,payment_mode:parsed.payment_mode,
  billing_period_start:parsed.billing_period_start,billing_period_end:parsed.billing_period_end,
  summary:parsed.summary,by_section:parsed.by_section,statement_lines:parsed.statement_lines,unique_pnrs:parsed.unique_pnrs,
  parse_warnings:parsed.parse_warnings,sections:parsed.sections,parsed_rows:parsed.rows,
  operator_matches_gds:true,totals:{},section_stats:{},lines:[],status:'parsed',
  uploaded_by:req.user.name||req.user.id,uploaded_at:new Date().toISOString()
 });
 doc.operator_matches_gds=authorizeInvoice(doc);
 if(!doc.operator_matches_gds)doc.parse_warnings.push('Operator GSTIN differs from this GDS; matches are not certified');
 rebuild(doc);
 db.persist();
 res.status(201).json({id:doc.id,...pick(doc)});
}));
r.get('/reconciliation/v43/invoices/:id',can('accounts.reconciliation'),wrap(async(req,res)=>res.json(pick(lookup(req)))));
r.get('/reconciliation/v43/invoices/:id/lines',can('accounts.reconciliation'),wrap(async(req,res)=>{
 const doc=lookup(req);
 let lines=doc.lines||[];
 const filter=String(req.query.filter||'all');
 const search=String(req.query.q||'').toLowerCase().trim().slice(0,120);
 if(filter!=='all')lines=lines.filter(x=>x.status===filter||filter==='unresolved'&&x.status!=='matched'&&!x.resolution);
 if(search)lines=lines.filter(x=>String(x.pnr).toLowerCase().includes(search)||String(x.why||'').toLowerCase().includes(search));
 const issue=String(req.query.issue||'').slice(0,40);
 if(issue&&issue!=='all')lines=lines.filter(x=>(x.differences||[]).includes(issue));
 const count=lines.length,offset=Math.min(Math.max(0,Number(req.query.offset)||0),count);
 const limit=Math.min(100,Math.max(1,Number(req.query.limit)||30));
 res.json({rows:lines.slice(offset,offset+limit),count,offset,limit,has_more:offset+limit<count});
}));
r.get('/reconciliation/v43/invoices/:id/export.csv',can('accounts.reconciliation'),wrap(async(req,res)=>{
 const d=lookup(req),filter=String(req.query.filter||'all');
 if(!['all','matched','mismatched','needs_review','unmatched_ota','unmatched_gds'].includes(filter))throw fail(400,'Unknown export filter');
 const csv=reconcile.exportCsv(d,filter);
 const basename=String(d.invoice_number||d.id).replace(/[^A-Za-z0-9_-]/g,'_');
 res.set('Cache-Control','private, no-store').set('Content-Type','text/csv; charset=utf-8')
  .set('Content-Disposition','attachment; filename="reconciliation_redbus_'+basename+'.csv"').send(csv);
}));
r.get('/reconciliation/v43/invoices/:id/original.pdf',can('accounts.reconciliation'),wrap(async(req,res)=>{
 const d=lookup(req),loc=path.join(dir,d.source_path||'');
 if(!fs.existsSync(loc))throw fail(404,'Source PDF unavailable');
 res.set('Cache-Control','private, no-store').set('Content-Type','application/pdf').set('Content-Disposition','inline; filename="redbus_invoice.pdf"');
 res.sendFile(loc);
}));
r.post('/reconciliation/v43/invoices/:id/recheck',can('accounts.reconciliation'),wrap(async(req,res)=>{
 const d=lookup(req);rebuild(d);db.persist();res.json(pick(d));
}));
r.post('/reconciliation/v43/invoices/:id/resolve',can('accounts.reconciliation'),wrap(async(req,res)=>{
 const d=lookup(req),id=String(req.body?.line_id||''),action=String(req.body?.action||'');
 if(!['accept_ota','dispute','investigating','clear'].includes(action))throw fail(400,'Invalid reconciliation action');
 const row=d.lines.find(x=>x.id===id);
 if(!row)throw fail(404,'PNR event row not found');
 if(row.status==='matched'&&action!=='clear')throw fail(400,'Matched records cannot be disputed unless evidence changes');
 const note=String(req.body?.note||'').trim().slice(0,2000);
 if(action==='dispute'&&!note)throw fail(400,'Dispute reason is required');
 row.resolution=action==='clear'?null:{action,by:req.user.name||String(req.user.id),at:new Date().toISOString(),note};
 d.totals.resolved=d.lines.filter(x=>x.resolution).length;
 d.totals.outstanding_issue_count=d.lines.filter(x=>x.status!=='matched'&&!x.resolution).length;
 db.persist();res.json({row,totals:d.totals});
}));
r.delete('/reconciliation/v43/invoices/:id',can('accounts.reconciliation'),wrap(async(req,res)=>{
 const doc=lookup(req);
 if(!req.body?.confirm||req.body.confirm!==doc.invoice_number)throw fail(400,'Confirm the invoice number to delete');
 db.col('ota_invoices_v43').remove(doc.id);
 const file=path.join(dir,doc.source_path||'');
 if(fs.existsSync(file))fs.unlinkSync(file);
 res.json({deleted:true});
}));
module.exports=r;
