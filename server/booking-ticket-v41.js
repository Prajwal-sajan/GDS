'use strict';
/* v41 operator-branded passenger ticket: reference-matched HTML data + vector PDF.
   Authenticated staff only; no public ticket URL or third-party source fetch. */
const db=require('./db');
const D=require('./domain');
const Policy=require('./access-runtime-v27');
const {Pdf,portrait}=require('./report-suite-pdf-v21');
const U=require('./util');

const DEFAULT_TERMS=[
 'Assigned vehicle, driver, and tracking details will be shared before boarding when available.',
 'Passengers should reach the boarding point 10-15 minutes before scheduled departure. Late arrivals may result in forfeiture of the ticket.',
 'Carry a valid government-issued photo ID (Aadhaar Card, Driving Licence, Passport, etc.) while travelling.',
 'Luggage allowance: 1 handbag and 1 check-in bag (up to 20 kg) per passenger, unless the operator specifies otherwise. Additional luggage may incur charges.',
 'No-show policy: refunds and modifications depend on the operator cancellation conditions.',
 'The operator may refuse boarding to intoxicated passengers or those causing a disturbance, subject to applicable law.',
 'Keep belongings secure. Contact the operator regarding loss, damage or theft during the journey.',
 'For operator cancellation or breakdown, request the applicable refund or alternative arrangement.',
 'Smoking, alcohol consumption and prohibited items are not permitted on the bus.',
 'Follow the safety instructions given by the driver and conductor.',
 'Any dispute or liability is governed by the applicable operator terms and law.'
];
const safe=x=>String(x??'').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,700).trim();
const n=x=>Number.isFinite(Number(x))?Number(x):0;
const cash=x=>'Rs. '+n(x).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const gt=x=>new Date(x).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
function stageDate(date,st){
 if(!st||!st.time||!date)return '';
 const m=/^(\d{1,2}):(\d{2})$/.exec(String(st.time));
 if(!m)return '';
 const dt=new Date(String(date).slice(0,10)+'T00:00:00Z');
 if(Number.isNaN(+dt))return '';
 dt.setUTCDate(dt.getUTCDate()+(Number(st.day||1)-1));
 dt.setUTCHours(Number(m[1]),Number(m[2]));
 return dt.toISOString();
}
function fmtStage(iso){
 if(!iso)return '';
 return new Date(iso).toLocaleString('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
}
function maps(st){
 if(Number.isFinite(Number(st?.lat))&&Number.isFinite(Number(st?.lng))&&st.lat!==''&&st.lng!=='')
  return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(Number(st.lat)+','+Number(st.lng));
 return '';
}
function model(req,pnr){
 const b=Policy.requireBooking(req,db.col('bookings').find(x=>
  String(x.pnr)===String(pnr)||String(x.ticket_number)===String(pnr)));
 const s=db.col('schedules').get(b.schedule_id),r=db.col('routes').get(b.route_id);
 if(!s||!r)throw D.httpErr(404,'Booked schedule or route unavailable');
 const list=(r.stages||[]).map(st=>({...st,...(s.stage_overrides?.[st.id]||{})}));
 const board=list.find(st=>String(st.id)===String(b.boarding_stage_id));
 const drop=list.find(st=>String(st.id)===String(b.dropping_stage_id));
 if(!board||!drop)throw D.httpErr(409,'Ticket boarding/drop points have not been configured');
 const op=db.meta('operator')||{};
 const allowPhone=Policy.viewPhone(req);
 const from=stageDate(b.travel_date,board),to=stageDate(b.travel_date,drop);
 const reportingOffset=Number.isFinite(Number(op.reporting_minutes))?Number(op.reporting_minutes):12;
 const reporting=from?new Date(new Date(from).getTime()-Math.max(0,reportingOffset)*60000).toISOString():'';
 const duration=from&&to?Math.max(0,Math.round((new Date(to)-new Date(from))/60000)):0;
 const f=b.fare||{},ps=(b.passengers||[]).filter(p=>p.status!=='cancelled');
 const coach=D.coachForSchedule(s);
 const terms=Array.isArray(op.ticket_terms)&&op.ticket_terms.length?
  op.ticket_terms.map(safe).filter(Boolean).slice(0,25):DEFAULT_TERMS;
 const cancellation=safe(op.ticket_cancellation_policy||
  'Cancellation charges vary by route and service. The exact charge for this ticket is shown before a cancellation is confirmed.');
 return {
  operator:{
   name:safe(op.operator_name||op.app_name||'Bus Operator'),
   legal_name:safe(op.gst_registration_name||op.operator_name||''),
   phone:safe(op.helpline_number||op.customer_central_number||''),
   alternate_phone:safe(op.customer_central_number||''),
   email:safe(op.support_email||''),
   gstin:safe(op.gst_number||''),
   address:safe(op.registered_address||op.office_address||op.address||''),
   website:safe(op.website_url||op.website||''),
   tagline:safe(op.tagline||'Your Journey, Our Commitment')
  },
  pnr:safe(b.ticket_number||b.pnr),booking_id:safe(b.pnr),
  status:safe(b.status).toUpperCase(),payment:safe(b.payment),source:safe(b.source),
  booked_at:safe(b.booked_at),booked_label:b.booked_at?gt(b.booked_at):'',
  service:safe(r.service_number),coach:safe(coach?.name||r.name||''),
  boarding:{
   name:safe(board.name),city:safe(D.cityName(board.city_id)),address:safe(board.address||''),
   instructions:safe(board.instructions||board.pickup_instructions||board.landmark||''),
   time:fmtStage(from),reporting:fmtStage(reporting),
   contact:safe(board.contact_number||op.customer_central_number||op.helpline_number||''),
   maps_url:maps(board),id:String(board.id)
  },
  dropping:{
   name:safe(drop.name),city:safe(D.cityName(drop.city_id)),address:safe(drop.address||''),
   instructions:safe(drop.instructions||drop.landmark||''),
   time:fmtStage(to),contact:safe(drop.contact_number||op.customer_central_number||op.helpline_number||''),
   maps_url:maps(drop),id:String(drop.id)
  },
  journey_minutes:duration,
  contact:{name:safe(b.contact?.name||''),phone:allowPhone?safe(b.contact?.phone||''):'**********',
   email:safe(b.contact?.email||'')},
  passengers:ps.map(p=>({name:safe(p.name),phone:allowPhone?safe(p.phone||b.contact?.phone||''):'**********',
   gender:safe(p.gender),age:p.age??'',seat:safe(p.seat),fare:n(p.fare)})),
  fare:{gross:n(f.gross),discount:n(f.discount),net:n(f.net),gst:n(f.gst),total:n(f.total)},
  gst_rate:f.net>0?Number((100*n(f.gst)/n(f.net)).toFixed(2)):0,
  cancellation_policy:cancellation,terms,
  can_update:!!req.user.permissions.includes('bookings.modify')&&b.status==='confirmed',
  seat_count:ps.length,
  ticket_date:safe(b.travel_date),
  schedule_id:String(s.id)
 };
}
const C={orange:[1,.365,.015],ink:[.05,.10,.19],slate:[.25,.33,.45],
 blue:[.09,.35,.99],muted:[.96,.97,.985],white:[1,1,1],
 green:[.05,.52,.29],pale:[.92,.98,.95],yellow:[1,.98,.85],border:[.83,.86,.91]};
function wrap(txt,width,sz){
 const words=safe(txt).split(/\s+/),out=[];let line='';
 const approx=x=>[...x].reduce((a,c)=>a+sz*('il.() ,'.includes(c)?.26:'MW'.includes(c)?.75:.51),0);
 for(const word of words){
  if(!word)continue;
  const next=line?line+' '+word:word;
  if(line&&approx(next)>width){out.push(line);line=word}else line=next;
 }
 if(line)out.push(line);
 return out;
}
function txt(p,x,y,s,size=9,bold=false,color=C.ink,align='left'){p.text(x,y,s,{size,bold,color,align})}
function lines(p,x,y,s,w,sz=9,col=C.slate,max=9){
 for(const l of wrap(s,w,sz).slice(0,max)){txt(p,x,y,l,sz,false,col);y+=sz+5}
 return y;
}
function rule(p,y){p.rule(40,y,555,y,C.border,.5)}
function footer(pdf,t){
 const p=pdf.page;p.rect(39,462,517,225,C.muted);
 txt(p,51,478,t.operator.name,16,true);txt(p,51,503,t.operator.tagline,9);
 let y=526;
 if(t.operator.address)y=lines(p,51,y,t.operator.address,243,8,C.slate,6)+9;
 txt(p,315,478,'COMPANY',9,true,C.slate);
 ['About Us','Contact','Terms & Conditions','Refund Policy','Privacy Policy','Delete My Data'].forEach((s,i)=>{
  txt(p,315,506+i*27,s,9);
 });
 txt(p,51,643,'GET IN TOUCH',9,true,C.slate);
 if(t.operator.phone)txt(p,51,662,t.operator.phone,8);
 if(t.operator.email)txt(p,51,679,t.operator.email,8);
}
function generatePdf(t){
 const pdf=new Pdf(portrait),p=pdf.page;
 // Page 1: same structure as supplied printed ticket, personalized per operator.
 p.rect(38,42,519,145,C.orange);
 txt(p,51,54,t.operator.name,17,true,C.white);
 if(t.operator.website)txt(p,545,57,t.operator.website,7,false,C.white,'right');
 txt(p,51,86,('Phone: '+t.operator.phone).trim(),9,false,C.white);
 if(t.operator.email)txt(p,545,86,t.operator.email,8,false,C.white,'right');
 let yy=110;
 if(t.operator.legal_name)yy=lines(p,51,yy,'Bus service provided by: '+t.operator.legal_name,487,8.2,C.white,2)+3;
 if(t.operator.address)yy=lines(p,51,yy,t.operator.address,487,8,C.white,3)+2;
 if(t.operator.gstin)txt(p,51,170,'Operator GSTIN: '+t.operator.gstin,8,false,C.white);
 p.rect(38,187,519,117,C.muted);
 txt(p,50,203,'Booking ID',8,false,C.slate);txt(p,545,203,'PNR',8,false,C.slate,'right');
 txt(p,50,220,t.booking_id,10,true);txt(p,545,220,t.pnr,10,true,C.ink,'right');
 txt(p,50,246,'Status',8,false,C.slate);txt(p,545,246,'Service',8,false,C.slate,'right');
 txt(p,50,263,t.status,9,true,C.green);txt(p,545,263,t.service,10,true,C.ink,'right');
 txt(p,50,280,'Booked: '+t.booked_label,8,false,C.slate);
 txt(p,545,283,t.coach,7.7,false,C.slate,'right');
 txt(p,298,317,Math.round(t.journey_minutes/60)+'h journey',9,false,C.slate,'center');
 txt(p,47,341,'BOARDING',8,true,C.slate);txt(p,548,341,'DROPPING',8,true,C.slate,'right');
 txt(p,47,358,t.boarding.city,12,true);txt(p,548,358,t.dropping.city,12,true,C.ink,'right');
 let yl=lines(p,47,377,t.boarding.name,218,9,C.ink,2);
 if(t.boarding.instructions)yl=lines(p,47,yl+3,t.boarding.instructions,215,8,C.slate,3);
 txt(p,47,455,'Time: '+t.boarding.time,8.5,true);
 txt(p,47,469,'Reporting: '+t.boarding.reporting,8.3);
 if(t.boarding.contact)txt(p,47,482,'Contact: '+t.boarding.contact,8.2);
 let yr=lines(p,548-205,377,t.dropping.name,205,9,C.ink,2);
 if(t.dropping.instructions)yr=lines(p,343,yr+2,t.dropping.instructions,205,8,C.slate,3);
 txt(p,548,455,'Time: '+t.dropping.time,8.5,true,C.ink,'right');
 if(t.dropping.contact)txt(p,548,469,'Contact: '+t.dropping.contact,8.2,false,C.slate,'right');
 rule(p,506);txt(p,45,514,'Passenger Detail',9,true);
 p.rect(40,538,515,22,C.muted);
 const col=[45,225,323,376,423,547];
 ['Passenger','Phone','Gender','Age','Seat','Fare'].forEach((s,i)=>txt(p,col[i],545,s,8,true,C.ink,i===5?'right':'left'));
 let y=565;
 t.passengers.slice(0,2).forEach(x=>{
  txt(p,col[0],y,safe(x.name).slice(0,31),7.7);txt(p,col[1],y,x.phone,8);
  txt(p,col[2],y,x.gender,8);txt(p,col[3],y,String(x.age),8);
  txt(p,col[4],y,x.seat,8,true,C.blue);txt(p,col[5],y,cash(x.fare),8,true,C.ink,'right');
  y+=18;rule(p,y-2);
 });
 y=Math.max(y+5,595);
 const pay=[['Base Fare ('+t.seat_count+' seat'+(t.seat_count===1?'':'s')+')',t.fare.gross],
  ['Discount',-t.fare.discount],['Net Fare',t.fare.net],['GST ('+t.gst_rate+'%)',t.fare.gst],
  [t.payment==='paid'?'Amount Paid':'Total Payable',t.fare.total]];
 pay.forEach((q,i)=>{
  if(i===1)p.rect(40,y-3,515,23,C.pale);
  if(i===4)p.rect(40,y-4,515,25,C.muted);
  txt(p,48,y,q[0],9,i===0||i===4,i===1?C.green:C.ink);
  txt(p,547,y,(i===1?'-':'')+cash(Math.abs(q[1])),9,i===0||i===4,i===1?C.green:i===4?C.blue:C.ink,'right');
  y+=26;
 });
 txt(p,46,y+3,'Booked via: '+t.source,8,false,C.slate);y+=24;
 p.rect(40,y,515,43,C.yellow);
 txt(p,51,y+7,'CANCELLATION POLICY',9,true,[.48,.25,0]);
 lines(p,51,y+21,t.cancellation_policy,490,7.4,[.52,.27,0],2);
 // Page 2 and optional continuation: never discard any additional passengers
 // or operator terms when an itinerary contains multiple booked seats.
 pdf.newPage();let p2=pdf.page,ty=45;
 const extra=t.passengers.slice(2);
 if(extra.length){
  txt(p2,41,ty,'Additional Passenger Detail',11,true);ty+=23;
  for(const x of extra){
   if(ty+22>415){pdf.newPage();p2=pdf.page;ty=45;
    txt(p2,41,ty,'Passenger Detail (continued)',11,true);ty+=23;}
   txt(p2,45,ty,safe(x.name).slice(0,29),8);
   txt(p2,231,ty,x.phone,8);txt(p2,330,ty,x.gender,8);
   txt(p2,375,ty,String(x.age),8);txt(p2,418,ty,x.seat,8,true,C.blue);
   txt(p2,548,ty,cash(x.fare),8,true,C.ink,'right');
   ty+=21;rule(p2,ty-5);
  }
  ty+=19;
 }
 if(ty+40>416){pdf.newPage();p2=pdf.page;ty=45;}
 txt(p2,41,ty,'TERMS & CONDITIONS',12,true);ty+=29;
 for(const item of t.terms){
  const wrapped=wrap(item,485,8.2);
  const required=wrapped.length*10+10;
  if(ty+required>423){pdf.newPage();p2=pdf.page;ty=43;
   txt(p2,41,ty,'TERMS & CONDITIONS (continued)',11,true);ty+=30;}
  txt(p2,42,ty,'-',8,false,C.blue);
  for(const ln of wrapped){txt(p2,58,ty,ln,8.2);ty+=10;}
  ty+=10;
 }
 rule(p2,435);footer(pdf,t);
 // Page 3: reference footer continuation and payment marks.
 pdf.newPage();p2=pdf.page;
 p2.rect(38,40,518,305,C.muted);
 txt(p2,51,61,'GET IN TOUCH',11,true,C.slate);
 if(t.operator.phone)txt(p2,51,94,'Phone: '+t.operator.phone,10);
 if(t.operator.email)txt(p2,51,120,'Email: '+t.operator.email,10);
 txt(p2,51,156,'Working hours: Contact operator for support timings',9,false,C.slate);
 rule(p2,200);
 txt(p2,51,223,'Secure Payments',9,true);
 txt(p2,236,223,'24 x 7 Support',9,true);
 txt(p2,51,266,'VISA     Mastercard     UPI     RuPay     Net Banking',9,false,C.slate);
 rule(p2,318);
 txt(p2,51,329,'© '+new Date().getUTCFullYear()+' - '+t.operator.name,8,false,C.slate);
 txt(p2,51,346,'Powered by JourneyOS GDS',8,false,C.slate);
 return pdf.file();
}
module.exports={model,generatePdf,stageDate,fmtStage,DEFAULT_TERMS};
