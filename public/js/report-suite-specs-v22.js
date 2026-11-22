(function(root,factory){
  const s=typeof module==='object'&&module.exports?require('./report-suite-specs-v21.js'):root.ReportSuiteSpecsV21;
  const defs=factory(s);
  if(typeof module==='object'&&module.exports)module.exports=defs;
  if(root)root.ReportSuiteSpecsV22=defs;
})(typeof window!=='undefined'?window:null,function(S){
'use strict';
const col=(key,label,type='text',width=1)=>({key,label,type,width});
const T=(k,l,w=1)=>col(k,l,'text',w),N=(k,l,w=1)=>col(k,l,'number',w),M=(k,l,w=1)=>col(k,l,'money',w),P=(k,l,w=1)=>col(k,l,'pct',w);
const section=(key,title,cols)=>({key,title,cols});
Object.assign(S.DEF,{
 'frequent-travellers':{
 title:'Frequent Travellers',pdf_orientation:'landscape',pdf_extra:'Trips',
 metrics:[['Passengers','passengers_label','text'],['Trips','trips','number'],['Spend','spend','money'],
   ['Avg / trip','avg_trip','money'],['Upcoming','upcoming','number'],['Cancelled','cancelled','number']],
 note:'Trips = confirmed or completed bookings in the period, all channels incl. imported bookings, by phone number.',
 sections:[
  section('rows','FREQUENT TRAVELLERS',[
    N('rank','#',.45),T('passenger','Passenger',1.4),T('phone','Phone',1.1),N('trips','Trips',.55),
    N('travelled','Travelled',.78),N('upcoming','Upcoming',.75),N('seats','Seats',.58),
    M('spend','Spend',1),M('avg_trip','Avg / trip',.9),N('cancelled','Cancelled',.85),
    T('first_trip','First trip',1.05),T('last_trip','Last trip',1.05),
    T('channels','Channels',2.1),T('email','Email',1.6)]),
  section('bands','ALL PASSENGERS IN THE PERIOD BY TRIP COUNT',[
    T('band','Trips',2),N('passengers','Passengers',1.4),P('share_pct','Share',1.1),
    N('trips_taken','Trips taken',1.4),P('share_of_trips','Share of trips',1.4),M('spend','Spend',1.5)])
 ]},
 'point-performance':{
 title:'Point Performance',pdf_orientation:'landscape',needsPoint:true,
 metrics:[['PNRs','pnrs','number'],['Seats','seats','number'],['Share','share_pct','pct'],
   ['Trips booked','trips_booked','number'],['Seats/trip','seats_per_trip','text'],['Revenue','revenue','money'],
   ['Rank','rank_label','text'],['Trips serving','trips_serving','number'],['Cancelled','cancelled','number'],
   ['No-shows','no_shows','number'],['On time','on_time','pct']],
 note:'PNRs from every source (OTAs included), by travel date, at this point on any route — names match ignoring case and spaces. Confirmed / completed count as sold; Cancelled = cancelled after being confirmed (rate = of all confirmed PNRs). No-shows = seats marked NO-SHOW (rate = of seats sold). Share = the point’s seats ÷ all seats sold; Rank = by seats among all points of that kind. Trips = running trips that stop here, booked or not. On time = GPS arrival within 8 min of the stop’s time; trips without a GPS stamp are left out.',
 sections:[
  section('ranking','ALL POINTS',[
    N('rank','#',.5),T('point','Point',4),N('pnrs','PNRs',.75),N('seats','Seats',.75),
    P('share_pct','Share',.85),N('trips_booked','Trips booked',1.1),T('seats_per_trip','Seats/trip',.95),M('revenue','Revenue',1.25)]),
  section('by_service','BY SCHEDULE',[
    T('service','Service',2),N('pnrs','PNRs'),N('seats','Seats'),N('trips_booked','Trips booked'),
    T('seats_per_trip','Seats/trip'),M('revenue','Revenue',1.5)]),
  section('by_source','BY BOOKING SOURCE',[
    T('source','Source',3),N('pnrs','PNRs'),N('seats','Seats'),M('revenue','Revenue',1.5)]),
  section('daily','DAILY',[
    T('date','Date',2),N('pnrs','PNRs'),N('seats','Seats'),M('revenue','Revenue',1.5),
    N('cancelled','Cancelled'),N('no_shows','No-shows')])
 ]},
 'station-performance':{
 title:'Station Performance',pdf_orientation:'landscape',
 metrics:[['Seats','seats','number'],['PNRs','pnrs','number'],['Revenue','revenue','money'],
   ['Avg fare / seat','avg_fare','money'],['Station pairs sold','station_pairs','number'],['Stations','stations','number'],
   ['Trips','trips','number'],['Seats / trip','seats_per_trip','text'],
   ['End-to-end seats','end_to_end_label','text'],['Cancelled','cancelled_label','text'],
   ['No-shows','no_show_label','text']],
 note:'All sources, by travel date. Station = stop city. Trips serving = trips stopping at both. End-to-end = schedule start to end city.',
 sections:[
  section('pairs','STATION PAIRS',[
    T('from','From',1.45),T('to','To',1.45),N('pnrs','PNRs',.7),N('seats','Seats',.7),P('share_pct','Share',.75),
    M('avg_fare','Avg fare',.95),M('revenue','Revenue',1.2),N('trips_serving','Trips serving',1.15),
    N('trips_booked','Trips booked',1.15),T('seats_per_trip','Seats/trip',1),N('cancelled','Cancelled',.95),
    N('no_shows','No-shows',.85),N('schedules','Schedules',.8)]),
  section('boarding','BOARDING STATIONS',[
    T('station','Boarding station',3),N('pnrs','PNRs'),N('seats','Seats'),P('share_pct','Share'),
    M('avg_fare','Avg fare'),M('revenue','Revenue',1.4),T('top_station','Top destination',1.8)]),
  section('dropping','DROPPING STATIONS',[
    T('station','Dropping station',3),N('pnrs','PNRs'),N('seats','Seats'),P('share_pct','Share'),
    M('avg_fare','Avg fare'),M('revenue','Revenue',1.4),T('top_station','Top origin',1.8)]),
  section('by_schedule','BY SCHEDULE',[
    T('service','Service',.9),T('route','Route',2),T('dep','Dep',.65),N('trips','Trips',.65),
    N('pnrs','PNRs',.7),N('seats','Seats',.7),T('seats_per_trip','Seats/trip',.95),
    M('avg_fare','Avg fare',1),M('revenue','Revenue',1.3),N('pairs','Pairs',.55),
    T('top_pair','Top pair',1.8),P('end_to_end_pct','End-to-end',1)]),
  section('by_schedule_pairs','STATION PAIRS BY SCHEDULE',[
    T('service','Service',1),T('from','From',1.4),T('to','To',1.4),N('pnrs','PNRs',.7),
    N('seats','Seats',.7),M('avg_fare','Avg fare',1),M('revenue','Revenue',1.4),
    N('trips_serving','Trips serving',1.15),N('trips_booked','Trips booked',1.1),
    T('seats_per_trip','Seats/trip',.9),N('cancelled','Cancelled',.9),N('no_shows','No-shows',.9)]),
  section('sources','BY BOOKING SOURCE',[
    T('source','Source',3),N('pnrs','PNRs'),N('seats','Seats'),P('share_pct','Share'),
    M('avg_fare','Avg fare'),M('revenue','Revenue',1.6)]),
  section('daily','DAILY',[
    T('date','Date',2),T('day','Day',.8),N('trips','Trips'),N('pnrs','PNRs'),
    N('seats','Seats'),N('end_to_end','End-to-end',1.2),M('revenue','Revenue',1.6),N('cancelled','Cancelled')])
 ]},
 'trip-pnl':{
 title:'Trip P&L / Occupancy',pdf_orientation:'landscape',
 metrics:[['Trips','trips','number'],['Occupancy','occupancy_pct','pct'],
   ['Net sales','net_sales','money'],['Expense','expense','money'],['Profit','profit','money'],
   ['Loss trips','loss_trips','number']],
 note:'Net sales = own-channel ticket sales less offers, net of GST (as in Sales). A turned-off trip carries only its fixed cost.',
 sections:[
  section('rows','TRIP-WISE P&L',[
    T('date','Date',1.2),T('dep','Dep',.8),T('service','Service',1),T('route','Route',2.2),
    T('bus','Bus',1.7),T('seats_label','Seats',.85),P('occupancy_pct','Occ',.8),
    M('net_sales','Net sales',1.3),M('expense','Expense',1.3),M('profit','Profit',1.3)])
 ]}
});
return {DEF:S.DEF,sections:S.sections};
});
