// 天体历表：Astronomy Engine（VSOP87 行星、ELP/MPP02 截断月球、TOP2013 外行星、冥王星数值积分、
// L1.2 伽利略卫星、IAU WGCCRE 2015 自转参数、IAU2000B 章动与岁差的地球自转轴）
import * as A from '../vendor/astronomy.js';

const DEG = Math.PI / 180;
export const AU = 149597870.7;
export const OBLIQUITY = 23.4392911 * DEG; // J2000 平黄赤交角（EQJ → ECL）

export const daysSinceJ2000 = (ms) => A.MakeTime(new Date(ms)).tt;

const C = Math.cos(OBLIQUITY), S = Math.sin(OBLIQUITY);
export function eqToEcl([x, y, z]) { return [x, C * y + S * z, -S * y + C * z]; }
const vecKm = (v) => eqToEcl([v.x * AU, v.y * AU, v.z * AU]);

export function radecToEcl(raDeg, decDeg) {
  const a = raDeg * DEG, d = decDeg * DEG;
  return eqToEcl([Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]);
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// 天体固连坐标轴（X 指向本初子午线，Z 指向北极）在黄道坐标中的表示
export function axesEcl(aDeg, dDeg, WDeg) {
  const a = aDeg * DEG, dl = dDeg * DEG, W = WDeg * DEG;
  const p = [Math.cos(dl) * Math.cos(a), Math.cos(dl) * Math.sin(a), Math.sin(dl)];
  const n = [-Math.sin(a), Math.cos(a), 0];
  const pn = cross(p, n);
  const X = [0, 1, 2].map((k) => n[k] * Math.cos(W) + pn[k] * Math.sin(W));
  const Y = cross(p, X);
  return { X: eqToEcl(X), Y: eqToEcl(Y), Z: eqToEcl(p) };
}

const BODY = {
  sun: A.Body.Sun, mercury: A.Body.Mercury, venus: A.Body.Venus, earth: A.Body.Earth, moon: A.Body.Moon,
  mars: A.Body.Mars, jupiter: A.Body.Jupiter, saturn: A.Body.Saturn, uranus: A.Body.Uranus,
  neptune: A.Body.Neptune, pluto: A.Body.Pluto, emb: A.Body.EMB,
};
const PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
export const GAL = ['io', 'europa', 'ganymede', 'callisto'];

// 日心黄道 J2000 坐标（km）
export function helio(id, t) { return vecKm(A.HelioVector(BODY[id], t)); }
export function moonGeo(t) { return vecKm(A.GeoMoon(t)); }
export function galilean(t) {
  const m = A.JupiterMoons(t);
  return GAL.map((k) => vecKm(m[k]));
}

// 自转：[北极赤经°, 北极赤纬°, 本初子午线角°]（J2000 赤道）
export function orient(id, t) {
  if (!(id in BODY) || id === 'emb') return null;
  const ax = A.RotationAxis(BODY[id], t);
  return [ax.ra * 15, ax.dec, ax.spin];
}

export function state(ms) {
  const t = A.MakeTime(new Date(ms));
  const P = { sun: [0, 0, 0] };
  for (const id of PLANETS) P[id] = helio(id, t);
  const mg = moonGeo(t);
  P.moon = P.earth.map((v, i) => v + mg[i]);
  const g = galilean(t);
  GAL.forEach((id, i) => { P[id] = P.jupiter.map((v, j) => v + g[i][j]); });
  return { t, P, gal: g };
}

// 以当前时刻为中心采样一个周期的轨迹（日心或母星心，km）
export const PERIOD = {
  mercury: 87.969, venus: 224.701, emb: 365.256, mars: 686.98, jupiter: 4332.59, saturn: 10759.22,
  uranus: 30688.5, neptune: 60182, pluto: 90560, moon: 27.3217,
  io: 1.769138, europa: 3.551181, ganymede: 7.154553, callisto: 16.689018,
};
export function track(id, ms, n) {
  const P = PERIOD[id], out = new Float64Array((n + 1) * 3);
  const gi = GAL.indexOf(id);
  for (let k = 0; k <= n; k++) {
    const t = A.MakeTime(new Date(ms + ((k / n) - 0.5) * P * 86400000));
    const v = id === 'moon' ? moonGeo(t) : gi >= 0 ? galilean(t)[gi] : helio(id, t);
    out.set(v, k * 3);
  }
  return out;
}
