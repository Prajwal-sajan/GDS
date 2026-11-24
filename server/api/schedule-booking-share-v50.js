/* Schedule booking-link share v50 — route/date-only public booking search link.
 * No GDS internal URL, no generic guessed domain and no invented service deep-link. */
'use strict';
const express=require('express');
const db=require('../db');
const D=require('../domain');
const {can}=require('../auth');
const r=express.Router();
const httpError=(code,message)=>D.httpErr(code,message);
function validateBase(value){
 const raw=String(value||'').trim();
 if(!raw)throw httpError(409,'Passenger booking website is not configured. Set the Booking Search URL in Settings → Configuration → Website.');
 if(raw.length>300||/[\s<>\\]/.test(raw))
  throw httpError(400,'Invalid passenger booking search URL');
 let url;
 try{url=new URL(raw)}catch(_){throw httpError(400,'Invalid passenger booking search URL')}
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||
   url.search||url.hash||!url.hostname||url.hostname.toLowerCase()==='localhost'||
   url.hostname.endsWith('.localhost')||
   /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname)||
   url.hostname.startsWith('[')||
   !url.hostname.includes('.'))
  throw httpError(400,'Passenger booking search URL must be a public HTTPS page without credentials, query or fragment');
 return url;
}
function dateLabel(day){
 const value=String(day||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw httpError(409,'Trip date is invalid');
 const d=new Date(value+'T12:00:00Z');
 if(Number.isNaN(+d)||d.toISOString().slice(0,10)!==value)
  throw httpError(409,'Trip date is invalid');
 const w=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 return w[d.getUTCDay()]+', '+String(d.getUTCDate()).padStart(2,'0')+' '+m[d.getUTCMonth()]+', '+d.getUTCFullYear();
}
function boardingDate(travelDate,cityDay){
 dateLabel(travelDate); // Strict validation, independent of local machine timezone.
 const day=Number(cityDay??1);
 if(!Number.isInteger(day)||day<1||day>15)throw httpError(409,'Invalid boarding day on route');
 const date=new Date(String(travelDate)+'T12:00:00Z');
 date.setUTCDate(date.getUTCDate()+day-1);
 return date.toISOString().slice(0,10);
}
function createShare({schedule,route,fromCityId,toCityId,bookingBase}){
 if(!schedule||!route)throw httpError(404,'Schedule or route not found');
 if(schedule.status!=='active'||route.status!=='active'||schedule.trip_status==='cancelled')
  throw httpError(409,'This service is not active for booking');
 const cities=D.routeCities(route);
 if(cities.length<2)throw httpError(409,'No valid city pair configured on this route');
 const from=String(fromCityId??cities[0].city_id),to=String(toCityId??cities[cities.length-1].city_id);
 const i=cities.findIndex(x=>String(x.city_id)===from),j=cities.findIndex(x=>String(x.city_id)===to);
 if(i<0||j<0||j<=i)throw httpError(400,'Select a valid From/To city pair along this route');
 const journeyDate=boardingDate(schedule.travel_date,cities[i].day);
 const url=validateBase(bookingBase);
 url.searchParams.set('fromCity',String(cities[i].city_id));
 url.searchParams.set('toCity',String(cities[j].city_id));
 url.searchParams.set('journeyDate',journeyDate);
 const nameFrom=D.cityName(cities[i].city_id),nameTo=D.cityName(cities[j].city_id);
 if(!nameFrom||!nameTo)throw httpError(409,'Missing city name for booking link');
 const booking_url=url.toString();
 return {
  message:nameFrom+' → '+nameTo+' on '+dateLabel(journeyDate)+
   ' — pick your seat and book: '+booking_url,
  booking_url,origin:nameFrom,destination:nameTo,journey_date:journeyDate,service_travel_date:String(schedule.travel_date),
  from_city_id:String(cities[i].city_id),to_city_id:String(cities[j].city_id),
  service_number:String(route.service_number||''),link_type:'route_date_search',preselects_service:false,
  note:'Opens the operator booking website for the selected route and date. Select the desired service; availability is determined on the booking website.'
 };
}
r.get('/schedules/:id/booking-share',can('schedules.view'),(req,res)=>{
 try{
  res.set('Cache-Control','private, no-store, max-age=0');
  const schedule=db.col('schedules').get(req.params.id);
  if(!schedule)throw httpError(404,'Schedule not found');
  const route=db.col('routes').get(schedule.route_id);
  if(!route)throw httpError(404,'Route not found');
  const website=db.meta('config_v30')?.website||{};
  const config=website.booking_search_url||db.meta('operator')?.booking_search_url||'';
  res.json(createShare({
   schedule,route,fromCityId:req.query.from_city_id,toCityId:req.query.to_city_id,bookingBase:config
  }));
 }catch(err){res.status(err.status||500).json({success:false,message:err.status?err.message:'Unable to create booking link'})}
});
module.exports=r;
module.exports.createShare=createShare;
module.exports.validateBase=validateBase;
module.exports.dateLabel=dateLabel;
module.exports.boardingDate=boardingDate;
