/* GDS v37: screenshot-faithful Accounts / Sales directional sector dropdown.
   Works with v10 state, standard URL filters, authorized route facets. */
(function(){
'use strict';
const h=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const svg=(kind,size=20)=>{
 const shapes={
  pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  down:'<path d="m6 9 6 6 6-6"/>',
  check:'<path d="m5 12 5 5L19 7"/>'
 };
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="'+size+'" height="'+size+
 '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
 shapes[kind]+'</svg>';
};
function mount(root,state,facets,queryUpdated){
 const anchor=root.querySelector('[data-ac11-sector-anchor]');if(!anchor)return;
 const items=[{value:'all',label:'All Sectors'},...(Array.isArray(facets.sectors)?facets.sectors:[])];
 const chosen=items.find(x=>String(x.value)===String(state.sector))||items[0];
 anchor.className='ac37-sector';
 anchor.innerHTML='<button type="button" class="ac37-sector-trigger" data-ac37-sector-trigger '+
  'aria-label="Sector filter: '+h(chosen.label)+'" aria-controls="ac37-sectors-list" aria-haspopup="listbox" aria-expanded="false" '+
  'title="'+h(chosen.label)+'"><span class="ac37-sector-leading">'+svg('pin',21)+'</span>'+
  '<span class="ac37-sector-text">'+h(chosen.label)+'</span>'+
  '<span class="ac37-sector-caret">'+svg('down',18)+'</span></button>'+
  '<div class="ac37-sector-menu" role="listbox" aria-label="Directional sectors" id="ac37-sectors-list" data-ac37-sector-menu hidden>'+
  items.map(row=>{
   const selected=String(row.value)===String(chosen.value);
   return '<button type="button" role="option" aria-selected="'+String(selected)+'" data-ac37-option="'+h(row.value)+'" '+
    'title="'+h(row.label)+'"><span>'+h(row.label)+'</span><span class="ac37-sector-check">'+svg('check',17)+'</span></button>';
  }).join('')+'</div>';
 const trigger=anchor.querySelector('[data-ac37-sector-trigger]'),menu=anchor.querySelector('[data-ac37-sector-menu]');
 const entries=()=>[...menu.querySelectorAll('[data-ac37-option]')];
 const open=val=>{
  menu.hidden=!val;trigger.setAttribute('aria-expanded',String(val));anchor.classList.toggle('open',val);
  if(val)(entries().find(x=>x.getAttribute('aria-selected')==='true')||entries()[0])?.focus();
 };
 const select=value=>{
  open(false);
  if(value===String(state.sector)){trigger.focus();return}
  const selectedService=state.service;
  const linked=(facets.services||[]).some(x=>String(x.value)===String(selectedService)&&x.sector===value);
  const nextService=value==='all'||linked?selectedService:'all';
  queryUpdated(state,{sector:value,service:nextService,pivot:state.pivot,basis:state.basis});
 };
 anchor.addEventListener('click',event=>{
  if(event.target.closest('[data-ac37-sector-trigger]')){open(menu.hidden);return}
  const option=event.target.closest('[data-ac37-option]');
  if(option)select(option.dataset.ac37Option);
 });
 anchor.addEventListener('keydown',event=>{
  if(event.key==='Escape'){if(!menu.hidden){event.stopPropagation();event.preventDefault();open(false);trigger.focus()}return}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();
   if(menu.hidden){open(true);return}
   const buttons=entries(),i=buttons.indexOf(document.activeElement);
   const delta=event.key==='ArrowDown'?1:-1;
   buttons[(i+delta+buttons.length)%buttons.length]?.focus();return;
  }
  if(event.key==='Home'||event.key==='End'){
   if(!menu.hidden){event.preventDefault();entries()[event.key==='Home'?0:entries().length-1]?.focus()}return;
  }
  if(event.key==='Enter'||event.key===' '){
   if(event.target===trigger){event.preventDefault();open(menu.hidden)}
   else if(event.target.closest('[data-ac37-option]')){event.preventDefault();event.target.closest('[data-ac37-option]').click()}
  }
 });
 const outside=event=>{
  if(!anchor.isConnected){document.removeEventListener('click',outside,true);return}
  if(!anchor.contains(event.target))open(false);
 };
 document.addEventListener('click',outside,true);
 return {anchor,open,items,select};
}
window.AccountsSalesV37={mount};
})();