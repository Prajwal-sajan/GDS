'use strict';
const express=require('express');
const {can}=require('../auth');
const S=require('../invoices-v24');
const router=express.Router();
const safe=fn=>(req,res)=>{try{fn(req,res);}catch(e){
 if(!res.headersSent)res.status(e.status||500).json({success:false,message:e.status?e.message:'Invoice operation failed'});
}};
const privateData=res=>res.set({'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'});
const protect=can('accounts.ledger');
router.get('/accounts/invoices-v24',protect,safe((req,res)=>{privateData(res);res.json(S.list());}));
router.get('/accounts/invoices-v24/current',protect,safe((req,res)=>{
 privateData(res);
 const d=S.latestStatement();if(!d)return res.status(404).json({message:'No current operator statement'});
 const x=S.resolve(d.key);
 res.json({document:x.document,snapshot:x.row.snapshot||null,balance:S.balance()});
}));
router.get('/accounts/invoices-v24/bundle/:month',protect,safe((req,res)=>{
 const content=S.bundle(req.params.month);privateData(res);
 res.set('Content-Type','application/zip');
 res.set('Content-Disposition',`attachment; filename="invoices_${req.params.month}.zip"`);
 res.set('Content-Length',String(content.length));res.send(content);
}));
router.get('/accounts/invoices-v24/documents/:key/pdf',protect,safe((req,res)=>{
 const {bytes,document}=S.getPdf(req.params.key);privateData(res);
 res.set('Content-Type','application/pdf');
 res.set('Content-Disposition',`${req.query.download==='1'?'attachment':'inline'}; filename="${document.name.replace(/[^a-z0-9.-]/gi,'_')}.pdf"`);
 res.set('Content-Length',String(bytes.length));res.send(bytes);
}));
router.get('/accounts/invoices-v24/documents/:key',protect,safe((req,res)=>{
 const d=S.resolve(req.params.key);privateData(res);
 res.json({document:d.document,snapshot:d.row.snapshot||null,
  pdf_history:Array.isArray(d.row.pdf_history)?d.row.pdf_history.map(x=>({...x})):[]});
}));
router.post('/accounts/invoices-v24/documents',protect,safe((req,res)=>{
 const result=S.create(req.body||{},req.user);privateData(res);res.status(201).json(result);
}));
router.put('/accounts/invoices-v24/documents/:key/snapshot',protect,safe((req,res)=>{
 const result=S.attachSnapshot(req.params.key,req.body?.snapshot||req.body,req.user);
 privateData(res);res.json(result);
}));
router.post('/accounts/invoices-v24/documents/:key/pdf',protect,safe((req,res)=>{
 const {base64,filename}=req.body||{};
 const result=S.attachPdf(req.params.key,base64,filename,req.user);
 privateData(res);res.json(result);
}));
router.post('/accounts/invoices-v24/payments',protect,safe((req,res)=>{
 const record=S.recordPayment(req.body||{},req.user);privateData(res);
 res.status(202).json({id:record.id,amount:record.amount,status:record.status,
  message:'Reference recorded pending verification. No bank transfer has been initiated.'});
}));
module.exports=router;
