'use strict';
// Schedule Update v51: authenticated, validated schedule-specific override
// operations. No writes to the route template and no pretend provider syncing.
const express=require('express'),db=require('../db'),D=require('../domain'),
 U=require('../util'),{can}=require('../auth'),Policy=require('../access-runtime-v27');
const router=express.Router();
const run=fn=>(req,res)=>{try{res.set('Cache-Control','private, no-store, max-age=0');const value=fn(req);if(value!==undefined)res.json(value)}catch(error){res.status(error.status||500).json({success:false,message:error.status?error.message:'Unable to update schedule'})}};
const fail=(status,message)=>{throw D.httpErr(status,message)};
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
const ROLES=['Driver','Helper','Attendant','Conductor','Pickup Van'];
const CALL_KEYS=['cloud_calling','number_masking','direct_to_vehicle','driver_gps'];
const CAB=['Off','Pickups','Drops','Both'];
function scheduleFrom(id){
 const s=db.col('schedules').get(id);if(!s)fail(404,'Schedule not found');
 const r=db.col('routes').get(s.route_id);if(!r)fail(404,'Route not found');
 return{s,r};
}
function routeAssignment(r,date){
 const items=r.assignments||[];
 if(!items.length)return{vehicle_id:r.vehicle_id||null,crew:[]};
 const index=items.length>1?Math.abs(U.daysBetween(r.start_date||'2026-01-01',date))%items.length:0;
 const x=items[index]||{};
 return{vehicle_id:x.vehicle_id||null,crew:(x.crew||[]).map(c=>({staff_id:c.staff_id,role:c.role}))};
}
function vehicle(id){
 if(id==null||id==='')return null;
 if(!/^[0-9]+$/.test(String(id)))fail(400,'Invalid vehicle selection');
 const v=db.col('vehicles').get(Number(id));
 if(!v||v.status==='inactive'||v.status==='deleted')fail(400,'Selected vehicle is unavailable');
 return v;
}
function ensureCoachCompatible(s,r,v){
 const existing=D.coachForSchedule(s),next=db.col('coaches').get(v?.coach_template_id||r.coach_template_id);
 if(!next)fail(409,'Selected vehicle has no valid coach template');
 const live=db.col('bookings').count(b=>String(b.schedule_id)===String(s.id)&&['hold','confirmed'].includes(b.status));
 if(live&&existing){
  const currentCodes=new Set((existing.layout?.decks||[]).flatMap(d=>(d.seats||[]).map(x=>String(x.code))));
  const nextCodes=new Set((next.layout?.decks||[]).flatMap(d=>(d.seats||[]).map(x=>String(x.code))));
  if(currentCodes.size!==nextCodes.size||[...currentCodes].some(c=>!nextCodes.has(c)))
   fail(409,'Coach transfer changes booked seat inventory. Use an authorized seat migration workflow instead.');
 }
}
function freezeRouteBlocks(s,r){
 // Disabling route sync must not silently release crew-reserved or other
 // blocked seats. Copy the effective route blocks into the schedule overlay.
 if(s.sync_with_route===false)return;
 const snapshots=(r.seat_blocks||[]).map(block=>({...block,route_snapshot_v51:true}));
 s.seat_blocks=[...(s.seat_blocks||[]),...snapshots];
}
function cleanRouteBlockSnapshots(s){
 s.seat_blocks=(s.seat_blocks||[]).filter(b=>!b.route_snapshot_v51);
}
function validateCrew(crew){
 if(!Array.isArray(crew)||crew.length>8)fail(400,'Maximum eight crew assignments');
 const seen=new Set(),result=[];
 for(const row of crew){
  if(!row||typeof row!=='object'||!ROLES.includes(row.role)||!row.staff_id||
    !/^[0-9]+$/.test(String(row.staff_id)))fail(400,'Invalid crew role or staff selection');
  const id=Number(row.staff_id),staff=db.col('staff').get(id);
  if(!staff||staff.status!=='active'||seen.has(id))fail(400,'Staff must be active and assigned once');
  if(row.role==='Driver'&&staff.role!=='driver')fail(400,'Driver assignment requires an active driver');
  if(['Helper','Attendant'].includes(row.role)&&!['helper','attendant'].includes(staff.role))
   fail(400,'Select a helper/attendant for this role');
  if(row.role==='Conductor'&&staff.role!=='conductor')fail(400,'Select an active conductor');
  seen.add(id);result.push({staff_id:id,role:row.role});
 }
 return result;
}
function validateCalls(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!CALL_KEYS.includes(k)))
  fail(400,'Invalid call routing settings');
 const out={};for(const key of CALL_KEYS)
  if(own(input,key)){if(typeof input[key]!=='boolean')fail(400,'Call routing switches must be boolean');out[key]=input[key];}
 return out;
}
function validateEscalations(value){
 if(!Array.isArray(value)||value.length>8)fail(400,'Maximum eight escalation contacts');
 const list=value.map(x=>String(x).replace(/[\s()-]/g,''));
 if(list.some(x=>!(/^\+?[0-9]{10,15}$/).test(x)))fail(400,'Escalation numbers must contain 10–15 digits');
 if(new Set(list).size!==list.length)fail(400,'Duplicate escalation number');
 return list;
}
function routeCalls(r){
 const a=r.call_settings||{};
 return{cloud_calling:!!a.cloud_calling,number_masking:!!a.number_masking,
  direct_to_vehicle:!!a.direct_to_vehicle,driver_gps:!!a.driver_gps};
}
function routeEscalation(r){
 const a=r.escalation_contacts||r.call_settings?.escalation_contacts||[];
 return (Array.isArray(a)?a:String(a||'').split(',')).map(x=>typeof x==='string'?x:x.phone||'').filter(Boolean);
}
function routeCab(r){
 const x=r.business_rules?.cab_mode||r.cabs?.mode||'Off';
 return CAB.includes(x)?x:'Off';
}
function response(s,r,req){
 const settings=s.update_v51||{},assignment=routeAssignment(r,s.travel_date);
 const routeVal=routeCalls(r),call=settings.call_settings||routeVal;
 const canModify=req.user.permissions.includes('schedules.modify');
 const showFleet=req.user.permissions.includes('fleet.view');
 const showStaff=req.user.permissions.includes('staff.view');
 const activeCrew=(s.crew||[]).map(c=>{
  const person=db.col('staff').get(c.staff_id);
  return{role:c.role||'Driver',staff_id:c.staff_id,name:person?.name||'Unavailable',phone:showStaff?person?.phone||'':''};
 });
 return{
  schedule_id:s.id,service_number:r.service_number,
  assignment_source:s.assignment_override_v51?'Schedule':'Route',
  call_source:settings.call_settings?'Schedule':'Route',
  cab_source:own(settings,'cab_mode')?'Schedule':'Route',
  can_modify:canModify,
  vehicle_id:s.vehicle_id||null,crew:activeCrew,
  route_assignment:assignment,
  vehicle_options:showFleet&&canModify?db.col('vehicles').filter(v=>v.status!=='inactive'&&v.status!=='deleted')
   .map(v=>({id:v.id,label:v.registration_number,coach_template_id:v.coach_template_id})):[],
  staff_options:showStaff&&canModify?db.col('staff').filter(x=>x.status==='active')
   .map(x=>({id:x.id,name:x.name,phone:x.phone,role:x.role})):[],
  call_settings:CALL_KEYS.reduce((out,k)=>(out[k]=!!call[k],out),{}),
  escalation_contacts:settings.escalation_contacts??routeEscalation(r),
  cab_mode:settings.cab_mode??routeCab(r),
  coach_name:db.col('coaches').get(D.coachForSchedule(s)?.id)?.name||'Coach not configured',
  auto_ota_sync_connected:false,
  ota_sync_message:'OTA resync is unavailable until an authorized OTA connector and provider endpoint are configured.'
 };
}
router.get('/schedules/:id/update-v51',can('schedules.view'),run(req=>{
 const {s,r}=scheduleFrom(req.params.id);return response(s,r,req);
}));
router.put('/schedules/:id/update-v51/assignment',can('schedules.modify'),run(req=>{
 Policy.explicitAccess(req,'Assign bus',{route_id:scheduleFrom(req.params.id).r.id});
 Policy.explicitAccess(req,'Assign crew (driver, conductor, helper)',{route_id:scheduleFrom(req.params.id).r.id});
 const{s,r}=scheduleFrom(req.params.id),body=req.body||{};
 if(body.vehicle_id===undefined||!Array.isArray(body.crew))
  fail(400,'Vehicle and staff selections required');
 if(Object.keys(body).some(k=>!['vehicle_id','crew','call_settings','escalation_contacts','cab_mode'].includes(k)))
  fail(400,'Unknown assignment setting');
 const v=vehicle(body.vehicle_id);
 ensureCoachCompatible(s,r,v);
 const crew=validateCrew(body.crew);
 const settings={...(s.update_v51||{})};
 if(own(body,'call_settings'))settings.call_settings=validateCalls(body.call_settings);
 if(own(body,'escalation_contacts'))settings.escalation_contacts=validateEscalations(body.escalation_contacts);
 if(own(body,'cab_mode')){
  if(!CAB.includes(body.cab_mode))fail(400,'Invalid cab selection');
  settings.cab_mode=body.cab_mode;
 }
 const previous={vehicle_id:s.vehicle_id,crew:s.crew,sync_with_route:s.sync_with_route,update_v51:s.update_v51};
 freezeRouteBlocks(s,r);
 s.vehicle_id=v?.id||null;s.crew=crew;
 s.update_v51=settings;s.assignment_override_v51=true;s.sync_with_route=false;
 db.persist();
 D.audit('schedule',s.id,'assignment',{before:previous,after:{
  vehicle_id:s.vehicle_id,crew,call_settings:settings.call_settings,
  cab_mode:settings.cab_mode,escalation_count:settings.escalation_contacts?.length||0,
  sync_with_route:false
 }},req.user);
 return response(s,r,req);
}));
router.put('/schedules/:id/update-v51/sync',can('schedules.modify'),run(req=>{
 const {s,r}=scheduleFrom(req.params.id),enabled=req.body?.enabled;
 if(typeof enabled!=='boolean')fail(400,'Choose whether route sync is enabled');
 Policy.explicitAccess(req,'Assign bus',{route_id:r.id});
 Policy.explicitAccess(req,'Assign crew (driver, conductor, helper)',{route_id:r.id});
 if(enabled){
  const next=routeAssignment(r,s.travel_date),v=vehicle(next.vehicle_id);
  ensureCoachCompatible(s,r,v);
  validateCrew(next.crew);
  const live=db.col('bookings').count(b=>String(b.schedule_id)===String(s.id)&&['confirmed','hold'].includes(b.status));
  if(live&&r.departure_time!==s.departure_time)
   fail(409,'Cannot reset a booked trip departure time while re-enabling route sync. Review affected passengers and trip timings first.');
  cleanRouteBlockSnapshots(s);
  s.vehicle_id=v?.id||null;s.crew=next.crew;
  s.departure_time=r.departure_time;s.arrival_time=r.arrival_time;
  s.update_v51={};s.assignment_override_v51=false;
  s.fare_override=null;
 }
 if(!enabled)freezeRouteBlocks(s,r);
 s.sync_with_route=enabled;
 db.persist();D.audit('schedule',s.id,'sync_with_route',{enabled,source:enabled?'route':'schedule'},req.user);
 return response(s,r,req);
}));
router.post('/schedules/:id/update-v51/sync-ota',can('schedules.modify'),run(req=>{
 const {s}=scheduleFrom(req.params.id);
 // No partner push connector is wired into the standalone GDS. Fail closed.
 return fail(501,'OTA resync is not connected. No seats were pushed for '+s.travel_date+'.');
}));
module.exports=router;
module.exports.validateCrew=validateCrew;
module.exports.validateEscalations=validateEscalations;
module.exports.validateCalls=validateCalls;
module.exports.response=response;
module.exports.routeAssignment=routeAssignment;
