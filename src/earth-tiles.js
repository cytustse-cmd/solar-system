import * as THREE from 'three';

const SOURCE = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless/default/WGS84';
const SIZE = 256;
const COLUMNS = 6;
const MIN_LEVEL = 5;
const MAX_LEVEL = 14;
const MAX_ALTITUDE = 1200;

export const earthTileShader = /* glsl */`
uniform sampler2D earthAtlas;
uniform vec4 earthTiles[EARTH_TILE_SLOTS];
uniform int earthTileCount;
uniform mat3 earthInverse;
uniform vec3 earthEye;
uniform float earthRayC;

// Range reduction to |t| <= tan(pi/8) keeps angular errors below a low-altitude texel.
float earthAtan2(float y, float x) {
  vec2 v = abs(vec2(x, y));
  float z = min(v.x, v.y) / max(max(v.x, v.y), 1e-20);
  bool reduce = z > 0.41421356237;
  float t = reduce ? (z - 1.0) / (z + 1.0) : z;
  float t2 = t * t;
  float a = t * (1.0 - t2 * (1.0/3.0 - t2 * (1.0/5.0 - t2 * (1.0/7.0 -
                 t2 * (1.0/9.0 - t2 * (1.0/11.0 - t2 * (1.0/13.0 - t2 / 15.0)))))));
  if (reduce) a += PI * 0.25;
  if (v.y > v.x) a = PI * 0.5 - a;
  if (x < 0.0) a = PI - a;
  return y < 0.0 ? -a : a;
}

vec3 earthDayColor(vec3 base, vec3 meshNormal) {
  if (earthTileCount == 0) return base;
  // Intersect the smooth globe so the low-altitude map doesn't inherit the sphere mesh's chords.
  vec3 ray = normalize(earthInverse * meshNormal - earthEye);
  float b = -dot(ray, earthEye);
  vec3 p = normalize(earthEye + ray * (earthRayC / (b + sqrt(max(0.0, b * b - earthRayC)))));
  vec2 map = vec2(fract(earthAtan2(-p.z, p.x) / (2.0 * PI) + 0.5),
                  clamp(earthAtan2(length(p.xz), p.y) / PI, 0.0, 0.9999999));
  for (int i = 0; i < EARTH_TILE_SLOTS; i++) {
    if (i >= earthTileCount) break;
    vec4 tile = earthTiles[i];
    vec2 local = map * vec2(2.0, 1.0) * tile.z - tile.xy;
    if (all(greaterThanEqual(local, vec2(0.0))) && all(lessThan(local, vec2(1.0)))) {
      float slot = tile.w;
      vec2 origin = vec2(mod(slot, EARTH_ATLAS_COLS), floor(slot / EARTH_ATLAS_COLS));
      vec2 atlasUv = (origin + clamp(local, 0.5 / EARTH_TILE_SIZE, 1.0 - 0.5 / EARTH_TILE_SIZE))
                     / vec2(EARTH_ATLAS_COLS, EARTH_ATLAS_ROWS);
      return texture2D(earthAtlas, atlasUv).rgb;
    }
  }
  return base;
}
`;

function childTiles({ z, x, y }) {
  return [
    { z: z + 1, x: 2 * x, y: 2 * y }, { z: z + 1, x: 2 * x + 1, y: 2 * y },
    { z: z + 1, x: 2 * x, y: 2 * y + 1 }, { z: z + 1, x: 2 * x + 1, y: 2 * y + 1 },
  ];
}

const rad = Math.PI;
function tileBounds({ z, x, y }) {
  const step = rad / 2 ** z;
  const lon = (x + 0.5) * step - rad;
  const lat = rad / 2 - (y + 0.5) * step;
  const half = step / 2;
  const center = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
  const cornerDot = (edge) => Math.sin(lat) * Math.sin(edge) + Math.cos(lat) * Math.cos(edge) * Math.cos(half);
  const angle = Math.acos(THREE.MathUtils.clamp(Math.min(cornerDot(lat - half), cornerDot(lat + half)), -1, 1));
  return { center, angle, chord: 2 * Math.sin(angle / 2), step };
}

const id = (tile) => `${tile.z}/${tile.y}/${tile.x}`;

function selectTiles(frustum, eye, look, focal, limit) {
  const distance = eye.length();
  const overhead = eye.clone().divideScalar(distance);
  const horizon = Math.acos(1 / distance);
  const planes = [...frustum.planes, new THREE.Plane(overhead, -1 / distance)];
  function intersects(tile, center, chord, depth) {
    let boundary = false;
    for (const plane of planes) {
      const side = plane.distanceToPoint(center);
      if (side < -chord) return false;
      if (side < 0) boundary = true;
    }
    if (!boundary || depth === 0) return true;
    return childTiles(tile).some((child) => {
      const bounds = tileBounds(child);
      return intersects(child, bounds.center, bounds.chord, depth - 1);
    });
  }
  function classify(tile) {
    const { center, angle, chord, step } = tileBounds(tile);
    const separation = overhead.angleTo(center);
    if (separation > horizon + angle || !intersects(tile, center, chord, 3)) return null;
    const gap = Math.max(0, separation - angle);
    const range = Math.hypot(distance - 1, 2 * Math.sqrt(distance) * Math.sin(gap / 2));
    const alignment = look.dot(center.clone().sub(eye).normalize());
    const pixels = focal * step / range;
    return { ...tile, pixels, priority: pixels * (0.25 + 0.75 * Math.max(0, alignment) ** 4) };
  }
  const leaves = [{ z: 0, x: 0, y: 0 }, { z: 0, x: 1, y: 0 }].map(classify).filter(Boolean);
  const settled = [];
  while (leaves.length) {
    leaves.sort((a, b) => b.priority - a.priority);
    const tile = leaves.shift();
    if (tile.z < MAX_LEVEL && (tile.z < MIN_LEVEL || tile.pixels > SIZE * 1.25)) {
      const children = childTiles(tile).map(classify).filter(Boolean);
      if (children.length + leaves.length + settled.length <= limit) {
        leaves.push(...children);
        continue;
      }
    }
    settled.push(tile);
  }
  return settled.sort((a, b) => b.priority - a.priority);
}

export function createEarthTiles(isTouch) {
  const rows = isTouch ? 4 : 6;
  const limit = COLUMNS * rows;
  const concurrency = isTouch ? 2 : 4;
  const defines = {
    EARTH_TILE_SLOTS: limit, EARTH_ATLAS_COLS: COLUMNS.toFixed(1),
    EARTH_ATLAS_ROWS: rows.toFixed(1), EARTH_TILE_SIZE: SIZE.toFixed(1),
  };
  const uniforms = {
    earthAtlas: { value: null },
    earthTiles: { value: Array.from({ length: limit }, () => new THREE.Vector4()) },
    earthTileCount: { value: 0 },
    earthInverse: { value: new THREE.Matrix3() },
    earthEye: { value: new THREE.Vector3() },
    earthRayC: { value: 0 },
  };
  const resident = new Map(), pending = new Map(), retryAt = new Map();
  const free = Array.from({ length: limit }, (_, i) => limit - 1 - i);
  const frustum = new THREE.Frustum(), planeCamera = new THREE.Matrix4(), model = new THREE.Matrix4();
  const look = new THREE.Vector3();
  let wanted = new Map(), lastSelection = -Infinity, ctx;

  async function load(key) {
    const controller = new AbortController();
    pending.set(key, controller);
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${SOURCE}/${key}.jpg`, { signal: controller.signal });
      if (!response.ok) throw new Error('Earth tile unavailable');
      const bitmap = await createImageBitmap(await response.blob());
      try {
        if (!wanted.has(key) || controller.signal.aborted) return;
        if (bitmap.width !== SIZE || bitmap.height !== SIZE) throw new Error('Invalid Earth tile size');
        let slot = free.pop();
        if (slot === undefined) {
          const evict = [...resident.keys()].find((id) => !wanted.has(id));
          if (evict === undefined) return;
          slot = resident.get(evict);
          resident.delete(evict);
        }
        if (!ctx) {
          const canvas = document.createElement('canvas');
          canvas.width = COLUMNS * SIZE;
          canvas.height = rows * SIZE;
          ctx = canvas.getContext('2d', { alpha: false });
          const atlas = new THREE.CanvasTexture(canvas);
          atlas.colorSpace = THREE.SRGBColorSpace;
          atlas.flipY = false;
          atlas.generateMipmaps = false;
          atlas.minFilter = THREE.LinearFilter;
          uniforms.earthAtlas.value = atlas;
        }
        ctx.drawImage(bitmap, (slot % COLUMNS) * SIZE, Math.floor(slot / COLUMNS) * SIZE);
        resident.set(key, slot);
        uniforms.earthAtlas.value.needsUpdate = true;
      } finally {
        bitmap.close();
      }
    } catch {
      if (wanted.has(key)) retryAt.set(key, performance.now() + 30000);
    } finally {
      clearTimeout(timeout);
      pending.delete(key);
    }
  }

  function update(now, camera, earth, height, enabled) {
    const { basis, rel, R } = earth;
    const active = enabled && rel.length() > R && rel.length() - R < MAX_ALTITUDE;
    if (!active) {
      wanted.clear();
      for (const controller of pending.values()) controller.abort();
      lastSelection = -Infinity;
      uniforms.earthTileCount.value = 0;
      return;
    }
    const eye = uniforms.earthEye.value;
    const inverse = uniforms.earthInverse.value.setFromMatrix4(basis).transpose();
    eye.copy(rel).multiplyScalar(-1 / R).applyMatrix3(inverse);
    uniforms.earthRayC.value = eye.lengthSq() - 1;
    if (now - lastSelection >= 90) {
      lastSelection = now;
      camera.updateMatrixWorld();
      model.copy(basis).scale(new THREE.Vector3(R, R, R)).setPosition(rel);
      planeCamera.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(model);
      frustum.setFromProjectionMatrix(planeCamera);
      camera.getWorldDirection(look).applyMatrix3(inverse);
      const focal = height * camera.projectionMatrix.elements[5] / 2;
      wanted = new Map(selectTiles(frustum, eye, look, focal, limit).map((tile) => [id(tile), tile]));
      for (const [key, controller] of pending) if (!wanted.has(key)) controller.abort();
      for (const [key, deadline] of retryAt) if (!wanted.has(key) || deadline <= now) retryAt.delete(key);
    }
    let count = 0;
    for (const [key, tile] of wanted) {
      const slot = resident.get(key);
      if (slot !== undefined) uniforms.earthTiles.value[count++].set(tile.x, tile.y, 2 ** tile.z, slot);
      else if (navigator.onLine && pending.size < concurrency && !pending.has(key) && !retryAt.has(key)) load(key);
    }
    uniforms.earthTileCount.value = count;
  }
  return { defines, uniforms, update };
}
