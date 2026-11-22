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
app.use('/api', auth.middleware);
app.use('/api', require('./api/pnl-v18'));
app.use('/api', require('./api/ops'));
app.use('/api', require('./api/master'));
app.use('/api', require('./api/accounts'));
app.use('/api', require('./api/settings-complete'));
app.use('/api', require('./api/settings-v16-iam-bridge'));
app.use('/api', misc.r);
app.use('/api', (req, res) => res.status(404).json({ success: false, message: `No route ${req.method} ${req.path}` }));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

setInterval(() => { try { D.expireHolds(); } catch (e) { console.error(e); } }, 60e3);
process.on('SIGINT', () => { db.persistNow(); process.exit(0); });

const PORT = Number(process.env.PORT) || 3000;
if (require.main === module) app.listen(PORT, () => console.log(`GDS running at http://localhost:${PORT}  (login 9999999999 / OTP 1234)`));
module.exports = app;
