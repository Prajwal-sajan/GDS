'use strict';
// Operator About metadata comes from this running deployment, never the
// screenshot reference or the operator's mutable business configuration.
const path=require('path');
const {execFileSync}=require('child_process');
const pkg=require('../package.json');
const ROOT=path.join(__dirname,'..');
function git(arg){
 try{return execFileSync('git',arg,{cwd:ROOT,encoding:'utf8',timeout:1500,windowsHide:true,stdio:['ignore','pipe','ignore']}).trim();}
 catch(_){return '';}
}
const shaSource=process.env.GDS_BUILD_SHA||process.env.GIT_COMMIT_SHA||process.env.GITHUB_SHA||
 process.env.RENDER_GIT_COMMIT||process.env.RAILWAY_GIT_COMMIT_SHA||git(['rev-parse','HEAD']);
const commit=/^[a-f0-9]{40}$/i.test(shaSource)?shaSource.toLowerCase():null;
function asIso(v){if(!v)return null;const t=Date.parse(v);return Number.isFinite(t)?new Date(t).toISOString():null;}
const builtAt=asIso(process.env.GDS_BUILD_TIME||process.env.BUILD_TIMESTAMP||'');
const committedAt=commit?asIso(git(['show','-s','--format=%cI',commit])):null;
const env=(process.env.GDS_ENVIRONMENT||process.env.APP_ENV||process.env.NODE_ENV||'local').trim().toLowerCase();
const envLabel={production:'PROD',prod:'PROD',staging:'STAGING',uat:'UAT',
 testing:'TEST',test:'TEST',development:'DEV',dev:'DEV',local:'LOCAL'}[env]||'CUSTOM';
const buildId=commit||String(process.env.GDS_BUILD_ID||'').trim().slice(0,100)||null;
const buildInfo=Object.freeze({
 product:'JourneyOS Operator',
 version:String(pkg.version||'0.0.0'),
 build_id:buildId,
 commit,
 short_commit:commit?commit.slice(0,8):null,
 built_at:builtAt,
 committed_at:committedAt,
 environment:envLabel,
 project_url:'https://github.com/Prajwal-sajan/GDS',
 commit_url:commit?'https://github.com/Prajwal-sajan/GDS/commit/'+commit:null,
 description:'The multi-tenant operator console for JourneyOS — manage GDS schedules, tripsheets, passenger chats, and bookings for your entire fleet from one place, on any device.',
 features:['GDS Schedules','Tripsheets','Passenger Chats','Bookings'],
 // Explicitly do not imply external release feed or push-update service.
 update_source:'deployed-server'
});
module.exports={buildInfo,asIso};
