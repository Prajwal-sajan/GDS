'use strict';
// Daily Ops / OTA Ratings provider-settings API.
// Provider credentials are encrypted at rest and never returned to the browser.
// This module does not impersonate providers or claim that a live feed exists.
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { can } = require('../auth');

const router = express.Router();
const PROVIDERS = ['redbus', 'abhibus'];
const REFRESH_HOURS = 3;

function secretKey() {
  const raw = String(process.env.OTA_RATINGS_CREDENTIAL_KEY || '').trim();
  if (!raw) return null;
  let key;
  if (/^[a-f0-9]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex');
  else key = Buffer.from(raw, 'base64');
  return key.length === 32 ? key : null;
}
function encrypt(value) {
  const key = secretKey();
  if (!key) {
    const err = new Error('OTA credential encryption key is not configured. Set OTA_RATINGS_CREDENTIAL_KEY to 32 random bytes (hex or base64) before saving a password.');
    err.status = 503; throw err;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return 'v1:' + iv.toString('base64') + ':' + cipher.getAuthTag().toString('base64') + ':' + encrypted.toString('base64');
}
function tenantKey() {
  const operator = db.meta('operator') || {};
  // Current GDS is a single-operator JSON store; the key is ready for a tenant id.
  return String(operator.tenant_id || operator.id || 'default');
}
function find(provider) {
  return db.col('ota_rating_connections').find(
    row => row.tenant_key === tenantKey() && row.provider === provider
  );
}
function requireProvider(req, res, next) {
  if (!PROVIDERS.includes(req.params.provider)) {
    return res.status(400).json({ success:false, message:'Unsupported OTA provider' });
  }
  next();
}
function present(provider) {
  const row = find(provider);
  return {
    provider,
    username: row?.username || '',
    password_saved: Boolean(row?.password_encrypted),
    configured: Boolean(row?.username && row?.password_encrypted),
    last_saved_at: row?.updated_at || row?.created_at || null,
    last_fetched_at: null,
    auto_fetch_active: false,
    live_connector_available: false,
    refresh_every_hours: REFRESH_HOURS,
    data_source: 'gds_records'
  };
}
function respondError(res, error) {
  // Never log or echo the submitted password, raw request, or encrypted payload.
  return res.status(error.status || 500).json({ success:false, message:error.message });
}

router.get('/ota-ratings/settings', can('settings.view'), (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  return res.json({
    providers: Object.fromEntries(PROVIDERS.map(p => [p, present(p)])),
    refresh_every_hours: REFRESH_HOURS,
    live_connector_available: false
  });
});

router.put('/ota-ratings/settings/:provider', can('settings.modify'), requireProvider, (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    const provider = req.params.provider;
    const body = req.body || {};
    if (typeof body.username !== 'string' || body.username.length > 256 || /[\u0000-\u001f]/.test(body.username)) {
      return res.status(400).json({ success:false, message:'Enter a valid username (up to 256 characters)' });
    }
    if (body.password !== undefined && (typeof body.password !== 'string' || body.password.length > 1024)) {
      return res.status(400).json({ success:false, message:'Invalid password' });
    }
    const username = body.username.trim();
    const existing = find(provider);
    // The blank password is intentionally a no-op so a saved password is retained.
    if (body.password && !username) {
      return res.status(400).json({ success:false, message:'Enter the username before saving a password' });
    }
    const password_encrypted = body.password ? encrypt(body.password) : (existing?.password_encrypted || null);
    const changes = { username, password_encrypted, updated_by: req.user.real_user_id || req.user.id };
    if (existing) db.col('ota_rating_connections').update(existing.id, changes);
    else db.col('ota_rating_connections').insert({ tenant_key:tenantKey(), provider, ...changes });
    return res.json({ success:true, settings:present(provider), message:'OTA account settings saved; live collection is not yet connected.' });
  } catch (error) { return respondError(res, error); }
});

router.post('/ota-ratings/refresh/:provider', can('dailyops.view'), requireProvider, (_req, res) => {
  // Do not claim a refresh succeeded or schedule an unimplemented 3-hour poll.
  return res.status(409).json({
    success:false, code:'OTA_CONNECTOR_NOT_AVAILABLE',
    message:'GDS ratings can be refreshed locally, but live OTA collection needs a permitted, verified provider connector. Saving a username and password does not activate a feed.'
  });
});

module.exports = router;
module.exports._test = { secretKey, encrypt, present, tenantKey };
