// OTP login, signed tokens and role-based access control.
const crypto = require('crypto');
const db = require('./db');

const SECRET = process.env.GDS_SECRET || 'gds-dev-secret-change-me';
const OTP_DEV = process.env.GDS_OTP || '1234'; // dev OTP (replace with SMS gateway in prod)

// Permission catalogue (service:action), grouped by area — mirrors operator role-permission areas.
const CATALOG = {
  trips: ['trips.view', 'trips.update_passengers', 'trips.location', 'trips.call', 'trips.chat', 'trips.import_chart'],
  bookings: ['bookings.create', 'bookings.view_all', 'bookings.modify', 'bookings.cancel', 'bookings.block_seats', 'bookings.release_hold'],
  schedules: ['schedules.view', 'schedules.modify', 'schedules.fares', 'schedules.toggle', 'schedules.delete', 'schedules.financial'],
  routes: ['routes.view', 'routes.create', 'routes.modify', 'routes.delete'],
  fleet: ['fleet.view', 'fleet.modify', 'fleet.delete', 'fleet.documents'],
  staff: ['staff.view', 'staff.modify', 'staff.payroll', 'staff.delete'],
  accounts: ['accounts.view', 'accounts.reports', 'accounts.ledger', 'accounts.reconciliation', 'accounts.own_only'],
  offers: ['offers.manage_coupons', 'offers.loyalty'],
  chats: ['chats.view', 'chats.send'],
  calls: ['calls.view', 'calls.make'],
  dailyops: ['dailyops.view', 'dailyops.ratings_reply'],
  crm: ['crm.view'],
  sarathi: ['sarathi.ask'],
  settings: ['settings.view', 'settings.modify', 'iam.manage_users', 'iam.manage_roles'],
};
const ALL = Object.values(CATALOG).flat();
const pick = (...areas) => areas.flatMap((a) => CATALOG[a]);
const DEFAULT_ROLES = {
  viewer: { name: 'Viewer', permissions: ['bookings.view_all', 'schedules.view', 'routes.view', 'fleet.view'] },
  service_associate: { name: 'Service Associate', permissions: ['trips.view', 'trips.update_passengers', 'trips.location', 'bookings.view_all', 'schedules.view', 'routes.view', 'fleet.view', 'chats.view', 'calls.view'] },
  service_agent: { name: 'Service Agent', permissions: ['bookings.create', 'bookings.view_all', 'bookings.cancel', 'trips.view', 'schedules.view', 'routes.view', 'chats.view', 'chats.send'] },
  branch_admin: { name: 'Branch Admin', permissions: ['settings.view', 'iam.manage_users', 'accounts.view', 'accounts.reports', 'bookings.create', 'bookings.view_all', 'bookings.modify', 'bookings.cancel', 'trips.view', 'schedules.view', 'routes.view', 'fleet.view', 'staff.view'], scopes: { 'View users': 'Branch', 'Add users (roles below their own)': 'Branch', 'Edit users (name, branch, status, routes)': 'Branch', 'Remove users': 'Branch', 'Branches': 'Branch' } },
  owner: { name: 'Organization Owner', permissions: ALL },
  admin: { name: 'Admin', permissions: ALL },
  manager: { name: 'Manager', permissions: ALL.filter((p) => !['iam.manage_roles', 'routes.delete', 'schedules.delete', 'fleet.delete', 'staff.delete'].includes(p)) },
  accountant: { name: 'Accountant', permissions: [...pick('accounts', 'offers'), 'trips.view', 'schedules.view', 'schedules.financial', 'routes.view', 'fleet.view', 'staff.view', 'staff.payroll', 'bookings.view_all', 'crm.view', 'sarathi.ask', 'dailyops.view'] },
  booking_executive: { name: 'Booking Executive', permissions: [...pick('bookings', 'chats', 'calls', 'crm'), 'trips.view', 'trips.update_passengers', 'trips.call', 'trips.chat', 'trips.location', 'schedules.view', 'routes.view'] },
  pickup_manager: { name: 'Pickup Manager', permissions: [...pick('trips', 'chats', 'calls'), 'schedules.view', 'bookings.view_all', 'fleet.view', 'dailyops.view'] },
  agent: { name: 'Agent', permissions: ['bookings.create', 'bookings.cancel', 'schedules.view', 'accounts.view', 'accounts.own_only'] },
  driver: { name: 'Driver', permissions: ['trips.view', 'trips.update_passengers', 'trips.location', 'trips.call'] },
};

function roles() {
  const custom = db.meta('roles') || {};
  return { ...DEFAULT_ROLES, ...custom };
}
function permsFor(user) {
  const r = roles()[user.role];
  const base = r ? r.permissions : [];
  return [...new Set([...base, ...(user.extra_permissions || [])])].filter((p) => !(user.denied_permissions || []).includes(p));
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verify(token) {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const exp = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (exp.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(sig))) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (p.exp && Date.now() > p.exp) return null;
  return p;
}

const otps = new Map();
function requestOtp(phone) {
  const u = db.col('users').find((x) => x.phone === phone && x.status === 'ACTIVE');
  if (!u) return { ok: false, message: 'This number is not registered with the operator' };
  otps.set(phone, { otp: OTP_DEV, exp: Date.now() + 5 * 60e3, tries: 0 });
  return { ok: true, message: 'OTP sent', dev_hint: process.env.NODE_ENV === 'production' ? undefined : OTP_DEV };
}
function verifyOtp(phone, otp, client = {}) {
  const rec = otps.get(phone);
  if (!rec || Date.now() > rec.exp) return { ok: false, message: 'OTP expired — request a new one' };
  if (++rec.tries > 5) return { ok: false, message: 'Too many attempts' };
  if (rec.otp !== String(otp)) return { ok: false, message: 'Incorrect OTP' };
  otps.delete(phone);
  const u = db.col('users').find((x) => x.phone === phone);
  const stamp=new Date().toISOString();
  db.col('users').update(u.id,{last_login:stamp,login_count:(Number(u.login_count)||0)+1});
  const session = db.col('auth_sessions').insert({ user_id:u.id, user_agent:String(client.user_agent||'Unknown browser').slice(0,300), last_seen:stamp, revoked_at:null });
  return { ok: true, token: sign({ uid: u.id, phone, sid:session.id, exp: Date.now() + 7 * 86400e3 }), user: publicUser(u) };
}
// Step-up OTP for sensitive actions (no-show, route delete).
const stepUps = new Map();
function requestStepUp(user, purpose) { stepUps.set(`${user.id}:${purpose}`, { otp: OTP_DEV, exp: Date.now() + 5 * 60e3 }); return { ok: true, dev_hint: OTP_DEV }; }
function checkStepUp(user, purpose, otp) {
  const k = `${user.id}:${purpose}`; const rec = stepUps.get(k);
  if (!rec || Date.now() > rec.exp || rec.otp !== String(otp)) return false;
  stepUps.delete(k); return true;
}

function publicUser(u) { return { id: u.id, phone: u.phone, name: u.name, role: u.role, branch_id: u.branch_id || null, permissions: permsFor(u) }; }

function middleware(req, res, next) {
  const h = req.headers.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
  const p = verify(tok);
  if (!p) return res.status(401).json({ success: false, message: 'Sign in required' });
  const u = db.col('users').get(p.uid);
  if (!u || u.status !== 'ACTIVE') return res.status(401).json({ success: false, message: 'User inactive' });
  if (p.sid) {
    const session=db.col('auth_sessions').get(p.sid);
    if (!session || session.user_id !== u.id || session.revoked_at) return res.status(401).json({success:false,message:'Session signed out'});
    if (Date.now()-Date.parse(session.last_seen||session.created_at||0)>5*60*1000)
      db.col('auth_sessions').update(session.id,{last_seen:new Date().toISOString()});
  }
  // "Switch user" (view as) for owners/admins
  const viewAs = req.headers['x-view-as'];
  let eff = u;
  if (viewAs && ['owner', 'admin'].includes(u.role)) eff = db.col('users').get(viewAs) || u;
  req.user = { ...publicUser(eff), real_user_id: u.id, session_id:p.sid || null };
  next();
}
const can = (perm) => (req, res, next) => (req.user.permissions.includes(perm) ? next() : res.status(403).json({ success: false, message: `Missing permission: ${perm}` }));

module.exports = { CATALOG, DEFAULT_ROLES, roles, permsFor, sign, verify, requestOtp, verifyOtp, requestStepUp, checkStepUp, middleware, can, publicUser };
