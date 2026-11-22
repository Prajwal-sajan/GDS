// Shared helpers: dates, money, ids, geo.
const crypto = require('crypto');

const pad = (n, l = 2) => String(n).padStart(l, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const addDays = (dateStr, n) => { const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
const dateRange = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
const dow = (dateStr) => new Date(dateStr + 'T00:00:00').getDay();
const toMin = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const fromMin = (m) => { m = ((m % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
 // Operator stop times can be local HH:mm or offset-aware ISO timestamps.
 const localMinutes = (value, timeZone='Asia/Kolkata') => {
   const s=String(value??'').trim();if(!s)return null;
   const hasOffset=/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:?\d{2})$/i.test(s);
   if(hasOffset){
     const d=new Date(s);if(!Number.isFinite(d.getTime()))return null;
     const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).filter(x=>x.type==='hour'||x.type==='minute').map(x=>[x.type,Number(x.value)]));
     return parts.hour*60+parts.minute;
   }
   const m=s.match(/(?:^|T|\s)(\d{1,2}):(\d{2})(?::\d{2})?/);
   if(!m||Number(m[1])>23||Number(m[2])>59)return null;
   return Number(m[1])*60+Number(m[2]);
 };
 const clockDifference = (actual,scheduled,zone='Asia/Kolkata') => {
   const a=localMinutes(actual,zone),s=localMinutes(scheduled,zone);
   return a===null||s===null?null:((a-s+720+1440)%1440)-720;
 };
 
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const groupBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); (m[k] = m[k] || []).push(x); return m; }, {});
const uid = (n = 8) => crypto.randomBytes(n).toString('hex');
const nowIso = () => new Date().toISOString();

// Deterministic PRNG so the seed is reproducible.
function rng(seed = 42) {
  let s = seed >>> 0;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  r.int = (a, b) => a + Math.floor(r() * (b - a + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}

function haversineKm(a, b) {
  const R = 6371, t = (x) => (x * Math.PI) / 180;
  const dLat = t(b.lat - a.lat), dLng = t(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

module.exports = { pad, ymd, today, addDays, daysBetween, dateRange, dow, toMin, fromMin, localMinutes, clockDifference, round2, sum, groupBy, uid, nowIso, rng, haversineKm };
