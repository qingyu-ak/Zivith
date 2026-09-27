import * as THREE from 'three';

export interface PlanetRingsHandle {
  group: THREE.Group;
  tick: (time: number, planetCenter: THREE.Vector3, sunDirWorld: THREE.Vector3) => void;
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function band(t: number, a: number, b: number, peak = 1): number {
  const m = (a + b) * 0.5;
  const w = (b - a) * 0.5;
  if (w <= 0) return 0;
  return peak * Math.max(0, 1 - Math.abs(t - m) / w);
}

/** 多层彩色环：内青白、中蓝、外品红，带缝与密度波。 */
function sampleRing(t: number): { r: number; g: number; b: number; a: number } {
  const wave =
    0.55 + 0.28 * Math.sin(t * 168.0) + 0.12 * Math.sin(t * 47.0) + 0.08 * Math.sin(t * 310.0);
  let a = 0;
  a += band(t, 0.02, 0.08, 0.12);
  a += band(t, 0.09, 0.13, 0.42);
  a += band(t, 0.145, 0.175, 0.7) * wave;
  a += band(t, 0.19, 0.37, 0.88) * (0.55 + 0.45 * Math.sin(t * 210));
  a *= 1 - band(t, 0.385, 0.445, 0.98);
  a += band(t, 0.46, 0.5, 0.55);
  a += band(t, 0.515, 0.6, 0.7) * (0.5 + 0.5 * Math.sin(t * 140));
  a *= 1 - band(t, 0.61, 0.635, 0.92);
  a += band(t, 0.645, 0.665, 0.8);
  a += band(t, 0.68, 0.705, 0.35);
  a += band(t, 0.725, 0.745, 0.55);
  a += band(t, 0.76, 0.79, 0.28) * wave;
  a += band(t, 0.805, 0.822, 0.62);
  a += band(t, 0.84, 0.855, 0.4);
  a *= 1 - band(t, 0.87, 0.888, 0.9);
  a += band(t, 0.9, 0.918, 0.5);
  a += band(t, 0.935, 0.948, 0.32);
  a += band(t, 0.965, 0.978, 0.22);
  a += band(t, 0.988, 0.998, 0.16);
  a = Math.min(1, Math.max(0, a));

  const inner = { r: 0.78, g: 0.92, b: 1.0 };
  const mid = { r: 0.42, g: 0.58, b: 0.92 };
  const outer = { r: 0.78, g: 0.38, b: 0.62 };
  const far = { r: 0.52, g: 0.32, b: 0.78 };
  const c =
    t < 0.38
      ? mix3(inner, mid, t / 0.38)
      : t < 0.7
        ? mix3(mid, outer, (t - 0.38) / 0.32)
        : mix3(outer, far, (t - 0.7) / 0.3);
  const ice = 0.18 * wave;
  return {
    r: Math.min(1, c.r + ice),
    g: Math.min(1, c.g + ice * 0.6),
    b: Math.min(1, c.b + ice * 0.35),
    a,
  };
}

function mix3(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
) {
  const k = Math.min(1, Math.max(0, t));
  return {
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
  };
}

function makeRadialRingTexture(size = 2048): THREE.DataTexture {
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const s = sampleRing(i / (size - 1));
    const o = i * 4;
    data[o] = Math.round(s.r * 255);
    data[o + 1] = Math.round(s.g * 255);
    data[o + 2] = Math.round(s.b * 255);
    data[o + 3] = Math.round(s.a * 255);
  }
  const tex = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeDiscMaterial(
  inner: number,
  outer: number,
  map: THREE.Texture,
  planetRadius: number,
  opacity: number,
) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uInner: { value: inner },
      uOuter: { value: outer },
      uPlanetRadius: { value: planetRadius },
      uPlanetCenter: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(1, 0.25, 0.4).normalize() },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      varying vec3 vPos;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vPos = position;
        vNormal = normalize(normalMatrix * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      #include <common>
      uniform sampler2D uMap;
      uniform float uInner;
      uniform float uOuter;
      uniform float uPlanetRadius;
      uniform vec3 uPlanetCenter;
      uniform vec3 uSunDir;
      uniform float uOpacity;
      varying vec3 vPos;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        float radial = length(vPos.xy);
        float t = clamp((radial - uInner) / max(uOuter - uInner, 0.0001), 0.0, 1.0);
        vec4 tex = texture2D(uMap, vec2(t, 0.5));
        float edge = smoothstep(0.0, 0.012, t) * (1.0 - smoothstep(0.985, 1.0, t));
        vec3 view = normalize(cameraPosition - vWorld);
        vec3 n = normalize(vNormal);
        float facing = abs(dot(n, view));
        float limb = mix(1.25, 0.42, pow(facing, 1.15));
        vec3 sunDir = normalize(uSunDir);
        float mu = dot(-sunDir, view);
        float g = 0.68;
        float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5);
        float scatter = 0.55 + 0.85 * hg;
        vec3 oc = vWorld - uPlanetCenter;
        float tca = dot(-oc, sunDir);
        float shadow = 1.0;
        if (tca > 0.0) {
          float d = length(oc + sunDir * tca);
          shadow = smoothstep(uPlanetRadius * 0.86, uPlanetRadius * 1.14, d);
        }
        float a = tex.a * edge * limb * scatter * shadow * uOpacity;
        vec3 col = tex.rgb * (0.62 + 0.55 * scatter) * shadow;
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function makeParticleMaterial(sizeScale: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: sizeScale },
    },
    vertexShader: `
      attribute float aRadius;
      attribute float aTheta;
      attribute float aY;
      attribute float aSpeed;
      attribute float aSize;
      attribute vec3 aColor;
      uniform float uTime;
      uniform float uScale;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float theta = aTheta + uTime * aSpeed;
        vec3 pos = vec3(cos(theta) * aRadius, sin(theta) * aRadius, aY);
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.0, aSize * uScale / max(1.0, -mv.z));
        vColor = aColor;
        vAlpha = mix(0.22, 0.95, aSize / 2.4);
      }
    `,
    fragmentShader: `
      #include <common>
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float d = dot(p, p);
        if (d > 1.0) discard;
        float core = exp(-d * 3.6);
        gl_FragColor = vec4(vColor * core, vAlpha * core);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  });
}

function spawnParticles(
  inner: number,
  outer: number,
  count: number,
  thickness: number,
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const radius = new Float32Array(count);
  const theta = new Float32Array(count);
  const y = new Float32Array(count);
  const speed = new Float32Array(count);
  const size = new Float32Array(count);
  const color = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let t = hash(i * 19.17 + 3.1);
    let s = sampleRing(t);
    for (let k = 0; k < 10; k++) {
      const cand = hash(i * 19.17 + k * 7.3);
      const sample = sampleRing(cand);
      if (sample.a >= s.a) {
        t = cand;
        s = sample;
      }
    }
    const r = inner + t * (outer - inner);
    radius[i] = r;
    theta[i] = hash(i * 5.91) * Math.PI * 2;
    y[i] = (hash(i * 2.7) - 0.5) * 2 * thickness * (0.25 + s.a);
    speed[i] = (0.028 / Math.pow(r / inner, 1.35)) * (0.75 + hash(i * 11.2) * 0.5);
    const ice = hash(i * 0.77) < 0.09;
    size[i] = ice ? 1.15 + hash(i) * 0.45 : 0.32 + s.a * 0.7;
    const i3 = i * 3;
    if (ice) {
      color[i3] = 0.95;
      color[i3 + 1] = 0.97;
      color[i3 + 2] = 1;
    } else {
      color[i3] = s.r;
      color[i3 + 1] = s.g;
      color[i3 + 2] = s.b;
    }
  }
  geo.setAttribute('aRadius', new THREE.BufferAttribute(radius, 1));
  geo.setAttribute('aTheta', new THREE.BufferAttribute(theta, 1));
  geo.setAttribute('aY', new THREE.BufferAttribute(y, 1));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  return geo;
}

/**
 * 行星环：径向多层色带 + Kepler 剪切粒子盘。
 * 参考 Saturn shader（径向密度波 / Cassini 缝）+ 粒子体积，色彩对齐超地星环概念图。
 */
export function makePlanetRings(
  planetRadius: number,
  options: { tilt?: number; particleCount?: number; sizeScale?: number; opacity?: number } = {},
): PlanetRingsHandle {
  const tilt = options.tilt ?? 0.16;
  const particleCount = options.particleCount ?? 4000;
  const sizeScale = options.sizeScale ?? 72;
  const opacity = options.opacity ?? 1;
  const inner = planetRadius * 1.16;
  const outer = planetRadius * 2.42;
  const group = new THREE.Group();
  group.rotation.x = Math.PI / 2 + tilt;

  const map = makeRadialRingTexture();
  const discMat = makeDiscMaterial(inner, outer, map, planetRadius, opacity);
  const discGeo = new THREE.RingGeometry(inner, outer, 256, 12);
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.renderOrder = 2;
  disc.frustumCulled = false;
  group.add(disc);

  const sparkMat = makeParticleMaterial(sizeScale);
  const sparkGeo = spawnParticles(inner, outer, particleCount, planetRadius * 0.018);
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.renderOrder = 3;
  sparks.frustumCulled = false;
  group.add(sparks);

  return {
    group,
    tick(time, planetCenter, sunDirWorld) {
      // ShaderMaterial.uniforms 的 value 是 any；按创建时的类型收窄。
      const planetCenterUniform = discMat.uniforms.uPlanetCenter?.value as
        THREE.Vector3 | undefined;
      const sunDirUniform = discMat.uniforms.uSunDir?.value as THREE.Vector3 | undefined;
      planetCenterUniform?.copy(planetCenter);
      sunDirUniform?.copy(sunDirWorld).normalize();
      if (sparkMat.uniforms.uTime) sparkMat.uniforms.uTime.value = time;
    },
  };
}
