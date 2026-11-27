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
export function eclipseSun(t) { return vecKm(A.GeoVector(A.Body.Sun, t, true)); }
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

const SEASONS = [
  ['mar_equinox', '春分', '太阳由南向北越过天赤道'],
  ['jun_solstice', '夏至', '太阳直射位置最偏北'],
  ['sep_equinox', '秋分', '太阳由北向南越过天赤道'],
  ['dec_solstice', '冬至', '太阳直射位置最偏南'],
];

function solarKind({ kind, peak }) {
  if (kind === 'partial') return '日偏食';
  let total = false, annular = false;
  for (let minutes = -180; minutes <= 180; minutes += 2) {
    const t = peak.AddDays(minutes / 1440);
    const m = A.GeoMoon(t), s = A.GeoVector(A.Body.Sun, t, true);
    const x = m.x - s.x, y = m.y - s.y, z = m.z - s.z;
    const dist = Math.hypot(x, y, z);
    const along = -(m.x * x + m.y * y + m.z * z) / dist;
    const miss = Math.hypot(m.x + along * x / dist, m.y + along * y / dist, m.z + along * z / dist) * AU;
    if (miss >= 6371) continue;
    const surface = along * AU - Math.sqrt(6371 ** 2 - miss ** 2);
    const umbra = 1736 - (695700 - 1736) * surface / (dist * AU);
    if (umbra > 0) total = true; else annular = true;
    if (total && annular) return '日全环食';
  }
  return kind === 'total' ? '日全食' : '日环食';
}

export function upcomingEvents(ms, end, limit = 12) {
  if (!Number.isFinite(ms) || ms > end || limit <= 0) return [];
  const start = new Date(ms);
  const eclipse = (find, next, type, body) => function* () {
    for (let e = find(start); ; e = next(e.peak)) yield { ms: e.peak.date.getTime(), type, body, eclipse: e };
  }();
  const sources = [
    eclipse(A.SearchGlobalSolarEclipse, A.NextGlobalSolarEclipse, 'solar', 'earth'),
    eclipse(A.SearchLunarEclipse, A.NextLunarEclipse, 'lunar', 'moon'),
    (function* () {
      for (let y = start.getUTCFullYear(); ; y++) {
        const s = A.Seasons(y);
        for (const [key, name, detail] of SEASONS) yield { ms: s[key].date.getTime(), body: 'earth', name, detail };
      }
    })(),
  ];
  for (const id of ['mercury', 'venus']) sources.push((function* () {
    for (let t = start; ;) {
      const e = A.SearchMaxElongation(BODY[id], t), evening = e.visibility === 'evening';
      yield { ms: e.time.date.getTime(), body: 'earth', planet: id, name: evening ? '东大距' : '西大距',
        detail: `与太阳相距 ${e.elongation.toFixed(1)}° · ${evening ? '日落后' : '日出前'}可见` };
      t = e.time.AddDays(1);
    }
  })());
  for (const id of ['mars', 'jupiter', 'saturn', 'uranus', 'neptune']) sources.push((function* () {
    for (let t = start; ;) {
      const e = A.SearchRelativeLongitude(BODY[id], 0, t);
      yield { ms: e.date.getTime(), body: id, planet: id, name: '冲日', detail: '与太阳分别位于地球天空的两侧' };
      t = e.AddDays(1);
    }
  })());
  const heads = sources.map((source) => {
    let event = source.next().value;
    while (event.ms < ms) event = source.next().value;
    return event;
  });
  const events = [];
  while (events.length < limit) {
    const i = heads.reduce((best, e, j) => e.ms < heads[best].ms ? j : best, 0);
    const { eclipse: e, ...event } = heads[i];
    if (event.ms > end) break;
    if (event.type === 'solar') {
      const coord = (value, pos, neg) => `${value < 0 ? neg : pos}${Math.abs(value).toFixed(1)}°`;
      event.name = solarKind(e);
      event.detail = Number.isFinite(e.latitude) ? `食甚中心：${coord(e.latitude, '北纬', '南纬')} · ${coord(e.longitude, '东经', '西经')}` : '可见范围内，月球遮住部分太阳';
    } else if (event.type === 'lunar') {
      event.name = { total: '月全食', partial: '月偏食', penumbral: '半影月食' }[e.kind];
      const [phase, duration] = e.sd_total ? ['全食', e.sd_total] : e.sd_partial ? ['偏食', e.sd_partial] : ['半影阶段', e.sd_penum];
      event.detail = `${phase}持续约 ${Math.round(2 * duration)} 分钟`;
    }
    events.push(event);
    heads[i] = sources[i].next().value;
  }
  return events;
}
