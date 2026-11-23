'use strict';
const db=require('./db');
const LEVEL={
 owner:100,admin:90,manager:80,branch_admin:75,pickup_manager:65,
 accountant:60,booking_executive:55,service_associate:50,service_agent:45,
 driver:30,conductor:30,helper:25,agent:20,viewer:10};
function level(u){return LEVEL[u?.role]??0;}
function active(u){return u&&u.status==='ACTIVE'&&!u.deleted_at&&!(u.role==='agent'&&u.mode==='Offline');}
function canViewAs(real,target){
 return Boolean(real&&target&&['owner','admin'].includes(real.role)&&
 active(real)&&active(target)&&String(real.id)!==String(target.id)&&
 level(target)<level(real));
}
function switchableUsers(real){
 if(!['owner','admin'].includes(real?.role))return [];
 return db.col('users').filter(x=>canViewAs(real,x)).map(x=>({
  id:x.id,name:x.name,phone:x.phone,role:x.role,
  branch_id:x.branch_id||null,status:x.status
 }));
}
function resolve(real,id){
 const target=db.col('users').get(id);
 if(!target||!canViewAs(real,target))return null;
 return target;
}
module.exports={LEVEL,level,active,canViewAs,switchableUsers,resolve};
