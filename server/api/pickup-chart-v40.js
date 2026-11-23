'use strict';
/* v40 secured chart export and external tripsheet import endpoints. */
const express=require('express'),db=require('../db'),D=require('../domain'),
 C=require('../pickup-chart-v40'),Pdf=require('../pickup-chart-pdf-v40'),
 Import=require('../pickup-chart-import-v40');
const {can}=require('../auth'),Policy=require('../access-runtime-v27');
const r=express.Router();
const error=fn=>(req,res)=>{
 try{const value=fn(req,res);if(value!==undefined&&!res.headersSent)res.json(value);}
 catch(e){if(!e.status)console.error('[pickup-chart-v40]',e.stack||e.message||e);if(!res.headersSent)res.status(e.status||500).json({success:false,message:e.status?e.message:'Pickup chart operation failed'});}
};
const noCache=res=>{res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.setHeader('Vary','Authorization, X-View-As');res.setHeader('X-Content-Type-Options','nosniff')};
const sid=req=>{const id=String(req.params.id||'');
 if(!/^\d+$/.test(id))throw D.httpErr(400,'Invalid schedule ID');
 return id};
const permission=(req,edit=false)=>{
 if(!req.user.permissions.includes('trips.view'))throw D.httpErr(403,'Trip view permission required');
 if(edit&&!req.user.permissions.includes('bookings.modify'))throw D.httpErr(403,'Booking modification permission required');
};
const maskReport=(report,req)=>{
 if(Policy.viewPhone(req))return report;
 return {...report,rows:report.rows.map(row=>({...row,mobile:'**********'}))};
};
const choose=(req,source='current')=>{
 permission(req,source==='imported');
 const id=sid(req);
 if(source==='imported'){
  const imported=C.latestImport(id,req);
  if(!imported)throw D.httpErr(404,'No imported pickup chart has been committed for this schedule');
  return maskReport(imported,req);
 }
 if(source!=='current')throw D.httpErr(400,'Unknown chart source');
 return C.current(id,req);
};
r.get('/schedules/:id/pickup-chart/v40/options',can('bookings.view_all'),error(req=>{
 const current=choose(req);
 const imported=req.user.permissions.includes('bookings.modify')?C.latestImport(sid(req),req):null;
 return {service:current.service,date:current.date,route:current.origin+' → '+current.destination,
  operator:current.operator,vehicle:current.vehicle_number,driver:current.driver,
  passenger_count:current.rows.length,capacity:current.capacity,
  city_options:C.cityOptions(current),
  columns:C.COLS.map(([key,label])=>({key,label,selected_pickup:C.BASE_PICKUP.includes(key),
   selected_rto:C.BASE_RTO.includes(key)})),
  imported:imported?{id:imported.import_id,source_gds:imported.source_gds,
   file_name:imported.import_filename,count:imported.rows.length,at:imported.imported_at,
   warnings:db.col('pickup_chart_imports_v40').get(imported.import_id)?.warnings||[]}:null};
}));
r.get('/schedules/:id/pickup-chart/v40/data',can('bookings.view_all'),error(req=>{
 const report=choose(req,String(req.query.source||'current'));
 return {service:report.service,date:report.date,origin:report.origin,destination:report.destination,
  operator:report.operator,vehicle:report.vehicle_number,driver:report.driver,
  driver_phone:report.driver_phone,capacity:report.capacity,
  source_gds:report.source_gds,kind:report.kind,stages:report.stages.map(s=>({
   id:s.id,type:s.type,name:s.name,time:s.time,day:s.day||1,city_id:s.city_id})),
  city_options:C.cityOptions(report),rows:report.rows};
}));
r.get('/schedules/:id/pickup-chart/v40.pdf',can('bookings.view_all'),error((req,res)=>{
 noCache(res);
 const source=String(req.query.source||'current');
 const report=choose(req,source),opts=C.options(req.query);
 const buffer=Pdf.generate(report,opts);
 const filename=('pickup-chart-'+report.service+'-'+report.date+
  (opts.chart==='rto'?'-RTO':'')+(source==='imported'?'-imported':'')+'.pdf').replace(/[^a-zA-Z0-9_.-]/g,'_');
 const download=String(req.query.disposition||'')==='attachment';
 res.setHeader('Content-Type','application/pdf');
 res.setHeader('Content-Disposition',(download?'attachment':'inline')+'; filename="'+filename+'"');
 res.setHeader('Content-Length',buffer.length);
 res.send(buffer);
}));
const body=express.raw({type:['application/pdf','text/csv','application/octet-stream'],
 limit:Import.MAX});
r.post('/schedules/:id/pickup-chart/v40/preview',
 can('bookings.view_all'),can('bookings.modify'),body,error((req,res)=>{
 permission(req,true);noCache(res);
 const id=sid(req),mime=(req.headers['content-type']||'').split(';')[0].toLowerCase();
 if(!['application/pdf','text/csv'].includes(mime))throw D.httpErr(415,'Upload a PDF or CSV file');
 const fileName=decodeURIComponent(String(req.get('X-Pickup-Chart-Filename')||'')).slice(0,180);
 const selection=String(req.get('X-Pickup-Chart-GDS')||'');
 const data=C.resolve(id,req);
 const imported=Import.parse(req.body,mime,fileName,selection,data);
 const preview_id=Import.storePreview(req.user.id,id,imported);
 const allowPhone=Policy.viewPhone(req);
 return {preview_id,file_name:imported.file_name,bytes:imported.bytes,sha256:imported.sha256,
  detected_gds:imported.detected_gds,source_gds:selection,input_layout:imported.input_layout,passenger_count:imported.rows.length,
  service_in_file:imported.service,travel_date_in_file:imported.date,
  warnings:imported.warnings,blocking_issues:imported.blocking_issues,
  rows:imported.rows.slice(0,25).map(x=>({seat:x.seat,pnr:x.pnr,name:x.name,
   mobile:allowPhone?x.mobile:'**********',pickup:x.pickup,drop:x.drop,source:x.source})),
  expires_in_minutes:20,inventory_will_change:false};
}));
r.post('/schedules/:id/pickup-chart/v40/commit',
 can('bookings.view_all'),can('bookings.modify'),error(req=>{
 permission(req,true);const id=sid(req);
 if(req.body?.confirm!==true)throw D.httpErr(400,'Confirm that this is a reference-only import');
 const data=Import.commitPreview(req.body?.preview_id,req.user.id,id);
 D.audit('schedule',id,'pickup_chart_import_v40',{
  op:'external_reference_import',source_gds:data.source_gds,sha256:data.sha256,
  passenger_count:data.rows.length,file_name:data.file_name},req.user);
 return {success:true,import_id:data.id,source_gds:data.source_gds,
  passenger_count:data.rows.length,imported_at:data.imported_at,
  inventory_changed:false,bookings_changed:false};
}));
module.exports=r;
