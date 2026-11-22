'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const schema=require('../server/configuration-v31-schema');
const dom=new JSDOM('<div></div>',{url:'http://localhost',runScripts:'outside-only'});
const w=dom.window;
const map={decks:[{seats:[
 {code:'1',status:'booked_female',booking:{gender:'F',source:'agent',is_mine:false}},
 {code:'2',status:'booked_male',booking:{gender:'M',source:'branch',is_mine:false}},
 {code:'3',status:'blocked',booking:null},
 {code:'4',status:'no_show',booking:{gender:'M',source:'agent',is_mine:false}},
 {code:'5',status:'booked_male',booking:{gender:'M',source:'branch',is_mine:true}}
]}]};
const called=[];
w.G={
 renderSeats:input=>'<div class="legend"></div><div class="decks">'+
  input.decks.flatMap(d=>d.seats).map(x=>'<div class="seat '+x.status+'" data-seat="'+x.code+'">'+x.code+'</div>').join('')+'</div>',
 get:async path=>{called.push(path);return {seat_legends:schema.defaults.seats};},
 bookingConsole:async id=>'booking '+id
};
w.eval(fs.readFileSync('public/js/seat-legend-v31.js','utf8'));
(async()=>{
 assert.equal(await w.G.bookingConsole(10),'booking 10');
 assert.ok(called.includes('/settings/config-v30/seat-display'));
 const html=w.G.renderSeats(map);
 const body=w.document.createElement('div');body.innerHTML=html;
 const a=code=>body.querySelector('[data-seat="'+code+'"]');
 assert.match(a('1').style.backgroundColor,/rgb\(240, 75, 157\)/);
 assert.match(a('1').style.boxShadow,/rgb\(226, 165, 30\)/);
 assert.match(a('2').style.backgroundColor,/rgb\(69, 139, 255\)/);
 assert.match(a('2').style.boxShadow,/rgb\(133, 82, 246\)/);
 assert.match(a('5').style.boxShadow,/rgb\(10, 170, 192\)/,'Mine is higher priority than Branch');
 assert.equal(a('3').getAttribute('style'),null,'Blocked colours must remain unchanged');
 assert.equal(a('4').getAttribute('style'),null,'No-show colours must remain unchanged');
 const selected=w.G.renderSeats(map,['1']);const selectedRoot=w.document.createElement('div');
 selectedRoot.innerHTML=selected;
 assert.equal(selectedRoot.querySelector('[data-seat="1"]').getAttribute('style'),null,'Selected seat unchanged');
 w.G._seatLegend={...schema.defaults.seats,fill_seats_by:'none',outer_ring_by:'none'};
 const plain=w.document.createElement('div');plain.innerHTML=w.G.renderSeats(map);
 assert.equal(plain.querySelector('[data-seat="1"]').style.backgroundColor,'rgb(255, 255, 255)');
 assert.equal(plain.querySelector('[data-seat="1"]').style.boxShadow,'');
 console.log('PASS Configuration v31 seat legends: booked gender fill + sales rings + priority, blocked/no-show/selected preserved, loader');
})().catch(e=>{console.error(e);process.exitCode=1;});
