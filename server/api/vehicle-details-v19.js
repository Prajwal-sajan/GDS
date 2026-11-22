'use strict';
const express = require('express');
const db = require('../db');
const D = require('../domain');
const {can} = require('../auth');
const router = express.Router();
const handle = fn => (req,res) => {try{const value=fn(req,res);if(value!==undefined&&!res.headersSent)res.json(value);}catch(err){if(!res.headersSent)res.status(err.status||500).json({success:false,message:err.message});}};
const fail = (status,message)=>{throw D.httpErr(status,message);};
const getVehicle=req=>{const v=db.col('vehicles').get(req.params.id);if(!v)fail(404,'Vehicle not found');return v;};
const textValue=(v,max=240)=>String(v??'').trim().slice(0,max);
const required=(v,label,max=100)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail(400,label+' required (max '+max+' characters)');return v.trim();};
const cleanDate=(v,label='Date')=>{if(v===null||v==='')return null;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T12:00:00Z'))||new Date(v+'T12:00:00Z').toISOString().slice(0,10)!==v)fail(400,'Invalid '+label);return v;};
const number=(v,label,max=100000000)=>{if(v===''||v===null)return null;if(v===undefined||typeof v==='boolean'||!Number.isFinite(Number(v))||Number(v)<0||Number(v)>max)fail(400,'Invalid '+label);return Number(v);};
const own=(v,list,label)=>{if(!list.includes(v))fail(400,'Invalid '+label);return v;};
const audit=(v,section,changes,user)=>D.audit('vehicle',v.id,section,changes,user);
const docTypes=['RC','INSURANCE','PUC','FITNESS','AITP_FORM_2','AITP_FORM_3','VLTD','FDSS','PERMIT','TAX','OTHER'];
const mimeTypes=['application/pdf','image/png','image/jpeg','image/webp'];
const safeFile=(data,fileName)=>{
  if(!data) return {file_data:null,file_name:null,file_type:null,file_size:0};
  if(typeof data!=='string'||data.length>7_200_000)fail(413,'File larger than the 5 MB limit');
  const m=/^data:(application\/pdf|image\/png|image\/jpeg|image\/webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if(!m||!mimeTypes.includes(m[1]))fail(400,'Upload a PDF, PNG, JPEG or WebP file');
  const bytes=Buffer.from(m[2],'base64');
  if(!bytes.length||bytes.length>5*1024*1024)fail(413,'File larger than the 5 MB limit');
  const signature=m[1]==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':m[1]==='image/png'?bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):m[1]==='image/jpeg'?bytes[0]===255&&bytes[1]===216:bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(!signature)fail(400,'File content does not match its type');
  if(bytes.toString('base64')!==m[2])fail(400,'Invalid file encoding');
  return {file_data:data,file_name:required(fileName,'File name',140).replace(/[/\\<>:"|?*\x00-\x1f]/g,'_'),file_type:m[1],file_size:bytes.length};
};
const summarizeDoc=d=>({
  id:d.id,document_type:d.document_type,document_name:d.document_name,document_number:d.document_number||null,
  expiry_date:d.expiry_date||null,issue_date:d.issue_date||null,visibility:d.visibility==='public'?'public':'private',
  file_name:d.file_name||null,has_file:!!d.file_data,file_size:d.file_size||null,status:d.archived_at?'archived':'active',
  archived_at:d.archived_at||null,archive_reason:d.archive_reason||null,created_at:d.created_at||null,updated_at:d.updated_at||null
});
const docsFor=v=>db.col('documents').filter(d=>d.owner_type==='vehicle'&&Number(d.owner_id)===Number(v.id));
const publicFields=v=>({...v, coach:db.col('coaches').get(v.coach_template_id)?.name||'Unassigned'});
const workFor=v=>db.col('vehicle_maintenance').filter(r=>Number(r.vehicle_id)===Number(v.id));
const summarizeMaintenance=r=>({
  id:r.id,type:r.type,label:r.label,service_date:r.service_date||null,odometer_km:r.odometer_km??null,
  next_due_date:r.next_due_date||null,next_due_km:r.next_due_km??null,cost:r.cost??0,notes:r.notes||'',
  file_name:r.file_name||null,has_file:!!r.file_data,archived_at:r.archived_at||null,
  created_at:r.created_at,updated_at:r.updated_at||null
});
function maintenanceOverview(v,records){
  const active=records.filter(x=>!x.archived_at).sort((a,b)=>String(b.service_date).localeCompare(String(a.service_date)));
  const dueDates=active.map(x=>x.next_due_date).filter(Boolean).sort();
  const kmDates=active.map(x=>x.next_due_km).filter(x=>x!==null&&x!==undefined).sort((a,b)=>a-b);
  const last=active.find(x=>x.service_date)?.service_date||v.last_service_date||null;
  const next=dueDates[0]||v.next_service_date||null;
  const odo=Number(v.odometer_reading??v.health?.odometer_km??0);
  const overdue=Boolean((next&&next<new Date().toISOString().slice(0,10))||(kmDates.length&&odo>=kmDates[0]));
  return {last_service_date:last,next_service_date:next,next_service_km:kmDates[0]??null,odometer_reading:odo,
    status:v.status==='maintenance'?'Maintenance':overdue?'Service due':v.status==='active'?'Active':'Inactive',count:active.length};
}
router.get('/vehicles/:id/detail-v19',can('fleet.view'),handle(req=>{
  const v=getVehicle(req);
  const docs=docsFor(v),maintenance=workFor(v);
  const archive=[...docs.filter(x=>x.archived_at).map(x=>({...summarizeDoc(x),kind:'document',sort_at:x.archived_at})),
    ...maintenance.filter(x=>x.archived_at).map(x=>({...summarizeMaintenance(x),kind:'maintenance',sort_at:x.archived_at}))].sort((a,b)=>String(b.sort_at).localeCompare(String(a.sort_at)));
  return {vehicle:publicFields(v),coaches:db.col('coaches').all().map(c=>({id:c.id,name:c.name})),
    documents:docs.filter(d=>!d.archived_at).map(summarizeDoc),
    maintenance:maintenance.filter(m=>!m.archived_at).map(summarizeMaintenance),
    service:maintenanceOverview(v,maintenance),archive};
}));
router.put('/vehicles/:id/detail-v19',can('fleet.modify'),handle(req=>{
  const v=getVehicle(req),b=req.body||{},patch={};
  const validText={
    vehicle_number:60,phone_number:20,chassis_number:90,engine_number:90,model_name:100,
    gps_device_id:80,gps_provider:100,dms_device_id:80,dms_provider:100,notes:3000
  };
  if(b.registration_number!==undefined){
    const plate=required(b.registration_number,'Registration number',40);
    if(db.col('vehicles').find(x=>x.id!==v.id&&String(x.registration_number||'').replace(/\s/g,'').toUpperCase()===plate.replace(/\s/g,'').toUpperCase()))fail(409,'Registration number already exists');
    patch.registration_number=plate;
  }
  if(b.coach_template_id!==undefined){
    const id=Number(b.coach_template_id);
    if(!Number.isSafeInteger(id)||!db.col('coaches').get(id))fail(400,'Choose an existing coach type');
    patch.coach_template_id=id;
  }
  for(const [key,max] of Object.entries(validText))if(b[key]!==undefined)patch[key]=textValue(b[key],max);
  if(b.phone_number!==undefined&&patch.phone_number&&!/^\+?[0-9 \-]{8,16}$/.test(patch.phone_number))fail(400,'Invalid mobile number');
  if(b.manufacture_year!==undefined){
    const y=b.manufacture_year===''?null:Number(b.manufacture_year);
    if(y!==null&&(!Number.isInteger(y)||y<1950||y>new Date().getFullYear()+1))fail(400,'Invalid manufacture year');
    patch.manufacture_year=y;
  }
  if(b.purchased_date!==undefined)patch.purchased_date=cleanDate(b.purchased_date,'purchase date');
  if(b.odometer_reading!==undefined)patch.odometer_reading=number(b.odometer_reading,'odometer reading',100000000);
  if(b.ownership_type!==undefined)patch.ownership_type=own(b.ownership_type,['permanent','temporary','leased','attached'],'ownership');
  if(b.vehicle_role!==undefined)patch.vehicle_role=own(b.vehicle_role,['main','pickup_van','spare'],'vehicle type');
  if(b.gps_enabled!==undefined){if(typeof b.gps_enabled!=='boolean')fail(400,'GPS flag must be boolean');patch.gps_enabled=b.gps_enabled;}
  if(b.dms_enabled!==undefined){if(typeof b.dms_enabled!=='boolean')fail(400,'DMS flag must be boolean');patch.dms_enabled=b.dms_enabled;}
  if(b.tags!==undefined){
    if(!b.tags||typeof b.tags!=='object'||Array.isArray(b.tags)||Object.keys(b.tags).length>30)fail(400,'Invalid tags');
    patch.tags=Object.fromEntries(Object.entries(b.tags).map(([key,value])=>{
      if(!key.trim()||key.length>60||['__proto__','constructor','prototype'].includes(key)||typeof value!=='string'||value.length>120)fail(400,'Invalid tag name or value');
      return [key.trim(),value.trim()];
    }));
  }
  if(!Object.keys(patch).length)fail(400,'No vehicle changes provided');
  const before=Object.fromEntries(Object.keys(patch).map(k=>[k,v[k]]));
  const saved=db.col('vehicles').update(v.id,patch);
  audit(v,'details',{before,after:patch},req.user);
  return {vehicle:publicFields(saved)};
}));
router.post('/vehicles/:id/documents-v19',can('fleet.documents'),handle(req=>{
  const v=getVehicle(req),b=req.body||{};
  const type=own(b.document_type,docTypes,'document type');
  const expiry=cleanDate(b.expiry_date,'expiry date');
  const visibility=own(b.visibility||'private',['public','private'],'visibility');
  const file=safeFile(b.file_data,b.file_name);
  if(!file.file_data)fail(400,'Select a document file');
  const replaced=docsFor(v).filter(x=>!x.archived_at&&x.document_type===type);
  const stamp=new Date().toISOString();
  for(const previous of replaced)db.col('documents').update(previous.id,{archived_at:stamp,archive_reason:'replaced',archived_by:req.user.id});
  const doc=db.col('documents').insert({owner_type:'vehicle',owner_id:v.id,document_type:type,
    document_name:textValue(b.document_name||type,110),document_number:textValue(b.document_number,80),
    expiry_date:expiry,issue_date:cleanDate(b.issue_date,'issue date'),visibility,
    category:'compliance',verification_status:'pending',...file});
  audit(v,'documents',{action:replaced.length?'replace':'upload',type,doc_id:doc.id,archived_ids:replaced.map(x=>x.id)},req.user);
  return {document:summarizeDoc(doc),replaced:replaced.length};
}));
router.put('/vehicles/:id/documents-v19/:docId',can('fleet.documents'),handle(req=>{
  const v=getVehicle(req),d=docsFor(v).find(x=>String(x.id)===req.params.docId&&!x.archived_at);
  if(!d)fail(404,'Active document not found');
  const b=req.body||{},patch={};
  if(b.visibility!==undefined)patch.visibility=own(b.visibility,['public','private'],'visibility');
  if(b.expiry_date!==undefined)patch.expiry_date=cleanDate(b.expiry_date,'expiry date');
  if(b.document_number!==undefined)patch.document_number=textValue(b.document_number,80);
  if(!Object.keys(patch).length)fail(400,'Nothing to update');
  db.col('documents').update(d.id,patch);
  audit(v,'documents',{action:'update',doc_id:d.id,patch},req.user);
  return {document:summarizeDoc(d)};
}));
router.post('/vehicles/:id/documents-v19/:docId/archive',can('fleet.documents'),handle(req=>{
  const v=getVehicle(req),d=docsFor(v).find(x=>String(x.id)===req.params.docId&&!x.archived_at);
  if(!d)fail(404,'Active document not found');
  db.col('documents').update(d.id,{archived_at:new Date().toISOString(),archive_reason:'manual',archived_by:req.user.id});
  audit(v,'documents',{action:'archive',doc_id:d.id},req.user);
  return {document:summarizeDoc(d)};
}));
router.delete('/vehicles/:id/documents-v19/:docId',can('fleet.documents'),handle(req=>{
  const v=getVehicle(req),d=docsFor(v).find(x=>String(x.id)===req.params.docId&&!x.archived_at);
  if(!d)fail(404,'Active document not found');
  db.col('documents').remove(d.id);
  audit(v,'documents',{action:'delete',doc_id:d.id,type:d.document_type},req.user);
  return {success:true};
}));
function canSeeFile(req,vehicle,doc){
  if(req.user.permissions.includes('fleet.view'))return true;
  if(doc.visibility!=='public'||doc.archived_at)return false;
  const phone=req.user.phone;
  return db.col('schedules').all().some(s=>s.vehicle_id==vehicle.id &&
    s.status==='active' && (s.crew||[]).some(c=>db.col('staff').get(c.staff_id)?.phone===phone));
}
router.get('/vehicles/:id/documents-v19/:docId/file',handle((req,res)=>{
  const v=getVehicle(req),doc=docsFor(v).find(x=>String(x.id)===req.params.docId);
  if(!doc)fail(404,'Document not found');
  if(!canSeeFile(req,v,doc))fail(403,'Document access denied');
  if(doc.archived_at&&!req.user.permissions.includes('fleet.documents'))fail(403,'Archived documents are restricted');
  if(!doc.file_data)fail(404,'No file uploaded');
  const match=/^data:(application\/pdf|image\/png|image\/jpeg|image\/webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(doc.file_data);
  if(!match)fail(415,'Unsupported file format');
  const bytes=Buffer.from(match[2],'base64');
  res.setHeader('Content-Type',match[1]);res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Disposition','inline; filename="'+String(doc.file_name||'document').replace(/[^A-Za-z0-9._-]/g,'_')+'"');
  res.send(bytes);
}));
function parseMaintenance(b,current={}){
  const out={};
  const fields=['type','label','service_date','odometer_km','next_due_date','next_due_km','cost','notes'];
  for(const key of fields)if(b[key]!==undefined){
    if(key==='type')out.type=own(b.type,['service','repair','inspection','reminder'],'maintenance type');
    else if(key==='label')out.label=required(b.label,'Maintenance description',120);
    else if(key==='service_date'||key==='next_due_date')out[key]=cleanDate(b[key],key);
    else if(key==='odometer_km'||key==='next_due_km'||key==='cost')out[key]=number(b[key],key);
    else out[key]=textValue(b[key],3000);
  }
  if((out.label||current.label)==null)fail(400,'Maintenance description required');
  if(b.file_data)Object.assign(out,safeFile(b.file_data,b.file_name));
  return out;
}
router.post('/vehicles/:id/maintenance-v19',can('fleet.modify'),handle(req=>{
  const v=getVehicle(req),details=parseMaintenance(req.body||{});
  const record=db.col('vehicle_maintenance').insert({vehicle_id:v.id,type:'service',cost:0,...details,by:req.user.name});
  audit(v,'maintenance',{action:'create',record_id:record.id},req.user);
  return {record:summarizeMaintenance(record)};
}));
router.put('/vehicles/:id/maintenance-v19/:recordId',can('fleet.modify'),handle(req=>{
  const v=getVehicle(req),record=workFor(v).find(x=>String(x.id)===req.params.recordId&&!x.archived_at);
  if(!record)fail(404,'Maintenance record not found');
  const patch=parseMaintenance(req.body||{},record);if(!Object.keys(patch).length)fail(400,'No changes');
  db.col('vehicle_maintenance').update(record.id,patch);
  audit(v,'maintenance',{action:'update',record_id:record.id,fields:Object.keys(patch).filter(x=>x!=='file_data')},req.user);
  return {record:summarizeMaintenance(record)};
}));
router.post('/vehicles/:id/maintenance-v19/:recordId/archive',can('fleet.modify'),handle(req=>{
  const v=getVehicle(req),record=workFor(v).find(x=>String(x.id)===req.params.recordId&&!x.archived_at);
  if(!record)fail(404,'Maintenance record not found');
  db.col('vehicle_maintenance').update(record.id,{archived_at:new Date().toISOString(),archived_by:req.user.id});
  audit(v,'maintenance',{action:'archive',record_id:record.id},req.user);
  return {record:summarizeMaintenance(record)};
}));
router.get('/vehicles/:id/maintenance-v19/:recordId/file',can('fleet.view'),handle((req,res)=>{
  const v=getVehicle(req),record=workFor(v).find(x=>String(x.id)===req.params.recordId);
  if(!record||!record.file_data)fail(404,'Maintenance attachment not found');
  const match=/^data:(application\/pdf|image\/png|image\/jpeg|image\/webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(record.file_data);
  if(!match)fail(415,'Invalid file');
  res.setHeader('Content-Type',match[1]);res.setHeader('Content-Disposition','inline; filename="'+String(record.file_name||'attachment').replace(/[^A-Za-z0-9._-]/g,'_')+'"');
  res.send(Buffer.from(match[2],'base64'));
}));
module.exports=router;
