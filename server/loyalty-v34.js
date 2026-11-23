'use strict';
const db=require('./db');
const U=require('./util');
const TIER_NAMES=['Bronze','Gold','Platinum','Silver'];
const DAYS=['SUN','MON','TUE','WED','THU','FRI','SAT'];
const defaultRates=[0,75,75,75,30,0,30];
const defaultTiers={Bronze:1,Gold:1.2,Platinum:1.5,Silver:1.1};
function error(message,status=400){const e=new Error(message);e.status=status;return e;}
function num(value,key,min,max,precision=2){
 if(typeof value==='boolean'||value===null||value===''||!Number.isFinite(Number(value)))throw error(key+' must be a number');
 const n=Number(value);if(n<min||n>max||Number(n.toFixed(precision))!==n)throw error(key+' must be '+min+'–'+max);
 return n;
}
function isoDate(v){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v||'')))throw error('Enter a valid YYYY-MM-DD date');
 const stamp=new Date(v+'T00:00:00Z');
 if(!Number.isFinite(stamp.getTime())||stamp.toISOString().slice(0,10)!==v)throw error('Invalid calendar date');
 return v;
}
function general(){
 const m=db.meta('miles')||{};
 return {is_active:typeof m.is_active==='boolean'?m.is_active:true,
 miles_to_rupee_ratio:m.miles_to_rupee_ratio??0.1,max_discount_percent:m.max_discount_percent??30,
 min_redeemable_miles:m.min_redeemable_miles??1000,min_booking_amount:m.min_booking_amount??50};
}
function dayRates(){
 const raw=db.meta('day_rates')||[];
 return Array.from({length:7},(_,i)=>({day_of_week:i,redemption_rate:
  Number(raw.find(x=>Number(x.day_of_week)===i)?.redemption_rate??defaultRates[i])}));
}
function tiers(){
 const rows=db.meta('tier_multipliers')||[];
 return TIER_NAMES.map(tier=>({tier_name:tier,multiplier:
 Number(rows.find(x=>x.tier_name===tier)?.multiplier??defaultTiers[tier])}));
}
function blocked(){
 return (db.meta('blackout_dates')||[]).map(v=>typeof v==='string'?
 {date:v,rate:0,reason:''}:{date:String(v.date||''),rate:Number(v.rate??0),reason:String(v.reason||'')});
}
function upgrades(){
 const curr=db.meta('loyalty_upgrade_v34')||{};
 return {enabled:curr.enabled??true,minutes_before_boarding:20,
 description:'Unsold seats in the last 20 minutes before boarding are offered to eligible loyal passengers as a free upgrade.',
 preference_order:['shared → single','upper → lower berth','back → front row'],
 execution_status:'automated_offers_with_consent_required',
 notice:'Eligible unsold-seat offers are generated within 20 minutes of boarding; seat changes require operator-recorded passenger consent and live inventory validation. Provider delivery is not implied.'};
}
function read(){
 return {general:general(),daily_limits:dayRates(),tier_bonus:tiers(),
 blocked_dates:blocked(),seat_upgrades:upgrades()};
}
function validate(section,value){
 if(section==='general'){
  if(!value||typeof value!=='object'||Array.isArray(value))throw error('Invalid general settings');
  if(typeof value.is_active!=='boolean')throw error('Enable loyalty must be true or false');
  return {is_active:value.is_active,
   miles_to_rupee_ratio:num(value.miles_to_rupee_ratio,'Value per mile',0,100,4),
   max_discount_percent:num(value.max_discount_percent,'Maximum discount',0,100),
   min_redeemable_miles:num(value.min_redeemable_miles,'Minimum miles to use',0,100000000,0),
   min_booking_amount:num(value.min_booking_amount,'Minimum booking amount',0,100000000)};
 }
 if(section==='daily_limits'){
  if(!Array.isArray(value)||value.length!==7)throw error('Provide exactly seven daily limits');
  const seen=new Set();
  const arr=value.map(v=>{
   const day=num(v.day_of_week,'Day of week',0,6,0),pct=num(v.redemption_rate,'Daily redemption limit',0,100);
   if(seen.has(day))throw error('Duplicate day of week');seen.add(day);
   return {day_of_week:day,redemption_rate:pct};
  });
  return arr.sort((a,b)=>a.day_of_week-b.day_of_week);
 }
 if(section==='tier_bonus'){
  if(!Array.isArray(value)||value.length!==4)throw error('Provide four loyalty tiers');
  const m={};
  for(const v of value){
   if(!TIER_NAMES.includes(v.tier_name)||Object.hasOwn(m,v.tier_name))throw error('Unknown or duplicated loyalty tier');
   m[v.tier_name]=num(v.multiplier,'Tier bonus',0,10,3);
  }
  return TIER_NAMES.map(t=>({tier_name:t,multiplier:m[t]}));
 }
 if(section==='blocked_dates'){
  if(!Array.isArray(value)||value.length>365)throw error('Too many blocked dates');
  const seen=new Set();
  return value.map(v=>{
   if(!v||typeof v!=='object')throw error('Invalid blocked date');
   const date=isoDate(v.date);if(seen.has(date))throw error('That date is already listed');seen.add(date);
   const rate=num(v.rate,'Blocked date rate',0,100);
   const reason=String(v.reason||'').trim().slice(0,160);
   if(String(v.reason||'').length>160)throw error('Reason must be at most 160 characters');
   return {date,rate,reason};
  }).sort((a,b)=>a.date.localeCompare(b.date));
 }
 if(section==='seat_upgrades'){
  if(typeof value?.enabled!=='boolean')throw error('Seat upgrade enable value must be boolean');
  return {enabled:value.enabled};
 }
 throw error('Unknown loyalty section',404);
}
function store(section,value){
 const v=validate(section,value);
 const meta={general:'miles',daily_limits:'day_rates',tier_bonus:'tier_multipliers',
  blocked_dates:'blackout_dates',seat_upgrades:'loyalty_upgrade_v34'}[section];
 db.meta(meta,v);return read();
}
function dayOfWeekNow(){
 const d=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',weekday:'short'}).format(new Date()).toUpperCase();
 return DAYS.findIndex(v=>v===d);
}
function eligible({milesUsed,contactPhone,travelDate,gross,couponDiscount=0,paymentMode='paid'}){
 const count=Number(milesUsed||0);
 if(count===0)return {miles:0,amount:0,tier:null};
 if(!Number.isSafeInteger(count)||count<0)throw error('Miles must be a non-negative whole number');
 const cfg=general();if(!cfg.is_active)throw error('Loyalty program is disabled',409);
 if(paymentMode!=='paid')throw error('Miles redemption requires a paid booking',409);
 if(gross<Number(cfg.min_booking_amount))throw error('Booking amount is below the minimum for miles use',409);
 if(count<Number(cfg.min_redeemable_miles))throw error('Minimum miles to use is '+cfg.min_redeemable_miles,409);
 if(!/^\d{10}$/.test(String(contactPhone||'')))throw error('Passenger mobile number required to redeem miles');
 const c=db.col('customers').find(x=>String(x.phone)===String(contactPhone));
 if(!c||Number(c.miles||0)<count)throw error('Insufficient available loyalty miles',409);
 const day=dayRates().find(x=>x.day_of_week===dayOfWeekNow());
 let pct=Number(day?.redemption_rate??0);
 if(travelDate){
  const routeDate=isoDate(travelDate);
  const special=blocked().find(x=>x.date===routeDate);
  if(special)pct=Math.min(pct,Number(special.rate));
 }
 if(count>Math.floor(Number(c.miles)*pct/100))
  throw error('Miles exceed the allowed '+pct+'% redemption limit for this day or travel date',409);
 const tier=tiers().find(x=>x.tier_name===c.tier)?.multiplier??1;
 const value=U.round2(count*Number(cfg.miles_to_rupee_ratio)*Number(tier));
 if(value>U.round2(Math.max(0,gross*Number(cfg.max_discount_percent)/100-couponDiscount))+0.000001)
  throw error('Miles exceed the maximum booking discount after coupons',409);
 return {miles:count,amount:value,tier:c.tier||'Bronze',multiplier:tier};
}
function settle(b){
 if(!b||b.loyalty_settled||b.payment!=='paid')return;
 const cfg=general();if(!cfg.is_active)return;
 const ccol=db.col('customers');
 let c=ccol.find(x=>x.phone===b.contact.phone);
 if(!c)c=ccol.insert({phone:b.contact.phone,name:b.contact.name,miles:0,tier:'Bronze'});
 const spent=Number(b.miles_used||0);
 // Revalidate availability when a pending payment gets settled.
 if(spent>0&&Number(c.miles)<spent)throw error('Insufficient loyalty miles when settling booking',409);
 c.miles=Number(c.miles||0)-spent;
 const awarded=Math.max(0,Math.round(Number(b.fare.net||0)));
 c.miles+=awarded;
 c.tier=c.miles>20000?'Platinum':c.miles>8000?'Gold':c.miles>3000?'Silver':'Bronze';
 b.loyalty_settled=true;b.loyalty_awarded=awarded;b.loyalty_redeemed=spent;b.loyalty_reversed_fraction=0;
 db.col('loyalty_transactions').insert({phone:c.phone,pnr:b.pnr,miles_redeemed:spent,miles_awarded:awarded,kind:'settlement',ts:U.nowIso()});
 db.persist();
}
function reverseForCancellation(b,ratio){
 if(!b?.loyalty_settled)return;
 const fraction=Math.min(1,Math.max(0,Number(ratio)||0));
 const target=Math.min(1,Number(b.loyalty_reversed_fraction||0)+fraction);
 const old=Math.max(0,Number(b.loyalty_reversed_fraction||0));
 if(target<=old)return;
 const c=db.col('customers').find(x=>x.phone===b.contact?.phone);
 if(!c)return;
 const earned=Math.round(Number(b.loyalty_awarded||0)*target)-Math.round(Number(b.loyalty_awarded||0)*old);
 const spent=Math.round(Number(b.loyalty_redeemed||0)*target)-Math.round(Number(b.loyalty_redeemed||0)*old);
 c.miles=Math.max(0,Number(c.miles||0)-earned)+spent;
 c.tier=c.miles>20000?'Platinum':c.miles>8000?'Gold':c.miles>3000?'Silver':'Bronze';
 b.loyalty_reversed_fraction=target;
 db.col('loyalty_transactions').insert({phone:c.phone,pnr:b.pnr,miles_redeemed:-spent,miles_awarded:-earned,kind:'cancel_reversal',ts:U.nowIso()});
 db.persist();
}
module.exports={TIER_NAMES,DAYS,read,store,validate,error,eligible,settle,reverseForCancellation,dayOfWeekNow};
