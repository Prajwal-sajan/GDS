/* GDS v37 screenshot layout: fleet and coach 3-column cards.
   Uses v9 action markup and permissions; no synthetic fleet records. */
(function(){
'use strict';
function coachCard(c,parts,counts,icon,E){
 const name=c.name||'Unnamed coach';
 const alias=c.alt_name||c.alternative_name||'';
 const pickup=/pickup/i.test(c.bus_type||'');
 const seats=[counts.seater?'<div>'+counts.seater+' Seater</div>':'',
  counts.sleeper?'<div>'+counts.sleeper+' Sleeper</div>':''].filter(Boolean).join('')||'<div>No seat layout</div>';
 const video=(c.amenities||[]).some(a=>/video|entertainment|personal.?tv/i.test(String(a)));
 return '<article class="vp37-card vp37-coach-card" data-vp37-coach="'+E(c.id)+'">'+
 '<header class="vp37-card-heading">'+
 '<span class="vp37-card-bus">'+icon('bus',22)+'</span>'+
 '<div class="vp37-card-title"><strong title="'+E(name)+'">'+E(name)+'</strong>'+
 (alias?'<span class="vp-coach-alias" title="'+E(alias)+'">'+E(alias)+'</span>':'')+'</div>'+
 '<div class="vp37-card-switch">'+parts[5]+'</div></header>'+
 '<p class="vp37-card-subtitle"><span class="'+(pickup?'vp37-pickup':'')+'">'+
 (pickup?'Pickup Van':'Regular')+'</span> · '+E(c.pattern||'—')+'</p>'+
 '<div class="vp37-coach-summary"><div><small>SEATS</small><div class="vp37-seats">'+seats+'</div></div>'+
 '<div><small>FEATURES</small><div class="vp37-features">'+parts[4]+
 (video?'<span class="vp37-video">'+icon('video',14)+' Video</span>':'')+'</div></div></div>'+
 '<footer class="vp37-card-footer">'+parts[6]+'</footer></article>';
}
function renderCoaches(rows,cells,coachCounts,icon,E){
 return '<div class="vp-card-grid vp37-cards vp37-coaches-grid">'+rows.map(c=>coachCard(c,cells(c),coachCounts(c),icon,E)).join('')+'</div>';
}
function vehicleCard(v,parts,icon,E){
 const reg=v.registration_number||v.plate||'Vehicle';
 return '<article class="vp37-card vp37-vehicle-card" data-vp37-vehicle="'+E(v.id)+'">'+
 '<header class="vp37-card-heading">'+
 '<span class="vp37-card-bus">'+icon('bus',22)+'</span>'+
 '<div class="vp37-card-title vp37-vehicle-title" title="'+E(reg)+'">'+parts[0]+'</div>'+
 '<div class="vp37-card-switch">'+parts[8]+'</div>'+
 '</header><div class="vp37-vehicle-summary">'+
 '<div class="vp37-vehicle-section"><small>STATE</small>'+parts[1]+'</div>'+
 '<div class="vp37-vehicle-section"><small>GPS</small>'+parts[4]+'</div>'+
 '<div class="vp37-vehicle-section"><small>ODOMETER</small>'+parts[2]+'</div>'+
 '<div class="vp37-vehicle-section"><small>FUEL / ADBLUE</small>'+parts[3]+'</div>'+
 '<div class="vp37-vehicle-section"><small>HEALTH</small>'+parts[5]+'</div>'+
 '<div class="vp37-vehicle-section"><small>ALERTS</small>'+parts[7]+'</div>'+
 '<div class="vp37-vehicle-section vp37-vehicle-location"><small>LOCATION</small>'+parts[6]+'</div>'+
 '</div><footer class="vp37-card-footer">'+parts[9]+'</footer></article>';
}
function renderVehicles(rows,row,icon,E){
 return '<div class="vp-card-grid vp37-cards vp37-vehicles-grid">'+rows.map(v=>vehicleCard(v,row(v),icon,E)).join('')+'</div>';
}
window.VehicleCardsV37={renderCoaches,renderVehicles};
})();