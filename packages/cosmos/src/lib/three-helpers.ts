import * as THREE from 'three';

/** 按 1080p 像素密度输出：窗口较小时提高 DPR，最大 2.5x。 */
export function setupRenderer(renderer: THREE.WebGLRenderer, width: number, height: number): void {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const need = Math.max(1920 / w, 1080 / h);
  const dpr = Math.min(Math.max(window.devicePixelRatio || 1, need), 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, true);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}
export function wantsStill(): boolean {
  return new URLSearchParams(window.location.search).has('still');
}

/** 径向渐变辉光贴图（canvas 生成，无外部素材） */
export function makeGlowTexture(size = 128, stops?: Array<[number, string]>): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const applied: Array<[number, string]> = stops ?? [
    [0, 'rgba(255,255,255,1)'],
    [0.22, 'rgba(255,255,255,0.6)'],
    [0.55, 'rgba(255,255,255,0.12)'],
    [1, 'rgba(255,255,255,0)'],
  ];
  for (const [offset, color] of applied) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/* ---------- 相机 tween ---------- */

export interface CameraTweenHandle {
  cancel(): void;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

interface TweenableControls {
  target: THREE.Vector3;
  update(): void;
  enabled: boolean;
}

export function tweenCamera(options: {
  camera: THREE.PerspectiveCamera;
  controls: TweenableControls;
  toPosition: THREE.Vector3;
  toTarget: THREE.Vector3;
  toUp?: THREE.Vector3;
  durationMs?: number;
  onDone?: () => void;
}): CameraTweenHandle {
  const { camera, controls, toPosition, toTarget, toUp, durationMs = 1300, onDone } = options;
  const fromPosition = camera.position.clone();
  const fromTarget = controls.target.clone();
  const fromUp = camera.up.clone();
  const start = performance.now();
  let cancelled = false;

  const step = () => {
    if (cancelled) return;
    const t = Math.min(1, (performance.now() - start) / durationMs);
    const k = easeInOutCubic(t);
    camera.position.lerpVectors(fromPosition, toPosition, k);
    controls.target.lerpVectors(fromTarget, toTarget, k);
    if (toUp) camera.up.copy(fromUp).lerp(toUp, k).normalize();
    controls.update();
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      if (toUp) camera.up.copy(toUp);
      controls.enabled = true;
      onDone?.();
    }
  };
  controls.enabled = false;
  requestAnimationFrame(step);

  return {
    cancel() {
      cancelled = true;
      controls.enabled = true;
    },
  };
}

/** 3D 点投影到屏幕像素坐标 */
export function projectToScreen(
  v: THREE.Vector3,
  camera: THREE.Camera,
  width: number,
  height: number,
): { x: number; y: number; visible: boolean } {
  const p = v.clone().project(camera);
  return {
    x: (p.x * 0.5 + 0.5) * width,
    y: (-p.y * 0.5 + 0.5) * height,
    visible: p.z < 1,
  };
}

/** 在宿主元素里创建一个绝对定位的 HTML 名牌 */
export function createLabel(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}
