// GDS server entry: static SPA + JSON API.
const path = require('path');
const express = require('express');
const db = require('./db');
const D = require('./domain');
const U = require('./util');
const auth = require('./auth');

if (!db.exists() || process.env.GDS_RESEED) { console.log('Seeding demo data…'); console.log(require('./seed').seed()); } else db.load();
// Keep schedules generated for the sale window.
D.ensureSchedules(U.addDays(U.today(), -1), U.addDays(U.today(), 30));

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });

const misc = require('./api/misc');
app.use('/api', misc.pub);
// Platform-key only; explicitly outside operator login/session routes.
app.use('/api/platform-billing/v25', require('./api/platform-billing-v25').internal);
app.use('/api', auth.middleware);
// A restrictive read-only access rule must cover all mutation endpoints,
// not only the screenshot's individually mapped handler checks.
const AccessRules=require('./team-access-policy-v28');
app.use('/api',(req,res,next)=>{
 if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
 if(['/team-access/v28/test','/bookings/quote','/auth/logout'].includes(req.path))return next();
 const effective=db.col('users').get(req.user?.id);
 if(AccessRules.isReadOnly(effective))
  return res.status(403).json({success:false,message:'Read-only access rule blocks changes'});
 next();
});
app.use('/api', require('./api/pnl-v18'));
app.use('/api', require('./api/ops'));
app.use('/api', require('./api/vehicle-details-v19'));
app.use('/api', require('./api/master'));
app.use('/api', require('./api/fleet-operations-v20'));
app.use('/api', require('./api/report-suite-v21'));
app.use('/api', require('./api/report-performance-v22'));
app.use('/api', require('./api/accounts'));
app.use('/api', require('./api/invoices-v24'));
app.use('/api', require('./api/platform-billing-v25').operator);
app.use('/api', require('./api/team-access-v26'));
app.use('/api', require('./api/team-access-v28'));
app.use('/api', require('./api/settings-complete'));
app.use('/api', require('./api/settings-v16-iam-bridge'));
app.use('/api', misc.r);
app.use('/api', (req, res) => res.status(404).json({ success: false, message: `No route ${req.method} ${req.path}` }));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

setInterval(() => { try { D.expireHolds(); } catch (e) { console.error(e); } }, 60e3);
const billing = require('./platform-billing-v25');
function billingRun(){
 try { if (db.meta('platform_billing_v25')) billing.runDue(); }
 catch(err) { console.error('[platform billing] issuance skipped:',err.message); }
}
// Issue only when all seven verified month-end billing inputs are ready.
// The read-only operator listing never attempts to fabricate missing documents.
billingRun();
setInterval(billingRun,15*60e3).unref();

process.on('SIGINT', () => { db.persistNow(); process.exit(0); });

const PORT = Number(process.env.PORT) || 3000;
if (require.main === module) app.listen(PORT, () => console.log(`GDS running at http://localhost:${PORT}  (login 9999999999 / OTP 1234)`));
module.exports = app;
