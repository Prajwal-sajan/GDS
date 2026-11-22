'use strict';
/**
 * Team & access screenshot matrix v27.
 * This is the complete 13-section WHAT inventory from the 20 supplied screenshots.
 * roleImpossible uses the screenshot's em dash, not an Off toggle.
 * No sample/screenshot role state is inserted into operator data.
 */
const V='viewer',C='driver',A='agent',S='service_associate',B='booking_executive';
const P='pickup_manager',G='service_agent',K='accountant',H='branch_admin',M='manager';
const order=[V,C,A,S,B,P,G,K,H,M];
const members={V,C,A,S,B,P,G,K,H,M};
const exclude=(letters='')=>[...letters].map(c=>members[c]).filter(Boolean);
const make=(section,definition)=>{
 const [label,code,kind='toggle',disabled='',limit=null]=definition;
 const key=section.toLowerCase().replace(/[^a-z0-9]+/g,'_')+'__'+label.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
 return {key,label,code,kind,roleImpossible:exclude(disabled),limit};
};
const groups=[
 ['TRIPS & PICKUPS',[
  ['View trip sheets & pickup charts','trips.view','scope','A'],
  ['Mark boarded / no-show, passenger notes','trips.update_passengers','toggle','A'],
  ['See bus location','trips.location','toggle','A'],
  ['Call passengers and crew','trips.call','toggle','A']]],
 ['BOOKINGS',[
  ['Book tickets','bookings.create'],['View bookings','bookings.view_all','scope'],
  ['Edit passengers & points','bookings.modify','scope'],
  ['Cancel tickets','bookings.cancel','scope','','cancel_cutoff_hours'],
  ['Shift seat / date','bookings.modify','scope'],
  ['Send passenger messages (delay, pre-boarding, resend ticket)','trips.chat','toggle','CA'],
  ['Add comments to a PNR','bookings.comments','toggle','CA'],
  ['Book on behalf of agents','bookings.on_behalf','toggle','CASG'],
  ['Block seats','bookings.block_seats','toggle','C','seat_block'],
  ['Unblock seats / book a blocked seat','bookings.release_hold','toggle','C'],
  ['See passenger phone numbers','bookings.see_phone']]],
 ['SCHEDULES',[
  ['View schedules & seat layouts','schedules.view','toggle','CA'],
  ['See who is booked on a schedule','schedules.view','toggle','CA'],
  ['View income & expenses','schedules.financial','toggle','CASG'],
  ['Edit timings, coach & delay','schedules.modify','toggle','CASG'],
  ['Edit expenses','schedules.edit_expenses','toggle','CASG'],
  ['Change cities, pickups & drops','schedules.modify','toggle','CASG'],
  ['Assign bus','schedules.assign_bus','toggle','CASG'],
  ['Assign crew (driver, conductor, helper)','schedules.assign_crew','toggle','CASG'],
  ['Edit fares','schedules.fares','toggle','CASG'],
  ['Switch schedules on / off','schedules.toggle','toggle','CASG'],
  ['Create schedules / import trip sheets','schedules.modify','toggle','CASG'],
  ['Delete schedules','schedules.delete','toggle','CASG']]],
 ['ROUTES',[
  ['View routes','routes.view','toggle','CASG'],
  ['Create routes','routes.create','toggle','CASG'],
  ['Edit general details (name, coach, settings, route map)','routes.modify','toggle','CASG'],
  ['Change cities & timings','routes.modify','toggle','CASG'],
  ['Change pickups, drops & breaks','routes.modify','toggle','CASG'],
  ['Change fares','routes.modify','toggle','CASG'],
  ['Block seats on the route','routes.modify','toggle','CASG'],
  ['Change cancellation rules','routes.modify','toggle','CASG'],
  ['Change expenses','routes.modify','toggle','CASG'],
  ['Update (shift the timings of its schedules)','routes.modify','toggle','CASG'],
  ['Delete routes','routes.delete','toggle','CASG']]],
 ['FLEET',[
  ['View vehicles & fleet map','fleet.view','toggle','CASG'],
  ['Add vehicles','fleet.modify','toggle','CASG'],
  ['Edit vehicles & documents','fleet.modify','toggle','CASG'],
  ['Delete vehicles','fleet.delete','toggle','CASG'],
  ['Share a bus location link','fleet.view','toggle','CASG'],
  ['View coaches / seat layouts','fleet.view','toggle','CASG'],
  ['Create & edit coaches','fleet.modify','toggle','CASG'],
  ['Delete coaches','fleet.delete','toggle','CASG']]],
 ['CHATS',[
  ['View trip chats','chats.view','scope','A'],
  ['Reply / send photos','chats.send','toggle','A'],
  ['Change chat status / mark read','chats.send','toggle','A'],
  ['Delete chats, block or report passengers','chats.send','toggle','CASG'],
  ['Share / revoke chat links','chats.send','toggle','CA']]],
 ['CALLS',[
  ['Make calls','calls.make','toggle','A'],
  ['View call history','calls.view','scope','A'],
  ['Listen to recordings','calls.view','toggle','CA'],
  ['Manage speed dials','settings.modify','toggle','CASG']]],
 ['ACCOUNTS',[
  ['Sales','accounts.view','scope'],
  ['Transactions & receivables','accounts.view','scope'],
  ['Add / delete ledger entries','accounts.ledger','toggle','CASG'],
  ['Reports','accounts.reports','toggle','CASG'],
  ['Invoices & statements (view / pay)','accounts.view','toggle','CASG'],
  ['Settlements (view)','accounts.view','toggle','CASG'],
  ['Upload & match settlements','accounts.reconciliation','toggle','CASG'],
  ['Agent settings (terms, credit, commission)','iam.manage_users','toggle','CASG'],
  ['Send payment links / collect','accounts.ledger'],
  ['Export / download','accounts.export','toggle','VCASBPGM']]],
 ['DAILY OPS',[
  ['Daily report','dailyops.view','scope','CASG'],
  ['View ratings','dailyops.view','toggle','CA'],
  ['Follow up on ratings (status, comments)','dailyops.ratings_reply','toggle','CA'],
  ['Import ratings','dailyops.ratings_reply','toggle','CA']]],
 ['STAFF & HR',[
  ['View staff','staff.view','toggle','CA'],
  ['Add / edit staff','staff.modify','toggle','CAS'],
  ['Attendance (view, correct, approve)','staff.payroll','toggle','CAS'],
  ['Advances & reimbursements','staff.payroll','toggle','CAS'],
  ['Payouts (generate, approve, mark paid)','staff.payroll','toggle','CAS']]],
 ['OFFERS & LOYALTY',[
  ['Coupons','offers.manage_coupons','toggle','CASG'],
  ['Branch offers at the counter','offers.manage_coupons'],
  ['Loyalty program settings','offers.loyalty','toggle','CASG'],
  ['Seat-upgrade settings','offers.loyalty','toggle','CASG']]],
 ['USERS & ACCESS',[
  ['View users','settings.view','scope','CA'],
  ['Add users (roles below their own)','iam.manage_users','toggle','CA'],
  ['Edit users (name, branch, status, routes)','iam.manage_users','toggle','CA'],
  ["Change a user's role",'iam.manage_users','toggle','CA'],
  ['Remove users','iam.manage_users','toggle','CASG'],
  ['Change what roles can do','iam.manage_roles','toggle','CASG']]],
 ['SETTINGS',[
  ['Configuration & notifications','settings.modify','toggle','CASG'],
  ['Branding','settings.modify','toggle','CASG'],
  ['Branches','settings.modify','toggle','CASG'],
  ['WhatsApp setup','settings.modify','toggle','CASG'],
  ['Use Sarathi (AI assistant)','sarathi.ask','toggle','CASG']]],
];
const ROWS=groups.map(([title,definitions])=>({
 title,rows:definitions.map(d=>make(title,d))
}));
const ALL_ROWS=ROWS.flatMap(x=>x.rows);
const byKey=new Map(ALL_ROWS.map(x=>[x.key,x]));
const byLabel=new Map(ALL_ROWS.map(x=>[x.label,x]));
if(byKey.size!==ALL_ROWS.length||byLabel.size!==ALL_ROWS.length)throw Error('Duplicate role-matrix key or label');
const BASE=require('./team-access-schema-v26');
const LIMIT_FIELDS={
 cancel_cutoff_hours:{label:'Cancel cut-off (hours before departure)',max:8760,unit:'h'},
 block_max_seats:{label:'Maximum seats per block',max:500,unit:'seats'},
 block_max_hours:{label:'Maximum block duration',max:8760,unit:'h'}
};
const permissionAvailable=(row,role)=>!row.roleImpossible.includes(role);
// Mapping is explicit: legacy v26 labels survive schema migration and do not reset grants.
const MIGRATIONS={
 'Book seats':'Book tickets',
 'View services & seat layouts':'View schedules & seat layouts',
 'See who is booked on a service':'See who is booked on a schedule',
 "View a service's revenue":'View income & expenses',
 'Edit services (timings, coach, bus & driver, delay)':'Edit timings, coach & delay',
 'Switch services on / off':'Switch schedules on / off',
 'Create services / import trip sheets':'Create schedules / import trip sheets',
 'Delete services':'Delete schedules',
 'Edit routes, fares, stops & route map':'Edit general details (name, coach, settings, route map)',
 'Edit routes, fares, stops & route map':'Edit general details (name, coach, settings, route map)',
 'Daily report':'Daily report'
};
const legacyFor=Object.fromEntries(Object.entries(MIGRATIONS).map(([old,current])=>[current,old]));
module.exports={...BASE,ROWS,ALL_ROWS,byKey,byLabel,order,LIMIT_FIELDS,permissionAvailable,legacyFor};
