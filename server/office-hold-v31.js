'use strict';
// Office-booking seat hold: enforce configurable default/max and a hard
// departure-time cap. Do not change OTA / external booking behavior.
const {HOLD}=require('./configuration-v31-schema');
function fail(message){const e=new Error(message);e.status=400;throw e;}
function nextDeparture(s){
 if(!s||typeof s.travel_date!=='string'||typeof s.departure_time!=='string')fail('Schedule has no departure time');
 const hhmm=s.departure_time.trim().slice(0,5);
 if(!/^\d\d:\d\d$/.test(hhmm))fail('Invalid service departure time');
 // GDS schedules are India-local; parse explicitly rather than using host/server timezone.
 const ms=Date.parse(s.travel_date+'T'+hhmm+':00+05:30');
 if(!Number.isFinite(ms))fail('Invalid service departure date');
 return ms;
}
function minutes(value){
 const raw=typeof value==='string'&&/^[0-9]+$/.test(value)?Number(value):value;
 if(!HOLD.includes(raw))fail('Invalid hold duration');
 return raw;
}
function resolve(schedule,setting,requested,now=Date.now()){
 if(!setting)return null; // No v31 policy was saved: use the existing legacy hold behavior.
 const departure=nextDeparture(schedule),remainingMs=departure-now;
 if(remainingMs<=0)fail('Cannot hold seats after departure');
 const max=minutes(setting.max_hold),defaultHold=minutes(setting.default_hold);
 const value=requested===undefined||requested===null||requested===''?defaultHold:minutes(requested);
 if(max!=='until_departure'&&value==='until_departure')fail('Hold exceeds configured maximum');
 if(max!=='until_departure'&&value>max)fail('Hold exceeds configured maximum');
 if(value!== 'until_departure'&&value<=0)fail('Hold must be at least one minute');
 const requestedMs=value==='until_departure'?remainingMs:value*60*1000;
 const permittedMs=max==='until_departure'?remainingMs:max*60*1000;
 return new Date(Math.min(now+requestedMs,now+permittedMs,departure)).toISOString();
}
module.exports={resolve,nextDeparture,minutes};
