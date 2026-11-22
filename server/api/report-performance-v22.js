'use strict';
const express=require('express'),R=require('../reports-performance-v22');
require('../../public/js/report-suite-specs-v22.js'); // Adds four report definitions to the shared browser/PDF contract.
const PDF=require('../report-suite-pdf-v21');
const XLSX=require('../report-performance-xlsx-v22');
const {can}=require('../auth');
const route=express.Router(),keys=R.KEYS;
const wrap=fn=>(req,res)=>{try{fn(req,res);}catch(e){if(!res.headersSent)res.status(e.status||500).json({success:false,message:e.message});}};
const privateHeaders=res=>res.set('Cache-Control','private, no-store, max-age=0');
const send=(res,buf,name,media)=>{
 privateHeaders(res);res.set('Content-Type',media);
 res.set('Content-Disposition',`attachment; filename="${name}"`);res.set('Content-Length',String(buf.length));res.send(buf);
};
const filename=s=>String(s).replace(/[^a-z0-9_-]/gi,'_');
const csv=rows=>{
 if(!rows.length)return '\uFEFF';
 const keys=[...new Set(rows.flatMap(x=>Object.keys(x)))].filter(k=>rows.every(r=>!r[k]||typeof r[k]!=='object'));
 return '\uFEFF'+[keys,...rows.map(x=>keys.map(k=>x[k]??''))].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
};
route.get('/accounts/reports/v22/options',can('accounts.reports'),wrap((req,res)=>{
 privateHeaders(res);res.json(R.options());
}));
for(const key of keys){
 route.get('/accounts/reports/'+key+'.pdf',can('accounts.reports'),wrap((req,res)=>{
   const d=R.compute(key,req.query);
   if(key==='point-performance'&&!d.selected_point){return res.status(400).json({success:false,message:'Select a pickup or drop point before printing a PDF'});}
   return send(res,PDF.generate(key,d),`${filename(key)}_${d.from}_${d.to}.pdf`,'application/pdf');
 }));
 route.get('/accounts/reports/'+key+'.xlsx',can('accounts.reports'),wrap((req,res)=>{
   if(key!=='frequent-travellers')return res.status(404).json({success:false,message:'Excel export is not available for this report'});
   const d=R.compute(key,req.query);
   return send(res,XLSX.generate(key,d),`${filename(key)}_${d.from}_${d.to}.xlsx`,
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 }));
 route.get('/accounts/reports/'+key,can('accounts.reports'),wrap((req,res)=>{
   const d=R.compute(key,req.query);privateHeaders(res);
   if(req.query.format==='csv'){
     const section=String(req.query.section||'rows');
     if(!Object.prototype.hasOwnProperty.call(d.sections,section))return res.status(400).json({success:false,message:'Unknown section'});
     return send(res,Buffer.from(csv(d.sections[section]),'utf8'),
       `${filename(key)}_${filename(section)}_${d.from}_${d.to}.csv`,'text/csv; charset=utf-8');
   }
   res.json(d);
 }));
}
module.exports=route;
