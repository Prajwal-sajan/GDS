'use strict';
const express=require('express'),A=require('../auth');
const {buildInfo}=require('../about-v32-build');
const r=express.Router();
r.get('/about/build',A.can('settings.view'),(_req,res)=>{
 res.set('Cache-Control','private, no-store, max-age=0');
 res.set('Pragma','no-cache');
 res.set('Vary','Authorization');
 res.json(buildInfo);
});
module.exports=r;
