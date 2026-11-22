'use strict';
// Explicit permission-to-API mapping; scope values are represented in UI but must be
// enforced by each domain endpoint before "Own"/"Branch" filtering is relied upon.
const ROWS=[
 ['TRIPS & PICKUPS',[
  ['View trip sheets & pickup charts','trips.view','scope'],
  ['Mark boarded / no-show, passenger notes','trips.update_passengers','toggle'],
  ['See bus location','trips.location','toggle'],
  ['Call passengers and crew','trips.call','toggle']]],
 ['BOOKINGS',[
  ['Book seats','bookings.create','toggle'],['View bookings','bookings.view_all','scope'],
  ['Edit passengers & points','bookings.modify','scope'],['Cancel tickets','bookings.cancel','scope'],
  ['Shift seat / date','bookings.modify','scope'],
  ['Send passenger messages (delay, pre-boarding, resend ticket)','trips.chat','toggle'],
  ['Block seats','bookings.block_seats','toggle'],
  ['Unblock seats / book a blocked seat','bookings.release_hold','toggle']]],
 ['SCHEDULES (SERVICES)',[
  ['View services & seat layouts','schedules.view','toggle'],
  ['See who is booked on a service','schedules.view','toggle'],
  ["View a service's revenue",'schedules.financial','toggle'],
  ['Edit services (timings, coach, bus & driver, delay)','schedules.modify','toggle'],
  ['Edit fares','schedules.fares','toggle'],['Switch services on / off','schedules.toggle','toggle'],
  ['Create services / import trip sheets','schedules.modify','toggle'],['Delete services','schedules.delete','toggle']]],
 ['ROUTES',[
  ['View routes','routes.view','toggle'],['Create routes','routes.create','toggle'],
  ['Edit routes, fares, stops & route map','routes.modify','toggle'],['Delete / retime routes','routes.delete','toggle']]],
 ['FLEET',[
  ['View vehicles & fleet map','fleet.view','toggle'],['Add vehicles','fleet.modify','toggle'],
  ['Edit vehicles & documents','fleet.modify','toggle'],['Delete vehicles','fleet.delete','toggle'],
  ['Share a bus location link','fleet.view','toggle'],['View coaches / seat layouts','fleet.view','toggle'],
  ['Create & edit coaches','fleet.modify','toggle']]],
 ['CHATS & CALLS',[
  ['View trip chats','chats.view','scope'],['Reply / send photos','chats.send','toggle'],
  ['Make calls','calls.make','toggle'],['View call history','calls.view','scope'],
  ['Listen to recordings','calls.view','toggle'],['Manage speed dials','settings.modify','toggle']]],
 ['ACCOUNTS',[
  ['Sales','accounts.view','scope'],['Transactions & receivables','accounts.view','scope'],
  ['Add / delete ledger entries','accounts.ledger','toggle'],['Reports','accounts.reports','toggle'],
  ['Invoices & statements (view / pay)','accounts.view','toggle'],
  ['Settlements (view)','accounts.view','toggle'],
  ['Upload & match settlements','accounts.reconciliation','toggle'],
  ['Agent settings (terms, credit, commission)','iam.manage_users','toggle']]],
 ['DAILY OPS & STAFF',[
  ['Daily report','dailyops.view','scope'],['View ratings','dailyops.view','toggle'],
  ['Follow up on ratings (status, comments)','dailyops.ratings_reply','toggle'],
  ['View staff','staff.view','toggle'],['Add / edit staff','staff.modify','toggle'],
  ['Advances & reimbursements','staff.payroll','toggle']]],
 ['USERS & SETTINGS',[
  ['View users','settings.view','scope'],['Add users (roles below their own)','iam.manage_users','toggle'],
  ['Edit users (name, branch, status, routes)','iam.manage_users','toggle'],
  ['Remove users','iam.manage_users','toggle'],['Change what roles can do','iam.manage_roles','toggle'],
  ['Configuration & notifications','settings.modify','toggle'],
  ['Branding','settings.modify','toggle'],['Use Sarathi (AI assistant)','sarathi.ask','toggle']]]
].map(([title,rows])=>({title,rows:rows.map(([label,code,kind])=>({label,code,kind}))}));
const ROLE_COLUMNS=[
 ['viewer','Viewer'],['driver','Bus crew (Driver, Conductor, Helper)'],
 ['agent','Agent'],['service_associate','Service Associate'],
 ['booking_executive','Booking Executive'],['pickup_manager','Pickup Manager'],
 ['service_agent','Service Agent'],['accountant','Accountant'],
 ['branch_admin','Branch Admin'],['manager','Manager']
];
const ROLE_DESCRIPTIONS={
 owner:'Organization owner with full business and access control',
 admin:'Administrator with full operator management',
 manager:'Route/fleet manager with operational control',
 pickup_manager:'Manages assigned pickup operations and trip handovers',
 booking_executive:'Counter bookings and passenger service',
 accountant:'Accounts, settlements and payroll access',
 agent:'Agent booking access',driver:'Vehicle driver with access to assigned trips',
 helper:'Helper with access to assigned trip passengers',
 conductor:'Conductor responsible for assigned trip operations',
 viewer:'Read-only access to assigned information',
 service_associate:'Trip and boarding operations',
 service_agent:'Agent team service management',branch_admin:'Office and branch operations'
};
const ROLE_HUES={owner:'#a646f5',admin:'#6057fb',manager:'#3578ff',pickup_manager:'#00b8d6',
 booking_executive:'#00b990',accountant:'#78bd02',agent:'#00bba4',
 driver:'#ff7200',helper:'#ff7200',conductor:'#ff7200',viewer:'#95a6be',
 service_associate:'#535ff6',service_agent:'#00a8bd',branch_admin:'#5763f6'};
module.exports={ROWS,ROLE_COLUMNS,ROLE_DESCRIPTIONS,ROLE_HUES};
