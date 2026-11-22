'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.GDS_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'config-v31-'));
process.env.GDS_RESEED='1';
const schema=require('../server/configuration-v31-schema');
const OfficeHold=require('../server/office-hold-v31');
const app=require('../server/index'),db=require('../server/db'),auth=require('../server/auth');
const owner=db.col('users').find(x=>x.role==='owner');
const agent=db.col('users').find(x=>x.role==='agent')||db.col('users').insert({name:'Agent',phone:'9444444441',role:'agent',status:'ACTIVE'});
assert.ok(owner);
const token=id=>auth.sign({uid:id,exp:Date.now()+600000});
const server=app.listen(0);
const uri='http://127.0.0.1:'+server.address().port+'/api';
async function request(method,route,body,actor=owner){
 const headers={authorization:'Bearer '+token(actor.id)};
 if(body!==undefined)headers['content-type']='application/json';
 const result=await fetch(uri+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 return {status:result.status,data:await result.json().catch(()=>({}))};
}
const GET=(p,a)=>request('GET',p,undefined,a),PUT=(p,b,a)=>request('PUT',p,b,a);
async function success(section,payload){
 const result=await PUT('/settings/config-v30/'+section,payload);
 assert.equal(result.status,200,JSON.stringify(result.data));
 assert.equal(result.data.saved,true);
 const latest=await GET('/settings/config-v30');
 for(const [k,v] of Object.entries(payload))assert.deepEqual(latest.data.sections[section][k],v);
}
(async()=>{
 try{
  const initial=await GET('/settings/config-v30');
  assert.equal(initial.status,200,JSON.stringify(initial.data));
  for(const key of Object.keys(schema.defaults)){
   assert.deepEqual(initial.data.sections[key],schema.defaults[key],'Missing '+key+' screenshot defaults');
  }
  await success('pricing',{dynamic_pricing_enabled:false,sarathi_ai_assistant_enabled:false,manual_pair_fare_hold_hours:0});
  assert.equal((await PUT('/settings/config-v30/pricing',{manual_pair_fare_hold_hours:-1})).status,400);
  assert.equal((await PUT('/settings/config-v30/pricing',{unlisted_key:'x'})).status,400);
  await success('office',{default_hold:15,max_hold:60});
  const office=await GET('/settings/config-v30/office-hold');
  assert.equal(office.status,200);assert.equal(office.data.enabled,true);
  assert.equal(office.data.default_hold,15);
  assert.ok(office.data.options.includes('until_departure'));
  assert.equal((await PUT('/settings/config-v30/office',{default_hold:120,max_hold:60})).status,400);
  assert.equal((await PUT('/settings/config-v30/office',{default_hold:'not_a_duration'})).status,400);
  const schedule={travel_date:'2026-11-23',departure_time:'18:00'};
  const now=Date.parse('2026-11-23T08:00:00Z');
  assert.equal(OfficeHold.resolve(schedule,{default_hold:15,max_hold:60},undefined,now),
   '2026-11-23T08:15:00.000Z');
  assert.equal(OfficeHold.resolve(schedule,{default_hold:'until_departure',max_hold:'until_departure'},undefined,now),
   '2026-11-23T12:30:00.000Z');
  assert.throws(()=>OfficeHold.resolve(schedule,{default_hold:15,max_hold:60},120,now),/maximum/);
  assert.throws(()=>OfficeHold.resolve(schedule,{default_hold:15,max_hold:60},15,Date.parse('2026-11-23T14:00:00Z')),/after departure/);
  await success('vehicle',{enabled:true,fuel_drop_threshold_liters:10,fuel_window_minutes:20,
   fuel_max_odometer_km:1.0,fuel_max_engine_hours:0.1,overspeed_speed_limit_kmh:90,
   overspeed_consecutive_readings:2,idling_duration_minutes:45,idling_max_odometer_km:1,
   offline_threshold_minutes:60,alert_recipients:['919731714358','919113209427']});
  assert.equal((await PUT('/settings/config-v30/vehicle',{overspeed_consecutive_readings:0})).status,400);
  assert.equal((await PUT('/settings/config-v30/vehicle',{alert_recipients:['wrong']})).status,400);
  await success('expenses',{diesel_cost_per_litre:99.28});
  await success('expenses',{diesel_cost_per_litre:null});
  assert.equal((await PUT('/settings/config-v30/expenses',{diesel_cost_per_litre:-50})).status,400);
  await success('seats',{fill_seats_by:'gender',outer_ring_by:'booking_channel',
   ring_channels:['branch','mine','my_branch','agent'],colors:schema.defaults.seats.colors});
  const swatch=await GET('/settings/config-v30/seat-display');
  assert.equal(swatch.status,200);
  assert.deepEqual(swatch.data.seat_legends.ring_channels,['branch','mine','my_branch','agent']);
  assert.equal((await PUT('/settings/config-v30/seats',{colors:{male:'javascript:evil'}})).status,400);
  assert.equal((await PUT('/settings/config-v30/seats',{ring_channels:['fake']})).status,400);
  await success('monitoring',{enabled:true,monitor_window_hours:12,baseline_ttl_hours:72,
   alert_cooldown_minutes:60,move_distance_km:1,geofence_radius_meters:500,
   move_speed_kmh:20,engine_on_minutes:30,engine_idle_speed_kmh:5,
   fuel_drop_liters:1,fuel_drop_percent:5});
  assert.equal((await PUT('/settings/config-v30/monitoring',{fuel_drop_percent:101})).status,400);
  await success('whatsapp',{enabled:true,recipients:['9731990033']});
  assert.equal((await PUT('/settings/config-v30/whatsapp',{recipients:['9731990033','9731990033']})).status,400);
  await success('bot',{enabled:true,respond_to_user_types:['passenger'],max_responses_per_passenger:10,
   response_delay_seconds:1,escalation_keywords:['complaint','refund','cancel booking','speak to manager','urgent'],
   free_metro_ticket_enabled:true,metro_exchange_point:'JNTU Metro Station',
   metro_ticket_instructions:'Show your operator-issued PNR at the metro desk'});
  assert.equal((await PUT('/settings/config-v30/bot',{respond_to_user_types:['all','passenger']})).status,400);
  assert.equal((await PUT('/settings/config-v30/bot',{escalation_keywords:['urgent','urgent']})).status,400);
  for(const key of Object.keys(schema.defaults)){
   const response=await PUT('/settings/config-v30/'+key,{},agent);
   assert.equal(response.status,403,'Agent must not modify '+key);
  }
  const operator=db.meta('operator');
  assert.notEqual(operator.operator_name,'November Travels','Reference identity must never overwrite tenant');
  assert.equal((await GET('/settings/config-v30')).data.delivery_connected,false);
  assert.ok(db.col('edit_history').count(x=>x.entity==='settings'&&x.entity_id==='configuration_v30')>=8);
  console.log('PASS configuration v31 API: 8 persisted sections, 50+ validated controls, RBAC, strict cross-field limits, seat display, office hold cap, no provider activation');
 }finally{
  await new Promise(resolve=>server.close(resolve));db.persistNow();
  fs.rmSync(process.env.GDS_DATA_DIR,{recursive:true,force:true});
 }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
