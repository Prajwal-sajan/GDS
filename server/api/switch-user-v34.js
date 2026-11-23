'use strict';
const express=require('express'),db=require('../db'),A=require('../auth'),S=require('../switch-user-v34'),D=require('../domain');
const router=express.Router();
router.post('/auth/switch-user/v34/resolve',(req,res)=>{
 const real=db.col('users').get(req.user.real_user_id);
 if(!real||!['owner','admin'].includes(real.role))return res.status(403).json({success:false,message:'Only owners and administrators can switch users'});
 if(String(real.id)!==String(req.user.id))return res.status(403).json({success:false,message:'Return to your own account before switching users'});
 const phone=String(req.body?.phone||'').trim().replace(/^\+91[\s-]?/,'').replace(/[\s-]/g,'');
 if(!/^\d{10}$/.test(phone))return res.status(400).json({success:false,message:'Enter a valid 10-digit mobile number'});
 const user=db.col('users').find(x=>x.phone===phone);
 if(!S.canViewAs(real,user))return res.status(404).json({success:false,message:'No active eligible user with that number'});
 D.audit('auth','switch-user','preview',{target_id:String(user.id),target_role:user.role},req.user);
 res.json({id:user.id,name:user.name,role:user.role,phone:user.phone,
  message:'Viewing as '+user.name+'. Changes remain attributed to your own account.'});
});
router.get('/auth/switch-user/v34/status',(req,res)=>{
 const real=db.col('users').get(req.user.real_user_id);
 const target=String(req.user.id)===String(real?.id)?null:db.col('users').get(req.user.id);
 if(!real)return res.status(401).json({success:false,message:'Authentication required'});
 res.json({is_viewing_as:Boolean(target),
  real:{id:real.id,name:real.name,role:real.role},
  target:target?{id:target.id,name:target.name,role:target.role}:null});
});
module.exports=router;
