import * as A from '../vendor/astronomy.js';
import { ecfToLookAngles, eciToEcf, gstime, propagate, twoline2satrec } from '../vendor/satellite.es.js';
import { eqToEcl } from './ephemeris.js';

const DAY_MS = 86400000, MAX_AGE = 14 * DAY_MS;
const RAD = Math.PI / 180;
const EARTH_RADIUS = 6378.1366, SUN_RADIUS = 695700;

function validLine(line) {
  if (!line || !/^\d$/.test(line[68])) return false;
  let sum = 0;
  for (const char of line.slice(0, 68)) sum += char === '-' ? 1 : Number(char) || 0;
  return sum % 10 === Number(line[68]);
}

export function parseTle(text) {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((line) => line.startsWith('1 25544'));
  const l1 = lines[i], l2 = lines[i + 1];
  if (!validLine(l1) || !l2?.startsWith('2 25544') || !validLine(l2)) return null;
  const sat = twoline2satrec(l1, l2);
  const epoch = (sat.jdsatepoch - 2440587.5) * DAY_MS;
  if (!Number.isFinite(epoch) || sat.error || !(sat.no > 0) || !teme(sat, new Date(epoch))) return null;
  return { sat, epoch, period: 2 * Math.PI / sat.no * 60000 };
}

export function isFresh(tle, ms) { return !!tle && Math.abs(ms - tle.epoch) <= MAX_AGE; }

function teme(sat, date) {
  const p = propagate(sat, date)?.position;
  return p && [p.x, p.y, p.z].every(Number.isFinite) ? p : null;
}

function temeToEqj(p, t) {
  // TEME 使用平春分点；转到真春分点后才能用 EQD → EQJ。
  const eqeq = A.SiderealTime(t) * 15 * RAD - gstime(t.date);
  const c = Math.cos(eqeq), s = Math.sin(eqeq);
  return A.RotateVector(A.Rotation_EQD_EQJ(t), new A.Vector(c * p.x - s * p.y, s * p.x + c * p.y, p.z, t));
}

export function position(tle, t) {
  if (!isFresh(tle, t.date.getTime())) return null;
  const p = teme(tle.sat, t.date);
  if (!p) return null;
  const { x, y, z } = temeToEqj(p, t);
  return eqToEcl([x, y, z]);
}

function sunlit(p, sun) {
  const dist = Math.hypot(sun.x, sun.y, sun.z);
  const along = (p.x * sun.x + p.y * sun.y + p.z * sun.z) / dist;
  if (along >= 0) return true;
  const umbra = EARTH_RADIUS + along * (SUN_RADIUS - EARTH_RADIUS) / dist;
  return Math.hypot(p.x, p.y, p.z) ** 2 - along ** 2 > umbra ** 2;
}

export function visiblePass(tle, ms, observer) {
  if (!isFresh(tle, ms)) return null;
  const site = { latitude: observer.latitude * RAD, longitude: observer.longitude * RAD, height: observer.height / 1000 };
  const end = Math.min(ms + 3 * DAY_MS, tle.epoch + MAX_AGE);
  let pass = null, last = ms;
  for (let now = ms; now <= end; now += 10000) {
    const date = new Date(now), p = teme(tle.sat, date);
    if (!p) return null;
    const look = ecfToLookAngles(site, eciToEcf(p, gstime(date)));
    if (look.elevation >= 10 * RAD) {
      const t = A.MakeTime(date);
      const eq = A.Equator(A.Body.Sun, t, observer, true, true);
      if (A.Horizon(t, observer, eq.ra, eq.dec).altitude < -6) {
        const sun = A.GeoVector(A.Body.Sun, t, true);
        if (sunlit(temeToEqj(p, t), { x: sun.x * A.KM_PER_AU, y: sun.y * A.KM_PER_AU, z: sun.z * A.KM_PER_AU })) {
          const alt = look.elevation / RAD;
          if (!pass) pass = { start: now, az: look.azimuth / RAD, maxAlt: alt };
          pass.maxAlt = Math.max(pass.maxAlt, alt);
          last = now;
          continue;
        }
      }
    }
    if (pass) return { ...pass, end: Math.max(last, now - 5000) };
  }
  return null;
}
