'use strict';
const express=require('express'),crypto=require('node:crypto');
const {can}=require('../auth'),B=require('../platform-billing-v25');
const internal=express.Router(),operator=express.Router();
const noCache=res=>res.set({'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'});
const wrap=fn=>(req,res)=>{try{return fn(req,res);}catch(err){
 if(!res.headersSent)res.status(err.status||500).json({success:false,message:err.status?err.message:'Billing service failure'});
}};
const serviceOnly=(req,res,next)=>{
 const key=process.env.GDS_PLATFORM_BILLING_KEY||'',actual=String(req.header('x-billing-service-key')||'');
 if(key.length<32||actual.length!==key.length||
   !crypto.timingSafeEqual(Buffer.from(key),Buffer.from(actual)))
  return res.status(403).json({success:false,message:'Platform billing service authentication required'});
 next();
};
internal.use(serviceOnly);
internal.post('/configure',wrap((req,res)=>res.json(B.configure(req.body))));
internal.post('/source',wrap((req,res)=>{
 const result=B.ingest(req.body);const issue=B.runDue();
 noCache(res);res.status(result.reused?200:201).json({source:result,issuance:issue});
}));
internal.post('/issue-due',wrap((req,res)=>{noCache(res);res.json(B.runDue());}));
internal.get('/health',wrap((req,res)=>{noCache(res);res.json({platform_billing_configured:!!B.configured(),month:new Date().toISOString().slice(0,7)});}));
operator.use(can('accounts.ledger'));
operator.get('/accounts/invoices-v25',wrap((req,res)=>{noCache(res);res.json(B.list());}));
operator.get('/accounts/invoices-v25/documents/:key',wrap((req,res)=>{
 const doc=B.ensureIssued(req.params.key);
 noCache(res);res.json({document:doc,snapshot:require('../invoices-v24').resolve(doc.key).row.snapshot});
}));
operator.get('/accounts/invoices-v25/documents/:key/pdf',wrap((req,res)=>{
 const {bytes,document}=B.getPdf(req.params.key);
 noCache(res);res.type('application/pdf');
 res.set('Content-Disposition',(req.query.download==='1'?'attachment':'inline')+
  '; filename="'+document.name.replace(/[^a-zA-Z0-9_.-]/g,'_')+'.pdf"');
 res.set('Content-Length',String(bytes.length));res.send(bytes);
}));
operator.post('/accounts/invoices-v25/payments',wrap((req,res)=>{
 const record=B.recordPayment(req.body||{},req.user);
 noCache(res);res.status(202).json(record);
}));
operator.get('/accounts/invoices-v25/current',wrap((req,res)=>{
 const doc=B.latest();
 if(!doc)return res.status(404).json({message:'No operator statement has been issued'});
 noCache(res);res.json({document:doc,snapshot:require('../invoices-v24').resolve(doc.key).row.snapshot,balance:B.list().balance});
}));
operator.get('/accounts/invoices-v25/bundle/:month',wrap((req,res)=>{
 const content=B.bundle(req.params.month);noCache(res);
 res.type('application/zip');res.set('Content-Disposition','attachment; filename="invoices_'+req.params.month+'.zip"');
 res.set('Content-Length',String(content.length));res.send(content);
}));
operator.get('/accounts/invoices-v25/reconcile/:month',wrap((req,res)=>{
 const docs=B.issuedDocs().filter(x=>x.period_month===req.params.month);
 if(!docs.length)return res.status(404).json({message:'No issued documents for this period'});
 const audit=require('../invoice-reconcile-v24').audit(req.params.month,{scope:'operational'});
 noCache(res);res.json(audit);
}));
module.exports={internal,operator};
