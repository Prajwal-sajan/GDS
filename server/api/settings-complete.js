// Settings-specific endpoints. All operator mutations are permission-checked and persisted.
const express = require('express');
const db = require('../db');
const D = require('../domain');
const A = require('../auth');
const crypto = require('crypto');
const r = express.Router();
const allowed = A.can;
const wrap = fn => (req,res) => { try {const out=fn(req,res); if(out!==undefined)res.json(out);} catch(e) {res.status(e.status||500).json({success:false,message:e.message});}};
const invalid = (msg,status=400) => {throw D.httpErr(status,msg);};
const txt = (v,len=200) => String(v??'').trim().slice(0,len);
const asId = v => v==null||v===''?null:Number(v);
const own = req => req.user.real_user_id;
const authAdmin = req => ['owner','admin'].includes(db.col('users').get(own(req))?.role);
const imageType = /^(image\/png|image\/jpeg|image\/webp)$/;

r.get('/settings/branding',allowed('settings.view'),wrap(()=>({operator:db.meta('operator')||{},branding:db.meta('branding')||{color_scheme:'Light',pwa_name:'',pwa_short_name:'',assets:{}}})));
r.put('/settings/branding',allowed('settings.modify'),wrap(req=>{
  const b=req.body||{};
  const op=db.meta('operator')||{},previous=db.meta('branding')||{};
  const color=txt(b.brand_hex||op.brand_hex,20);
  if(!/^#[0-9a-f]{6}$/i.test(color))invalid('Brand color must be a 6-digit hex value');
  const scheme=txt(b.color_scheme||previous.color_scheme||'Light',20);
  if(!['Light','Dark','System'].includes(scheme))invalid('Invalid color scheme');
  const family=txt(b.font_family||op.font_family||'Poppins',80);
  if(!['Poppins','Inter','Manrope','Roboto','System'].includes(family)) invalid('Font family is not supported');
  const updated={...op,app_name:txt(b.app_name??op.app_name,100),tagline:txt(b.tagline??op.tagline,180),helpline_number:txt(b.helpline_number??op.helpline_number,80),support_email:txt(b.support_email??op.support_email,150),brand_hex:color,font_family:family};
  const next={...previous,color_scheme:scheme,pwa_name:txt(b.pwa_name??previous.pwa_name,100),pwa_short_name:txt(b.pwa_short_name??previous.pwa_short_name,30),assets:{...(previous.assets||{})}};
  db.meta('operator',updated); db.meta('branding',next);
  D.audit('settings','branding','branding',{fields:['app_name','tagline','helpline_number','support_email','brand_hex','font_family','pwa_name','pwa_short_name','color_scheme']},req.user);
  return {operator:updated,branding:next};
}));
r.post('/settings/branding/assets/:asset',allowed('settings.modify'),wrap(req=>{
  const asset=req.params.asset;
  if(!['mobile_logo','desktop_logo','dark_logo','favicon','signin_background'].includes(asset))invalid('Unknown branding asset');
  const value=String(req.body?.data_url||'');
  const m=value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if(!m||!imageType.test(m[1]))invalid('Use PNG, JPEG or WebP (SVG uploads are not enabled)');
  const raw=Buffer.from(m[2],'base64');
  if(raw.byteLength<16||raw.byteLength>1024*1024)invalid('File must be under 1 MB and non-empty');
  // Reject mislabeled images rather than storing arbitrary active content as a data URL.
  const png=raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg=raw.subarray(0,3).equals(Buffer.from([255,216,255]));
  const webp=raw.toString('ascii',0,4)==='RIFF'&&raw.toString('ascii',8,12)==='WEBP';
  if(!({ 'image/png':png,'image/jpeg':jpg,'image/webp':webp }[m[1]]))invalid('Image content does not match its type');
  const existing=db.meta('branding')||{},assets={...(existing.assets||{}),[asset]:value};
  db.meta('branding',{...existing,assets});
  if(asset==='mobile_logo')db.meta('operator',{...(db.meta('operator')||{}),logo_url:value});
  D.audit('settings','branding_assets',asset,{size:raw.byteLength},req.user);
  return {asset,bytes:raw.byteLength,data_url:value};
}));
r.delete('/settings/branding/assets/:asset',allowed('settings.modify'),wrap(req=>{
  const asset=req.params.asset, existing=db.meta('branding')||{},assets={...(existing.assets||{})};
  if(!Object.hasOwn(assets,asset))return {success:true};
  delete assets[asset];db.meta('branding',{...existing,assets});
  if(asset==='mobile_logo')db.meta('operator',{...(db.meta('operator')||{}),logo_url:''});
  D.audit('settings','branding_assets',asset,{removed:true},req.user);
  return {success:true};
}));

r.get('/settings/whatsapp',allowed('settings.view'),wrap(()=>db.meta('whatsapp_ui')||{display_name:'',business_number:'',status:'not_connected',templates:[]}));
r.put('/settings/whatsapp',allowed('settings.modify'),wrap(req=>{
  const b=req.body||{},old=db.meta('whatsapp_ui')||{};
  const templates=Array.isArray(b.templates)?b.templates.map(x=>({name:txt(x.name,80),category:txt(x.category,30),message:txt(x.message,1600)})).filter(x=>x.name&&x.message).slice(0,50):(old.templates||[]);
  const next={display_name:txt(b.display_name??old.display_name,100),business_number:txt(b.business_number??old.business_number,20),status:'not_connected',templates};
  db.meta('whatsapp_ui',next); D.audit('settings','whatsapp','templates',{count:templates.length},req.user);
  return {...next,notice:'Templates saved locally. A verified WhatsApp Business API connection is required to send messages.'};
}));
r.get('/settings/configuration',allowed('settings.view'),wrap(()=>db.meta('configuration_ui')||{quiet_hours_enabled:false,quiet_start:'22:00',quiet_end:'07:00',escalation_minutes:15,bot_tone:'professional',bot_handoff:true}));
r.put('/settings/configuration',allowed('settings.modify'),wrap(req=>{
  const b=req.body||{};const value={quiet_hours_enabled:!!b.quiet_hours_enabled,quiet_start:txt(b.quiet_start||'22:00',5),quiet_end:txt(b.quiet_end||'07:00',5),escalation_minutes:Math.max(1,Math.min(240,Number(b.escalation_minutes)||15)),bot_tone:['professional','friendly','concise'].includes(b.bot_tone)?b.bot_tone:'professional',bot_handoff:!!b.bot_handoff};
  if(!/^\d\d:\d\d$/.test(value.quiet_start)||!/^\d\d:\d\d$/.test(value.quiet_end))invalid('Enter a valid HH:MM time');
  db.meta('configuration_ui',value);D.audit('settings','configuration','ui',{updated:true},req.user);return value;
}));

r.put('/branches/:id',allowed('settings.modify'),wrap(req=>{
  const row=db.col('branches').get(req.params.id);if(!row)invalid('Branch not found',404);
  const b=req.body||{},name=txt(b.name??row.name,120);if(!name)invalid('Branch name required');
  return db.col('branches').update(row.id,{name,city_id:asId(b.city_id??row.city_id),address:txt(b.address??row.address,240),phone:txt(b.phone??row.phone,20)});
}));
r.delete('/branches/:id',allowed('settings.modify'),wrap(req=>{
  const b=db.col('branches').get(req.params.id);if(!b)invalid('Branch not found',404);
  if(db.col('users').count(u=>String(u.branch_id)===String(b.id))) invalid('Unassign users before deleting this branch',409);
  const success=db.col('branches').remove(b.id);D.audit('settings','branch',b.id,{removed:true},req.user);return {success};
}));
// Keep legacy branch POST, and provide direct listing/update/delete with safeguards.

r.get('/branches',allowed('settings.view'),wrap(()=>db.col('branches').all()));

r.get('/iam/groups',allowed('settings.view'),wrap(()=>db.col('iam_groups').all()));
r.post('/iam/groups',allowed('iam.manage_roles'),wrap(req=>{
  const name=txt(req.body?.name,90);if(!name)invalid('Group name required');
  const ids=[...new Set((req.body?.user_ids||[]).map(Number))].filter(id=>db.col('users').get(id));
  const row=db.col('iam_groups').insert({name,description:txt(req.body?.description,250),user_ids:ids});
  D.audit('iam','group',row.id,{created:name},req.user);return row;
}));
r.put('/iam/groups/:id',allowed('iam.manage_roles'),wrap(req=>{
  const row=db.col('iam_groups').get(req.params.id);if(!row)invalid('Group not found',404);
  const ids=[...new Set((req.body?.user_ids||row.user_ids||[]).map(Number))].filter(id=>db.col('users').get(id));
  return db.col('iam_groups').update(row.id,{name:txt(req.body?.name??row.name,90),description:txt(req.body?.description??row.description,250),user_ids:ids});
}));
r.delete('/iam/groups/:id',allowed('iam.manage_roles'),wrap(req=>({success:db.col('iam_groups').remove(req.params.id)})));
r.get('/iam/access-evaluate/:id',allowed('settings.view'),wrap(req=>{
  const u=db.col('users').get(req.params.id);if(!u)invalid('User not found',404);
  return {user:A.publicUser(u),status:u.status,role_name:A.roles()[u.role]?.name||u.role,groups:db.col('iam_groups').filter(g=>(g.user_ids||[]).includes(Number(u.id))).map(g=>({id:g.id,name:g.name})),note:'Role scope metadata is stored for UI parity; enforcement must be added per endpoint before production.'};
}));
r.delete('/iam/users/:id',allowed('iam.manage_users'),wrap(req=>{
  const u=db.col('users').get(req.params.id);if(!u)invalid('User not found',404);
  if(u.role==='owner'||u.id===own(req))invalid('You cannot delete an owner or your own account',403);
  if(!authAdmin(req)&&['admin','manager'].includes(u.role))invalid('Insufficient privileges',403);
  const removed=db.col('users').remove(u.id);D.audit('iam','user',u.id,{deleted:u.name},req.user);return {success:removed};
}));
r.get('/auth/sessions',wrap(req=>{
  const rows=db.col('auth_sessions').filter(s=>s.user_id===own(req)&&!s.revoked_at).map(s=>({id:s.id,created_at:s.created_at,last_seen:s.last_seen,user_agent:s.user_agent,current:s.id===req.user.session_id}));
  return {sessions:rows,has_legacy_session:!req.user.session_id};
}));
r.delete('/auth/sessions/:id',wrap(req=>{
  const s=db.col('auth_sessions').get(req.params.id);
  if(!s||s.user_id!==own(req))invalid('Session not found',404);
  db.col('auth_sessions').update(s.id,{revoked_at:new Date().toISOString()});return {success:true,current:s.id===req.user.session_id};
}));
r.post('/auth/logout',wrap(req=>{
  const s=req.user.session_id&&db.col('auth_sessions').get(req.user.session_id);
  if(s&&s.user_id===own(req))db.col('auth_sessions').update(s.id,{revoked_at:new Date().toISOString()});
  return {success:true};
}));

module.exports=r;
