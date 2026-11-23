'use strict';
const express=require('express');
const {can}=require('../auth');
const Ticket=require('../booking-ticket-v41');
const r=express.Router();
const secured=(fn)=>(req,res)=>{
 try{
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('Vary','Authorization, X-View-As');
  res.setHeader('X-Content-Type-Options','nosniff');
  return fn(req,res);
 }catch(e){
  if(!e.status)console.error('[booking-ticket-v41]',e.stack||e);
  if(!res.headersSent)res.status(e.status||500).json({success:false,message:e.status?e.message:'Ticket could not be generated'});
 }
};
r.get('/bookings/:pnr/ticket/v41',can('bookings.view_all'),secured((req,res)=>{
 const t=Ticket.model(req,req.params.pnr);
 res.json(t);
}));
r.get('/bookings/:pnr/ticket/v41.pdf',can('bookings.view_all'),secured((req,res)=>{
 const t=Ticket.model(req,req.params.pnr),pdf=Ticket.generatePdf(t);
 const file='ticket-'+String(t.pnr||'booking').replace(/[^a-z0-9_-]/ig,'')+'.pdf';
 const disposition=req.query.disposition==='attachment'?'attachment':'inline';
 res.setHeader('Content-Type','application/pdf');
 res.setHeader('Content-Disposition',disposition+'; filename="'+file+'"');
 res.setHeader('Content-Length',pdf.length);
 res.send(pdf);
}));
module.exports=r;
