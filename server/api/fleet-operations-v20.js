'use strict';
const express=require('express');
const D=require('../domain');
const Fleet=require('../fleet-operations-v20');
const Pdf=require('../fleet-operations-pdf-v20');
const {can}=require('../auth');
const r=express.Router();
const h=fn=>(req,res)=>{try{const out=fn(req,res);if(out!==undefined&&!res.headersSent)res.json(out);}
  catch(e){if(!res.headersSent)res.status(e.status||500).json({success:false,message:e.message});}};
const noCache=res=>res.setHeader('Cache-Control','private, no-store, max-age=0');
r.get('/accounts/reports/fleet-operations/options',can('accounts.reports'),h((req,res)=>{
 noCache(res);return Fleet.options();
}));
r.get('/accounts/reports/fleet-operations.pdf',can('accounts.reports'),h((req,res)=>{
 const report=Fleet.compute(req.query);
 const buffer=Pdf.generate(report);
 noCache(res);
 res.setHeader('Content-Type','application/pdf');
 res.setHeader('Content-Disposition',`attachment; filename="fleet-operations_${report.from}_${report.to}.pdf"`);
 res.setHeader('Content-Length',buffer.length);
 res.send(buffer);
}));
r.get('/accounts/reports/fleet-operations',can('accounts.reports'),h((req,res)=>{
 const result=Fleet.compute(req.query);
 noCache(res);
 if(req.query.format==='csv'){
   const arr=result.rows||[];
   const fields=['date','departure_time','service','route','vehicle','drivers','crew','km','fuel_l','kmpl','diesel'];
   const csv=[fields,...arr.map(row=>fields.map(k=>Array.isArray(row[k])?row[k].map(p=>p.name||p.role||'').join('; '):row[k]??''))]
     .map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
   res.setHeader('Content-Type','text/csv; charset=utf-8');
   res.setHeader('Content-Disposition',`attachment; filename="fleet-operations_${result.from}_${result.to}.csv"`);
   res.send('\uFEFF'+csv);
   return;
 }
 return result;
}));
module.exports=r;
