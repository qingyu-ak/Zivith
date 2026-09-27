import * as THREE from 'three';

const NOISE_GLSL = `
float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}
float fbm(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  float n = 0.0;
  for (int i = 0; i < 5; i++) {
    s += noise(p) * a;
    n += a;
    a *= 0.5;
    p *= 2.07;
  }
  return s / n;
}
`;

/** 恒星表面：对流粒状结构、黑子、边缘变暗、活动区闪烁。 */
export function makeSunMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vObj;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vObj = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vObj;
      ${NOISE_GLSL}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 view = normalize(-vView);
        float mu = max(0.0, dot(n, view));
        float limb = 1.0 - 0.68 * (1.0 - mu);
        vec3 dir = normalize(vObj);
        vec3 flow = dir * 18.0 + vec3(uTime * 0.07, uTime * 0.025, -uTime * 0.04);
        float gran = fbm(flow);
        float lanes = pow(1.0 - gran, 2.4);
        float spotN = fbm(dir * 26.0 + vec3(2.4, uTime * 0.008, 7.1));
        float spots = smoothstep(0.9, 0.97, spotN) * mu;
        vec3 hot = vec3(1.28, 1.12, 0.78);
        vec3 mid = vec3(1.05, 0.62, 0.16);
        vec3 cool = vec3(0.72, 0.22, 0.04);
        vec3 col = mix(cool, mid, clamp(limb, 0.0, 1.0));
        col = mix(col, hot, pow(mu, 1.6) * (0.55 + gran * 0.45));
        col *= 0.88 + gran * 0.18;
        col -= vec3(0.22, 0.18, 0.08) * lanes * 0.35;
        col *= 1.0 - spots * 0.45;
        col += vec3(1.1, 0.85, 0.4) * pow(mu, 12.0) * 0.12;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/** 日冕：贴着光球的一圈边缘纤维，不要包一层黄雾球。 */
export function makeCoronaMesh(radius: number): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vObj;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vObj = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vObj;
      ${NOISE_GLSL}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 view = normalize(-vView);
        float fres = pow(1.0 - abs(dot(n, view)), 6.4);
        vec3 dir = normalize(vObj);
        float stream = fbm(dir * 11.0 + vec3(uTime * 0.1, 0.0, -uTime * 0.07));
        float fiber = pow(max(0.0, stream - 0.48), 1.8);
        float a = fres * (0.04 + fiber * 0.55);
        vec3 col = mix(vec3(1.2, 1.05, 0.82), vec3(1.35, 1.22, 1.0), fiber);
        gl_FragColor = vec4(col, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.085, 64, 48), material);
}

/** 日冕粒子流：从光球向外的短纤维，替代大范围黄色辉光。 */
export function makeCoronaParticles(radius: number, count = 1400): THREE.Points {
  const dirs = new Float32Array(count * 3);
  const r0 = new Float32Array(count);
  const phase = new Float32Array(count);
  const size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const dx = Math.sin(phi) * Math.cos(theta);
    const dy = Math.cos(phi);
    const dz = Math.sin(phi) * Math.sin(theta);
    dirs[i * 3] = dx;
    dirs[i * 3 + 1] = dy;
    dirs[i * 3 + 2] = dz;
    r0[i] = radius * (1.02 + Math.pow(Math.random(), 1.6) * 0.34);
    phase[i] = Math.random() * Math.PI * 2;
    size[i] = 0.7 + Math.random() * 1.6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('aDir', new THREE.BufferAttribute(dirs, 3));
  geo.setAttribute('aR0', new THREE.BufferAttribute(r0, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 48 }, uStarR: { value: radius } },
    vertexShader: `
      attribute vec3 aDir;
      attribute float aR0;
      attribute float aPhase;
      attribute float aSize;
      uniform float uTime;
      uniform float uScale;
      uniform float uStarR;
      varying float vAlpha;
      varying vec3 vCol;
      void main() {
        float pulse = 0.012 * sin(uTime * 0.55 + aPhase);
        vec3 pos = aDir * (aR0 + pulse);
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(0.8, aSize * uScale / max(1.0, -mv.z));
        float reach = clamp((aR0 - uStarR * 1.02) / max(uStarR * 0.34, 0.001), 0.0, 1.0);
        vAlpha = (1.0 - reach * 0.75) * (0.55 + 0.25 * sin(uTime * 1.1 + aPhase));
        vCol = mix(vec3(1.35, 1.12, 0.72), vec3(1.2, 0.7, 0.28), reach);
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      varying vec3 vCol;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float d = dot(p, p);
        if (d > 1.0) discard;
        float core = exp(-d * 4.2);
        gl_FragColor = vec4(vCol * core, vAlpha * core);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  points.renderOrder = 1;
  return points;
}

/** 日珥：贴着光球边缘的弧，明暗随时间起伏。 */
export function makeProminenceGroup(radius: number): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.TorusGeometry(radius * 1.12, radius * 0.016, 8, 56, Math.PI * 0.38);
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPhase: { value: i * 1.17 },
      },
      vertexShader: `
        varying float vU;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vU = uv.x;
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uPhase;
        varying float vU;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float ndv = abs(dot(normalize(vNormal), normalize(-vView)));
          if (ndv > 0.22) discard;
          float pulse = 0.4 + 0.6 * sin(uTime * (0.9 + fract(uPhase) * 0.7) + uPhase);
          float along = sin(vU * 3.14159);
          float a = along * along * pulse * 0.85;
          gl_FragColor = vec4(1.0, 0.48, 0.12, a);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo.clone(), mat);
    const a = (i / 6) * Math.PI * 2;
    mesh.rotation.set(Math.sin(a) * 0.9, a, Math.cos(a * 1.3) * 0.55);
    group.add(mesh);
  }
  geo.dispose();
  return group;
}

/** 极光环：贴着地球极冠缓慢呼吸。 */
export function makeAuroraMesh(radius: number): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vObj;
      varying vec3 vView;
      void main() {
        vObj = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vObj;
      varying vec3 vView;
      ${NOISE_GLSL}
      void main() {
        vec3 dir = normalize(vObj);
        float polar = abs(dir.y);
        float band = smoothstep(0.62, 0.78, polar) * (1.0 - smoothstep(0.9, 0.98, polar));
        float wave = fbm(dir * 10.0 + vec3(uTime * 0.06, 0.0, uTime * 0.04));
        float a = band * (0.06 + wave * 0.1);
        vec3 col = mix(vec3(0.25, 0.85, 0.55), vec3(0.4, 0.55, 0.95), wave);
        gl_FragColor = vec4(col, a);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.03, 48, 32), material);
}

export function tickStarBody(root: THREE.Object3D, time: number): void {
  root.traverse((obj) => {
    const mat = (obj as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
    if (mat?.uniforms?.uTime) mat.uniforms.uTime.value = time;
  });
}
