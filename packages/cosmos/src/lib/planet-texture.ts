import * as THREE from 'three';
import { seededRandom } from './palette';

/**
 * Earth 类程序化星球：蓝色海洋、绿褐大陆、纬度气候带、极地冰盖，
 * 附带海面高光（粗糙度图）、地形凹凸（高度图）与独立云层贴图。
 * 观感对齐 Google Earth，但刻意不做精细地形（实验定位）。
 */

const SEA_LEVEL = 0.555;

class ValueNoise3D {
  private perm = new Uint8Array(256);

  constructor(seed: string) {
    // 经典置换表：0..255 整数洗牌（浮点表会让外层查表全部塌缩到 0）
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
    const xf = x - xi;
    const yf = y - yi;
    const zf = z - zi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const w = zf * zf * (3 - 2 * zf);

    const c000 = this.lattice(xi, yi, zi);
    const c100 = this.lattice(xi + 1, yi, zi);
    const c010 = this.lattice(xi, yi + 1, zi);
    const c110 = this.lattice(xi + 1, yi + 1, zi);
    const c001 = this.lattice(xi, yi, zi + 1);
    const c101 = this.lattice(xi + 1, yi, zi + 1);
    const c011 = this.lattice(xi, yi + 1, zi + 1);
    const c111 = this.lattice(xi + 1, yi + 1, zi + 1);

    const x00 = c000 + (c100 - c000) * u;
    const x10 = c010 + (c110 - c010) * u;
    const x01 = c001 + (c101 - c001) * u;
    const x11 = c011 + (c111 - c011) * u;
    const y0 = x00 + (x10 - x00) * v;
    const y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  }

  fbm(x: number, y: number, z: number, octaves = 4): number {
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
      fx *= 2.03;
      fy *= 2.03;
      fz *= 2.03;
    }
    return sum / norm;
  }
}

export interface PlanetSurface {
  isLand(latDeg: number, lngDeg: number): boolean;
}

export function createEarthSurface(seed: string): {
  surface: PlanetSurface;
  elevationAt(latDeg: number, lngDeg: number): number;
} {
  const noise = new ValueNoise3D(seed);
  const off = seededRandom(seed + ':off')() * 40;

  /** 带域扭曲的大陆高度场（0..1，海平面见 SEA_LEVEL） */
  const elevationAt = (latDeg: number, lngDeg: number): number => {
    const lat = (latDeg * Math.PI) / 180;
    const lng = (lngDeg * Math.PI) / 180;
    const x = Math.cos(lat) * Math.cos(lng);
    const y = Math.sin(lat);
    const z = Math.cos(lat) * Math.sin(lng);
    const warpX = noise.fbm(x * 1.1 + off, y * 1.1 + 7.3, z * 1.1 + 3.1, 3) - 0.5;
    const warpY = noise.fbm(x * 1.1 + 11.7, y * 1.1 + off, z * 1.1 + 9.2, 3) - 0.5;
    const px = x * 2.5 + warpX * 1.4;
    const py = y * 2.5 + warpY * 1.4;
    const pz = z * 2.5 + warpX * 1.4;
    return noise.fbm(px + off, py + off * 0.6, pz, 6);
  };

  return {
    elevationAt,
    surface: {
      isLand: (latDeg, lngDeg) => elevationAt(latDeg, lngDeg) > SEA_LEVEL,
    },
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

// Earth 观感色板
const DEEP_SEA = hexToRgb('#04162e');
const MID_SEA = hexToRgb('#0a3d78');
const SHELF = hexToRgb('#1a7aaf');
const LOWLAND = hexToRgb('#47803a');
const GRASS = hexToRgb('#6fae4e');
const DRY = hexToRgb('#9aa85c');
const DESERT = hexToRgb('#c2a86b');
const ROCK = hexToRgb('#8a7a5f');
const HIGHROCK = hexToRgb('#9d9285');
const SNOW = hexToRgb('#e9edf2');
const ICE = hexToRgb('#f2f6fa');

/** 生成 Earth 类贴图：颜色图 + 粗糙度图（海面高光）+ 高度凹凸图 */
export function makeEarthTextures(
  seed: string,
  surface: { elevationAt(latDeg: number, lngDeg: number): number },
  width = 1024,
): { map: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const w = width;
  const h = width / 2;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = w;
  colorCanvas.height = h;
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = w;
  roughCanvas.height = h;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = w;
  bumpCanvas.height = h;
  const colorCtx = colorCanvas.getContext('2d')!;
  const roughCtx = roughCanvas.getContext('2d')!;
  const bumpCtx = bumpCanvas.getContext('2d')!;
  const colorImg = colorCtx.createImageData(w, h);
  const roughImg = roughCtx.createImageData(w, h);
  const bumpImg = bumpCtx.createImageData(w, h);

  const detailNoise = new ValueNoise3D(seed + ':detail');

  for (let py = 0; py < h; py++) {
    const latDeg = ((py + 0.5) / h - 0.5) * 180;
    const lat = (latDeg * Math.PI) / 180;
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    for (let px = 0; px < w; px++) {
      const lngDeg = ((px + 0.5) / w) * 360 - 180;
      const lng = (lngDeg * Math.PI) / 180;
      const e = surface.elevationAt(latDeg, lngDeg);
      const nx = cosLat * Math.cos(lng);
      const nz = cosLat * Math.sin(lng);
      const detail = detailNoise.fbm(nx * 9, sinLat * 9, nz * 9, 3);
      const micro = detailNoise.fbm(nx * 28, sinLat * 28, nz * 28, 4);
      const grain = detailNoise.fbm(nx * 54, sinLat * 54, nz * 54, 3);
      const eVis = e + (micro - 0.5) * 0.04;

      let color: [number, number, number];
      let rough: number;
      let bump: number;

      if (eVis <= SEA_LEVEL) {
        const depth = smooth(Math.min(1, (SEA_LEVEL - eVis) / 0.24));
        color = mix(SHELF, mix(MID_SEA, DEEP_SEA, smooth(depth)), smooth(Math.min(1, depth * 1.6)));
        rough = 186 + grain * 16;
        bump = 118 + grain * 12;
      } else {
        const land = Math.min(1, (eVis - SEA_LEVEL) / 0.3);
        const desertBand = Math.exp(-Math.pow((Math.abs(latDeg) - 24) / 13, 2));
        const dryness = Math.min(1, desertBand * 1.15 + (detail - 0.5) * 0.9);
        const base = mix(mix(LOWLAND, GRASS, smooth(detail)), DRY, dryness * 0.75);
        color = mix(base, DESERT, Math.max(0, dryness - 0.45) * 0.9);
        if (land > 0.45) color = mix(color, ROCK, smooth((land - 0.45) / 0.3));
        if (land > 0.75) color = mix(color, HIGHROCK, smooth((land - 0.75) / 0.2));
        if (land > 0.88) color = mix(color, SNOW, smooth((land - 0.88) / 0.1));
        const shade = (micro - 0.5) * 0.28 + (grain - 0.5) * 0.16;
        color = [
          Math.max(0, Math.min(255, color[0] * (1 + shade))),
          Math.max(0, Math.min(255, color[1] * (1 + shade))),
          Math.max(0, Math.min(255, color[2] * (1 + shade))),
        ];
        rough = 238;
        bump = 125 + land * 130 + grain * 22;
      }

      // 极地冰盖（噪声边缘）
      const ice = smooth(
        Math.min(1, Math.max(0, (Math.abs(sinLat) + detail * 0.14 - 0.86) / 0.07)),
      );
      if (ice > 0) {
        color = mix(color, ICE, ice);
        rough = rough + (210 - rough) * ice;
        bump = bump + (150 - bump) * ice;
      }

      const idx = (py * w + px) * 4;
      colorImg.data[idx] = color[0];
      colorImg.data[idx + 1] = color[1];
      colorImg.data[idx + 2] = color[2];
      colorImg.data[idx + 3] = 255;
      roughImg.data[idx] = rough;
      roughImg.data[idx + 1] = rough;
      roughImg.data[idx + 2] = rough;
      roughImg.data[idx + 3] = 255;
      bumpImg.data[idx] = bump;
      bumpImg.data[idx + 1] = bump;
      bumpImg.data[idx + 2] = bump;
      bumpImg.data[idx + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);

  const map = new THREE.CanvasTexture(colorCanvas);
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  for (const tex of [map, roughnessMap, bumpMap]) {
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
  }
  map.colorSpace = THREE.SRGBColorSpace;
  roughnessMap.colorSpace = THREE.NoColorSpace;
  bumpMap.colorSpace = THREE.NoColorSpace;
  return { map, roughnessMap, bumpMap };
}

/** 陆地夜灯：只在夜面由材质 shader 点亮，表现城市活动。 */
export function makeCityLightsTexture(
  seed: string,
  surface: { elevationAt(latDeg: number, lngDeg: number): number },
  width = 512,
): THREE.CanvasTexture {
  const w = width;
  const h = width / 2;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const noise = new ValueNoise3D(seed + ':city');
  for (let py = 0; py < h; py++) {
    const latDeg = ((py + 0.5) / h - 0.5) * 180;
    const lat = (latDeg * Math.PI) / 180;
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    for (let px = 0; px < w; px++) {
      const lngDeg = ((px + 0.5) / w) * 360 - 180;
      const e = surface.elevationAt(latDeg, lngDeg);
      const idx = (py * w + px) * 4;
      if (e <= SEA_LEVEL || Math.abs(sinLat) > 0.78) continue;
      const x = cosLat * Math.cos((lngDeg * Math.PI) / 180);
      const z = cosLat * Math.sin((lngDeg * Math.PI) / 180);
      const dens = noise.fbm(x * 42, sinLat * 42, z * 42, 5);
      const speckle = noise.fbm(x * 96 + 5.2, sinLat * 96, z * 96, 3);
      if (dens < 0.78 || speckle < 0.62) continue;
      const cluster = Math.pow((dens - 0.78) / 0.22, 2.6) * Math.pow((speckle - 0.62) / 0.38, 1.6);
      img.data[idx] = 255 * cluster;
      img.data[idx + 1] = 210 * cluster;
      img.data[idx + 2] = 140 * cluster;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** 云层贴图（白色 + alpha；独立球壳缓慢漂移） */
export function makeCloudTexture(seed: string, width = 512): THREE.CanvasTexture {
  const w = width;
  const h = width / 2;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const noise = new ValueNoise3D(seed + ':cloud');
  const off = seededRandom(seed + ':coff')() * 30;

  for (let py = 0; py < h; py++) {
    const lat = ((py + 0.5) / h - 0.5) * Math.PI;
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    for (let px = 0; px < w; px++) {
      const lng = ((px + 0.5) / w) * Math.PI * 2;
      const x = cosLat * Math.cos(lng);
      const y = sinLat;
      const z = cosLat * Math.sin(lng);
      const base = noise.fbm(x * 2.3 + off, y * 2.3, z * 2.3, 5);
      const wisps = noise.fbm(x * 7.2 + off * 2, y * 7.2, z * 7.2, 4);
      const a = smooth(Math.min(1, Math.max(0, (base * 0.68 + wisps * 0.32 - 0.5) / 0.24)));
      const idx = (py * w + px) * 4;
      img.data[idx] = 255;
      img.data[idx + 1] = 255;
      img.data[idx + 2] = 255;
      img.data[idx + 3] = a * 150;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** 大气辉光：薄蓝边缘（背面辉光 + 正面细 rim），对齐深空摄影的地球轮廓。 */
export function makeAtmosphereMaterial(glowColor: string, radius: number): THREE.Group {
  const group = new THREE.Group();
  const makeShell = (scale: number, power: number, alpha: number, side: THREE.Side) => {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(glowColor) },
        uPower: { value: power },
        uAlpha: { value: alpha },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uPower;
        uniform float uAlpha;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(-vView))), uPower);
          gl_FragColor = vec4(uColor, fresnel * uAlpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side,
      depthWrite: false,
    });
    return new THREE.Mesh(new THREE.SphereGeometry(radius * scale, 64, 48), material);
  };
  group.add(makeShell(1.024, 6.2, 0.22, THREE.BackSide));
  group.add(makeShell(1.006, 10.5, 0.28, THREE.FrontSide));
  return group;
}
