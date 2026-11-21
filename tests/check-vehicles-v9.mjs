// Run after applying patch: node tests/check-vehicles-v9.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const js=fs.readFileSync('public/js/vehicles-parity-v9.js','utf8');
const css=fs.readFileSync('public/css/vehicles-parity-v9.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const elements={
  'Vehicle counters':['MOVING','IDLING','STOPPED','GPS OFFLINE','CRITICAL','DEF INHIBIT'],
  'Vehicle filters':['Search plate or coach','All states','All health','All GPS','Sort: Plate'],
  'Vehicle actions':['fleet-map','add-vehicle','view','edit','duplicate','delete','health','alerts','location'],
  'Health modal':['Fault Codes','Predictive Algorithms','Last engine data','Active (','Inactive (','Battery voltage','DPF soot load'],
  'Telemetry':['Engine speed','Engine load','Engine torque','Coolant temperature','Oil pressure','Fuel level','AdBlue tank level','DOC outlet temperature','Barometric pressure'],
  'Alerts':['OVERSPEED','HARD BRAKE','IDLING','STOPPAGE'],
  'Coaches':['COACHES','SLEEPER','SEATER','VIDEO','Coach Type','Amenities','Seat Layout'],
  'Coach data':['Coach Name *','Alternative name','Bus Category *','Bus Manufacturer *','Total Seater Seats','Total Sleeper Berths','Has Upper Deck'],
  'Amenity controls':['Air Conditioning','Video/Entertainment','Washroom','CCTV','Emergency Exit','First Aid Kit','Fire Extinguisher','GPS Tracking','WiFi','Water Bottle','Panic Button'],
  'Seat config':['Current Configuration','Male (Booked)','Female (Booked)','Blocked','No-show','Selected','Generate Layout','Seat Configuration','Display Name (Editable)','Position (Grid)']
};
let n=0;
for(const [group,items] of Object.entries(elements))for(const x of items){assert(js.includes(x),`Missing ${group}: ${x}`);n++}
for(const selector of ['.vp-toolbar-card','.vp-metrics','.vp-vehicle-table','.vp-coach-table','.vp-health-columns','.vp-map-pin','.vp-alert-card','.vp-modal-tabs','.vp-decks','.vp-seat-config']){assert(css.includes(selector),`Missing CSS ${selector}`);n++}
assert(html.indexOf('vehicles-parity-v9.js')>html.indexOf('savetrip-visual.js'),'Vehicle script must be after visual overlay');
assert(html.indexOf('vehicles-parity-v9.js')<html.indexOf('main.js'),'Vehicle script must be before router');
assert(html.includes('vehicles-parity-v9.css'),'CSS not registered');
console.log('PASS: Vehicle screenshot coverage checks:',n,'UI elements and styles, plus script ordering');
