import * as THREE from 'three';
import * as EPH from './ephemeris.js';
import * as ISS from './iss.js';

const DEG = Math.PI / 180;
const C_KMS = 299792.458;
const UP = new THREE.Vector3(0, 1, 0);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

// ---------- 渲染器 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.getElementById('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.001, 2e10);
scene.add(camera);

// 场景坐标：黄道 J2000，(x, y, z)_scene = (X, Z, -Y)_ecl，单位 km；相机始终位于原点（浮动原点）
const toScene = (a, out = new THREE.Vector3()) => out.set(a[0], a[2], -a[1]);

// ---------- 加载 ----------
const manager = new THREE.LoadingManager();
const lprog = document.getElementById('lprog');
manager.onProgress = (_u, done, total) => { lprog.style.width = `${(done / total) * 100}%`; };
let loaded = false;
manager.onLoad = () => {
  if (loaded) return;
  loaded = true;
  const l = document.getElementById('loading');
  l.style.opacity = 0;
  setTimeout(() => l.remove(), 700);
  if (!localStorage.getItem('ss-help-seen')) document.getElementById('help').classList.remove('hidden');
};
const tl = new THREE.TextureLoader(manager);
const maxAniso = renderer.capabilities.getMaxAnisotropy();
const nativeTextures = new Set(['neptune_2k.jpg', 'uranus_2k.jpg', 'plutomap1k.jpg', 'saturn_ring_4k.png']);
const texturePath = (file) => 'textures/' + (isTouch && !nativeTextures.has(file) ? '2k/' : '') + file;
function tex(file, srgb = true) {
  const t = tl.load(texturePath(file));
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, maxAniso);
  return t;
}

// ---------- 天体定义 ----------
const BODIES = [
  { id: 'sun', name: '太阳', R: 695700, view: 5, color: '#ffd27a', soi: Infinity, group: '恒星',
    facts: '半径 695,700 km · 自转约 25.4 天 · 表面温度约 5,772 K' },
  { id: 'mercury', name: '水星', R: 2439.7, tex: 'mercury_4k.jpg', view: 4, color: '#b9b2a8', soi: 1.12e5, group: '行星',
    facts: '半径 2,440 km · 一天 58.6 地球日 · 一年 88 天' },
  { id: 'venus', name: '金星', R: 6051.8, tex: 'venus_atmos_4k.jpg', view: 4, color: '#f3d9a6', soi: 6.16e5, group: '行星', atm: [0.035, [1.0, 0.85, 0.55], 1.3],
    facts: '半径 6,052 km · 逆向自转 243 天 · 一年 225 天' },
  { id: 'earth', name: '地球', R: 6371.0, view: 3.6, color: '#7fb4ff', soi: 9.24e5, group: '行星', atm: [0.02, [0.35, 0.6, 1.0], 1.2],
    facts: '半径 6,371 km · 一天 23 时 56 分 · 一年 365.256 天' },
  { id: 'moon', name: '月球', R: 1737.4, tex: 'moon_4k.jpg', view: 4, color: '#d9d9d9', soi: 6.6e4, parent: 'earth', group: '卫星',
    facts: '半径 1,737 km · 潮汐锁定 · 公转 27.32 天' },
  { id: 'mars', name: '火星', R: 3389.5, tex: 'mars_4k.jpg', view: 4, color: '#ff8a5c', soi: 5.77e5, group: '行星', atm: [0.012, [1.0, 0.6, 0.4], 0.5],
    facts: '半径 3,390 km · 一天 24 时 37 分 · 一年 687 天' },
  { id: 'jupiter', name: '木星', R: 71492, flat: 0.06487, tex: 'jupiter_4k.jpg', view: 4, color: '#e8c9a0', soi: 4.82e7, group: '行星',
    facts: '赤道半径 71,492 km · 一天 9 时 56 分 · 一年 11.86 年' },
  { id: 'io', name: '木卫一', R: 1821.6, view: 4, color: '#f1e27a', soi: 2e4, parent: 'jupiter', group: '卫星', noise: ['#d9c45a', '#f4ea9a', '#b9773a'],
    facts: '伊奥 · 半径 1,822 km · 公转 1.77 天 · 火山最活跃的天体' },
  { id: 'europa', name: '木卫二', R: 1560.8, view: 4, color: '#e9e2d0', soi: 2e4, parent: 'jupiter', group: '卫星', noise: ['#d8cbb0', '#f2ede2', '#a88a6a'],
    facts: '欧罗巴 · 半径 1,561 km · 公转 3.55 天 · 冰壳下有海洋' },
  { id: 'ganymede', name: '木卫三', R: 2634.1, view: 4, color: '#bfb3a2', soi: 3.2e4, parent: 'jupiter', group: '卫星', noise: ['#8f8577', '#c9c0b2', '#6d645a'],
    facts: '盖尼米德 · 半径 2,634 km · 公转 7.15 天 · 太阳系最大卫星' },
  { id: 'callisto', name: '木卫四', R: 2410.3, view: 4, color: '#9c8f80', soi: 5e4, parent: 'jupiter', group: '卫星', noise: ['#5e5448', '#8a7d6c', '#3f3832'],
    facts: '卡利斯托 · 半径 2,410 km · 公转 16.69 天' },
  { id: 'saturn', name: '土星', R: 60268, flat: 0.09796, tex: 'saturn_4k.jpg', view: 7, color: '#f0dca0', soi: 5.48e7, group: '行星',
    facts: '赤道半径 60,268 km · 一天 10 时 33 分 · 一年 29.46 年' },
  { id: 'uranus', name: '天王星', R: 25559, flat: 0.0229, tex: 'uranus_2k.jpg', view: 4, color: '#a8e4ea', soi: 5.18e7, group: '行星', atm: [0.02, [0.6, 0.9, 1.0], 0.6],
    facts: '赤道半径 25,559 km · 自转轴倾角 98° · 一年 84 年' },
  { id: 'neptune', name: '海王星', R: 24764, flat: 0.0171, tex: 'neptune_2k.jpg', view: 4, color: '#6f8cff', soi: 8.68e7, group: '行星', atm: [0.02, [0.4, 0.55, 1.0], 0.6],
    facts: '赤道半径 24,764 km · 一天 16 时 6 分 · 一年 164.8 年' },
  { id: 'pluto', name: '冥王星', R: 1188.3, tex: 'plutomap1k.jpg', view: 4, color: '#d8c3a8', soi: 3.1e6, group: '矮行星',
    facts: '半径 1,188 km · 一天 6.39 地球日 · 一年 248 年' },
  { id: 'iss', name: '国际空间站', R: 0.05, view: 6000, color: '#7df4ff', parent: 'earth', group: '航天器', available: false,
    facts: 'NORAD 25544 · CelesTrak 双行轨道根数 / SGP4' },
];
const B = Object.fromEntries(BODIES.map((b) => [b.id, b]));
for (const b of BODIES) { b.pos = new THREE.Vector3(); b.rel = new THREE.Vector3(); b.basis = new THREE.Matrix4(); b.tilt = new THREE.Matrix4(); }
const issState = { tle: null, fetchedAt: -Infinity, trackAt: -Infinity, restoreOrbit: false };

// ---------- 着色器公共片段 ----------
const eclipseUniforms = (occluder) => ({
  eclipseSun: { value: new THREE.Vector3() }, eclipseOccluder: { value: new THREE.Vector3() },
  eclipseSunRadius: { value: B.sun.R }, eclipseOccluderRadius: { value: occluder.R },
});
const earthEclipse = eclipseUniforms(B.moon), moonEclipse = eclipseUniforms(B.earth);
const ECLIPSE = /* glsl */`
uniform vec3 eclipseSun, eclipseOccluder;
uniform float eclipseSunRadius, eclipseOccluderRadius;
varying vec3 eclipsePoint;
float sunlight() {
  vec3 sun = eclipseSun - eclipsePoint;
  vec3 body = eclipseOccluder - eclipsePoint;
  float ds = length(sun), db = length(body);
  if (db >= ds || dot(sun, body) <= 0.0) return 1.0;
  sun /= ds;
  body /= db;
  float s = asin(clamp(eclipseSunRadius / ds, 0.0, 1.0));
  float r = asin(clamp(eclipseOccluderRadius / db, 0.0, 1.0));
  float d = atan(length(cross(sun, body)), dot(sun, body));
  if (d >= s + r) return 1.0;
  if (d <= abs(s - r)) return r >= s ? 0.0 : 1.0 - (r / s) * (r / s);
  float ss = s * s, rr = r * r, dd = d * d;
  float a = acos(clamp((dd + ss - rr) / (2.0 * d * s), -1.0, 1.0));
  float b = acos(clamp((dd + rr - ss) / (2.0 * d * r), -1.0, 1.0));
  float chord = sqrt(max(0.0, (-d + s + r) * (d + s - r) * (d - s + r) * (d + s + r)));
  return clamp(1.0 - (ss * a + rr * b - chord * 0.5) / (PI * ss), 0.0, 1.0);
}`;
const VS_WORLD = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
varying vec3 eclipsePoint;
void main() {
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  eclipsePoint = mat3(modelMatrix) * position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;

function noiseTexture([base, light, dark]) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 512, 256);
  let seed = base.length * 997 + light.charCodeAt(2) * 31;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * 512, y = 20 + rnd() * 216, r = 1 + rnd() ** 3 * 22;
    g.globalAlpha = 0.15 + rnd() * 0.35; g.fillStyle = rnd() < 0.5 ? light : dark;
    g.beginPath(); g.ellipse(x, y, r * 1.4, r, 0, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- 网格 ----------
const sphereGeo = new THREE.SphereGeometry(1, 192, 96);
const sunLight = new THREE.PointLight(0xffffff, 3.3, 0, 0);
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0xffffff, 0.035));

function makeAtmosphere(b) {
  const [th, col, strength] = b.atm;
  const mat = new THREE.ShaderMaterial({
    uniforms: { center: { value: new THREE.Vector3() }, R: { value: b.R }, Ra: { value: b.R * (1 + th) }, sunDir: { value: new THREE.Vector3(1, 0, 0) },
      color: { value: new THREE.Color(...col) }, strength: { value: strength } },
    vertexShader: VS_WORLD,
    fragmentShader: /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 center; uniform float R; uniform float Ra; uniform vec3 sunDir; uniform vec3 color; uniform float strength;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
  #include <logdepthbuf_fragment>
  vec3 rd = normalize(vW - cameraPosition);
  vec3 oc = center - cameraPosition;
  float t = dot(oc, rd);
  vec3 cp = cameraPosition + rd * t;
  float h = length(cp - center);
  float a; vec3 nrm;
  if (h > R) {
    a = pow(clamp(1.0 - (h - R) / (Ra - R), 0.0, 1.0), 2.0);
    nrm = normalize(cp - center);
  } else {
    vec3 p = cameraPosition + rd * (t - sqrt(max(R * R - h * h, 0.0)));
    nrm = normalize(p - center);
    float mu = clamp(dot(nrm, -rd), 0.0, 1.0);
    a = 0.3 * pow(1.0 - mu, 3.0) + 0.03;
  }
  float s = dot(nrm, sunDir);
  float lit = smoothstep(-0.12, 0.22, s);
  vec3 c = h > R ? mix(vec3(0.9, 0.45, 0.25), color, smoothstep(-0.06, 0.08, s)) : color;
  if (h <= R) lit = smoothstep(0.0, 0.3, s);
  gl_FragColor = vec4(c * a * strength * lit, 1.0);
  #include <colorspace_fragment>
}`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
  });
  const m = new THREE.Mesh(sphereGeo, mat);
  m.scale.setScalar(b.R * (1 + th));
  m.renderOrder = 2;
  return m;
}

// 地球：当月 NASA Blue Marble 地表（含季节性积雪与植被）+ 法线贴图 + 海洋镜面 + 夜光 + 实时云图（EUMETSAT/NOAA 合成，约 3 小时更新）
const earthDay = { month: -1, tex: null };
function setEarthMonth(m) {
  if (m === earthDay.month) return;
  earthDay.month = m;
  const t = tl.load(texturePath(`earth_day_${String(m + 1).padStart(2, '0')}.jpg`), () => {
    if (earthDay.month !== m) return;
    const old = B.earth.mat.uniforms.dayMap.value;
    B.earth.mat.uniforms.dayMap.value = t;
    if (old && old !== t) old.dispose();
  });
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, maxAniso);
  if (!B.earth.mat.uniforms.dayMap.value) B.earth.mat.uniforms.dayMap.value = t;
}
const LIVE_CLOUDS = `https://clouds.matteason.co.uk/images/${isTouch ? '2048x1024' : '4096x2048'}/clouds-alpha.png`;
const cloudState = { live: false, at: 0 };
function loadLiveClouds() {
  cloudState.at = Date.now();
  new THREE.TextureLoader().load(LIVE_CLOUDS + '?t=' + Math.floor(Date.now() / 1800000), (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, maxAniso);
    const cm = B.earth.clouds.material;
    cm.uniforms.cloudMap.value = t; cm.uniforms.alphaChan.value = 1;
    B.earth.mat.uniforms.cloudMap.value = t; B.earth.mat.uniforms.alphaChan.value = 1;
    cloudState.live = true;
  }, undefined, () => { cloudState.live = false; });
}
function makeEarth(b) {
  const staticClouds = tex('earth_clouds_4k.jpg', false);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...earthEclipse, dayMap: { value: null }, nightMap: { value: tex('earth_night_4k.jpg') },
      specMap: { value: tex('earth_spec_4k.jpg', false) }, normalMap: { value: tex('earth_normal_4k.jpg', false) },
      cloudMap: { value: staticClouds }, alphaChan: { value: 0 },
      sunDir: { value: new THREE.Vector3(1, 0, 0) }, pole: { value: new THREE.Vector3(0, 1, 0) } },
    vertexShader: VS_WORLD,
    fragmentShader: /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D dayMap; uniform sampler2D nightMap; uniform sampler2D specMap; uniform sampler2D normalMap;
uniform sampler2D cloudMap; uniform float alphaChan; uniform vec3 sunDir; uniform vec3 pole;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
${ECLIPSE}
void main() {
  #include <logdepthbuf_fragment>
  vec3 n0 = normalize(vN);
  vec3 T = normalize(cross(pole, n0) + vec3(1e-6));
  vec3 Bt = cross(n0, T);
  vec3 nm = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
  vec3 n = normalize(T * nm.x * 0.6 + Bt * nm.y * 0.6 + n0 * nm.z);
  vec3 v = normalize(cameraPosition - vW);
  float ndl0 = dot(n0, sunDir);
  float ndl = dot(n, sunDir);
  vec3 day = texture2D(dayMap, vUv).rgb;
  vec3 night = texture2D(nightMap, vUv).rgb;
  float water = texture2D(specMap, vUv).r;
  vec4 cs = texture2D(cloudMap, vUv);
  float cloud = pow(mix(cs.r, cs.a, alphaChan), 1.5) * 0.85;
  float lit = clamp(mix(ndl0, ndl, smoothstep(0.0, 0.15, ndl0)), 0.0, 1.0);
  float dayMix = smoothstep(-0.08, 0.08, ndl0);
  float light = sunlight();
  vec3 col = day * (lit * light * 1.1 + 0.008) * (1.0 - 0.35 * cloud * smoothstep(0.0, 0.2, ndl0));
  col += night * vec3(1.0, 0.8, 0.55) * (1.0 - dayMix) * 1.5 * (1.0 - 0.8 * cloud);
  vec3 hv = normalize(sunDir + v);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n0, v), 0.0), 5.0);
  col += vec3(1.0, 0.94, 0.85) * water * (1.0 - cloud) * (pow(max(dot(n0, hv), 0.0), 60.0) * 0.6 + fres * 0.08) * clamp(ndl0, 0.0, 1.0) * light;
  col += vec3(1.0, 0.42, 0.15) * 0.012 * exp(-ndl0 * ndl0 * 120.0);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`,
  });
  b.mat = mat;
  const mesh = new THREE.Mesh(sphereGeo, mat);
  const clouds = new THREE.Mesh(sphereGeo, new THREE.ShaderMaterial({
    uniforms: { ...earthEclipse, cloudMap: { value: staticClouds }, alphaChan: { value: 0 }, sunDir: mat.uniforms.sunDir },
    vertexShader: VS_WORLD,
    fragmentShader: /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D cloudMap; uniform float alphaChan; uniform vec3 sunDir;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
${ECLIPSE}
void main() {
  #include <logdepthbuf_fragment>
  vec4 cs = texture2D(cloudMap, vUv);
  float a = mix(cs.r, cs.a, alphaChan);
  a = pow(a, 1.5) * 0.85;
  float ndl = dot(normalize(vN), sunDir);
  float lit = smoothstep(-0.1, 0.25, ndl) * (0.25 + 0.75 * clamp(ndl, 0.0, 1.0)) * sunlight() + 0.004;
  vec3 c = mix(vec3(1.0, 0.75, 0.6), vec3(1.0), smoothstep(-0.05, 0.12, ndl)) * lit;
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`,
    transparent: true, depthWrite: false,
  }));
  clouds.scale.setScalar(1.0015);
  clouds.renderOrder = 1;
  mesh.add(clouds);
  b.clouds = clouds;
  return mesh;
}

// 太阳：面向地球的半球使用 NASA SDO/HMI 最新连续谱图像（实时黑子），其余区域用静态纹理
const sunState = { at: 0 };
function makeSun(b) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex('sun_4k.jpg') }, sdo: { value: null }, hasSdo: { value: 0 }, skyView: { value: 0 },
      toEarth: { value: new THREE.Vector3(1, 0, 0) }, pole: { value: new THREE.Vector3(0, 1, 0) } },
    vertexShader: VS_WORLD,
    fragmentShader: /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map; uniform sampler2D sdo; uniform float hasSdo; uniform float skyView; uniform vec3 toEarth; uniform vec3 pole;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vN);
  float muCam = clamp(dot(n, normalize(cameraPosition - vW)), 0.0, 1.0);
  float base = dot(texture2D(map, vUv).rgb, vec3(0.3, 0.55, 0.15)) / 0.62;
  float I = base;
  if (hasSdo > 0.5) {
    float muE = dot(n, toEarth);
    if (muE > 0.0) {
      vec3 up = normalize(pole - dot(pole, toEarth) * toEarth);
      vec3 right = cross(-toEarth, up);
      vec2 uv = 0.5 + 0.4707 * vec2(dot(n, right), dot(n, up));
      float s = dot(texture2D(sdo, uv).rgb, vec3(0.299, 0.587, 0.114));
      float ld = 1.0 - 0.62 * (1.0 - muE) - 0.18 * (1.0 - muE) * (1.0 - muE);
      I = mix(base, s / (0.70 * max(ld, 0.2)), smoothstep(0.05, 0.25, muE));
    }
  }
  float ld = 1.0 - 0.62 * (1.0 - muCam) - 0.18 * (1.0 - muCam) * (1.0 - muCam);
  vec3 surface = vec3(1.0, 0.8, 0.55) * I * 0.92 * (0.12 + 0.88 * ld);
  vec3 glare = vec3(1.0, 0.95, 0.80) * (0.65 + 0.4 * ld + 0.15 * I);
  gl_FragColor = vec4(mix(surface, glare, skyView), 1.0);
  #include <colorspace_fragment>
}`,
  });
  b.mat = mat;
  return new THREE.Mesh(sphereGeo, mat);
}
function loadSdo() {
  sunState.at = Date.now();
  new THREE.TextureLoader().load('live/sun.jpg?t=' + Math.floor(Date.now() / 900000), (t) => {
    t.colorSpace = THREE.NoColorSpace;
    const u = B.sun.mat.uniforms;
    if (u.sdo.value) u.sdo.value.dispose();
    u.sdo.value = t; u.hasSdo.value = 1;
  });
}

function makeRings(b) {
  const inner = 74500, outer = 140220;
  const geo = new THREE.RingGeometry(inner, outer, 256, 1);
  geo.rotateX(-Math.PI / 2);
  const t = tex('saturn_ring_4k.png');
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: t }, inner: { value: inner }, outer: { value: outer }, center: { value: new THREE.Vector3() },
      R: { value: b.R }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, ringN: { value: new THREE.Vector3(0, 1, 0) } },
    vertexShader: /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float inner; uniform float outer;
varying float vR; varying vec3 vW;
void main() {
  vR = (length(position.xz) - inner) / (outer - inner);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`,
    fragmentShader: /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map; uniform vec3 center; uniform float R; uniform vec3 sunDir; uniform vec3 ringN;
varying float vR; varying vec3 vW;
void main() {
  #include <logdepthbuf_fragment>
  vec4 t = texture2D(map, vec2(clamp(vR, 0.0, 1.0), 0.5));
  vec3 oc = center - vW;
  float tt = dot(oc, sunDir);
  float h = sqrt(max(dot(oc, oc) - tt * tt, 0.0));
  float shadow = tt > 0.0 ? mix(0.04, 1.0, smoothstep(R * 0.985, R * 1.015, h)) : 1.0;
  float sunSide = dot(ringN, sunDir);
  float camSide = dot(ringN, cameraPosition - vW);
  float lit = sunSide * camSide > 0.0 ? 1.0 : 0.3;
  lit *= 0.55 + 0.45 * sqrt(abs(sunSide));
  gl_FragColor = vec4(t.rgb * lit * shadow * 1.15, t.a * 0.96);
  #include <colorspace_fragment>
}`,
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.matrixAutoUpdate = false;
  m.renderOrder = 3;
  b.rings = m;
  return m;
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,253,245,1)'); gr.addColorStop(0.08, 'rgba(255,240,210,0.9)');
  gr.addColorStop(0.2, 'rgba(255,205,140,0.35)'); gr.addColorStop(0.45, 'rgba(255,160,80,0.08)'); gr.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function moonShadowMaterial(shader) {
  Object.assign(shader.uniforms, moonEclipse);
  shader.vertexShader = 'varying vec3 eclipsePoint;\n' + shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\neclipsePoint = mat3(modelMatrix) * transformed;');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + ECLIPSE)
    .replace('#include <opaque_fragment>', 'outgoingLight *= mix(vec3(0.075, 0.014, 0.006), vec3(1.0), sunlight());\n#include <opaque_fragment>');
}

for (const b of BODIES) {
  b.obj = new THREE.Group();
  scene.add(b.obj);
  let mesh;
  if (b.id === 'sun') {
    mesh = makeSun(b);
    b.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    b.glow.renderOrder = 4;
    b.obj.add(b.glow);
  } else if (b.id === 'earth') {
    mesh = makeEarth(b);
  } else if (b.id === 'iss') {
    mesh = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: b.color }));
    b.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: b.color, depthWrite: false }));
    b.obj.add(b.marker);
  } else {
    const map = b.tex ? tex(b.tex) : noiseTexture(b.noise);
    mesh = new THREE.Mesh(sphereGeo, new THREE.MeshPhongMaterial({ map, shininess: 4, specular: 0x0a0a0a }));
    if (b.id === 'moon') mesh.material.onBeforeCompile = moonShadowMaterial;
  }
  mesh.matrixAutoUpdate = false;
  b.mesh = mesh;
  b.obj.add(mesh);
  if (b.atm) { b.atmMesh = makeAtmosphere(b); b.obj.add(b.atmMesh); }
  if (b.id === 'saturn') b.obj.add(makeRings(b));
}

// ---------- 星空 ----------
const sky = new THREE.Group();
scene.add(sky);
const SKY_R = 1e9;
const skyColor = new THREE.Color();
const nightColor = new THREE.Color(0x000000), dayColor = new THREE.Color(0x438bce);
const ground = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 16, 0, 2 * Math.PI, Math.PI / 2, Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x171e27, side: THREE.BackSide }));
ground.visible = false;
scene.add(ground);
const starFade = { value: 1 };

// 银河（ESO 全天图，银道坐标等距柱状投影）
const eclFromScene = new THREE.Matrix3().set(1, 0, 0, 0, 0, -1, 0, 1, 0);
const eps = EPH.OBLIQUITY;
const eqFromEcl = new THREE.Matrix3().set(1, 0, 0, 0, Math.cos(eps), -Math.sin(eps), 0, Math.sin(eps), Math.cos(eps));
const galFromEq = new THREE.Matrix3().set(
  -0.0548755604, -0.8734370902, -0.4838350155,
  0.4941094279, -0.44482963, 0.7469822445,
  -0.867666149, -0.1980763734, 0.4559837762);
const galFromScene = galFromEq.clone().multiply(eqFromEcl).multiply(eclFromScene);
const mwTex = tl.load(texturePath('milkyway.jpg'));
mwTex.colorSpace = THREE.SRGBColorSpace; mwTex.generateMipmaps = false; mwTex.minFilter = THREE.LinearFilter;
const milky = new THREE.Mesh(new THREE.SphereGeometry(SKY_R * 1.5, 64, 32), new THREE.ShaderMaterial({
  uniforms: { map: { value: mwTex }, toGal: { value: galFromScene }, intensity: { value: 0.55 }, tint: { value: skyColor } },
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
uniform sampler2D map; uniform mat3 toGal; uniform float intensity; uniform vec3 tint; varying vec3 vDir;
void main(){
  vec3 g = normalize(toGal * normalize(vDir));
  float l = atan(g.y, g.x); float b = asin(clamp(g.z, -1.0, 1.0));
  vec2 uv = vec2(0.5 - l / 6.28318530718, 0.5 + b / 3.14159265359);
  vec3 c = texture2D(map, uv).rgb;
  c = max(c - 0.015, 0.0) * intensity;
  gl_FragColor = vec4(c + tint, 1.0);
  #include <colorspace_fragment>
}`,
  side: THREE.BackSide, depthTest: false, depthWrite: false,
}));
milky.renderOrder = -20; milky.frustumCulled = false;
sky.add(milky);

function bvToColor(bv) {
  bv = Math.max(-0.4, Math.min(2.0, bv));
  const T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  const t = T / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * (t - 60) ** -0.1332; g = 288.12 * (t - 60) ** -0.0755; b = 255; }
  const cl = (x) => Math.max(0, Math.min(255, x)) / 255;
  const c = new THREE.Color(cl(r), cl(g), cl(b));
  return c.lerp(new THREE.Color(1, 1, 1), 0.35);
}

let starLabels = [];
const constLines = new THREE.Group();
constLines.visible = false;
sky.add(constLines);
const skyLoad = fetch('data/sky.json').then((r) => r.json()).then((data) => {
  const n = data.stars.length / 4;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const [ra, dec, mag, bv] = data.stars.slice(i * 4, i * 4 + 4);
    toScene(EPH.radecToEcl(ra, dec), v).multiplyScalar(SKY_R);
    pos.set([v.x, v.y, v.z], i * 3);
    const c = bvToColor(bv);
    const br = Math.min(1.6, 0.25 + Math.pow(10, -0.4 * (mag - 1.0)) * 0.9);
    col.set([c.r * br, c.g * br, c.b * br], i * 3);
    size[i] = Math.max(2.0, Math.min(14, 2.0 + Math.pow(10, -0.4 * (mag - 6)) ** 0.33 * 1.1));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('starColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: { pr: { value: renderer.getPixelRatio() }, fade: starFade },
    vertexShader: `attribute float size; attribute vec3 starColor; varying vec3 vC; uniform float pr;
      void main(){ vC = starColor; gl_PointSize = size * pr; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vC; uniform float fade; void main(){ vec2 p = gl_PointCoord - 0.5; float r2 = dot(p,p) * 4.0;
      float a = exp(-r2 * 5.0) + 0.25 * exp(-r2 * 1.2); gl_FragColor = vec4(vC * a * fade, 1.0); }`,
    blending: THREE.AdditiveBlending, depthTest: true, depthWrite: false, transparent: true,
  }));
  pts.renderOrder = -10; pts.frustumCulled = false;
  sky.add(pts);

  const lp = [];
  for (const seg of data.lines) for (let i = 0; i < seg.length - 1; i++) {
    for (const p of [seg[i], seg[i + 1]]) { toScene(EPH.radecToEcl(p[0], p[1]), v).multiplyScalar(SKY_R * 0.99); lp.push(v.x, v.y, v.z); }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const ls = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x4f6fb0, transparent: true, opacity: 0.45, depthTest: true, depthWrite: false }));
  ls.renderOrder = -9; ls.frustumCulled = false;
  constLines.add(ls);

  starLabels = data.labels.map(([ra, dec, zh]) => {
    const el = document.createElement('div');
    el.className = 'lbl star hidden'; el.innerHTML = `<span class="dot"></span>${zh}`;
    labelsEl.appendChild(el);
    return { el, dir: toScene(EPH.radecToEcl(ra, dec)).multiplyScalar(SKY_R) };
  });
});
manager.itemStart('sky'); skyLoad.finally(() => manager.itemEnd('sky'));

// ---------- 小行星带（示意，按开普勒运动） ----------
// 真实小行星：NASA JPL SBDB 中绝对星等 H<15 的全部小行星（含近地、主带、特洛伊、柯伊伯带），二体开普勒外推
const AST_EPOCH = 2461200.5 - 2451545.0;
const belt = new THREE.Points(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
  uniforms: { dt: { value: 0 }, pr: { value: renderer.getPixelRatio() } },
  vertexShader: /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 el1; attribute vec2 el2; uniform float dt; uniform float pr; varying vec3 vCol;
void main() {
  float a = el1.x, e = el1.y, I = el1.z, O = el1.w, w = el2.x;
  float M = mod(el2.y + 0.01720209895 / (a * sqrt(a)) * dt, 6.2831853);
  float E = M + e * sin(M);
  for (int k = 0; k < 8; k++) E = E - (E - e * sin(E) - M) / (1.0 - e * cos(E));
  float x = a * (cos(E) - e), y = a * sqrt(1.0 - e * e) * sin(E);
  float cw = cos(w), sw = sin(w), cO = cos(O), sO = sin(O), cI = cos(I), sI = sin(I);
  vec3 p = vec3((cw*cO - sw*sO*cI)*x + (-sw*cO - cw*sO*cI)*y, (cw*sO + sw*cO*cI)*x + (-sw*sO + cw*cO*cI)*y, sw*sI*x + cw*sI*y);
  vec3 sp = vec3(p.x, p.z, -p.y) * 149597870.7;
  vCol = a * (1.0 - e) < 1.3 ? vec3(1.0, 0.55, 0.35) : a > 4.9 && a < 5.5 ? vec3(0.55, 0.85, 0.55) : a > 25.0 ? vec3(0.55, 0.7, 1.0) : vec3(0.62, 0.58, 0.52);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(sp, 1.0);
  gl_PointSize = 1.4 * pr;
  #include <logdepthbuf_vertex>
}`,
  fragmentShader: /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vCol;
void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(vCol, 0.4); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
}));
belt.frustumCulled = false;
scene.add(belt);
fetch('data/asteroids.bin').then((r) => r.arrayBuffer()).then((buf) => {
  const all = new Float32Array(buf), N = Math.min(all.length / 6, isTouch ? 30000 : 85000);
  const el1 = new Float32Array(N * 4), el2 = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    el1.set(all.subarray(i * 6, i * 6 + 4), i * 4);
    el2.set(all.subarray(i * 6 + 4, i * 6 + 6), i * 2);
  }
  const geo = belt.geometry;
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('el1', new THREE.BufferAttribute(el1, 4));
  geo.setAttribute('el2', new THREE.BufferAttribute(el2, 2));
});

// ---------- 轨道线 ----------
const ORBIT_IDS = ['mercury', 'venus', 'emb', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
const orbitGroup = new THREE.Group();
scene.add(orbitGroup);
const orbitLines = {};
function lineMat(color, op = 0.38) { return new THREE.LineBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false }); }
for (const id of ORBIT_IDS) {
  const b = B[id === 'emb' ? 'earth' : id];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(721 * 3), 3));
  const l = new THREE.Line(geo, lineMat(b.color));
  l.frustumCulled = false; l.userData.body = b; l.userData.baseOp = 0.38;
  orbitGroup.add(l); orbitLines[id] = l;
}
const moonOrbit = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(361 * 3), 3)), lineMat('#cfcfcf', 0.3));
moonOrbit.frustumCulled = false; moonOrbit.userData.body = B.moon; moonOrbit.userData.baseOp = 0.3; orbitGroup.add(moonOrbit);
const GAL = ['io', 'europa', 'ganymede', 'callisto'];
const galOrbits = GAL.map((id) => {
  const l = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(181 * 3), 3)), lineMat(B[id].color, 0.3));
  l.frustumCulled = false; l.userData.body = B[id]; l.userData.baseOp = 0.3;
  orbitGroup.add(l); return l;
});
const ISS_SAMPLES = 90;
const issOrbit = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array((ISS_SAMPLES + 1) * 3), 3)), lineMat(B.iss.color, 0.7));
issOrbit.frustumCulled = false;
orbitGroup.add(issOrbit);

// 轨道线：以当前时刻为中心、按同一星历采样一个周期，保证天体恰好位于轨道线上
const TRACKS = [
  ...ORBIT_IDS.map((id) => ({ id, line: orbitLines[id], n: 720 })),
  { id: 'moon', line: moonOrbit, n: 360 },
  ...GAL.map((id, i) => ({ id, line: galOrbits[i], n: 180 })),
];
for (const t of TRACKS) t.at = -1e18;
function refreshTrack(t, d) {
  t.at = d;
  const pts = EPH.track(t.id, time.ms, t.n), arr = t.line.geometry.attributes.position;
  for (let k = 0; k <= t.n; k++) { toScene([pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2]], tmpV); arr.setXYZ(k, tmpV.x, tmpV.y, tmpV.z); }
  arr.needsUpdate = true;
}
const tmpV = new THREE.Vector3();
function updateOrbitGeometry(d, all = false) {
  let worst = null, wv = 0.01;
  for (const t of TRACKS) {
    const v = Math.abs(d - t.at) / EPH.PERIOD[t.id];
    if (all && v > 0.01) refreshTrack(t, d);
    else if (v > wv) { wv = v; worst = t; }
  }
  if (worst) refreshTrack(worst, d);
}

function updateIssOrbit(t) {
  const tle = issState.tle, ms = time.ms;
  issOrbit.position.copy(B.earth.rel);
  issOrbit.visible = B.iss.available && ISS.isFresh(tle, ms - tle.period / 2) && ISS.isFresh(tle, ms + tle.period / 2);
  if (!issOrbit.visible || Math.abs(ms - issState.trackAt) < 30000) return;
  const arr = issOrbit.geometry.attributes.position;
  for (let i = 0; i <= ISS_SAMPLES; i++) {
    const p = ISS.position(tle, t.AddDays((i / ISS_SAMPLES - 0.5) * tle.period / 86400000));
    if (!p) { issOrbit.visible = false; return; }
    toScene(p, tmpV);
    arr.setXYZ(i, tmpV.x, tmpV.y, tmpV.z);
  }
  issState.trackAt = ms;
  arr.needsUpdate = true;
}

async function loadIss() {
  issState.fetchedAt = Date.now();
  try {
    const response = await fetch('./live/iss.txt', { cache: 'no-cache' });
    const tle = response.ok ? ISS.parseTle(await response.text()) : null;
    if (!tle) return;
    issState.tle = tle;
    issState.trackAt = -Infinity;
    if (issState.restoreOrbit && selected === B.iss && nav.mode === 'orbit' && nav.ref === B.earth) {
      updateEphemeris();
      if (B.iss.available) setOrbit(B.iss);
    }
    issState.restoreOrbit = false;
  } catch {}
}

// ---------- 星历与姿态 ----------
const vX = new THREE.Vector3(), vY = new THREE.Vector3(), vZ = new THREE.Vector3();
function setBasis(b, ax, W = true) {
  toScene(ax.X, vX); toScene(ax.Y, vY); toScene(ax.Z, vZ);
  b.basis.makeBasis(vX, vZ, vY.negate());
}
function updateEphemeris() {
  const { t, P, gal } = EPH.state(time.ms);
  for (const b of BODIES) {
    if (b.id === 'earth' && nav.mode === 'sky') { setBasis(b, EPH.earthFixed(t)); continue; }
    const o = EPH.orient(b.id, t);
    if (o) {
      setBasis(b, EPH.axesEcl(o[0], o[1], o[2]));
      setBasis({ basis: b.tilt }, EPH.axesEcl(o[0], o[1], 0));
    }
  }
  const jo = EPH.orient('jupiter', t);
  const jZ = EPH.axesEcl(jo[0], jo[1], 0).Z;
  GAL.forEach((id, i) => {
    // 潮汐锁定：本初子午线指向木星
    const toJ = gal[i].map((v) => -v), n = Math.hypot(...toJ);
    const X = toJ.map((v) => v / n);
    const Y = [jZ[1] * X[2] - jZ[2] * X[1], jZ[2] * X[0] - jZ[0] * X[2], jZ[0] * X[1] - jZ[1] * X[0]];
    setBasis(B[id], { X, Y, Z: jZ });
  });
  for (const b of BODIES) if (b !== B.iss) toScene(P[b.id], b.pos);
  const iss = ISS.position(issState.tle, t);
  B.iss.available = !!iss;
  if (iss) toScene(iss, B.iss.pos).add(B.earth.pos);
  toScene(EPH.eclipseSun(t), earthEclipse.eclipseSun.value);
  earthEclipse.eclipseOccluder.value.copy(B.moon.pos).sub(B.earth.pos);
  moonEclipse.eclipseSun.value.copy(earthEclipse.eclipseSun.value).sub(earthEclipse.eclipseOccluder.value);
  moonEclipse.eclipseOccluder.value.copy(earthEclipse.eclipseOccluder.value).negate();
  return t;
}

// ---------- 时间 ----------
const RATES = [-31557600, -2592000, -604800, -86400, -3600, -60, -1, 1, 60, 3600, 86400, 604800, 2592000, 31557600];
const time = { ms: Date.now(), rateIdx: 7, paused: false };
const isLive = () => !time.paused && time.rateIdx === 7 && Math.abs(time.ms - Date.now()) < 3000;
const rateName = (r) => {
  const a = Math.abs(r);
  const s = a === 1 ? '1 秒/秒' : a === 60 ? '1 分钟/秒' : a === 3600 ? '1 小时/秒' : a === 86400 ? '1 天/秒' : a === 604800 ? '1 周/秒' : a === 2592000 ? '30 天/秒' : '1 年/秒';
  return r < 0 ? '倒退 ' + s : r === 1 ? '实时 ×1' : s;
};

// ---------- 导航 ----------
const nav = {
  mode: 'orbit', ref: B.earth, offset: new THREE.Vector3(), fly: null, speedExp: 0,
  keys: new Set(), joy: { x: 0, y: 0 }, vUp: 0, dragX: 0, dragY: 0, zoom: 1, roll: 0, speed: 0,
};
const camWorld = new THREE.Vector3();
const CITIES = {
  北京: [39.9042, 116.4074], 上海: [31.2304, 121.4737], 广州: [23.1291, 113.2644],
  香港: [22.3193, 114.1694], 台北: [25.033, 121.5654], 纽约: [40.7128, -74.006], 伦敦: [51.5072, -0.1276],
};
const skyState = {
  observer: null, az: 90, alt: 0, riseSet: null, apparent: {}, locationRequest: 0,
  offset: new THREE.Vector3(), localUp: new THREE.Vector3(), localNorth: new THREE.Vector3(), localEast: new THREE.Vector3(),
  up: new THREE.Vector3(), north: new THREE.Vector3(), east: new THREE.Vector3(), direction: new THREE.Vector3(),
};
function setObserver(lat, lon) {
  const p = lat * DEG, l = lon * DEG;
  const sp = Math.sin(p), cp = Math.cos(p), sl = Math.sin(l), cl = Math.cos(l);
  const flattening = 0.996647180302104;
  const r = 6378.1366 / Math.hypot(cp, flattening * sp);
  skyState.observer = EPH.groundObserver(lat, lon);
  skyState.riseSet = null;
  skyState.localUp.set(cp * cl, sp, -cp * sl);
  skyState.localNorth.set(-sp * cl, cp, sp * sl);
  skyState.localEast.set(-sl, 0, -cl);
  skyState.offset.set(r * cp * cl, r * flattening ** 2 * sp, -r * cp * sl).addScaledVector(skyState.localUp, 0.002);
}
function horizontalDirection(az, alt, out) {
  const a = az * DEG, h = alt * DEG;
  return out.copy(skyState.north).multiplyScalar(Math.cos(a) * Math.cos(h))
    .addScaledVector(skyState.east, Math.sin(a) * Math.cos(h)).addScaledVector(skyState.up, Math.sin(h));
}
function horizontalAngles(direction) {
  const n = direction.dot(skyState.north), e = direction.dot(skyState.east);
  return { az: (Math.atan2(e, n) / DEG + 360) % 360, alt: Math.atan2(direction.dot(skyState.up), Math.hypot(n, e)) / DEG };
}
function updateSkyNav() {
  const { basis } = B.earth;
  skyState.up.copy(skyState.localUp).applyMatrix4(basis);
  skyState.north.copy(skyState.localNorth).applyMatrix4(basis);
  skyState.east.copy(skyState.localEast).applyMatrix4(basis);
  nav.offset.copy(skyState.offset).applyMatrix4(basis);
  camWorld.copy(B.earth.pos).add(nav.offset);
  const k = camera.fov / innerHeight;
  skyState.az = (skyState.az - nav.dragX * k) % 360;
  skyState.alt = THREE.MathUtils.clamp(skyState.alt + nav.dragY * k, -89.9, 89.9);
  if (nav.zoom !== 1) {
    camera.fov = THREE.MathUtils.clamp(camera.fov * nav.zoom, 5, 100);
    camera.updateProjectionMatrix();
  }
  lookM.lookAt(ORIGIN, horizontalDirection(skyState.az, skyState.alt, skyState.direction), skyState.up);
  camera.quaternion.setFromRotationMatrix(lookM);
  nav.dragX = nav.dragY = 0; nav.zoom = 1; nav.speed = 0;
}
const lookM = new THREE.Matrix4(), ORIGIN = new THREE.Vector3();
function lookQuat(dir, q = new THREE.Quaternion()) { lookM.lookAt(ORIGIN, dir, UP); return q.setFromRotationMatrix(lookM); }
function viewDir(b) {
  if (b.id === 'sun') return null;
  const s = B.sun.pos.clone().sub(b.pos).normalize();
  if (b === B.iss) return b.pos.clone().sub(B.earth.pos).normalize().addScaledVector(s, 0.45).normalize();
  const perp = new THREE.Vector3().crossVectors(s, UP).normalize();
  return s.multiplyScalar(0.55).add(perp.multiplyScalar(0.8)).add(UP.clone().multiplyScalar(0.22)).normalize();
}
function eclipseView(type) {
  const moon = earthEclipse.eclipseOccluder.value;
  if (type === 'lunar') return moon.clone().negate().normalize();
  if (type !== 'solar') return null;
  const sun = earthEclipse.eclipseSun.value;
  const ray = moon.clone().sub(sun).normalize();
  const closest = moon.clone().addScaledVector(ray, -moon.dot(ray));
  const depth = Math.sqrt(Math.max(0, B.earth.R ** 2 - closest.lengthSq()));
  return closest.addScaledVector(ray, -depth).normalize().addScaledVector(sun, 0.3 / sun.length()).normalize();
}
function flyTo(b, keepDist = false, direction = null) {
  if (b.available === false) { selectBody(b); return; }
  if (nav.mode === 'sky') { camera.fov = 60; camera.updateProjectionMatrix(); }
  const p0 = camWorld.clone().sub(b.pos);
  if (p0.length() < 1) p0.set(0, 0, 1);
  const u0 = p0.clone().normalize();
  const dirE = keepDist ? u0.clone() : (direction || viewDir(b) || u0.clone());
  const distE = keepDist ? Math.max(p0.length(), b.R * 1.1) : b.R * b.view;
  const ratio = Math.abs(Math.log10(p0.length() / distE));
  nav.fly = { target: b, u0, l0: Math.log(p0.length()), le: Math.log(distE), qd: new THREE.Quaternion().setFromUnitVectors(u0, dirE),
    q0: camera.quaternion.clone(), t: 0, dur: keepDist ? 1.0 : Math.min(7, 2.2 + ratio * 0.7) };
  nav.mode = 'fly'; nav.ref = b; nav.offset.copy(p0);
  selectBody(b);
  updateModeBtn();
}
const qI = new THREE.Quaternion(), qT = new THREE.Quaternion(), qL = new THREE.Quaternion();
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
function nearest() {
  let best = null, alt = Infinity;
  for (const b of BODIES) { if (b.available === false) continue; const a = camWorld.distanceTo(b.pos) - b.R; if (a < alt) { alt = a; best = b; } }
  return { body: best, alt };
}
function updateNav(dt) {
  if (nav.mode === 'sky') { updateSkyNav(); return; }
  if (nav.ref.available === false) {
    const previous = selected;
    setOrbit(B.earth);
    selectBody(previous);
  }
  if (nav.mode === 'fly') {
    const f = nav.fly; f.t += dt;
    const x = Math.min(1, f.t / f.dur), s = ease(x);
    qT.copy(qI).slerp(f.qd, s);
    nav.offset.copy(f.u0).applyQuaternion(qT).multiplyScalar(Math.exp(f.l0 + (f.le - f.l0) * s));
    lookQuat(nav.offset.clone().negate(), qL);
    camera.quaternion.slerpQuaternions(f.q0, qL, THREE.MathUtils.smoothstep(x, 0, 0.35));
    if (x >= 1) { nav.mode = 'orbit'; nav.fly = null; updateModeBtn(); }
  } else if (nav.mode === 'orbit') {
    const sph = new THREE.Spherical().setFromVector3(nav.offset);
    sph.theta -= nav.dragX * 0.005; sph.phi -= nav.dragY * 0.005;
    sph.phi = Math.min(Math.PI - 0.01, Math.max(0.01, sph.phi));
    sph.radius = Math.min(2e10, Math.max(nav.ref.R * 1.02 + 0.05, sph.radius * nav.zoom));
    nav.offset.setFromSpherical(sph);
    lookQuat(nav.offset.clone().negate(), camera.quaternion);
    if (movementInput()) { nav.mode = 'free'; updateModeBtn(); }
  }
  if (nav.mode === 'free') {
    const k = 0.0035 * (camera.fov / 60);
    camera.rotateY(-nav.dragX * k); camera.rotateX(-nav.dragY * k);
    let roll = 0; if (nav.keys.has('KeyQ')) roll += 1; if (nav.keys.has('KeyE')) roll -= 1;
    camera.rotateZ(roll * 1.2 * dt);
    const mv = new THREE.Vector3();
    const K = nav.keys;
    if (K.has('KeyW') || K.has('ArrowUp')) mv.z -= 1;
    if (K.has('KeyS') || K.has('ArrowDown')) mv.z += 1;
    if (K.has('KeyA') || K.has('ArrowLeft')) mv.x -= 1;
    if (K.has('KeyD') || K.has('ArrowRight')) mv.x += 1;
    if (K.has('KeyR') || K.has('Space')) mv.y += 1;
    if (K.has('KeyF') || K.has('KeyC')) mv.y -= 1;
    mv.x += nav.joy.x; mv.z += nav.joy.y; mv.y += nav.vUp;
    if (nav.zoom !== 1) mv.z += (nav.zoom - 1) * -60;
    camWorld.copy(nav.ref.pos).add(nav.offset);
    const { alt } = nearest();
    const boost = K.has('ShiftLeft') || K.has('ShiftRight') ? 8 : 1;
    const speed = Math.max(alt, 0.3) * 0.8 * 10 ** nav.speedExp * boost;
    nav.speed = mv.lengthSq() > 0 ? speed * Math.min(1, mv.length()) : 0;
    if (mv.lengthSq() > 1) mv.normalize();
    mv.applyQuaternion(camera.quaternion).multiplyScalar(speed * dt);
    nav.offset.add(mv);
    // 参考系自动切换到所在引力范围最小的天体
    camWorld.copy(nav.ref.pos).add(nav.offset);
    let ref = B.sun, soi = Infinity;
    for (const b of BODIES) if (b.soi < soi && camWorld.distanceTo(b.pos) < b.soi) { ref = b; soi = b.soi; }
    if (ref !== nav.ref) { nav.ref = ref; nav.offset.copy(camWorld).sub(ref.pos); }
  } else nav.speed = 0;
  nav.dragX = nav.dragY = 0; nav.zoom = 1;
  camWorld.copy(nav.ref.pos).add(nav.offset);
  // 防止穿入天体
  for (const b of BODIES) {
    if (b.available === false) continue;
    const dv = camWorld.clone().sub(b.pos), dl = dv.length(), min = b.R * 1.0005 + 0.05;
    if (dl < min) { camWorld.copy(b.pos).add(dv.multiplyScalar(min / Math.max(dl, 1e-6))); nav.offset.copy(camWorld).sub(nav.ref.pos); }
  }
}
function movementInput() {
  const K = nav.keys;
  return ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyF', 'KeyQ', 'KeyE', 'Space', 'KeyC', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some((k) => K.has(k))
    || nav.joy.x !== 0 || nav.joy.y !== 0 || nav.vUp !== 0;
}

// ---------- 输入 ----------
const canvas = renderer.domElement;
const pointers = new Map();
let pinchDist = 0;
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); closeDrops(); if (pointers.size === 2) pinchDist = pinchLen(); });
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId); if (!p) return;
  if (pointers.size === 1) { nav.dragX += e.clientX - p.x; nav.dragY += e.clientY - p.y; }
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 2) { const l = pinchLen(); if (pinchDist > 0) nav.zoom *= (pinchDist / l) ** 1.5; pinchDist = l; }
});
const endPtr = (e) => { pointers.delete(e.pointerId); pinchDist = pointers.size === 2 ? pinchLen() : 0; };
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
function pinchLen() { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; }
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (nav.mode === 'free') { setSpeedExp(nav.speedExp - Math.sign(e.deltaY) * 0.1); }
  else nav.zoom *= Math.exp(e.deltaY * 0.0015);
}, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());
const ORDER = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
addEventListener('keydown', (e) => {
  if (dateDialog.open || e.target.tagName === 'INPUT' || (e.code === 'Space' && e.target.tagName === 'BUTTON')) return;
  nav.keys.add(e.code);
  if (/^Digit\d$/.test(e.code)) chooseBody(B[ORDER[+e.code.slice(5)]]);
  if (e.code === 'KeyO') toggleOpt('optOrbits');
  if (e.code === 'KeyL') toggleOpt('optLabels');
  if (e.code === 'KeyM') toggleSpaceMode();
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => nav.keys.delete(e.code));
addEventListener('blur', () => nav.keys.clear());

// 虚拟摇杆
const joy = document.getElementById('joy'), knob = document.getElementById('knob');
let joyId = null;
function joyMove(e) {
  const r = joy.getBoundingClientRect();
  let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  nav.joy.x = Math.abs(x) < 0.08 ? 0 : x; nav.joy.y = Math.abs(y) < 0.08 ? 0 : y;
  knob.style.transform = `translate(${x * 35}px, ${y * 35}px)`;
}
joy.addEventListener('pointerdown', (e) => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); joyMove(e); });
joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) joyMove(e); });
const joyEnd = (e) => { if (e.pointerId !== joyId) return; joyId = null; nav.joy.x = nav.joy.y = 0; knob.style.transform = ''; };
joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);
for (const [id, v] of [['btnUp', 1], ['btnDown', -1]]) {
  const el = document.getElementById(id);
  el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); nav.vUp = v; el.classList.add('on'); });
  const up = () => { nav.vUp = 0; el.classList.remove('on'); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}

// ---------- 界面 ----------
const $ = (id) => document.getElementById(id);
const labelsEl = $('labels');
const cardinals = ['N', 'E', 'S', 'W'].map((name) => {
  const el = document.createElement('div');
  el.className = 'lbl cardinal hidden'; el.textContent = name;
  labelsEl.appendChild(el);
  return el;
});
const modeBtn = $('modeBtn');
function updateModeBtn() {
  const inSky = nav.mode === 'sky';
  modeBtn.textContent = inSky ? '返回太空' : nav.mode === 'free' ? `环绕${nav.ref.name}` : '自由飞行';
  $('btnSky').setAttribute('aria-pressed', String(inSky));
  $('btnSky').classList.toggle('on', inSky);
  document.body.classList.toggle('skyMode', inSky);
  $('spaceHud').classList.toggle('hidden', inSky);
  $('skyLocation').classList.toggle('hidden', !inSky);
  if (!inSky) { skyState.locationRequest++; $('skyPanel').classList.add('hidden'); $('skyLocation').setAttribute('aria-expanded', 'false'); }
  applyOpts();
}
function orbitNearest() {
  camWorld.copy(nav.ref.pos).add(nav.offset);
  let best = nav.ref, bd = Infinity;
  for (const b of BODIES) { if (b.available === false) continue; const r = camWorld.distanceTo(b.pos) / b.R; if (r < bd) { bd = r; best = b; } }
  flyTo(nav.ref.id === 'sun' && bd < 400 ? best : nav.ref, true);
}
function toggleSpaceMode() {
  if (nav.mode === 'sky') setOrbit(B.earth);
  else if (nav.mode === 'free') orbitNearest();
  else { nav.mode = 'free'; nav.fly = null; updateModeBtn(); }
}
modeBtn.addEventListener('click', toggleSpaceMode);

const eventsPanel = $('eventsPanel'), eventsButton = $('btnEvents');
const panels = { btnBodies: $('bodiesPanel'), btnSettings: $('settingsPanel'), btnEvents: eventsPanel, skyLocation: $('skyPanel') };
function closeDrops() {
  for (const p of Object.values(panels)) p.classList.add('hidden');
  eventsButton.setAttribute('aria-expanded', 'false');
  $('skyLocation').setAttribute('aria-expanded', 'false');
}
for (const [bid, p] of Object.entries(panels)) $(bid).addEventListener('click', () => {
  const hidden = p.classList.contains('hidden');
  closeDrops();
  if (!hidden) return;
  if (p === eventsPanel) { renderEvents(); eventsButton.setAttribute('aria-expanded', 'true'); }
  if (bid === 'skyLocation') $(bid).setAttribute('aria-expanded', 'true');
  p.classList.remove('hidden');
});
$('btnHelp').addEventListener('click', () => $('help').classList.toggle('hidden'));
$('helpClose').addEventListener('click', () => { $('help').classList.add('hidden'); localStorage.setItem('ss-help-seen', '1'); });

function useLocation(lat, lon, name) {
  setObserver(lat, lon);
  $('skyLocation').textContent = `观测地点：${name} ▾`;
  const coord = (deg, pos, neg) => Math.abs(deg).toFixed(4) + '°' + (deg < 0 ? neg : pos);
  $('skyCoordinates').textContent = `${coord(lat, 'N', 'S')} · ${coord(lon, 'E', 'W')}`;
  $('skyStatus').textContent = '';
}
function requestLocation() {
  const request = ++skyState.locationRequest;
  const active = () => nav.mode === 'sky' && request === skyState.locationRequest;
  $('skyStatus').textContent = '正在定位…';
  const fallback = () => {
    if (active()) useLocation(...CITIES.北京, '北京（定位未成功）');
  };
  if (!navigator.geolocation) { fallback(); return; }
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    if (active()) useLocation(coords.latitude, coords.longitude, '当前位置');
  }, fallback, { timeout: 8000, maximumAge: 60000 });
}
function enterSky(lat, lon, name, az = 90, alt = 0, fov = 60) {
  useLocation(lat, lon, name);
  skyState.az = az; skyState.alt = alt;
  nav.mode = 'sky'; nav.ref = B.earth; nav.fly = null;
  nav.dragX = nav.dragY = 0; nav.zoom = 1;
  camera.fov = fov; camera.updateProjectionMatrix();
  updateModeBtn();
}
$('btnSky').addEventListener('click', () => {
  closeDrops();
  if (nav.mode === 'sky') { setOrbit(B.earth); return; }
  enterSky(...CITIES.北京, '北京');
  if (selected === B.earth) selectBody(B.moon);
  requestLocation();
});
$('skyRetry').addEventListener('click', requestLocation);
for (const [name, coords] of Object.entries(CITIES)) {
  const btn = document.createElement('button'); btn.className = 'btn'; btn.textContent = name;
  btn.addEventListener('click', () => { skyState.locationRequest++; useLocation(...coords, name); closeDrops(); });
  $('skyCities').appendChild(btn);
}

const groups = {};
for (const b of BODIES) (groups[b.group] ||= []).push(b);
$('bodiesPanel').innerHTML = Object.entries(groups).map(([g, list]) =>
  `<div class="grp">${g}</div><div class="items">${list.map((b) => `<button class="btn" data-id="${b.id}">${b.name}</button>`).join('')}</div>`).join('');
$('bodiesPanel').addEventListener('click', (e) => { const id = e.target.dataset?.id; if (id) { chooseBody(B[id]); closeDrops(); } });

function toggleOpt(id) { const el = $(id); el.checked = !el.checked; applyOpts(); }
function applyOpts() {
  orbitGroup.visible = nav.mode !== 'sky' && $('optOrbits').checked;
  constLines.visible = $('optConst').checked;
  milky.visible = $('optMilky').checked;
  belt.visible = nav.mode !== 'sky' && $('optBelt').checked;
}
for (const id of ['optOrbits', 'optLabels', 'optConst', 'optMilky', 'optBelt']) $(id).addEventListener('change', applyOpts);
function setSpeedExp(v) {
  nav.speedExp = Math.max(-3, Math.min(3, v));
  $('speedRange').value = nav.speedExp;
  const m = 10 ** nav.speedExp;
  $('speedVal').textContent = '×' + (m >= 10 ? m.toFixed(0) : m >= 1 ? m.toFixed(1) : m.toPrecision(2));
}
$('speedRange').addEventListener('input', (e) => setSpeedExp(+e.target.value));

$('tSlower').addEventListener('click', () => { time.rateIdx = Math.max(0, time.rateIdx - 1); time.paused = false; });
$('tFaster').addEventListener('click', () => { time.rateIdx = Math.min(RATES.length - 1, time.rateIdx + 1); time.paused = false; });
$('tPause').addEventListener('click', () => { time.paused = !time.paused; });
$('tNow').addEventListener('click', () => { time.ms = Date.now(); time.rateIdx = 7; time.paused = false; });

const dateDialog = $('dateDialog'), dateInput = $('dateInput');
const minTime = Date.UTC(1800, 0, 1), maxTime = Date.UTC(2101, 0, 1) - 1000;
const clampTime = (ms) => Math.min(maxTime, Math.max(minTime, ms));
function dateInputValue(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function openDate() {
  dateInput.value = dateInputValue(time.ms);
  nav.keys.clear();
  dateDialog.showModal();
}
$('clock').addEventListener('click', openDate);
$('tDate').addEventListener('click', openDate);
dateInput.addEventListener('change', () => {
  const ms = new Date(dateInput.value).getTime();
  if (ms >= minTime && ms <= maxTime) time.ms = ms;
});
dateDialog.querySelector('form').addEventListener('submit', () => {
  const ms = new Date(dateInput.value).getTime();
  if (ms < minTime || ms > maxTime) time.ms = clampTime(ms);
});

function setOrbit(b) {
  nav.mode = 'orbit'; nav.ref = b; nav.fly = null;
  nav.dragX = nav.dragY = 0; nav.zoom = 1;
  nav.offset.copy(viewDir(b) || new THREE.Vector3(0, 0, 1)).multiplyScalar(b.R * b.view);
  camWorld.copy(b.pos).add(nav.offset);
  camera.fov = 60; camera.updateProjectionMatrix();
  selectBody(b);
  updateModeBtn();
}
function restoreFromHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const ms = Date.parse(params.get('t'));
  const rate = params.get('r');
  time.ms = Number.isFinite(ms) ? clampTime(ms) : Date.now();
  time.rateIdx = /^\d+$/.test(rate) && Number(rate) < RATES.length ? Number(rate) : 7;
  time.paused = params.get('p') === '1';
  const id = params.get('b');
  const b = Object.hasOwn(B, id) ? B[id] : B.earth;
  issState.restoreOrbit = false;
  updateEphemeris();
  updateOrbitGeometry(EPH.daysSinceJ2000(time.ms), true);
  const number = (key, min, max, fallback) => {
    const str = params.get(key), n = Number(str);
    return str?.trim() && n >= min && n <= max ? n : fallback;
  };
  if (params.get('v') === 'sky') {
    const lat = number('lat', -90, 90), lon = number('lon', -180, 180);
    const az = number('az', -360, 360, 90), alt = number('alt', -89.9, 89.9, 0), fov = number('fov', 5, 100, 60);
    const valid = lat !== undefined && lon !== undefined;
    const city = Object.keys(CITIES).find((name) => CITIES[name][0] === lat && CITIES[name][1] === lon);
    skyState.locationRequest++;
    enterSky(...(valid ? [lat, lon, city || '链接地点'] : [...CITIES.北京, '北京（链接坐标无效）']), az, alt, fov);
    selectBody(Object.hasOwn(B, id) ? b : B.moon);
  } else if (b.available === false) {
    setOrbit(B.earth);
    selectBody(b);
    issState.restoreOrbit = !issState.tle;
  } else setOrbit(b);
}
addEventListener('hashchange', restoreFromHash);

function viewHash() {
  const inSky = nav.mode === 'sky';
  const params = new URLSearchParams({ b: inSky || (issState.restoreOrbit && selected === B.iss) ? selected.id : nav.ref.id });
  if (inSky) {
    const { latitude, longitude } = skyState.observer;
    params.set('v', 'sky'); params.set('lat', latitude); params.set('lon', longitude);
    params.set('az', skyState.az.toFixed(3)); params.set('alt', skyState.alt.toFixed(3)); params.set('fov', camera.fov.toFixed(3));
  }
  if (!isLive()) params.set('t', new Date(time.ms).toISOString());
  if (time.rateIdx !== 7) params.set('r', time.rateIdx);
  if (time.paused) params.set('p', '1');
  return '#' + params;
}

let toastTimer;
function shareToast(message) {
  const toast = $('shareToast');
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.textContent = ''; }, 2400);
}
$('btnShare').addEventListener('click', async () => {
  const url = new URL(viewHash(), location.href).href;
  if (navigator.share) {
    try { await navigator.share({ url }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    shareToast('链接已复制');
  } catch {
    shareToast('无法复制链接，请从地址栏复制');
    if (location.href !== url) history.replaceState(history.state, '', url);
  }
});

// 天体标签
for (const b of BODIES) {
  const el = document.createElement('div');
  el.className = 'lbl'; el.style.color = b.color;
  el.innerHTML = `<span class="dot"></span><span>${b.name}</span>`;
  el.addEventListener('click', (e) => { e.stopPropagation(); chooseBody(b); });
  labelsEl.appendChild(el);
  b.label = el;
}

let selected = null;
function selectBody(b) { selected = b; $('infoName').textContent = b.name; }
function chooseBody(b) { if (nav.mode === 'sky') selectBody(b); else flyTo(b); }

const fmtDist = (km) => {
  if (km < 1) return `${(km * 1000).toFixed(0)} m`;
  if (km < 1e6) return `${Math.round(km).toLocaleString('zh-CN')} km`;
  if (km < 1e8) return `${(km / 1e4).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} 万 km`;
  return `${(km / EPH.AU).toFixed(3)} AU`;
};
const fmtSpeed = (v) => {
  if (v === 0) return '0';
  if (v >= C_KMS * 0.1) return `${(v / C_KMS).toPrecision(3)} c`;
  if (v >= 1) return `${v.toPrecision(3)} km/s`;
  return `${(v * 1000).toPrecision(3)} m/s`;
};
const lightTime = (km) => { const s = km / C_KMS; return s < 120 ? `${s.toFixed(1)} 光秒` : s < 7200 ? `${(s / 60).toFixed(1)} 光分` : `${(s / 3600).toFixed(2)} 光时`; };
const dtf = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const RISE_SET_WINDOW = 7 * 86400000;
function updateSkyInfo() {
  const b = selected, info = $('infoBody');
  if (b === B.earth) { info.textContent = '地球是你的观测位置。'; return; }
  if (b === B.iss) { updateIssSkyInfo(info); return; }
  const apparent = skyState.apparent[b.id];
  const { alt, az } = apparent ?? horizontalAngles(b.rel);
  const ms = time.ms;
  const start = Math.floor(ms / RISE_SET_WINDOW) * RISE_SET_WINDOW;
  let events = skyState.riseSet;
  if (!events || events.body !== b || events.start !== start) {
    const find = apparent ? EPH.skyRiseSet(b.id, start, start + RISE_SET_WINDOW, skyState.observer) : null;
    events = skyState.riseSet = { body: b, start, find };
  }
  const times = events.find?.(ms);
  const format = (t) => t === null ? '一年内无事件' : dtf.format(t);
  info.innerHTML = `高度 ${alt.toFixed(2)}° · 方位 ${az.toFixed(2)}°` +
    (times ? `<br>升起 ${format(times[0])}<br>落下 ${format(times[1])}<br>时间为设备本地时间` : '<br>暂无升落星历');
}

const ISS_UNAVAILABLE = '位置不可用：缺少有效的空间站轨道数据，或与模拟时间相差超过 14 天。';
function updateIssSkyInfo(info) {
  if (!B.iss.available) { info.textContent = ISS_UNAVAILABLE; return; }
  const { observer } = skyState, { tle } = issState, ms = time.ms;
  const { alt, az } = horizontalAngles(B.iss.rel);
  let cached = issState.pass;
  if (!cached || cached.observer !== observer || cached.tle !== tle || ms < cached.from || ms >= cached.until) {
    const pass = ISS.visiblePass(tle, ms, observer);
    cached = issState.pass = { observer, tle, from: ms, until: pass?.end ?? ms + 300000, pass };
  }
  const { pass } = cached;
  const position = `高度 ${alt.toFixed(2)}° · 方位 ${az.toFixed(2)}°`;
  if (!pass) { info.innerHTML = `${position}<br>未来 3 天内未找到可见过境`; return; }
  const compass = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  const direction = compass[Math.round(pass.az / 45) % 8];
  info.innerHTML = `${position}<br>可见过境（本地时间）<br>开始 ${dtf.format(pass.start)} · ${direction} ${Math.round(pass.az)}°<br>最高 ${pass.maxAlt.toFixed(1)}°<br>结束 ${dtf.format(pass.end)}`;
}

function renderEvents() {
  eventsPanel.innerHTML = '<h3>天象日历</h3><p class="muted">从当前模拟时间起 · 本地时间</p>';
  let events;
  try { events = EPH.upcomingEvents(time.ms, maxTime); }
  catch { eventsPanel.lastElementChild.textContent = '暂时无法计算天象，请尝试调整模拟时间。'; return; }
  if (!events.length) { eventsPanel.lastElementChild.textContent = '星历精度范围内没有更多天象。'; return; }
  for (const e of events) {
    const button = document.createElement('button');
    const when = document.createElement('time');
    const detail = document.createElement('small');
    button.type = 'button'; button.className = 'btn';
    when.dateTime = new Date(e.ms).toISOString(); when.textContent = dtf.format(e.ms);
    detail.className = 'muted'; detail.textContent = e.detail;
    button.append(when, (e.planet ? B[e.planet].name : '') + e.name, detail);
    button.addEventListener('click', () => {
      time.ms = e.ms; time.paused = true;
      updateEphemeris();
      flyTo(B[e.body], false, eclipseView(e.type));
      closeDrops();
    });
    eventsPanel.appendChild(button);
  }
}

let hudT = 0, hashT = -Infinity;
function updateHud(now) {
  if (now - hudT < 120) return; hudT = now;
  $('clock').textContent = dtf.format(time.ms);
  const rate = RATES[time.rateIdx];
  const live = isLive();
  if (now - hashT >= 500) {
    hashT = now;
    const hash = viewHash();
    if (location.hash !== hash) history.replaceState(history.state, '', hash);
  }
  $('sync').textContent = live ? '● 与现实实时同步' : time.paused ? '❚❚ 已暂停' : `▶ ${rateName(rate)}`;
  $('sync').classList.toggle('off', !live);
  $('tRate').textContent = time.paused ? '暂停' : rateName(rate);
  $('tPause').textContent = time.paused ? '▶' : '⏸';
  if (time.ms === minTime || time.ms === maxTime) $('sync').textContent += '（已到星历精度范围边界）';
  if (nav.mode === 'sky') { updateSkyInfo(); return; }
  const { body, alt } = nearest();
  $('hudRef').textContent = nav.ref.name;
  $('hudAlt').textContent = `${fmtDist(Math.max(0, alt))}（${body.name}）`;
  $('hudSpeed').textContent = nav.mode === 'free' ? fmtSpeed(nav.speed) : nav.mode === 'fly' ? '跃迁中' : `随${nav.ref.name}运动`;
  $('hudSun').textContent = fmtDist(camWorld.length());
  if (selected) {
    const b = selected;
    if (b.available === false) { $('infoBody').textContent = ISS_UNAVAILABLE; return; }
    const dCam = camWorld.distanceTo(b.pos);
    const dEarth = b.id === 'earth' ? null : b.pos.distanceTo(B.earth.pos);
    const dSun = b.pos.length();
    $('infoBody').innerHTML = `${b.facts}<br>` +
      (b.id !== 'sun' ? `距太阳 ${fmtDist(dSun)} · ` : '') +
      (dEarth ? `距地球 ${fmtDist(dEarth)}（${lightTime(dEarth)}）` : `距你 ${fmtDist(dCam - b.R)}`);
  }
}

// 标签投影与遮挡
const proj = new THREE.Vector3(), fwd = new THREE.Vector3();
function updateLabels() {
  const show = $('optLabels').checked;
  const inSky = nav.mode === 'sky';
  const W = innerWidth, H = innerHeight;
  const f = H / 2 / Math.tan((camera.fov * DEG) / 2);
  camera.getWorldDirection(fwd);
  const screen = {};
  for (const b of BODIES) {
    const el = b.label;
    const dist = b.rel.length();
    let vis = show && b.available !== false && b.rel.dot(fwd) > 0 && (!inSky || (b !== B.earth && b.rel.dot(skyState.up) >= 0));
    if (vis) {
      proj.copy(b.rel).project(camera);
      vis = Math.abs(proj.x) < 1.2 && Math.abs(proj.y) < 1.2;
    }
    if (vis) {
      const dir = b.rel.clone().divideScalar(dist);
      for (const o of BODIES) {
        if (o === b || o.available === false || (inSky && o === B.earth)) continue;
        const od = o.rel.length();
        if (od >= dist) continue;
        const t = o.rel.dot(dir);
        if (t > 0 && o.rel.lengthSq() - t * t < o.R * o.R) { vis = false; break; }
      }
    }
    const x = (proj.x * 0.5 + 0.5) * W, y = (-proj.y * 0.5 + 0.5) * H;
    screen[b.id] = { x, y, vis };
    if (vis && b.parent && b !== selected) {
      const p = screen[b.parent] || (() => { const v = B[b.parent].rel.clone().project(camera); return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H }; })();
      if (Math.hypot(p.x - x, p.y - y) < 16) vis = false;
    }
    if (vis && b.id === 'sun' && dist < b.R * 60) vis = false;
    el.classList.toggle('hidden', !vis);
    if (!vis) continue;
    const rpx = (b.R / dist) * f;
    const big = rpx > 5 || (inSky && rpx >= 2);
    el.classList.toggle('big', big);
    el.style.transform = `translate(${x - 7}px, ${y - 9 + (big ? rpx + 10 : 0)}px)`;
  }
  const showStars = constLines.visible;
  for (const s of starLabels) {
    let vis = showStars && s.dir.dot(fwd) > 0 && (!inSky || (starFade.value > 0 && s.dir.dot(skyState.up) >= 0));
    if (vis) { proj.copy(s.dir).project(camera); vis = Math.abs(proj.x) < 1 && Math.abs(proj.y) < 1; }
    s.el.classList.toggle('hidden', !vis);
    if (vis) {
      s.el.style.opacity = starFade.value;
      s.el.style.transform = `translate(${(proj.x * 0.5 + 0.5) * W + 6}px, ${(-proj.y * 0.5 + 0.5) * H - 8}px)`;
    }
  }
  for (const [i, el] of cardinals.entries()) {
    let vis = inSky && horizontalDirection(i * 90, 0, proj).dot(fwd) > 0;
    if (vis) {
      proj.project(camera);
      vis = Math.abs(proj.x) < 1 && Math.abs(proj.y) < 1;
    }
    el.classList.toggle('hidden', !vis);
    if (vis) el.style.transform = `translate(${(proj.x * 0.5 + 0.5) * W}px, ${(-proj.y * 0.5 + 0.5) * H}px) translate(-50%, 4px)`;
  }
}

// ---------- 主循环 ----------
const scaleM = new THREE.Matrix4();
const jupiterShift = new THREE.Vector3();
function updateSkyScene(t, inSky) {
  B.earth.obj.visible = !inSky;
  ground.visible = inSky;
  let light = 0;
  if (inSky) {
    ground.quaternion.setFromUnitVectors(UP, skyState.up);
    for (const b of BODIES) skyState.apparent[b.id] = EPH.skyPosition(b.id, t, skyState.observer);
    light = THREE.MathUtils.smoothstep(skyState.apparent.sun.alt, -18, 0);
  }
  starFade.value = 1 - light;
  skyColor.copy(nightColor).lerp(dayColor, light);
  scene.background = inSky ? skyColor : null;
  milky.material.uniforms.intensity.value = 0.55 * starFade.value;
  constLines.children.forEach((lines) => { lines.material.opacity = 0.45 * starFade.value; });
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!time.paused) {
    const ms = time.ms + dt * 1000 * RATES[time.rateIdx];
    time.ms = clampTime(ms);
    if (time.ms !== ms) time.paused = true;
  }
  if (isLive()) time.ms = Date.now();
  const d = EPH.daysSinceJ2000(time.ms);
  const t = updateEphemeris();
  updateNav(dt);
  const inSky = nav.mode === 'sky';
  updateSkyScene(t, inSky);

  for (const b of BODIES) {
    if (b === B.iss) b.obj.visible = b.available;
    if (b.available === false) continue;
    b.rel.copy(b.pos).sub(camWorld);
    if (inSky) {
      const apparent = skyState.apparent[b.id];
      if (apparent) {
        if (b === B.jupiter) jupiterShift.copy(b.rel).negate();
        horizontalDirection(apparent.az, apparent.alt, b.rel).multiplyScalar(apparent.distance);
        if (b === B.jupiter) jupiterShift.add(b.rel);
      } else if (b.parent === 'jupiter') b.rel.add(jupiterShift);
    }
    b.obj.position.copy(b.rel);
    if (b.id !== 'sun' || true) {
      scaleM.makeScale(b.R, b.R * (1 - (b.flat || 0)), b.R);
      b.mesh.matrix.copy(b.basis).multiply(scaleM);
    }
  }
  const sunRel = B.sun.rel;
  sunLight.position.copy(sunRel);
  const sd = sunRel.length();
  B.iss.marker.scale.setScalar(2 * B.iss.rel.length() * Math.tan(camera.fov * DEG / 2) * 24 / innerHeight);
  const glareSize = 2 * sd * Math.tan(camera.fov * DEG / 2) * 95 / innerHeight;
  B.sun.mat.uniforms.skyView.value = inSky ? 1 : 0;
  B.sun.glow.scale.setScalar(inSky ? Math.max(B.sun.R * 8, glareSize) : Math.max(B.sun.R * 9, sd * 0.05));
  B.sun.glow.material.opacity = inSky ? 0.9 : 1;
  for (const b of BODIES) {
    const sdir = sunRel.clone().sub(b.rel).normalize();
    if (b.mat && b.mat.uniforms.sunDir) b.mat.uniforms.sunDir.value.copy(sdir);
    if (b.atmMesh) b.atmMesh.material.uniforms.sunDir.value.copy(sdir), b.atmMesh.material.uniforms.center.value.copy(b.rel),
      (b.atmMesh.material.side = b.rel.length() < b.R * (1 + b.atm[0]) ? THREE.BackSide : THREE.FrontSide);
    if (b.rings) {
      b.rings.matrix.copy(b.tilt);
      const u = b.rings.material.uniforms;
      u.center.value.copy(b.rel); u.sunDir.value.copy(sdir);
      u.ringN.value.setFromMatrixColumn(b.tilt, 1).normalize();
    }
  }
  B.earth.mat.uniforms.pole.value.setFromMatrixColumn(B.earth.basis, 1).normalize();
  B.sun.mat.uniforms.pole.value.setFromMatrixColumn(B.sun.basis, 1).normalize();
  B.sun.mat.uniforms.toEarth.value.copy(B.earth.pos).sub(B.sun.pos).normalize();
  setEarthMonth(new Date(time.ms).getUTCMonth());
  if (navigator.onLine) {
    if (Date.now() - cloudState.at > 1800000) loadLiveClouds();
    if (Date.now() - sunState.at > 900000) loadSdo();
    if (Date.now() - issState.fetchedAt > 3600000) loadIss();
  }

  if (!inSky) updateOrbitGeometry(d);
  if (orbitGroup.visible) updateIssOrbit(t);
  for (const id of ORBIT_IDS) orbitLines[id].position.copy(sunRel);
  moonOrbit.position.copy(B.earth.rel);
  galOrbits.forEach((l) => l.position.copy(B.jupiter.rel));
  for (const l of orbitGroup.children) {
    if (l === issOrbit) continue;
    const b = l.userData.body;
    const r = b.rel.length() / b.R;
    l.material.opacity = l.userData.baseOp * THREE.MathUtils.clamp((r - 8) / 60, 0, 1);
  }
  belt.position.copy(sunRel);
  belt.material.uniforms.dt.value = d - AST_EPOCH;

  renderer.render(scene, camera);
  updateLabels();
  updateHud(now);
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

restoreFromHash();
setSpeedExp(0);
requestAnimationFrame(frame);

// 调试/自动化用
window.__ss = { nav, B, time, flyTo, camera, skyState, issOrbit };

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
