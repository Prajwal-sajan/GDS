'use strict';
const express=require('express'),db=require('../db'),A=require('../auth'),D=require('../domain'),L=require('../loyalty-v34');
const router=express.Router();
const handlers={
 general:'general',daily_limits:'daily_limits',tier_bonus:'tier_bonus',
 blocked_dates:'blocked_dates',seat_upgrades:'seat_upgrades'
};
const fail=(e,res)=>res.status(e.status||500).json({success:false,message:e.status?e.message:'Unable to save loyalty settings'});
router.get('/settings/loyalty-v34',A.can('settings.view'),(req,res)=>{
 res.set('Cache-Control','private, no-store');res.json(L.read());
});
router.put('/settings/loyalty-v34/:section',A.can('settings.modify'),(req,res)=>{
 try{
  const section=handlers[req.params.section];if(!section)throw L.error('Unknown section',404);
  if(!req.user.permissions.includes('offers.loyalty'))throw L.error('Loyalty management permission required',403);
  const old=L.read()[section],next=L.store(section,req.body?.value);
  // Critical rule enforcement is in pricing domain, not on a client toggle.
  D.audit('settings','loyalty-v34',section,{before:old,after:next[section]},req.user);
  res.json({success:true,configuration:next});
 }catch(e){fail(e,res);}
});
module.exports=router;
