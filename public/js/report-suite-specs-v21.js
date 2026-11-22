(function(root,factory){
 const value=factory();
 if(typeof module==='object'&&module.exports)module.exports=value;
 if(root)root.ReportSuiteSpecsV21=value;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const col=(k,l,t='text',w=1)=>({key:k,label:l,type:t,width:w});
 const N=(k,l,w=1)=>col(k,l,'number',w),M=(k,l,w=1)=>col(k,l,'money',w),P=(k,l,w=1)=>col(k,l,'pct',w),
  T=(k,l,w=1)=>col(k,l,'text',w),R=(k,l,w=1)=>col(k,l,'ratio',w),L=(k,l,w=1)=>col(k,l,'minutes',w),
  D=(k,l,w=1)=>col(k,l,'delta',w),H=(k,l,w=1)=>col(k,l,'duration',w),V=(k,l,w=1)=>col(k,l,'speed',w);
 const section=(key,title,cols)=>({key,title,cols});
 const DEF={
 'staff-duty':{title:'Staff Duty Statement',pdf_orientation:'landscape',needsStaff:true,bus:true,staff:true,
    note:'Trips this person was assigned to, with Daily Ops figures per trip. Halt = the trip was turned off (a halt day only when nothing was worked that day). Pickup/drop: actual/scheduled, late at 8+ minutes. km/L uses paired trip km and fuel; bus avg is the same bus over this period.',
    metrics:[['Trips','trips','number'],['Working days','working_days','number'],['Halt days','halt_days','number'],
      ['Km (GPS)','km','number'],['Fuel (L)','fuel_l','decimal'],['Mileage','mileage','mileage'],
      ['Late pickups','late_pickups','number'],['Trips turned off','trips_turned_off','number']],
    sections:[
      section('rows','TRIPS',[
        T('date','Date',1.05),T('dep','Dep',.55),T('service','Service',.72),T('route','Route',1.6),T('bus','Bus',1.1),
        T('status','Status',.8),T('pickup_scheduled','Pickup sch.',.85),T('pickup_actual','Pickup act.',.85),
        T('drop_scheduled','Drop sch.',.85),T('drop_actual','Drop act.',.85),N('late','Late 8+',.65),
        N('km','Km',.65),N('fuel_l','Fuel (L)',.75),R('kmpl','km/L',.6),R('bus_avg_kmpl','Bus avg',.7),D('vs_bus_avg_pct','vs avg',.7),
        T('other_crew','Other crew',1.3)]),
      section('daily','DAILY',[
        T('date','Date',1.5),N('trips','Trips'),N('worked','Worked'),N('halts','Halt'),
        T('status','Day status',1.5),N('km','Km (GPS)',1.2),N('fuel_l','Fuel (L)',1.2)])
    ]},
 'point-usage':{title:'Boarding & Dropping Points',pdf_orientation:'portrait',bus:true,
    note:'Own bookings (website, app, staff, agents — not OTA-imported), confirmed or completed, by travel date. Share = the point’s seats ÷ all seats. Days used = travel days with at least one booking at the point.',
    metrics:[['Bookings','bookings','number'],['Seats','seats','number'],['Amount','amount','money'],
      ['Boarding points','boarding_points','number'],['Dropping points','dropping_points','number']],
    sections:[
      section('boarding','BOARDING POINTS',[T('point','Boarding point',5.3),N('bookings','Bookings'),N('seats','Seats'),P('share_pct','Share'),N('days_used','Days used'),M('amount','Amount',1.4)]),
      section('dropping','DROPPING POINTS',[T('point','Dropping point',5.3),N('bookings','Bookings'),N('seats','Seats'),P('share_pct','Share'),N('days_used','Days used'),M('amount','Amount',1.4)]),
      section('pairs','BOARDING → DROPPING',[T('boarding','Boarding',4.2),T('dropping','Dropping',4.2),N('bookings','Bookings'),N('seats','Seats'),M('amount','Amount',1.4)])
    ]},
 'cancellations':{title:'Cancellations',pdf_orientation:'landscape',bus:true,
    note:'Bookings cancelled after being confirmed, by travel date. By = passenger or operator. Resold = the booking’s seats on the same trip sold again after cancellation — to anyone, including the same passenger. Recovered = fares from those resales.',
    metrics:[['Cancellations','cancellations','number'],['Seats','seats','number'],['Amount','amount','money'],['Charges kept','charges_kept','money'],
      ['By operator','by_operator','number'],['Bookings resold','bookings_resold','resale'],['Seats resold','seats_resold','number'],['Recovered','recovered','money']],
    sections:[section('rows','CANCELLATIONS',[
      T('date','Date',1),T('service','Service',.7),T('pnr','PNR',1.75),T('passenger','Passenger',1.45),
      T('phone','Phone',1.1),T('boarding','Boarding',2.25),T('source','Source',1.1),T('by','By',.9),
      N('seats','Seats',.55),M('amount','Amount',.95),M('charge','Charge',.9),T('resold_label','Resold',.7),M('recovered','Recovered',1.0)])]},
 'driver-behavior':{title:'Driver Behaviour',pdf_orientation:'landscape',bus:true,staff:true,
    note:'Intangles alerts over each trip’s journey (first to last GPS stop stamp — the same window as diesel). Every driver on a trip is charged all its alerts; a two-driver trip is Shared. Score 0–100 = 100 − 5 × penalty points per 100 km: 1 per hard brake, harsh acceleration or freerun, 0.5 per 10 min over-speed, 0.2 per 10 min idling. Over-speed = above the Intangles speed limit. Trips still running or missing Intangles readings show —.',
    metrics:[['Trips recorded','trips_recorded','recorded'],['Drivers','drivers','number'],['Avg driver score','avg_driver_score','number'],
      ['Below 65','below_65','number'],['Trips without driver','trips_without_driver','number']],
    sections:[
      section('drivers','DRIVERS (WORST SCORE FIRST)',[
        T('driver','Driver',1.5),T('phone','Phone',1),N('trips','Trips',.5),N('shared','Shared',.6),
        N('km','Km',.85),N('score','Score',.55),N('hard_brake','Hard brake',.9),N('harsh_accel','Harsh accel',.9),
        H('over_speed','Over-speed',.9),V('top_speed','Top speed',.9),H('idling','Idling',.8),N('freerun','Freerun',.7),T('buses','Buses',1.4)]),
      section('rows','TRIP-WISE',[
        T('date','Date',.9),T('dep','Dep',.55),T('service','Service',.75),T('route','Route',1.3),T('bus','Bus',1),
        T('drivers','Drivers',2.4),N('km','Km',.6),N('score','Score',.6),
        N('hard_brake','Hard brake',.9),N('harsh_accel','Harsh accel',.9),H('over_speed','Over-speed',.9),
        V('top_speed','Top speed',.9),H('idling','Idling',.8),N('freerun','Freerun',.7)])
    ]},
 'expenses':{title:'Expenses',pdf_orientation:'landscape',bus:true,
    note:'Expense lines = route defaults with each trip’s own entries on top, as in Trip P&L. A running trip carries fixed + running lines + channel commission; a turned-off trip only fixed lines, so the total matches Trip P&L. Diesel uses completed-trip telematics where recorded, otherwise the route figure (explicit operator overrides take precedence). By bus and trip-wise show the largest categories as columns; the rest add up under Other.',
    metrics:[['Total expense','total_expense','money'],['Fixed','fixed','money'],['Running','running','money'],
      ['Channel commission','channel_commission','money'],['Per trip','per_trip','money'],['Trips','trips','number'],
      ['Trips turned off','trips_turned_off','number'],['Buses','buses','number']],
    sections:[
      section('categories','BY CATEGORY',[T('label','Category',3.5),T('type','Type',1.5),M('amount','Amount',1.5),P('share_pct','Share'),N('trips','Trips'),M('avg_per_trip','Avg / trip',1.5)]),
      section('by_bus','BY BUS',[]),section('rows','TRIP-WISE',[])
    ]},
 'metro-bookings':{title:'Metro Bookings',pdf_orientation:'landscape',bus:true,modes:true,
    note:'PNRs (all sources, OTAs included) confirmed or completed, by travel date, whose boarding or dropping point is a Metro feeder stage — the same stages metro billing reads. Revenue = booking amount. Pickup / Drop keeps PNRs with that metro leg; a PNR with both counts under either. Metro fare, Metro pax and Billed are the same figures as the Metro Feeder Statement: a metro leg is charged once the tracking link carrying its ticket was sent, at the ticket price where issued. A PNR with no link sent shows Not billed. PNRs cancelled after the link, or with a ticket on a stage not marked Metro, are listed too because they are charged.',
    metrics:[['Metro PNRs','metro_pnrs','number'],['Seats','seats','number'],['Revenue','revenue','money'],
      ['Billed metro legs','billed_metro_legs','number'],['Metro pax','metro_pax','number'],['Metro fare','metro_fare','money'],
      ['With metro pickup','with_pickup','number'],['With metro drop','with_drop','number'],['Both legs','both_legs','number']],
    sections:[
      section('pickup_points','METRO PICKUP POINTS',[T('point','Boarding point',5),N('pnrs','PNRs'),N('seats','Seats'),M('revenue','Revenue',1.6)]),
      section('drop_points','METRO DROP POINTS',[T('point','Dropping point',5),N('pnrs','PNRs'),N('seats','Seats'),M('revenue','Revenue',1.6)]),
      section('daily','DAILY',[T('date','Date',2),N('pnrs','PNRs'),N('seats','Seats'),M('revenue','Revenue',1.6)]),
      section('rows','PNRS',[
        T('date','Date',.9),T('service','Service',.65),T('bus','Bus',.95),T('pnr','PNR',1.6),
        T('source','Source',.85),T('leg','Metro',.8),T('boarding','Boarding',2),T('dropping','Dropping',1.8),
        N('seats','Seats',.55),N('metro_pax','Metro pax',.75),M('metro_fare','Metro fare',.9),M('amount','Revenue',1)])
    ]},
 'no-shows':{title:'No-shows',pdf_orientation:'landscape',bus:true,
    note:'No-show = a seat marked NO-SHOW on the trip’s seat map, by travel date. Resold = that same seat sold again after the no-show was marked. Recovered = the fare of that resale. If a mark timestamp is missing, resale cannot be established.',
    metrics:[['No-shows','no_shows','number'],['Fare','fare','money'],['Seats resold','seats_resold','no_show_resale'],['Recovered','recovered','money']],
    sections:[section('rows','NO-SHOWS',[
      T('date','Date',1),T('service','Service',.75),T('bus','Bus',1.15),T('pnr','PNR',1.9),
      T('passenger','Passenger',1.5),T('phone','Phone',1.15),T('boarding','Boarding',1.7),
      T('source','Source',.8),T('seat','Seat',.55),M('fare','Fare',.85),T('resold_label','Resold',.75),M('recovered','Recovered',.95)])]},
 'van-bookings':{title:'Pickup Van Bookings',pdf_orientation:'landscape',bus:true,modes:true,
    note:'PNRs (all sources, OTAs included) confirmed or completed, by travel date, whose boarding or dropping point is a Pickup Van feeder stage. Revenue = booking amount. Pickup / Drop keeps PNRs with that van leg; a PNR with both counts under either. Meets bus at = the exchange point where the van hands over to the main bus. Van = feeder vans assigned to the trip; a trip with two vans lists both since the booking does not say which van carried the passenger. Not assigned = no van on the trip.',
    metrics:[['Van PNRs','van_pnrs','number'],['Seats','seats','number'],['Revenue','revenue','money'],
      ['With van pickup','with_pickup','number'],['Both legs','both_legs','number'],['Vans used','vans_used','number'],['PNRs without van','pnrs_without_van','number']],
    sections:[section('rows','PNRS',[
      T('date','Date',.9),T('service','Service',.75),T('bus','Bus',1.05),T('van','Van',1),
      T('pnr','PNR',1.85),T('source','Source',.85),T('leg','Van leg',.85),
      T('boarding','Boarding',2.1),T('dropping','Dropping',2.1),N('seats','Seats',.65),M('amount','Revenue',1.0)])]}
 };
 function sections(key,data){
   const def=DEF[key];if(!def)return [];
   let sections=def.sections.map(s=>({...s,cols:s.cols.slice()}));
   if(key==='expenses'){
     const extra=(data?.top_categories||[]).map(item=>M(item.key,item.label,1.2));
     sections=sections.map(s=>s.key==='by_bus'?{...s,cols:[T('bus','Bus',1.3),T('trips_label','Trips',1.0),...extra,M('other','Other',1.2),M('total','Total',1.4)]}:
      s.key==='rows'?{...s,cols:[T('date','Date',1),T('dep','Dep',.65),T('service','Service',.75),
        T('route','Route',1.6),T('bus','Bus',1.4),...extra,M('other','Other',1.2),M('total','Total',1.4)]}:s);
   }
   if(key==='metro-bookings'){
     const mode=data?.mode||'both';
     if(mode==='pickup')sections=sections.filter(s=>s.key!=='drop_points');
     if(mode==='drop')sections=sections.filter(s=>s.key!=='pickup_points');
   }
   return sections;
 }
 return {DEF,sections};
});
