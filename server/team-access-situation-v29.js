'use strict';
// Snapshot-only Test access scenario inputs. These never grant permissions or impersonate a caller.
const net=require('node:net');
const FIELDS=[
 ['caller_id',"The caller's id (91 + mobile)"],['acting_operator_id','Operator the caller is acting for'],
 ['caller_branch_id',"The caller's branch id"],['caller_role_names',"The caller's role names (multi-valued)"],
 ['calling_app','Calling app: app | hub | website | gds | partner'],['client_ip','Client IP address'],
 ['request_time_utc','Request time (ISO 8601, UTC)'],['operator_hour','Hour of day at the operator (0-23)'],
 ['resource_operator_id','Operator that owns the resource'],['booked_by_mobile','Who booked / is assigned (91 + mobile)'],
 ['sold_branch_id','Branch that sold it (sales boundary)'],['route_id','Route id of the trip'],
 ['stop_city_ids','Cities the trip stops in (multi-valued)'],['inside_branch_operations_area',"Inside the caller's branch operations area (Bool)"],
 ['on_trip_roster','Caller is on the trip roster (Bool)'],['request_amount_inr','Money amount of the request (₹)'],
 ['discount_percent','Discount being given (%)'],['fare_change_percent','Fare change being made (±%)'],
 ['seat_count','Seats in the request'],['already_blocked_seats','Seats the caller already holds blocked'],
 ['block_duration_hours','Requested block duration (hours)'],['days_before_departure','Days from now to departure'],
 ['hours_before_departure','Hours from now to departure']
];
const LABELS=new Map(FIELDS);
const LEGACY=new Set(['branch_id','owner_user_id']);
const USED=new Set(['route_id','seat_count','block_duration_hours','hours_before_departure',
 'days_before_departure','sold_branch_id','booked_by_mobile','branch_id','owner_user_id']);
const NUMBERS={
 caller_branch_id:[0,1000000000,true],sold_branch_id:[1,1000000000,true],
 route_id:[1,1000000000,true],operator_hour:[0,23,true],
 request_amount_inr:[0,1000000000,false],discount_percent:[0,100,false],
 fare_change_percent:[-100,1000,false],seat_count:[0,500,true],
 already_blocked_seats:[0,500,true],block_duration_hours:[0,8760,false],
 days_before_departure:[0,365,false],hours_before_departure:[0,8760,false],
 branch_id:[1,1000000000,true],owner_user_id:[1,1000000000,true]
};
function normalize(raw,{user,db,visible,fail,context}){
 if(raw==null)raw={};
 if(typeof raw!=='object'||Array.isArray(raw))fail('Situation must be an object');
 if(Object.keys(raw).length>27)fail('Too many situation fields');
 const supplied=[],contextOnly=[];
 function number(key,value){
  const [min,max,whole]=NUMBERS[key];
  const n=Number(value);
  if(String(value).trim()===''||!Number.isFinite(n)||n<min||n>max||(whole&&!Number.isInteger(n)))
   fail('Invalid '+(LABELS.get(key)||key));
  return n;
 }
 function mobile(key,value){
  const s=String(value).trim().replace(/[ +()-]/g,'');
  const digits=s.startsWith('91')&&s.length===12?s.slice(2):s;
  if(!/^[6-9][0-9]{9}$/.test(digits))fail('Invalid '+LABELS.get(key));
  return digits;
 }
 function listed(key,value){
  const items=Array.isArray(value)?value:String(value).split(',');
  if(items.length>30||!items.length||items.some(x=>typeof x!=='string'||!x.trim()||x.trim().length>100))
   fail('Invalid '+LABELS.get(key));
  return items.map(x=>x.trim());
 }
 function bool(key,value){
  if(value===true||value==='true'||value===1||value==='1')return true;
  if(value===false||value==='false'||value===0||value==='0')return false;
  fail('Invalid '+LABELS.get(key));
 }
 const data={};
 for(const [key,value] of Object.entries(raw)){
  if(!LABELS.has(key)&&!LEGACY.has(key))fail('Unknown situation field: '+String(key).slice(0,40));
  if(value===undefined||value===null||value==='')continue;
  if(typeof value==='object'&&!Array.isArray(value))fail('Invalid value for '+key);
  if(NUMBERS[key])data[key]=number(key,value);
  else if(key==='caller_id'||key==='booked_by_mobile')data[key]=mobile(key,value);
  else if(key==='caller_role_names'||key==='stop_city_ids')data[key]=listed(key,value);
  else if(key==='inside_branch_operations_area'||key==='on_trip_roster')data[key]=bool(key,value);
  else if(key==='calling_app'){
   if(!['app','hub','website','gds','partner'].includes(value))fail('Invalid calling app');
   data[key]=value;
  }else if(key==='client_ip'){
   if(!net.isIP(String(value)))fail('Invalid client IP address');
   data[key]=String(value);
  }else if(key==='request_time_utc'){
   const s=String(value);
   if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(s)||!Number.isFinite(Date.parse(s)))
    fail('Request time must be ISO 8601 UTC ending in Z');
   data[key]=s;
  }else{
   const s=String(value).trim();
   if(!s||s.length>120)fail('Invalid '+(LABELS.get(key)||key));
   data[key]=s;
  }
  supplied.push(key);
 }
 if(data.caller_id&&data.caller_id!==String(user.phone).replace(/\D/g,'').slice(-10))
  fail("Caller's id must match the person being tested");
 if(data.caller_branch_id!==undefined&&String(data.caller_branch_id)!==String(user.branch_id||0))
  fail("Caller's branch must match the person being tested");
 if(data.sold_branch_id!==undefined){
  if(!db.col('branches').get(data.sold_branch_id))fail('Unknown selling branch');
  if(context.branch_id!==undefined&&context.branch_id!==data.sold_branch_id)
   fail('Conflicting selling branch and branch scope');
  context.branch_id=data.sold_branch_id;
 }
 if(data.booked_by_mobile){
  const assigned=db.col('users').find(x=>String(x.phone).replace(/\D/g,'').slice(-10)===data.booked_by_mobile&&!x.deleted_at);
  if(assigned&&visible(assigned)){
   if(context.owner_user_id!==undefined&&context.owner_user_id!==assigned.id)fail('Conflicting booking owner');
   context.owner_user_id=assigned.id;
  }
  // Unknown or non-visible booking owners cannot grant Own access.
 }
 // Normalize canonical permission-rule inputs as well as screenshot-only metadata.
 // The legacy v28 route still independently checks resource IDs and existence.
 for(const key of ['route_id','seat_count','block_duration_hours','hours_before_departure','branch_id','owner_user_id']){
  if(data[key]===undefined)continue;
  if(context[key]!==undefined&&context[key]!==data[key])fail('Conflicting '+key);
  context[key]=data[key];
 }
 if(data.days_before_departure!==undefined){
  const hours=data.days_before_departure*24;
  if(context.hours_before_departure!==undefined&&Math.abs(context.hours_before_departure-hours)>0.01)
   fail('Conflicting departure days and hours');
  if(context.hours_before_departure===undefined)context.hours_before_departure=hours;
 }
 if(data.inside_branch_operations_area===false)context.inside_branch_operations_area=false;
 const policyKeys=supplied.filter(x=>USED.has(x)&&
  (x!=='booked_by_mobile'||context.owner_user_id!==undefined));
 for(const key of supplied)if(!policyKeys.includes(key))contextOnly.push(key);
 return {supplied,policyKeys,contextOnly};
}
module.exports={FIELDS,normalize};
