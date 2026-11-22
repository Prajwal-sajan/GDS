'use strict';
// Configuration v30: screenshot-derived operator settings, persisted locally.
// Saved preferences do not imply that a telephony, WhatsApp or push provider is connected.
const express=require('express'),db=require('../db'),D=require('../domain'),A=require('../auth');
const r=express.Router();
const fail=(m,s=400)=>{throw D.httpErr(s,m);};
const run=fn=>(req,res)=>{try{res.set('Cache-Control','private, no-store');const out=fn(req);if(out!==undefined)res.json(out);}catch(e){res.status(e.status||500).json({success:false,message:e.status?e.message:'Unable to update configuration'});}};
const grant=A.can;
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const store=()=>db.meta('config_v30')||{};
const base={
 business:{operator_name:'',support_email:'',gst_receivable:false,gst_number:'',gst_registration_name:''},
 website:{tagline:'',company_legal_name:'',address_lines:'',email:'',helpline:'',whatsapp_number:'',business_hours:'',copyright_line:'',
  boarding_window_minutes:30,refund_processing_days:7,carry_on_kg:7,check_in_kg:15,
  baggage_liability_inr:2000,child_free_age:5,unaccompanied_minor_age:12,
  jurisdiction_city:'',jurisdiction_state:'',grievance_officer_name:'',grievance_designation:''},
 communications:{cloud_calling:false,passenger_masking:false,direct_to_vehicle:false,call_individual_drivers:false,
  savetrip_line:'',whatsapp_sender:'',support_number:'',published_office_numbers:[],
  escalation_contacts:[],ring_order:'share',speed_dial_during_calls:false,
  dial_bus_last4:false,city_contacts:[],office_extra:[],crew_extra:[]},
 notifications:{bus_live_status:false,boarding_point_cutoff:45,pre_boarding_minutes:360,pre_boarding_based_on:'boarding_point',
  checkin_reminder_minutes:45,rating_request_minutes:120,builtin_crew_push:true,builtin_office_push:true}
};
const keys=Object.fromEntries(Object.entries(base).map(([k,v])=>[k,new Set(Object.keys(v))]));
function getAll(){
 const current=store(),op=db.meta('operator')||{};
 const result={};
 for(const k of Object.keys(base))result[k]={...base[k],...(current[k]||{})};
 // Existing operator fields are authoritative if already configured.
 for(const [k,opKey] of [['operator_name','operator_name'],['support_email','support_email']])
  if(op[opKey]&&!result.business[k])result.business[k]=op[opKey];
 if(op.tagline&&!result.website.tagline)result.website.tagline=op.tagline;
 if(op.helpline_number&&!result.website.helpline)result.website.helpline=op.helpline_number;
 return result;
}
const number=(v,key,max)=>{const n=Number(v);if(!Number.isFinite(n)||n<0||n>max||!Number.isInteger(n))fail('Invalid '+key);return n;};
const string=(v,key,max=150)=>{
 if(typeof v!=='string'||v.length>max)fail('Invalid '+key);
 return v.trim();
};
const phone=v=>{
 const s=String(v).replace(/[\s()-]/g,'');
 if(!/^\+?[0-9]{7,15}$/.test(s))fail('Enter a valid phone number');
 return s;
};
function cleanArray(value,key,count=30){
 if(!Array.isArray(value)||value.length>count)fail('Invalid '+key);
 return [...new Set(value.map(phone))];
}
function cleanCityContacts(value){
 if(!Array.isArray(value)||value.length>45)fail('Invalid city contacts');
 const names=new Set();
 return value.map(x=>{
  if(!plain(x))fail('Invalid city contact');
  const city=string(x.city,'city',90);
  if(!city||names.has(city.toLowerCase()))fail('Duplicate or empty city');
  names.add(city.toLowerCase());
  return {city,phones:cleanArray(x.phones||[],'city numbers',20)};
 });
}
const rules={
 business:{
  operator_name:v=>string(v,'operator name',150),
  support_email:v=>{const s=string(v,'support email',180);if(s&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))fail('Invalid support email');return s;},
  gst_receivable:v=>{if(typeof v!=='boolean')fail('Invalid GST switch');return v;},
  gst_number:v=>{const s=string(v,'GST number',15).toUpperCase();if(s&&!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s))fail('Invalid GSTIN');return s;},
  gst_registration_name:v=>string(v,'GST registration name',170)
 },
 website:{
  tagline:v=>string(v,'tagline',180),company_legal_name:v=>string(v,'company legal name',170),
  address_lines:v=>string(v,'address lines',1200),
  email:v=>{const s=string(v,'email',180);if(s&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))fail('Invalid email');return s;},
  helpline:v=>string(v,'helpline',120),
  whatsapp_number:v=>v?phone(v):'',
  business_hours:v=>string(v,'business hours',150),
  copyright_line:v=>string(v,'copyright line',220),
  boarding_window_minutes:v=>number(v,'boarding window',1440),
  refund_processing_days:v=>number(v,'refund days',365),
  carry_on_kg:v=>number(v,'carry-on baggage',250),
  check_in_kg:v=>number(v,'check-in baggage',250),
  baggage_liability_inr:v=>number(v,'baggage liability cap',10000000),
  child_free_age:v=>number(v,'child free age',21),
  unaccompanied_minor_age:v=>number(v,'minor age',21),
  jurisdiction_city:v=>string(v,'jurisdiction city',100),
  jurisdiction_state:v=>string(v,'jurisdiction state',100),
  grievance_officer_name:v=>string(v,'officer name',140),
  grievance_designation:v=>string(v,'designation',140)
 },
 communications:{
  cloud_calling:v=>boolean(v,'cloud calling'),
  passenger_masking:v=>boolean(v,'passenger masking'),
  direct_to_vehicle:v=>boolean(v,'direct to vehicle'),
  call_individual_drivers:v=>boolean(v,'call individual drivers'),
  savetrip_line:v=>fail('Managed calling line is configured by the connected provider'),
  whatsapp_sender:v=>fail('Managed WhatsApp sender is configured by the connected provider'),
  support_number:v=>string(v,'support number',60),
  published_office_numbers:v=>cleanArray(v,'office numbers'),
  escalation_contacts:v=>cleanArray(v,'escalation contacts'),
  ring_order:v=>{if(!['share','sequential'].includes(v))fail('Invalid ring order');return v;},
  speed_dial_during_calls:v=>boolean(v,'speed dial during calls'),
  dial_bus_last4:v=>boolean(v,'last four digits'),
  city_contacts:cleanCityContacts,
  office_extra:v=>cleanArray(v,'office team extras'),
  crew_extra:v=>cleanArray(v,'crew extras')
 },
 notifications:{
  bus_live_status:v=>boolean(v,'bus live status'),
  boarding_point_cutoff:v=>number(v,'boarding change cutoff',1440),
  pre_boarding_minutes:v=>number(v,'pre-boarding minutes',43200),
  pre_boarding_based_on:v=>{if(!['boarding_point','departure'].includes(v))fail('Invalid pre-boarding reference');return v;},
  checkin_reminder_minutes:v=>number(v,'check-in reminder',43200),
  rating_request_minutes:v=>number(v,'rating request',43200),
  builtin_crew_push:v=>boolean(v,'crew push'),
  builtin_office_push:v=>boolean(v,'office push')
 }
};
function boolean(v,key){if(typeof v!=='boolean')fail('Invalid '+key);return v;}
function update(section,payload,req){
 if(!rules[section]||!plain(payload))fail('Invalid section');
 if(Object.keys(payload).some(k=>!keys[section].has(k)))fail('Unknown setting field');
 const patch={};for(const [k,v] of Object.entries(payload))patch[k]=rules[section][k](v);
 const old=store(),next={...old,[section]:{...getAll()[section],...patch}};
 // Managed identifiers are informational, not a connected provider configuration.
 db.meta('config_v30',next);
 if(section==='business'){
  const op=db.meta('operator')||{};
  const delta={};
  if(Object.hasOwn(patch,'operator_name'))delta.operator_name=patch.operator_name;
  if(Object.hasOwn(patch,'support_email'))delta.support_email=patch.support_email;
  if(Object.keys(delta).length)db.meta('operator',{...op,...delta});
 }
 if(section==='website'){
  const op=db.meta('operator')||{},delta={};
  if(Object.hasOwn(patch,'tagline'))delta.tagline=patch.tagline;
  if(Object.hasOwn(patch,'helpline'))delta.helpline_number=patch.helpline;
  if(Object.keys(delta).length)db.meta('operator',{...op,...delta});
 }
 D.audit('settings','configuration_v30',section,{fields:Object.keys(patch)},req.user);
 return {section,value:next[section],saved:true,delivery_connected:false};
}
r.get('/settings/config-v30',grant('settings.view'),run(req=>({
 sections:getAll(),
 dials:db.col('speed_dials').all(),
 subscriptions:db.col('notification_subscriptions').all(),
 users:db.col('users').filter(u=>{
  const me=db.col('users').get(req.user?.real_user_id||req.user?.id);
  return !u.deleted_at&&!!me&&(['owner','admin','manager'].includes(me.role)||u.id===me.id||
   !!me.branch_id&&String(me.branch_id)===String(u.branch_id));
 }).map(u=>({id:u.id,name:u.name,phone:u.phone,role:u.role})),
 delivery_connected:false,
 provider_note:'Cloud calls, WhatsApp and push delivery need separately configured authorized providers.'
})));
r.put('/settings/config-v30/:section',grant('settings.modify'),run(req=>update(req.params.section,req.body,req)));
r.post('/settings/config-v30/dials',grant('settings.modify'),run(req=>{
 const b=req.body||{},code=String(b.code||'').trim(),kind=String(b.kind||'number');
 if(!/^[0-9]{1,2}$/.test(code))fail('Dial code must contain 1–2 digits');
 if(!['number','staff','branch'].includes(kind))fail('Invalid dial type');
 if(db.col('speed_dials').find(x=>x.code===code))fail('Code already exists',409);
 const row=db.col('speed_dials').insert({code,kind,phone:phone(b.phone),label:string(b.label||'','label',90),is_active:b.is_active!==false});
 D.audit('settings','speed_dial',row.id,{created:true},req.user);return row;
}));
r.put('/settings/config-v30/dials/:id',grant('settings.modify'),run(req=>{
 const old=db.col('speed_dials').get(req.params.id);if(!old)fail('Code not found',404);
 const b=req.body||{},code=String(b.code??old.code).trim();
 if(!/^[0-9]{1,2}$/.test(code))fail('Invalid dial code');
 if(db.col('speed_dials').find(x=>x.code===code&&x.id!==old.id))fail('Code already exists',409);
 const kind=String(b.kind??old.kind);
 if(!['number','staff','branch'].includes(kind))fail('Invalid dial type');
 const next=db.col('speed_dials').update(old.id,{code,kind,phone:phone(b.phone??old.phone),label:string(b.label??old.label,'label',90),is_active:b.is_active===undefined?old.is_active:boolean(b.is_active,'active')});
 D.audit('settings','speed_dial',old.id,{edited:true},req.user);return next;
}));
r.delete('/settings/config-v30/dials/:id',grant('settings.modify'),run(req=>{
 if(!db.col('speed_dials').get(req.params.id))fail('Code not found',404);
 db.col('speed_dials').remove(req.params.id);D.audit('settings','speed_dial',req.params.id,{deleted:true},req.user);return {deleted:true};
}));
const EVENTS=['New booking','Booking changed','Cancellation','Trip delayed / cancelled','Unpaid hold expired',
 'Payment received','Check-in reminder','Live Journey','Pre-boarding / tracking link',
 'Rating request','Bus approaching'];
const SOURCES=['Website','app','Branch','Agent','GDS','Partner'];
function subClean(b,existing){
 if(!plain(b))fail('Invalid subscription');
 if(b.enabled!==undefined&&Object.keys(b).length===1&&existing)return {...existing,enabled:boolean(b.enabled,'status')};
 const event_types=Array.isArray(b.event_types)?[...new Set(b.event_types)]:existing?.event_types||[];
 if(!event_types.length||event_types.some(x=>!EVENTS.includes(x)))fail('Choose one or more events');
 const channel=b.protocol||b.channel||existing?.channel||'whatsapp';
 if(!['whatsapp','push'].includes(channel))fail('Only WhatsApp and app push are supported by this screen');
 const endpoint=b.endpoint||existing?.endpoint||'phone';
 if(!['phone','booking_passenger','crew','office'].includes(endpoint))fail('Invalid endpoint');
 const contacts=Array.isArray(b.contacts)?b.contacts:existing?.contacts||[];
 if(contacts.length>20)fail('Too many contacts');
 const normalized=contacts.map(x=>{
  if(!plain(x))fail('Invalid contact');
  return {phone:phone(x.phone),name:string(x.name||'','name',90)};
 });
 if(endpoint==='phone'&&!normalized.length)fail('Add at least one mobile contact');
 const only_sources=b.only_sources===undefined?!!existing?.only_sources:boolean(b.only_sources,'booking sources');
 const source_list=Array.isArray(b.booking_sources)?[...new Set(b.booking_sources)]:existing?.booking_sources||[];
 if(source_list.some(x=>!SOURCES.includes(x)))fail('Unknown booking source');
 if(only_sources&&!source_list.length)fail('Choose a booking source');
 return {subscriber_type:endpoint==='phone'?'contacts':'group',subscriber_ref:endpoint,
  display_name:endpoint==='phone'?normalized.map(x=>x.name||x.phone).join(', ').slice(0,120):endpoint,
  event_types,channel,endpoint,contacts:normalized,only_sources,
  booking_sources:only_sources?source_list:[],quiet_hours:b.quiet_hours===undefined?!!existing?.quiet_hours:boolean(b.quiet_hours,'quiet hours'),
  enabled:b.enabled===undefined?(existing?.enabled!==false):boolean(b.enabled,'enabled'),
  managed_by:'config-v30',delivery_status:'not_connected'};
}
r.post('/settings/config-v30/subscriptions',grant('settings.modify'),run(req=>{
 const clean=subClean(req.body);const row=db.col('notification_subscriptions').insert(clean);
 D.audit('settings','notification_subscription',row.id,{created:true},req.user);return row;
}));
r.put('/settings/config-v30/subscriptions/:id',grant('settings.modify'),run(req=>{
 const old=db.col('notification_subscriptions').get(req.params.id);if(!old)fail('Subscription not found',404);
 if(req.body?.enabled!==undefined&&Object.keys(req.body).length===1){
  const enabled=boolean(req.body.enabled,'enabled');
  const row=db.col('notification_subscriptions').update(old.id,{enabled});
  D.audit('settings','notification_subscription',old.id,{enabled},req.user);return row;
 }
 const clean=subClean(req.body,old);const row=db.col('notification_subscriptions').update(old.id,clean);
 D.audit('settings','notification_subscription',old.id,{updated:true},req.user);return row;
}));
r.delete('/settings/config-v30/subscriptions/:id',grant('settings.modify'),run(req=>{
 if(!db.col('notification_subscriptions').get(req.params.id))fail('Subscription not found',404);
 db.col('notification_subscriptions').remove(req.params.id);
 D.audit('settings','notification_subscription',req.params.id,{deleted:true},req.user);return {deleted:true};
}));
r.post('/settings/config-v30/subscriptions/:id/test',grant('settings.modify'),run(req=>{
 if(!db.col('notification_subscriptions').get(req.params.id))fail('Subscription not found',404);
 fail('Delivery unavailable: no authorized WhatsApp or push provider is connected. No message was sent.',424);
}));
r.get('/settings/config-v30/delivery-log/:pnr',grant('settings.view'),run(req=>{
 const pnr=String(req.params.pnr||'').trim();
 if(!/^[a-zA-Z0-9-]{4,35}$/.test(pnr))fail('Enter a valid PNR');
 const logs=db.col('notification_delivery_log').filter(x=>x.pnr===pnr);
 // Do not invent delivery receipts or expose booking/customer details.
 return {pnr,rows:logs.map(x=>({at:x.at,status:x.status,channel:x.channel,event:x.event})),
   note:'Only real recorded delivery attempts are displayed. No provider delivery is currently connected.'};
}));
module.exports=r;
