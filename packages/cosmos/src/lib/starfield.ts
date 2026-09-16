import * as THREE from 'three';
import { seededRandom } from './palette';

/** 程序化星图背景：近黑太空、针尖恒星、极淡尘带。 */

class ValueNoise {
  private perm = new Uint8Array(256);
  constructor(seed: string) {
    const rand = seededRandom(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    this.perm.set(p);
  }
  private lattice(i: number, j: number, k: number): number {
    return this.perm[(i + this.perm[(j + this.perm[k & 255]) & 255]) & 255] / 255;
  }
  noise(x: number, y: number, z: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const u = x - xi;
    const v = y - yi;
    const w = z - zi;
    const su = u * u * (3 - 2 * u);
    const sv = v * v * (3 - 2 * v);
    const sw = w * w * (3 - 2 * w);
    const n = (i: number, j: number, k: number) => this.lattice(xi + i, yi + j, zi + k);
    const x00 = n(0, 0, 0) + (n(1, 0, 0) - n(0, 0, 0)) * su;
    const x10 = n(0, 1, 0) + (n(1, 1, 0) - n(0, 1, 0)) * su;
    const x01 = n(0, 0, 1) + (n(1, 0, 1) - n(0, 0, 1)) * su;
    const x11 = n(0, 1, 1) + (n(1, 1, 1) - n(0, 1, 1)) * su;
    const y0 = x00 + (x10 - x00) * sv;
    const y1 = x01 + (x11 - x01) * sv;
    return y0 + (y1 - y0) * sw;
  }
  fbm(x: number, y: number, z: number, octaves = 5): number {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    let fx = x;
    let fy = y;
    let fz = z;
    for (let o = 0; o < octaves; o++) {
      sum += this.noise(fx, fy, fz) * amp;
      norm += amp;
      amp *= 0.5;
      fx *= 2.05;
      fy *= 2.05;
      fz *= 2.05;
    }
    return sum / norm;
  }
}

function gaussian(rand: () => number): number {
  const u = Math.max(1e-6, rand());
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

/** 恒星色温：蓝白主、少量琥珀 */
function starColor(rand: () => number): THREE.Color {
  const t = rand();
  if (t < 0.12) return new THREE.Color().setHSL(0.07, 0.55, 0.72);
  if (t < 0.28) return new THREE.Color().setHSL(0.55, 0.45, 0.86);
  if (t < 0.55) return new THREE.Color().setHSL(0.62, 0.35, 0.92);
  return new THREE.Color().setHSL(0.6, 0.08, 0.95);
}

export function makeStarSpikeTexture(size = 96): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const radial = ctx.createRadialGradient(c, c, 0, c, c, c);
  radial.addColorStop(0, 'rgba(255,255,255,1)');
  radial.addColorStop(0.12, 'rgba(255,255,255,0.7)');
  radial.addColorStop(0.32, 'rgba(210,225,255,0.14)');
  radial.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  const spike = ctx.createLinearGradient(0, c, size, c);
  spike.addColorStop(0, 'rgba(255,255,255,0)');
  spike.addColorStop(0.5, 'rgba(255,255,255,0.7)');
  spike.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = spike;
  ctx.fillRect(0, c - 1.1, size, 2.2);
  const spikeV = ctx.createLinearGradient(c, 0, c, size);
  spikeV.addColorStop(0, 'rgba(255,255,255,0)');
  spikeV.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  spikeV.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = spikeV;
  ctx.fillRect(c - 0.9, 0, 1.8, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function finishTexture(
  texture: THREE.CanvasTexture,
  mode: 'sky' | 'soft' = 'soft',
): THREE.CanvasTexture {
  texture.colorSpace = THREE.SRGBColorSpace;
  if (mode === 'sky') {
    // 关掉 mipmap，避免远处恒星被滤成糊斑；1px 星点保持针尖大小
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 1;
  } else {
    texture.anisotropy = 8;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
  }
  texture.needsUpdate = true;
  return texture;
}

/** 不规则星云：纤维 + 尘埃 + 嵌入亮星，给 Normal 混合用。 */
export function makeNebulaTexture(
  seed: string,
  rgb: [number, number, number],
  size = 512,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const noise = new ValueNoise(seed);
  const rand = seededRandom(seed + ':n');
  const [r0, g0, b0] = rgb;
  const r1 = Math.min(255, r0 + 70);
  const g1 = Math.min(255, g0 + 40);
  const b1 = Math.min(255, b0 + 90);
  const lobes = [
    { x: 0.02, y: -0.04, sx: 1.05, sy: 0.72, w: 1 },
    { x: 0.32, y: -0.16, sx: 0.52, sy: 0.38, w: 0.72 },
    { x: -0.28, y: 0.2, sx: 0.48, sy: 0.42, w: 0.64 },
    { x: 0.08, y: 0.28, sx: 0.36, sy: 0.3, w: 0.4 },
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const px = u * 2 - 1;
      const py = v * 2 - 1;
      const warp = noise.fbm(u * 3.4, v * 3.4, 0.6, 3) - 0.5;
      const qx = px + warp * 0.38;
      const qy = py + (noise.fbm(u * 3.1 + 4.2, v * 3.1, 1.4, 3) - 0.5) * 0.32;
      let envelope = 0;
      for (const lobe of lobes) {
        const dx = (qx - lobe.x) / lobe.sx;
        const dy = (qy - lobe.y) / lobe.sy;
        envelope += lobe.w * Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
      }
      envelope = Math.min(1, envelope);
      const body = noise.fbm(u * 5.2, v * 5.2, 2.1, 5);
      const ridge = 1 - Math.abs(noise.fbm(u * 7.4, v * 7.4, 3.3, 4) * 2 - 1);
      const dens = Math.pow(envelope, 1.15) * (0.28 + body * 0.55 + ridge * 0.42);
      const mix = Math.min(1, dens * 1.15);
      const hot = Math.pow(Math.max(0, dens - 0.35), 1.6);
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, r0 * (1 - mix) + r1 * mix + 255 * hot * 0.55);
      img.data[i + 1] = Math.min(255, g0 * (1 - mix) + g1 * mix + 230 * hot * 0.45);
      img.data[i + 2] = Math.min(255, b0 * (1 - mix) + b1 * mix + 255 * hot * 0.35);
      img.data[i + 3] = Math.max(0, Math.min(255, dens * 255));
    }
  }
  ctx.putImageData(img, 0, 0);

  ctx.globalCompositeOperation = 'lighter';
  for (let s = 0; s < 16; s++) {
    const x = size * (0.22 + rand() * 0.56);
    const y = size * (0.24 + rand() * 0.52);
    const rad = 0.7 + rand() * 1.4;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 3);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.35, `rgba(${r1},${g1},${b1},0.28)`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad * 3, y - rad * 3, rad * 6, rad * 6);
  }

  return finishTexture(new THREE.CanvasTexture(canvas));
}

export function makeNebulaGlowTexture(
  rgb: [number, number, number],
  size = 256,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const [r, g, b] = rgb;
  const grad = ctx.createRadialGradient(c, c * 0.92, 0, c, c, c);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
  grad.addColorStop(0.35, `rgba(${r},${g},${b},0.18)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return finishTexture(new THREE.CanvasTexture(canvas));
}

export interface StarfieldHandle {
  group: THREE.Group;
  update(dt: number, elapsed: number): void;
  dispose(): void;
}

const skyTexCache = new Map<string, THREE.CanvasTexture>();

/** 深空摄影式星图：近黑底、极淡尘带，恒星改由点云绘制以免贴图像素放大。 */
function paintSky(seed: string, width = 2048, height = 1024): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(seed);
  ctx.fillStyle = '#000105';
  ctx.fillRect(0, 0, width, height);

  const band = ctx.createLinearGradient(0, 0, 0, height);
  band.addColorStop(0, 'rgba(4,8,18,0)');
  band.addColorStop(0.48, 'rgba(14,22,42,0.04)');
  band.addColorStop(0.5, 'rgba(20,30,54,0.07)');
  band.addColorStop(0.52, 'rgba(14,22,42,0.04)');
  band.addColorStop(1, 'rgba(4,8,18,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, width, height);

  const dustCount = Math.round(18 * (width / 2048));
  for (let i = 0; i < dustCount; i++) {
    const x = rand() * width;
    const y = height * (0.46 + gaussian(rand) * 0.04);
    const rad = (30 + rand() * 70) * (width / 2048);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(58,74,110,${0.012 + rand() * 0.02})`);
    g.addColorStop(1, 'rgba(58,74,110,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  return finishTexture(new THREE.CanvasTexture(canvas), 'sky');
}

function makeStarPointMaterial(size: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSize: { value: size } },
    vertexShader: `
      attribute vec3 color;
      attribute float phase;
      uniform float uTime;
      uniform float uSize;
      varying vec3 vColor;
      void main() {
        float tw = 0.58 + 0.42 * pow(0.5 + 0.5 * sin(uTime * (1.15 + phase * 0.9) + phase * 6.2832), 3.0);
        vColor = color * tw;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float d = dot(p, p);
        if (d > 1.0) discard;
        float a = exp(-d * 3.4);
        gl_FragColor = vec4(vColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function makeStarPoints(seed: string, radius: number): THREE.Points[] {
  const rand = seededRandom(seed + ':pts');
  const layer = (count: number, size: number, minB: number, maxB: number) => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      const r = radius * (0.86 + rand() * 0.12);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const c = starColor(rand);
      const b = minB + rand() * (maxB - minB);
      colors[i * 3] = c.r * b;
      colors[i * 3 + 1] = c.g * b;
      colors[i * 3 + 2] = c.b * b;
      phases[i] = rand();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    return new THREE.Points(geo, makeStarPointMaterial(size));
  };
  return [layer(7200, 1.0, 0.28, 0.72), layer(900, 1.35, 0.55, 0.95), layer(80, 1.85, 0.8, 1)];
}

export function createStarfield(
  seed = 'zivith-sky',
  radius = 80,
  options?: { width?: number; height?: number },
): StarfieldHandle {
  const group = new THREE.Group();
  const width = options?.width ?? 2048;
  const height = options?.height ?? 1024;
  const key = `v4:${seed}:${width}x${height}`;
  let texture = skyTexCache.get(key);
  if (!texture) {
    texture = paintSky(seed, width, height);
    skyTexCache.set(key, texture);
  }
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 32),
    new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  group.add(mesh);
  const points = makeStarPoints(seed, radius * 0.92);
  for (const pts of points) group.add(pts);
  return {
    group,
    update(dt, elapsed) {
      group.rotation.y += dt * 0.0035;
      for (const pts of points) {
        const mat = pts.material as THREE.ShaderMaterial;
        if (mat.uniforms?.uTime) mat.uniforms.uTime.value = elapsed;
      }
    },
    dispose() {
      mesh.geometry.dispose();
      mesh.material.dispose();
      for (const pts of points) {
        pts.geometry.dispose();
        (pts.material as THREE.Material).dispose();
      }
    },
  };
}

export function layoutStarMap(count: number, seed: string, radius = 7.4): THREE.Vector3[] {
  const rand = seededRandom(seed);
  const pts: THREE.Vector3[] = [];
  const minDist = count <= 4 ? 4.6 : 3.4;
  for (let i = 0; i < count; i++) {
    let chosen = new THREE.Vector3();
    for (let k = 0; k < 60; k++) {
      const a = rand() * Math.PI * 2;
      const r = 2.8 + rand() * radius;
      const candidate = new THREE.Vector3(Math.cos(a) * r, (rand() - 0.5) * 1.6, Math.sin(a) * r);
      if (pts.every((p) => p.distanceTo(candidate) >= minDist)) {
        chosen = candidate;
        break;
      }
      chosen = candidate;
    }
    pts.push(chosen);
  }
  return pts;
}

/** 稀疏连线（近似路径），对应草图里星云之间的虚线。 */
export function starMapLinks(points: THREE.Vector3[]): Array<[number, number]> {
  if (points.length < 2) return [];
  const pairs: Array<{ a: number; b: number; d: number }> = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      pairs.push({ a: i, b: j, d: points[i].distanceTo(points[j]) });
    }
  }
  pairs.sort((x, y) => x.d - y.d);
  const degree = new Array(points.length).fill(0);
  const links: Array<[number, number]> = [];
  for (const pair of pairs) {
    if (degree[pair.a] >= 2 || degree[pair.b] >= 2) continue;
    links.push([pair.a, pair.b]);
    degree[pair.a] += 1;
    degree[pair.b] += 1;
    if (links.length >= points.length - 1) break;
  }
  return links;
}
