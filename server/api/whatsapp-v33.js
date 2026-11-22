'use strict';
/* Meta Embedded Signup V4: signed-in admin initiates a one-time flow;
 * server exchanges the code, validates WABA/phone membership and stores
 * encrypted credentials. Never send a Meta token to the browser. */
const express=require('express');
const crypto=require('crypto');
const db=require('../db');
const A=require('../auth');
const D=require('../domain');
const router=express.Router();
const pending=new Map();
const MAX_STATES=100;
const TIMEOUT=12000;
const graphVersion=/^v\d{1,2}\.\d{1,2}$/.test(process.env.META_GRAPH_API_VERSION||'')?
  process.env.META_GRAPH_API_VERSION:'v24.0';
function config(){
 const appId=String(process.env.META_APP_ID||'').trim();
 const configId=String(process.env.META_WHATSAPP_CONFIG_ID||'').trim();
 const appSecret=String(process.env.META_APP_SECRET||'').trim();
 const keyString=String(process.env.GDS_WA_ENCRYPTION_KEY||'').trim();
 const key=/^[0-9a-fA-F]{64}$/.test(keyString)?Buffer.from(keyString,'hex'):
  /^[A-Za-z0-9+/]{43}=$/.test(keyString)?Buffer.from(keyString,'base64'):null;
 return {appId,configId,appSecret,key:Buffer.isBuffer(key)&&key.length===32?key:null,
  ready:Boolean(/^\d{5,24}$/.test(appId)&&/^\d{5,30}$/.test(configId)&&appSecret&&key?.length===32)};
}
function err(message,status=400){const e=new Error(message);e.status=status;return e;}
function wrap(fn){return async(req,res)=>{
 try{res.set('Cache-Control','private, no-store');res.set('Vary','Authorization');
  const value=await fn(req,res);if(!res.headersSent)res.json(value);
 }catch(e){res.status(e.status||502).json({success:false,message:e.publicMessage||
  (e.status?e.message:'Unable to complete WhatsApp onboarding with Meta. Try again or contact your administrator.')});}
};}
function admin(req){
 const person=db.col('users').get(req.user?.real_user_id);
 if(!person||!['owner','admin'].includes(person.role))throw err('An organization owner or administrator must connect WhatsApp.',403);
 if(!req.user?.permissions?.includes('settings.modify'))throw err('Missing settings.modify permission',403);
 // A view-as session may browse setup status but cannot install another
 // organization's third-party token.
 if(String(person.id)!==String(req.user.id))throw err('Return to your own account before connecting WhatsApp.',403);
 return person;
}
function publicConnection(){
 const c=db.meta('wa_meta_connection')||{};
 return {status:c.status||'not_connected',
  business_name:c.business_name||null,waba_id:c.waba_id||null,
  phone_number_id:c.phone_number_id||null,display_phone_number:c.display_phone_number||null,
  connected_at:c.connected_at||null,authorized_at:c.authorized_at||null};
}
function encrypt(token,key){
 const nonce=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);
 const content=Buffer.concat([cipher.update(String(token),'utf8'),cipher.final()]);
 return 'gcm1.'+nonce.toString('base64url')+'.'+cipher.getAuthTag().toString('base64url')+'.'+content.toString('base64url');
}
function decrypt(value,key){
 const p=String(value||'').split('.');
 if(p.length!==4||p[0]!=='gcm1')throw err('Stored WhatsApp credentials are invalid. Reconnect Meta.',409);
 const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(p[1],'base64url'));
 decipher.setAuthTag(Buffer.from(p[2],'base64url'));
 return Buffer.concat([decipher.update(Buffer.from(p[3],'base64url')),decipher.final()]).toString('utf8');
}
const isId=value=>/^\d{5,30}$/.test(String(value||''));
function extractIdList(x){
 const ids=[];
 if(Array.isArray(x?.messaging_account_ids))ids.push(...x.messaging_account_ids);
 if(Array.isArray(x?.waba_ids))ids.push(...x.waba_ids);
 if(x?.waba_id)ids.push(x.waba_id);
 return ids.map(String).filter(isId);
}
function cleanupStates(){
 const now=Date.now();
 for(const [key,val] of pending)if(val.deadline<now)pending.delete(key);
 while(pending.size>=MAX_STATES)pending.delete(pending.keys().next().value);
}
async function graph(path,{method='GET',token,params={},body,appCredentials=false}={}){
 const cfg=config();
 const url=new URL('https://graph.facebook.com/'+graphVersion+'/'+path.replace(/^\//,''));
 for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));
 const headers={'Accept':'application/json'};
 if(token)headers.Authorization='Bearer '+token;
 if(body)headers['Content-Type']='application/json';
 if(appCredentials){url.searchParams.set('client_id',cfg.appId);url.searchParams.set('client_secret',cfg.appSecret);}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TIMEOUT);
 try{
  const resp=await fetch(url,{method,headers,body:body?JSON.stringify(body):undefined,signal:controller.signal});
  const raw=await resp.text();
  let data;try{data=JSON.parse(raw)}catch{throw err('Meta returned a non-JSON response',502);}
  if(!resp.ok||data.error){
   // Do not reflect Meta request parameters, URLs, credentials or tokens in errors.
   const code=Number(data.error?.code)||0;
   if([190,200,10].includes(code))throw err('Meta authorization is missing or expired. Reconnect WhatsApp.',403);
   throw err('Meta rejected this step (code '+(code||resp.status)+'). Check your Meta business permissions and phone registration.',409);
  }
  return data;
 }catch(e){
  if(e.name==='AbortError')throw err('Meta did not respond in time. Please retry.',504);
  if(!e.status)throw err('Unable to reach the Meta Graph API. Please retry.',502);
  throw e;
 }finally{clearTimeout(timer);}
}
router.get('/settings/whatsapp/onboarding',A.can('settings.view'),wrap(req=>{
 const cfg=config(),conn=publicConnection();
 return {enabled:cfg.ready,app_id:cfg.ready?cfg.appId:null,
  configuration_id:cfg.ready?cfg.configId:null,graph_version:graphVersion,
  connection:conn,setup_required:!cfg.ready,
  setup_message:cfg.ready?null:'Meta Embedded Signup is not configured for this deployment. Ask your administrator to set Meta app, configuration, secret and encryption key.',
  provider:'meta-embedded-signup-v4'};
}));
router.post('/settings/whatsapp/onboarding/start',A.can('settings.modify'),wrap(req=>{
 admin(req);const cfg=config();
 if(!cfg.ready)throw err('Meta WhatsApp onboarding is not configured on this server.',503);
 cleanupStates();
 const state=crypto.randomBytes(24).toString('hex');
 pending.set(state,{uid:req.user.real_user_id,sid:req.user.session_id||null,deadline:Date.now()+10*60000});
 D.audit('settings','whatsapp_onboarding','start',{flow:'embedded_signup'},req.user);
 return {state,app_id:cfg.appId,configuration_id:cfg.configId,graph_version:graphVersion,expires_in_seconds:600};
}));
router.post('/settings/whatsapp/onboarding/finish',A.can('settings.modify'),wrap(async req=>{
 admin(req);
 const body=req.body||{},flow=String(body.state||''),attempt=pending.get(flow);
 // Single use, including failed Graph attempts: a replay requires fresh admin consent.
 if(attempt)pending.delete(flow);
 if(!attempt||attempt.deadline<Date.now()||String(attempt.uid)!==String(req.user.real_user_id)||
   String(attempt.sid||'')!==String(req.user.session_id||''))throw err('Signup session expired. Start WhatsApp connection again.',409);
 const code=String(body.code||'').trim(),wabaId=String(body.waba_id||'').trim(),
  numberId=String(body.phone_number_id||'').trim();
 if(code.length<8||code.length>2048||!isId(wabaId)||!isId(numberId))
  throw err('Meta did not return a complete authorization code and business phone.',400);
 const cfg=config();if(!cfg.ready)throw err('Meta WhatsApp onboarding is not configured.',503);
 const tokenResponse=await graph('oauth/access_token',{appCredentials:true,
  params:{code,grant_type:'authorization_code'}});
 const token=String(tokenResponse.access_token||'');
 if(token.length<20)throw err('Meta did not issue a valid business access token.',409);
 // Verify the WABA and selected phone *using the issued token*, never trust
 // postMessage IDs without Graph verification.
 const account=await graph(wabaId,{token,params:{fields:'id,name'}});
 if(String(account.id)!==wabaId)throw err('Meta business account verification failed.',409);
 const numbers=await graph(wabaId+'/phone_numbers',{token,params:{fields:'id,display_phone_number,verified_name',limit:'100'}});
 const selected=(numbers.data||[]).find(x=>String(x.id)===numberId);
 if(!selected)throw err('The selected phone number is not part of the authorized WhatsApp business account.',409);
 const previous=db.meta('wa_meta_connection')||{};
 if(previous.status==='connected'&&String(previous.phone_number_id)!==numberId)
  throw err('Disconnect the existing WhatsApp number before connecting another number.',409);
 const rec={
  status:'pending_registration',waba_id:wabaId,phone_number_id:numberId,
  business_name:String(account.name||'').slice(0,200),
  display_phone_number:String(selected.display_phone_number||'').slice(0,40),
  authorized_at:new Date().toISOString(),connected_at:null,
  token_encrypted:encrypt(token,cfg.key)};
 db.meta('wa_meta_connection',rec);
 D.audit('settings','whatsapp_onboarding','authorized',{waba_id:wabaId,phone_number_id:numberId},req.user);
 return {connection:publicConnection(),notice:'Meta authorization verified. Register the phone using its six-digit two-step verification PIN to finish connection.'};
}));
router.post('/settings/whatsapp/onboarding/register',A.can('settings.modify'),wrap(async req=>{
 admin(req);
 const record=db.meta('wa_meta_connection')||{};
 if(record.status!=='pending_registration')throw err('Authorize WhatsApp with Meta before registering the phone.',409);
 const pin=String(req.body?.pin||'');
 if(!/^\d{6}$/.test(pin))throw err('Enter a six-digit WhatsApp registration PIN.');
 const cfg=config();if(!cfg.key)throw err('WhatsApp encryption key missing.',503);
 const token=decrypt(record.token_encrypted,cfg.key);
 const result=await graph(record.phone_number_id+'/register',{method:'POST',token,
  body:{messaging_product:'whatsapp',pin}});
 if(result.success!==true)throw err('Meta has not confirmed phone registration.',409);
 db.meta('wa_meta_connection',{...record,status:'connected',connected_at:new Date().toISOString()});
 D.audit('settings','whatsapp_onboarding','registered',{waba_id:record.waba_id,phone_number_id:record.phone_number_id},req.user);
 return {connection:publicConnection(),notice:'Meta confirmed WhatsApp Cloud API phone registration. Configure webhook subscriptions and approved message templates before sending automated messages.'};
}));
router.post('/settings/whatsapp/onboarding/disconnect',A.can('settings.modify'),wrap(req=>{
 admin(req);
 const current=db.meta('wa_meta_connection');
 if(!current||current.status==='not_connected')return {connection:publicConnection()};
 if(req.body?.confirm!=='DISCONNECT')throw err('Confirm WhatsApp disconnection.',400);
 db.meta('wa_meta_connection',{status:'not_connected'});
 D.audit('settings','whatsapp_onboarding','disconnected',{waba_id:current.waba_id,phone_number_id:current.phone_number_id},req.user);
 return {connection:publicConnection(),notice:'Local authorization deleted. You may also revoke partner access from your Meta Business settings.'};
}));
module.exports=router;
