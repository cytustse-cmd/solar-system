import * as THREE from 'three';

const tileSize = 1216;
const border = 8 / tileSize;
const faces = {
  px: (u, v) => [1, u, -v], nx: (u, v) => [-1, u, -v],
  py: (u, v) => [u, 1, -v], ny: (u, v) => [u, -1, -v],
  pz: (u, v) => [u, v, 1], nz: (u, v) => [u, v, -1],
};

export function createMilkyWay(legacy, galFromScene, tint, radius, isTouch, maxAniso) {
  const background = new THREE.Group();
  const intensity = { value: 0.55 };
  function material(map, sharp) {
    return new THREE.ShaderMaterial({
      defines: sharp ? { SHARP_TILE: 1 } : {},
      uniforms: { map: { value: map }, toGal: { value: galFromScene }, intensity, tint: { value: tint } },
      vertexShader: `
varying vec3 vDir;
varying vec2 tileUv;
void main() {
  vDir = position;
  tileUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
      fragmentShader: `
uniform sampler2D map;
uniform mat3 toGal;
uniform float intensity;
uniform vec3 tint;
varying vec3 vDir;
varying vec2 tileUv;
void main() {
#ifdef SHARP_TILE
  vec2 uv = tileUv;
#else
  vec3 g = normalize(toGal * normalize(vDir));
  float l = atan(g.y, g.x);
  float b = asin(clamp(g.z, -1.0, 1.0));
  vec2 uv = vec2(0.5 - l / 6.28318530718, 0.5 + b / 3.14159265359);
#endif
  vec3 c = texture2D(map, uv).rgb;
#ifdef SHARP_TILE
  float luminance = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float exposure = mix(0.56, 0.81, smoothstep(0.025, 0.20, luminance));
  c = mix(vec3(luminance), c, 0.24) * exposure;
#endif
  c = max(c - 0.015, 0.0) * intensity;
  gl_FragColor = vec4(c + tint, 1.0);
  #include <colorspace_fragment>
}`,
      side: sharp ? THREE.DoubleSide : THREE.BackSide,
      depthTest: false,
      depthWrite: false,
    });
  }
  const fallback = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.5, 64, 32), material(legacy, false));
  fallback.renderOrder = -20;
  fallback.frustumCulled = false;
  background.add(fallback);

  const sceneFromGal = galFromScene.clone().transpose();
  const tiles = [];
  for (const [face, direction] of Object.entries(faces)) {
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([s, t]) =>
          new THREE.Vector3(...direction(col - 1 + s, row - 1 + t)).applyMatrix3(sceneFromGal));
        const center = corners[0].clone().add(corners[3]).normalize();
        corners.forEach((v) => v.multiplyScalar(radius));
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap((v) => v.toArray()), 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
          border, 1 - border, 1 - border, 1 - border, border, border, 1 - border, border,
        ], 2));
        geometry.setIndex([0, 2, 1, 1, 2, 3]);
        const mesh = new THREE.Mesh(geometry, material(null, true));
        mesh.renderOrder = -19;
        mesh.frustumCulled = false;
        mesh.visible = false;
        background.add(mesh);
        tiles.push({ name: `${face}-${row}${col}`, corners, center, mesh, wanted: false, pending: false, failed: false, used: 0 });
      }
    }
  }

  const loader = new THREE.TextureLoader();
  const capacity = isTouch ? 8 : 12;
  const projection = new THREE.Matrix4();
  const frustum = new THREE.Frustum();
  const forward = new THREE.Vector3();
  let pending = 0;
  let frame = 0;
  addEventListener('online', () => { for (const tile of tiles) tile.failed = false; });

  function load(tile) {
    tile.pending = true;
    pending++;
    const finish = () => { tile.pending = false; pending--; };
    loader.load(`textures/milkyway-gaia-v1/${tile.name}.webp`, (texture) => {
      finish();
      if (texture.image.width !== tileSize || texture.image.height !== tileSize || !tile.wanted) {
        tile.failed = tile.wanted;
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, maxAniso);
      tile.mesh.material.uniforms.map.value = texture;
    }, undefined, () => { finish(); tile.failed = tile.wanted; });
  }

  function updateTiles(camera) {
    frame++;
    camera.updateMatrixWorld();
    frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const visible = tiles.filter((tile) => background.visible && intensity.value > 0 &&
      frustum.planes.every((plane) => tile.corners.some((corner) => plane.distanceToPoint(corner) >= 0)));
    visible.sort((a, b) => b.center.dot(forward) - a.center.dot(forward));
    const wanted = visible.slice(0, capacity);
    const resident = [];
    for (const tile of tiles) {
      tile.wanted = wanted.includes(tile);
      const hasMap = !!tile.mesh.material.uniforms.map.value;
      if (tile.wanted) tile.used = frame;
      else tile.failed = false;
      tile.mesh.visible = tile.wanted && hasMap;
      if (!tile.wanted && hasMap) resident.push(tile);
    }
    resident.sort((a, b) => a.used - b.used);
    while (resident.length + wanted.length > capacity) {
      const { mesh } = resident.shift();
      mesh.material.uniforms.map.value.dispose();
      mesh.material.uniforms.map.value = null;
    }
    for (const tile of wanted) {
      if (pending >= 2) break;
      if (!tile.mesh.visible && !tile.pending && !tile.failed) load(tile);
    }
  }

  return { background, intensity, updateTiles };
}
