'use strict';
// Public, read-only branded PWA metadata. Never expose operator configuration or credentials.
const express=require('express');
const db=require('../db');
const router=express.Router();
const ASSET_TYPES={mobile_logo:1,desktop_logo:1,dark_logo:1,favicon:1,signin_background:1};
const typeFromData=(v)=>{const m=String(v||'').match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);return m?{type:m[1],bytes:Buffer.from(m[2],'base64')}:null;};
const identity=()=>({operator:db.meta('operator')||{},branding:db.meta('branding')||{}});
const color=(v)=>/^#[0-9a-fA-F]{6}$/.test(String(v))?v:'#2563eb';
const text=(v,n)=>String(v??'').trim().slice(0,n);
function defaultIcon(){
 const {operator}=identity();
 const fill=color(operator.brand_hex);
 const initials=text(operator.app_name||'GDS',50).split(/\s+/).filter(Boolean).slice(0,2).map(v=>v[0]).join('').toUpperCase().replace(/[^A-Z0-9]/g,'')||'G';
 return `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192"><rect width="192" height="192" rx="38" fill="${fill}"/><text x="96" y="111" fill="#fff" font-size="74" font-weight="700" font-family="Arial,sans-serif" text-anchor="middle">${initials}</text></svg>`;
}
router.get('/branding-assets/default.svg',(req,res)=>{
 res.set({'Cache-Control':'public,max-age=300','X-Content-Type-Options':'nosniff'});
 res.type('image/svg+xml; charset=utf-8').send(defaultIcon());
});
router.get('/branding-assets/:asset',(req,res)=>{
 const asset=req.params.asset;
 if(!ASSET_TYPES[asset])return res.status(404).end();
 const {operator,branding}=identity();
 const raw=branding.assets?.[asset]||(asset==='mobile_logo'?operator.logo_url:null);
 const val=typeFromData(raw);
 if(!val||val.bytes.length>1024*1024)return res.status(404).end();
 res.set({'Cache-Control':'public,max-age=300','X-Content-Type-Options':'nosniff','Content-Length':String(val.bytes.length)});
 res.type(val.type).send(val.bytes);
});
router.get('/manifest.webmanifest',(req,res)=>{
 const {operator,branding}=identity();
 const name=text(branding.pwa_name||operator.app_name||operator.operator_name||'JourneyOS GDS',100);
 const short_name=text(branding.pwa_short_name||name,30);
 const scheme=branding.color_scheme||operator.color_scheme||'Light';
 const theme_color=color(operator.brand_hex);
 const icon=typeFromData(branding.assets?.favicon)?'favicon':
            typeFromData(branding.assets?.mobile_logo||operator.logo_url)?'mobile_logo':null;
 const icons=icon?[{src:'/branding-assets/'+icon,type:typeFromData(branding.assets?.[icon]||(icon==='mobile_logo'?operator.logo_url:null)).type,sizes:'any',purpose:'any'}]:
             [{src:'/branding-assets/default.svg',type:'image/svg+xml',sizes:'any',purpose:'any'}];
 res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 res.type('application/manifest+json').send(JSON.stringify({
   id:'/',name,short_name,start_url:'/',scope:'/',display:'standalone',
   background_color:scheme==='Dark'?'#111827':'#ffffff',theme_color,icons,
   description:text(operator.tagline||'Bus operator management',180)
 }));
});
module.exports=router;
