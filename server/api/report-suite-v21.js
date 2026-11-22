'use strict';
const express=require('express');
const Reports=require('../reports-suite-v21');
const PDF=require('../report-suite-pdf-v21');
const {can}=require('../auth');
const r=express.Router();
const h=fn=>(req,res)=>{try{const out=fn(req,res);if(out!==undefined&&!res.headersSent)res.json(out);}
 catch(e){if(!res.headersSent)res.status(e.status||500).json({success:false,message:e.message});}};
const cache=res=>res.setHeader('Cache-Control','private, no-store, max-age=0');
const headers=(res,name,type)=>{
 cache(res);
 res.setHeader('Content-Type',type);
 res.setHeader('Content-Disposition',`attachment; filename="${name}"`);
};
const safe=s=>String(s).replace(/[^a-z0-9_-]/gi,'_');
const csv=rows=>{
 if(!rows.length)return '\uFEFF';
 const columns=[...new Set(rows.flatMap(r=>Object.keys(r)))].filter(k=>!k.startsWith('_')&&rows.every(r=>typeof r[k]!=='object'));
 const fields=[columns,...rows.map(r=>columns.map(k=>r[k]===null||r[k]===undefined?'':r[k]))];
 return '\uFEFF'+fields.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
};
r.get('/accounts/reports/v21/options',can('accounts.reports'),h((req,res)=>{cache(res);return Reports.options();}));
for(const key of Reports.keys){
 r.get('/accounts/reports/'+key+'.pdf',can('accounts.reports'),h((req,res)=>{
   const data=Reports.compute(key,req.query);
   const buf=PDF.generate(key,data);
   headers(res,`${safe(key)}_${data.from}_${data.to}.pdf`,'application/pdf');
   res.setHeader('Content-Length',buf.length);res.send(buf);
 }));
 r.get('/accounts/reports/'+key,can('accounts.reports'),h((req,res)=>{
   const out=Reports.compute(key,req.query);
   cache(res);
   if(req.query.format==='csv'){
     const section=req.query.section||'rows';
     if(!Object.prototype.hasOwnProperty.call(out.sections,section))return res.status(400).json({success:false,message:'Unknown section'});
     const content=csv(out.sections[section]||[]);
     headers(res,`${safe(key)}_${safe(section)}_${out.from}_${out.to}.csv`,'text/csv; charset=utf-8');
     return res.send(content);
   }
   return out;
 }));
}
module.exports=r;
