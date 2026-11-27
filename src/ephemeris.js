// 天体历表：JPL 近似行星轨道根数（1800–2050）、Schlyter 月球理论、Meeus 伽利略卫星、IAU 自转参数
const DEG = Math.PI / 180;
export const AU = 149597870.7;
export const OBLIQUITY = 23.43928 * DEG;

// 自 J2000.0 起的地球时（TT）日数；TT ≈ UTC + 69.184 s
export const daysSinceJ2000 = (ms) => (ms + 69184) / 86400000 + 2440587.5 - 2451545.0;

// a(AU) e I L 近日点经度 升交点经度 + 每儒略世纪变化率（JPL Table 1）
const EL = {
  mercury: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593, 0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  venus: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255, 0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  emb: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0, 0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  mars: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  jupiter: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  saturn: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, -0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  uranus: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503, -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  neptune: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574, 0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
  pluto: [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684, -0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482],
};

export function elementsAt(id, T) {
  const v = EL[id];
  return {
    a: v[0] + v[6] * T, e: v[1] + v[7] * T, I: (v[2] + v[8] * T) * DEG,
    L: (v[3] + v[9] * T) * DEG, peri: (v[4] + v[10] * T) * DEG, node: (v[5] + v[11] * T) * DEG,
  };
}

export function kepler(M, e) {
  M = ((((M + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 12; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-13) break;
  }
  return E;
}

export function orbitPoint(el, E) {
  const x = el.a * (Math.cos(E) - el.e);
  const y = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const w = el.peri - el.node, O = el.node, I = el.I;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  return [
    ((cw * cO - sw * sO * cI) * x + (-sw * cO - cw * sO * cI) * y) * AU,
    ((cw * sO + sw * cO * cI) * x + (-sw * sO + cw * cO * cI) * y) * AU,
    (sw * sI * x + cw * sI * y) * AU,
  ];
}

// 日心黄道坐标（J2000），单位 km
export function planetPos(id, d) {
  const el = elementsAt(id, d / 36525);
  return orbitPoint(el, kepler(el.L - el.peri, el.e));
}

// 地心月球位置（黄道 J2000，km）
export function moonGeo(d) {
  const ds = d + 1.5;
  const sin = Math.sin, cos = Math.cos;
  const N = (125.1228 - 0.0529538083 * ds) * DEG, i = 5.1454 * DEG;
  const w = (318.0634 + 0.1643573223 * ds) * DEG, a = 60.2666, e = 0.0549;
  const M = (115.3654 + 13.0649929509 * ds) * DEG;
  const Ms = (356.047 + 0.9856002585 * ds) * DEG, ws = (282.9404 + 4.70935e-5 * ds) * DEG;
  const E = kepler(M, e);
  const xv = a * (cos(E) - e), yv = a * Math.sqrt(1 - e * e) * sin(E);
  const v = Math.atan2(yv, xv), r = Math.hypot(xv, yv);
  const xh = r * (cos(N) * cos(v + w) - sin(N) * sin(v + w) * cos(i));
  const yh = r * (sin(N) * cos(v + w) + cos(N) * sin(v + w) * cos(i));
  const zh = r * sin(v + w) * sin(i);
  let lon = Math.atan2(yh, xh), lat = Math.atan2(zh, Math.hypot(xh, yh));
  const Ls = Ms + ws, Lm = M + w + N, D = Lm - Ls, F = Lm - N;
  lon += DEG * (-1.274 * sin(M - 2 * D) + 0.658 * sin(2 * D) - 0.186 * sin(Ms) - 0.059 * sin(2 * M - 2 * D)
    - 0.057 * sin(M - 2 * D + Ms) + 0.053 * sin(M + 2 * D) + 0.046 * sin(2 * D - Ms) + 0.041 * sin(M - Ms)
    - 0.035 * sin(D) - 0.031 * sin(M + Ms) - 0.015 * sin(2 * F - 2 * D) + 0.011 * sin(M - 4 * D));
  lat += DEG * (-0.173 * sin(F - 2 * D) - 0.055 * sin(M - F - 2 * D) - 0.046 * sin(M + F - 2 * D)
    + 0.033 * sin(F + 2 * D) + 0.017 * sin(2 * M + F));
  const dist = (r - 0.58 * cos(M - 2 * D) - 0.46 * cos(2 * D)) * 6378.137;
  lon -= 1.3969713 * DEG * (d / 36525); // 岁差：当日黄道 -> J2000
  return [dist * cos(lat) * cos(lon), dist * cos(lat) * sin(lon), dist * sin(lat)];
}

// IAU WGCCRE 自转参数：[北极赤经 α0, 北极赤纬 δ0, 本初子午线 W]（度）
export function orient(id, d) {
  const T = d / 36525, s = (x) => Math.sin(x * DEG), c = (x) => Math.cos(x * DEG);
  switch (id) {
    case 'sun': return [286.13, 63.87, 84.176 + 14.1844 * d];
    case 'mercury': return [281.0103 - 0.0328 * T, 61.4155 - 0.0049 * T, 329.5988 + 6.1385108 * d];
    case 'venus': return [272.76, 67.16, 160.2 - 1.4813688 * d];
    case 'earth': return [0.0 - 0.641 * T, 90.0 - 0.557 * T, 190.147 + 360.9856235 * d];
    case 'moon': {
      const E1 = 125.045 - 0.0529921 * d, E2 = 250.089 - 0.1059842 * d, E3 = 260.008 + 13.0120009 * d;
      return [
        269.9949 + 0.0031 * T - 3.8787 * s(E1) - 0.1204 * s(E2) + 0.07 * s(E3),
        66.5392 + 0.013 * T + 1.5419 * c(E1) + 0.0239 * c(E2) - 0.0278 * c(E3),
        38.3213 + 13.17635815 * d + 3.561 * s(E1) + 0.1208 * s(E2) - 0.0642 * s(E3),
      ];
    }
    case 'mars': return [317.68143 - 0.1061 * T, 52.8865 - 0.0609 * T, 176.63 + 350.89198226 * d];
    case 'jupiter': return [268.056595 - 0.006499 * T, 64.495303 + 0.002413 * T, 284.95 + 870.536 * d];
    case 'saturn': return [40.589 - 0.036 * T, 83.537 - 0.004 * T, 38.9 + 810.7939024 * d];
    case 'uranus': return [257.311, -15.175, 203.81 - 501.1600928 * d];
    case 'neptune': {
      const N = 357.85 + 52.316 * T;
      return [299.36 + 0.7 * s(N), 43.46 - 0.51 * c(N), 249.978 + 541.1397757 * d - 0.48 * s(N)];
    }
    case 'pluto': return [132.993, -6.163, 302.695 + 56.3625225 * d];
  }
  return null;
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function eqToEcl([x, y, z]) {
  const c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY);
  return [x, c * y + s * z, -s * y + c * z];
}
export function radecToEcl(raDeg, decDeg) {
  const a = raDeg * DEG, d = decDeg * DEG;
  return eqToEcl([Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]);
}

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

// 伽利略卫星（Meeus 第 44 章低精度算法），返回相对木星的黄道坐标 km
export function galilean(d, jup, earth, poleZ) {
  const s = (x) => Math.sin(x * DEG), c = (x) => Math.cos(x * DEG);
  const V = 172.74 + 0.00111588 * d, M = 357.529 + 0.9856003 * d;
  const N = 20.02 + 0.0830853 * d + 0.329 * s(V), J = 66.115 + 0.9025179 * d - 0.329 * s(V);
  const A = 1.915 * s(M) + 0.02 * s(2 * M), B = 5.555 * s(N) + 0.168 * s(2 * N);
  const K = J + A - B;
  const R = 1.00014 - 0.01671 * c(M) - 0.00014 * c(2 * M);
  const r = 5.20872 - 0.25208 * c(N) - 0.00611 * c(2 * N);
  const Dl = Math.sqrt(r * r + R * R - 2 * r * R * c(K));
  const psi = Math.asin((R / Dl) * s(K)) / DEG;
  const t = d - Dl / 173;
  let u1 = 163.8069 + 203.4058646 * t + psi - B;
  let u2 = 358.414 + 101.2916335 * t + psi - B;
  let u3 = 5.7176 + 50.234518 * t + psi - B;
  let u4 = 224.8092 + 21.48798 * t + psi - B;
  const G = 331.18 + 50.310482 * t, H = 87.45 + 21.569231 * t;
  const r1 = 5.9057 - 0.0244 * c(2 * (u1 - u2)), r2 = 9.3966 - 0.0882 * c(2 * (u2 - u3));
  const r3 = 14.9883 - 0.0216 * c(G), r4 = 26.3627 - 0.1939 * c(H);
  const c1 = 0.473 * s(2 * (u1 - u2)), c2 = 1.065 * s(2 * (u2 - u3)), c3 = 0.165 * s(G), c4 = 0.843 * s(H);
  u1 += c1; u2 += c2; u3 += c3; u4 += c4;
  // u 从下合（朝向地球方向）起算，在木星赤道面内顺行
  let e1 = [earth[0] - jup[0], earth[1] - jup[1], earth[2] - jup[2]];
  const k = e1[0] * poleZ[0] + e1[1] * poleZ[1] + e1[2] * poleZ[2];
  e1 = e1.map((v, i) => v - k * poleZ[i]);
  const len = Math.hypot(...e1); e1 = e1.map((v) => v / len);
  const e2 = cross(poleZ, e1);
  const RJ = 71492;
  return [[r1, u1], [r2, u2], [r3, u3], [r4, u4]].map(([rr, u]) =>
    [0, 1, 2].map((i) => rr * RJ * (c(u) * e1[i] + s(u) * e2[i])));
}
