'use strict';
// Configuration v31 schema: 8 screenshot continuations. Persisted preferences do not
// activate RevenueMax, WhatsApp, AI, GPS or metro partnerships on their own.
const error=(m)=>{const e=new Error(m);e.status=400;throw e;};
function boolean(v,name){if(typeof v!=='boolean')error(name+' must be true or false');return v;}
function integer(v,name,max,min=0){
 if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)error(name+' must be a whole number between '+min+' and '+max);
 return v;
}
function decimal(v,name,max,min=0){
 if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)error(name+' must be a number between '+min+' and '+max);
 return Math.round(v*10000)/10000;
}
function optionalDecimal(v,name,max){
 if(v===null||v==='')return null;
 return decimal(v,name,max);
}
function choice(v,name,options){
 if(!options.includes(v))error('Invalid '+name);
 return v;
}
function str(v,name,max=160){
 if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b-\u001f]/.test(v))error('Invalid '+name);
 return v.trim();
}
function list(v,name,maxCount,parse){
 if(!Array.isArray(v)||v.length>maxCount)error('Invalid '+name);
 const output=v.map(x=>parse(x));
 if(new Set(output.map(x=>x.toLowerCase())).size!==output.length)error('Duplicate '+name);
 return output;
}
function phone(v){
 const norm=str(v,'phone number',25).replace(/[\s()+-]/g,'');
 if(!/^[0-9]{10,15}$/.test(norm))error('Phone number must contain 10 to 15 digits');
 return norm;
}
const HOLD=['until_departure',5,10,15,20,30,45,60,90,120,180,240,360,720,1440];
const CHANNELS=['branch','mine','my_branch','agent','online_otas','website','other'];
const USER_TYPES=['passenger','driver','agent','staff','all'];
const COLOR_KEYS=['male','female','not_given','branch','mine','my_branch','agent','online_otas','website','other'];
const DEFAULT_COLORS={
 male:'#458bff',female:'#f04b9d',not_given:'#df393f',
 branch:'#8552f6',mine:'#0aaac0',my_branch:'#79b71d',
 agent:'#e2a51e',online_otas:'#9aadc3',website:'#a7a9c5',other:'#b8c5d4'
};
const defaults={
 pricing:{dynamic_pricing_enabled:true,sarathi_ai_assistant_enabled:true,manual_pair_fare_hold_hours:3},
 office:{default_hold:'until_departure',max_hold:'until_departure'},
 vehicle:{enabled:true,fuel_drop_threshold_liters:10,fuel_window_minutes:20,
  fuel_max_odometer_km:1.0,fuel_max_engine_hours:0.1,
  overspeed_speed_limit_kmh:90,overspeed_consecutive_readings:2,
  idling_duration_minutes:45,idling_max_odometer_km:1,
  offline_threshold_minutes:60,alert_recipients:[]},
 expenses:{diesel_cost_per_litre:null},
 seats:{fill_seats_by:'gender',outer_ring_by:'booking_channel',
  ring_channels:['branch','mine','my_branch','agent'],colors:DEFAULT_COLORS},
 monitoring:{enabled:true,monitor_window_hours:12,baseline_ttl_hours:72,
  alert_cooldown_minutes:60,move_distance_km:1,geofence_radius_meters:500,
  move_speed_kmh:20,engine_on_minutes:30,engine_idle_speed_kmh:5,
  fuel_drop_liters:1,fuel_drop_percent:5},
 whatsapp:{enabled:true,recipients:[]},
 bot:{enabled:true,respond_to_user_types:['passenger'],max_responses_per_passenger:10,
  response_delay_seconds:1,escalation_keywords:['complaint','refund','cancel booking','speak to manager','urgent'],
  free_metro_ticket_enabled:true,metro_exchange_point:'',metro_ticket_instructions:''}
};
function colors(v){
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length>COLOR_KEYS.length)error('Invalid seat legend colours');
 const result={...DEFAULT_COLORS};
 for(const [key,value] of Object.entries(v)){
  if(!COLOR_KEYS.includes(key)||typeof value!=='string'||!/^#[0-9a-fA-F]{6}$/.test(value))error('Invalid colour for '+key);
  result[key]=value.toLowerCase();
 }
 return result;
}
function hold(v){
 if(typeof v==='string'&&v!=='until_departure'&&/^\d+$/.test(v))v=Number(v);
 return choice(v,'seat hold',HOLD);
}
const rules={
 pricing:{
  dynamic_pricing_enabled:v=>boolean(v,'Dynamic Pricing'),
  sarathi_ai_assistant_enabled:v=>boolean(v,'Sarathi assistant'),
  manual_pair_fare_hold_hours:v=>decimal(v,'Manual pair fare hold',720)
 },
 office:{default_hold:hold,max_hold:hold},
 vehicle:{
  enabled:v=>boolean(v,'Vehicle Alerts'),fuel_drop_threshold_liters:v=>decimal(v,'Fuel drop threshold',10000),
  fuel_window_minutes:v=>integer(v,'Fuel detection window',10080),fuel_max_odometer_km:v=>decimal(v,'Fuel odometer limit',10000),
  fuel_max_engine_hours:v=>decimal(v,'Maximum engine hours',240),
  overspeed_speed_limit_kmh:v=>decimal(v,'Overspeed threshold',250),
  overspeed_consecutive_readings:v=>integer(v,'Consecutive overspeed readings',100,1),
  idling_duration_minutes:v=>integer(v,'Idling duration',1440),
  idling_max_odometer_km:v=>decimal(v,'Idling maximum odometer',1000),
  offline_threshold_minutes:v=>integer(v,'Offline threshold',10080),
  alert_recipients:v=>list(v,'vehicle recipients',30,phone)
 },
 expenses:{diesel_cost_per_litre:v=>optionalDecimal(v,'Diesel cost',100000)},
 seats:{
  fill_seats_by:v=>choice(v,'seat fill mode',['gender','booking_channel','none']),
  outer_ring_by:v=>choice(v,'seat ring mode',['booking_channel','none']),
  ring_channels:v=>list(v,'seat ring channels',CHANNELS.length,x=>choice(x,'booking channel',CHANNELS)),
  colors
 },
 monitoring:{
  enabled:v=>boolean(v,'Post-Trip Monitoring'),
  monitor_window_hours:v=>decimal(v,'Monitor window',720),
  baseline_ttl_hours:v=>decimal(v,'Baseline TTL',8760),
  alert_cooldown_minutes:v=>integer(v,'Alert cooldown',10080),
  move_distance_km:v=>decimal(v,'Move distance',10000),
  geofence_radius_meters:v=>decimal(v,'Geofence radius',100000),
  move_speed_kmh:v=>decimal(v,'Move speed',250),
  engine_on_minutes:v=>integer(v,'Engine on',10080),
  engine_idle_speed_kmh:v=>decimal(v,'Engine idle speed',100),
  fuel_drop_liters:v=>decimal(v,'Fuel drop liters',10000),
  fuel_drop_percent:v=>decimal(v,'Fuel drop percent',100)
 },
 whatsapp:{
  enabled:v=>boolean(v,'WhatsApp Operational Alerts'),
  recipients:v=>list(v,'WhatsApp alert recipients',30,phone)
 },
 bot:{
  enabled:v=>boolean(v,'AI Bot'),
  respond_to_user_types:v=>list(v,'user types',USER_TYPES.length,x=>choice(x,'user type',USER_TYPES)),
  max_responses_per_passenger:v=>integer(v,'Maximum responses',1000),
  response_delay_seconds:v=>decimal(v,'Response delay',120),
  escalation_keywords:v=>list(v,'escalation keywords',40,x=>{
   const s=str(x,'keyword',90).toLowerCase();
   if(!s)error('Escalation keyword cannot be empty');
   return s;
  }),
  free_metro_ticket_enabled:v=>boolean(v,'Free Metro Ticket'),
  metro_exchange_point:v=>str(v,'Metro exchange point',200),
  metro_ticket_instructions:v=>str(v,'Metro ticket instructions',2000)
 }
};
function validateFull(section,data){
 if(section==='office'){
  const rank=x=>x==='until_departure'?Infinity:x;
  if(rank(data.default_hold)>rank(data.max_hold))error('Default hold cannot exceed maximum hold');
 }
 if(section==='seats'&&data.outer_ring_by==='none'&&data.ring_channels.length){
  // Retain the chosen channels for when the ring is re-enabled; do not render them.
 }
 if(section==='bot'&&data.respond_to_user_types.includes('all')&&data.respond_to_user_types.length!==1){
  error('All user types cannot be combined with individual types');
 }
}
module.exports={defaults,rules,validateFull,HOLD,CHANNELS,COLOR_KEYS,DEFAULT_COLORS};
