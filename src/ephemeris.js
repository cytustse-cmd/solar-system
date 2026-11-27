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

// JPL SSD mean-element seeds (https://ssd.jpl.nasa.gov/sats/elem/), refined against
// 1800–2100 planetocentric Horizons vectors sampled every 193 days, plus a recent 23-day grid.
// JD 2451545.0 TDB: parent, a (km), e, inclination, node, node rate,
// periapsis longitude, periapsis rate, mean longitude, sidereal rate, [pole RA, Dec].
// Angles in degrees, rates per Julian year. Longitudes use ω + sΩ (+ M), s = ±1.
const SATELLITES = {
  phobos: ['mars', 9374.928, 0.01510108, 1.07491, 169.149503, -159.17182258, 25.575736, 158.95056584, -144.8343548, 412310.5471941427, 317.7, 52.9],
  deimos: ['mars', 23457.3, 0, 1.795728, 54.417837, -6.59913831, 0, 0, -100.5398469, 104155.3793058688, 316.6, 53.5],
  mimas: ['saturn', 185535.044, 0.01965707, 1.572822, 173.024311, -365.06714417, 145.605579, 365.58572841, 160.3123242, 139523.4905381941, 40.6, 83.5],
  enceladus: ['saturn', 238035.764, 0.00473894, 0, 0, 0, 171.538508, 123.44123486, -177.7441632, 95962.8255910734, 40.6, 83.5],
  tethys: ['saturn', 294673.119, 0, 1.091454, -100.246541, -72.26449946, 0, 0, -171.6258787, 69652.4124089475, 40.6, 83.5],
  dione: ['saturn', 377415.067, 0.00219727, 0, 0, 0, -145.259254, 30.77234773, 176.898528, 48043.1335282311, 40.6, 83.5],
  rhea: ['saturn', 527067.491, 0.00096978, 0.331692, -8.297049, -10.04655194, -156.522501, 0.50615709, 52.1558058, 29106.7895470208, 40.6, 83.5],
  titan: ['saturn', 1221863.658, 0.02884197, 0.327749, 24.177622, -0.49924134, -151.652687, 0.51106354, 11.7243172, 8246.2405691792, 36.4, 84],
  iapetus: ['saturn', 3560833.331, 0.02840918, 4.492486, 62.112128, -0.14338453, -8.848793, 0.10965746, -159.8274767, 1657.4875393671, 288.7, 78.9],
  miranda: ['uranus', 129847.873, 0.0013588, 4.42699, 100.875369, -20.23978062, -104.170398, 20.03208768, -31.4111984, 93025.7670450357],
  ariel: ['uranus', 190930.152, 0, 0, 0, 0, 0, 0, -156.8811724, 52170.7219900966],
  umbriel: ['uranus', 265980.627, 0.00400144, 0.08823, -173.187649, -2.59247585, -6.590359, 2.81653083, -108.7592147, 31728.856454778],
  titania: ['uranus', 436313.628, 0.00103248, 0.095872, 30.024814, -0.24231067, -136.494781, 0.47788657, -78.4388876, 15103.6043233696],
  oberon: ['uranus', 583450.065, 0.00152012, 0.149714, 23.915622, -0.17721701, -157.172591, 0.32704618, -7.4404977, 9766.5958854158],
  triton: ['neptune', 354759.076, 0, 156.922703, 177.736773, 0.52587201, 0, 0, -119.2423146, 22374.2144510507, 299.4105366, 43.36565026],
  charon: ['pluto', 19595.852, 0, 0, 0, 0, 0, 0, -55.8742088, 20586.4142201969],
};
// Free precession plus forced pole offsets: x + iy = sin(i) exp(iΩ).
const SATELLITE_TILT = {
  phobos: [-0.00032186247, 0.00016394559],
  enceladus: [-0.00068108516, -0.00000687916],
  dione: [-0.00075825464, -0.00006620059],
  iapetus: [-0.00185185853, 0.05783356549, 0.00008003584, 0.00003115525],
  ariel: [0.00015205605, 0.00007265198],
  charon: [0.00142721847, 0.00022211471],
};
// Coefficient of t² in degrees/Julian year², including Phobos's tidal acceleration.
const SATELLITE_PHASE_QUADRATIC = {
  phobos: 0.00125984877,
  ariel: -0.00002960668,
};
// Empirical longitude harmonics, including the Mimas–Tethys inclination resonance.
// [angular frequency in radians/Julian year, cosine amplitude, sine amplitude in degrees]
const SATELLITE_PHASE_TERMS = {
  mimas: [[0.0889264823, 27.46906778, -33.6598125], [0.266779447, 0.62740564, 0.33131225], [0.4446324117, -0.00830788, 0.01970816], [1.6933756327, -0.07205157, 0.1106523]],
  enceladus: [[0.5687488757, 0.25097312, 0.07248522], [1.6173815098, -0.12881625, 0.13727079]],
  tethys: [[0.0888829589, -1.32386295, 1.60996872], [0.2666488766, -0.03174169, -0.01441352], [1.6925838551, 0.00388257, -0.00510383]],
  iapetus: [[0.215736529, 0.03815912, -0.06429068], [3.9126596863, -0.03979733, 0.01235491]],
  miranda: [[0.5009295775, -0.95367891, 1.06838655], [1.0018591549, -0.17265293, 0.01968652], [1.5027887324, 0.01680201, 0.01056329]],
  ariel: [[0.5008523563, 0.06559444, -0.07251599], [1.0017047125, 0.0119411, -0.00116488]],
};
const JULIAN_YEAR = 365.25;
const MINOR_MOONS = Object.keys(SATELLITES);
// SBDB heliocentric osculating elements, J2000 ecliptic: https://ssd-api.jpl.nasa.gov/sbdb.api
// Epoch (JD TDB), a (AU), e, i, Ω, ω, M (°), n (°/day); solutions 75, K273/32, K284/1, K242/85.
const COMETS = {
  halley: [2439875.5, 17.92863504856923, .9679359956953211, 162.1905300439129, 59.09894720612437, 112.2414314637764, 274.3823371366792, .01298324443268444],
  encke: [2460676.5, 2.218262545825663, .8470390274144163, 11.34132270086944, 334.0134132510543, 187.2815335757859, 130.2041032820363, .2983215688230302],
  churyumov: [2457305.5, 3.462249490129549, .6409081308996354, 7.040294937543767, 50.13557377155012, 12.79824970228189, 8.859927425218402, .1529912291873851],
  ponsBrooks: [2460211.5, 17.18491452391846, .954561244241766, 74.19091025149504, 255.8553515784109, 198.9879991135792, 357.0928096847352, .01383512251682923],
};
const COMET_IDS = Object.keys(COMETS);

const J2000 = 2451545;
const wrapDegrees = (angle) => ((angle + 180) % 360 + 360) % 360 - 180;
function eccentricAnomaly(anomaly, e) {
  const M = wrapDegrees(anomaly) * DEG;
  let E = M + Math.sign(M) * .85 * e;
  for (let pass = 0; pass < 16; pass++) {
    const step = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= step;
    if (Math.abs(step) < 1e-12) break;
  }
  return E;
}
function ellipse(a, e, i, node, apsis, E) {
  const x = a * (Math.cos(E) - e), y = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cosW = Math.cos(apsis), sinW = Math.sin(apsis), cosN = Math.cos(node), sinN = Math.sin(node);
  const u = x * cosW - y * sinW, v = x * sinW + y * cosW;
  const vi = v * Math.cos(i);
  return [u * cosN - vi * sinN, u * sinN + vi * cosN, v * Math.sin(i)];
}
const EQUATORIAL_POLES = Object.fromEntries(['uranus', 'pluto'].map((id) => {
  const axis = A.RotationAxis(BODY[id], A.AstroTime.FromTerrestrialTime(0));
  // 天王星规则卫星以顺行的自转极为正极，不是 IAU 北极。
  return [id, id === 'uranus' ? [axis.ra * 15 + 180, -axis.dec] : [axis.ra * 15, axis.dec]];
}));
const MOON_AXES = Object.fromEntries(MINOR_MOONS.map((id) => {
  const [parent, , , , , , , , , , ra, dec] = SATELLITES[id];
  return [id, axesEcl(...(ra === undefined ? EQUATORIAL_POLES[parent] : [ra, dec]), 0)];
}));
function satelliteGeo(id, days) {
  const [, a, e, i, node, nodeRate, peri, periRate, lon, lonRate] = SATELLITES[id];
  const years = days / JULIAN_YEAR;
  const direction = i > 90 ? -1 : 1;
  let inclination = i * DEG, ascNode = wrapDegrees(node + nodeRate * years) * DEG;
  const tilt = SATELLITE_TILT[id];
  if (tilt) {
    const [x, y, dx = 0, dy = 0] = tilt;
    const s = Math.sin(inclination);
    const tx = s * Math.cos(ascNode) + x + dx * years;
    const ty = s * Math.sin(ascNode) + y + dy * years;
    inclination = Math.asin(Math.min(1, Math.hypot(tx, ty)));
    if (direction < 0) inclination = Math.PI - inclination;
    ascNode = Math.atan2(ty, tx);
  }
  const periLon = wrapDegrees(peri + periRate * years);
  let M = lon + lonRate * years + (SATELLITE_PHASE_QUADRATIC[id] ?? 0) * years ** 2 - periLon;
  const terms = SATELLITE_PHASE_TERMS[id];
  if (terms) for (const [frequency, c, s] of terms) {
    const angle = frequency * years;
    M += c * Math.cos(angle) + s * Math.sin(angle);
  }
  const [x, y, z] = ellipse(a, e, inclination, ascNode, periLon * DEG - direction * ascNode, eccentricAnomaly(M, e));
  const axes = MOON_AXES[id];
  return axes.X.map((v, k) => v * x + axes.Y[k] * y + axes.Z[k] * z);
}
function cometHelio(id, days) {
  const [epoch, a, e, i, node, w, m, n] = COMETS[id];
  const E = eccentricAnomaly(m + (days + J2000 - epoch) * n, e);
  return ellipse(a * AU, e, i * DEG, node * DEG, w * DEG, E);
}
function cometApparent(id, t) {
  const v = A.CorrectLightTravel((emit) => {
    const earth = helio('earth', emit);
    const [x, y, z] = cometHelio(id, emit.tt).map((p, i) => (p - earth[i]) / AU);
    return new A.Vector(x, y, z, emit);
  }, t);
  return [v.x * AU, v.y * AU, v.z * AU];
}

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

// System II west longitudes, unwrapped across 360°. Approximate GRS centers from the
// ALPO-Japan drift chart: https://alpo-j.sakura.ne.jp/Latest/j_Cylindrical_Maps/j20-26GRS_drift_chart.htm
// 2025-09-01: https://britastro.org/wp-content/uploads/2025/10/Report_2025-26_no-2_Minifigs.pdf
// Oct/Nov 2026 centers from ALPO-Japan System II maps:
// https://alpo-j.sakura.ne.jp/Latest/j_Cylindrical_Maps/j26mapsL2.htm
const JUPITER_GRS_ANCHORS = [
  [2020, 2, 1, 325], [2021, 8, 14, 360], [2022, 8, 14, 381.4],
  [2023, 8, 14, 399.2], [2024, 9, 10, 420.4], [2025, 2, 20, 429.6],
  [2025, 9, 1, 437], [2025, 11, 24, 438.6], [2026, 2, 17, 442.6],
  [2026, 6, 5, 449.6], [2026, 10, 19, 455.5], [2026, 11, 18, 455.5],
].map(([year, month, day, lon]) => [Date.UTC(year, month - 1, day), lon]);

function jupiterGrsLongitudeII(ms) {
  let [start, lon] = JUPITER_GRS_ANCHORS[0];
  if (ms <= start) return lon;
  for (let i = 1; i < JUPITER_GRS_ANCHORS.length; i++) {
    const [end, nextLon] = JUPITER_GRS_ANCHORS[i];
    if (ms <= end) return lon + (nextLon - lon) * (ms - start) / (end - start);
    start = end; lon = nextLon;
  }
  return lon;
}

export function jupiterGrsLongitudeIII(t, frameSpin = orient('jupiter', t)[2]) {
  // IAU J2000: W₂ = 43.3° + 870.270°/d; W₃ = 284.95° + 870.536°/d (orient).
  // A west longitude increases by W₃ − W₂; frameSpin may be the render frame's W₃.
  const W2 = 43.3 + 870.27 * t.tt;
  return wrapDegrees(jupiterGrsLongitudeII(t.date.getTime()) + (frameSpin - W2));
}

export function earthFixed(t) {
  const angle = A.SiderealTime(t) * 15 * DEG;
  const c = Math.cos(angle), s = Math.sin(angle), rot = A.Rotation_EQD_EQJ(t);
  const axis = (x, y, z) => {
    const v = A.RotateVector(rot, new A.Vector(x, y, z, t));
    return eqToEcl([v.x, v.y, v.z]);
  };
  return { X: axis(c, s, 0), Y: axis(-s, c, 0), Z: axis(0, 0, 1) };
}

export function groundObserver(lat, lon) { return new A.Observer(lat, lon, 2); }

export function skyPositions(t, P, observer) {
  const geo = A.ObserverVector(t, observer, false);
  const rot = A.Rotation_EQJ_EQD(t);
  const [ex, ey, ez] = P.earth;
  const out = {};
  for (const [id, [px, py, pz]] of Object.entries(P)) {
    if (id === 'earth') continue;
    const x = (px - ex) / AU, y = (py - ey) / AU, z = (pz - ez) / AU;
    const top = new A.Vector(x - geo.x, C * y - S * z - geo.y, S * y + C * z - geo.z, t);
    const eq = A.EquatorFromVector(A.RotateVector(rot, top));
    const hor = A.Horizon(t, observer, eq.ra, eq.dec, 'normal');
    out[id] = { alt: hor.altitude, az: hor.azimuth, distance: eq.dist * AU };
  }
  return out;
}

export function skyRiseSet(id, start, end, observer) {
  if (!Object.hasOwn(BODY, id) || id === 'earth' || id === 'emb') return null;
  const limit = end + 366 * 86400000;
  const crossings = [1, -1].map((direction) => {
    const times = [];
    for (let ms = start;;) {
      const peak = A.SearchRiseSet(BODY[id], observer, direction, new Date(ms), (limit - ms) / 86400000, observer.height);
      if (!peak) break;
      const next = peak.date.getTime();
      times.push(next);
      if (next >= end) break;
      ms = next + 1000;
    }
    return times;
  });
  return (ms) => crossings.map((times) => times.find((t) => t >= ms && t <= ms + 366 * 86400000) ?? null);
}

export function state(ms, apparent = false) {
  const t = A.MakeTime(new Date(ms));
  const P = { earth: helio('earth', t) };
  const fromEarth = (offset) => P.earth.map((v, i) => v + offset[i]);
  const emission = {};
  if (apparent) {
    for (const id of ['sun', ...PLANETS, 'moon']) {
      if (id === 'earth') continue;
      const vector = A.BackdatePosition(t, A.Body.Earth, BODY[id], true);
      emission[id] = vector.t;
      P[id] = fromEarth(vecKm(vector));
    }
  } else {
    P.sun = [0, 0, 0];
    for (const id of PLANETS) if (id !== 'earth') P[id] = helio(id, t);
    P.moon = fromEarth(moonGeo(t));
  }
  const g = galilean(emission.jupiter ?? t);
  GAL.forEach((id, i) => { P[id] = P.jupiter.map((v, j) => v + g[i][j]); });
  for (const id of MINOR_MOONS) {
    const [parent] = SATELLITES[id];
    const offset = satelliteGeo(id, (emission[parent] ?? t).tt);
    P[id] = P[parent].map((v, i) => v + offset[i]);
  }
  const cometDistance = {};
  for (const id of COMET_IDS) {
    const geometric = cometHelio(id, t.tt);
    cometDistance[id] = Math.hypot(...geometric);
    P[id] = apparent ? fromEarth(cometApparent(id, t)) : geometric;
  }
  return { t, P, gal: g, cometDistance, jupiterTime: emission.jupiter ?? t };
}

// 以当前时刻为中心采样一个周期的轨迹（日心或母星心，km）
export const PERIOD = {
  mercury: 87.969, venus: 224.701, emb: 365.256, mars: 686.98, jupiter: 4332.59, saturn: 10759.22,
  uranus: 30688.5, neptune: 60182, pluto: 90560, moon: 27.3217,
  io: 1.769138, europa: 3.551181, ganymede: 7.154553, callisto: 16.689018,
  ...Object.fromEntries(MINOR_MOONS.map((id) => [id, 360 * JULIAN_YEAR / SATELLITES[id][9]])),
  ...Object.fromEntries(COMET_IDS.map((id) => [id, 360 / COMETS[id][7]])),
};
export function track(id, ms, n) {
  const P = PERIOD[id], out = new Float64Array((n + 1) * 3);
  const gi = GAL.indexOf(id);
  const days = daysSinceJ2000(ms);
  if (COMETS[id]) {
    const [epoch, a, e, i, node, w, m, rate] = COMETS[id];
    const E = eccentricAnomaly(m + (days + J2000 - epoch) * rate, e);
    for (let k = 0; k <= n; k++) {
      out.set(ellipse(a * AU, e, i * DEG, node * DEG, w * DEG, E + 2 * Math.PI * (k / n - 0.5)), k * 3);
    }
    return out;
  }
  for (let k = 0; k <= n; k++) {
    const offset = ((k / n) - 0.5) * P;
    if (SATELLITES[id]) {
      out.set(satelliteGeo(id, days + offset), k * 3);
      continue;
    }
    const t = A.MakeTime(new Date(ms + offset * 86400000));
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

function surfaceUmbra(t) {
  // 与 Astronomy Engine 的 GeoidIntersect 一致：将地球椭球拉伸成球后求日侧交点。
  const rot = A.Rotation_EQJ_EQD(t);
  const m = A.RotateVector(rot, A.GeoMoon(t)), s = A.RotateVector(rot, A.GeoVector(A.Body.Sun, t, true));
  const flattening = 0.996647180302104;
  const x = m.x - s.x, y = m.y - s.y, z = (m.z - s.z) / flattening, mz = m.z / flattening;
  const norm = Math.hypot(x, y, z);
  const along = -(m.x * x + m.y * y + mz * z) / norm;
  const miss = Math.hypot(m.x + along * x / norm, m.y + along * y / norm, mz + along * z / norm);
  const radicand = (6378.1366 / AU) ** 2 - miss ** 2;
  if (radicand < 0) return null;
  const fraction = (along - Math.sqrt(radicand)) / norm;
  return 1736 - (695700 - 1736) * fraction;
}

function solarKind({ kind, peak }) {
  if (kind === 'partial') return '日偏食';
  const fallback = kind === 'total' ? '日全食' : '日环食';
  const center = surfaceUmbra(peak);
  if (center === null) return fallback;
  const umbra = (minutes) => surfaceUmbra(peak.AddDays(minutes / 1440));
  for (const sign of [-1, 1]) {
    let inside = 0, outside = 180, edge = center;
    // 二分定位中心线与地球相切的位置，避免错过两端极短的环食阶段。
    while (outside - inside > 1e-6) {
      const mid = (inside + outside) / 2;
      const radius = umbra(sign * mid);
      if (radius === null) outside = mid;
      else { inside = mid; edge = radius; }
    }
    if ((edge > 0) !== (center > 0)) return '混合食';
    for (let minute = 1; minute < inside; minute++) {
      if ((umbra(sign * minute) > 0) !== (center > 0)) return '混合食';
    }
  }
  return fallback;
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
