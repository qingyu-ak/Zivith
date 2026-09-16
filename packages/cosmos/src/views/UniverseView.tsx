import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { UniverseBubble } from '../data/mock-universe';
import { hueFromId, seededRandom } from '../lib/palette';
import {
  createStarfield,
  makeNebulaGlowTexture,
  makeNebulaTexture,
  makeStarSpikeTexture,
} from '../lib/starfield';
import { createLabel, projectToScreen, setupRenderer, wantsStill } from '../lib/three-helpers';

interface Props {
  bubbles: UniverseBubble[];
  enteringId: string | null;
  onEnter: (bubble: UniverseBubble) => void;
  active?: boolean;
  initialFocusId?: string | null;
}

const GAP = 6.45;
const CAM_Z = 13.6;
const SHARED_SKY = { width: 2048, height: 1024 } as const;

function wrapIndex(i: number, n: number): number {
  if (n <= 0) return 0;
  return ((i % n) + n) % n;
}

function wrapDelta(i: number, scroll: number, n: number): number {
  if (n <= 1) return i - scroll;
  let d = i - scroll;
  d -= n * Math.round(d / n);
  return d;
}

function nebulaRgb(id: string): [number, number, number] {
  const hue = hueFromId(id);
  const color = new THREE.Color().setHSL(hue / 360, 0.52, 0.62);
  return [Math.round(color.r * 255), Math.round(color.g * 255), Math.round(color.b * 255)];
}

export function UniverseView({
  bubbles,
  enteringId,
  onEnter,
  active = true,
  initialFocusId = null,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [focusId, setFocusId] = useState(
    initialFocusId && bubbles.some((bubble) => bubble.id === initialFocusId)
      ? initialFocusId
      : (bubbles[0]?.id ?? null),
  );
  const enteringRef = useRef<string | null>(null);
  const onEnterRef = useRef(onEnter);
  const goRef = useRef<(dir: number) => void>(() => undefined);
  const activeRef = useRef(active);
  const focusIdRef = useRef(focusId);
  enteringRef.current = enteringId;
  onEnterRef.current = onEnter;
  activeRef.current = active;
  focusIdRef.current = focusId;

  useEffect(() => {
    const host = hostRef.current;
    const overlay = overlayRef.current;
    if (!host || !overlay || bubbles.length === 0) return;

    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    setupRenderer(renderer, width, height);
    renderer.setClearColor(new THREE.Color('#000105'), 1);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 240);
    camera.position.set(0, 0.18, CAM_Z);
    camera.lookAt(0, 0, 0);

    const sky = createStarfield('cosmos-sky', 110, SHARED_SKY);
    scene.add(sky.group);

    const strip = new THREE.Group();
    scene.add(strip);

    const extraTextures: THREE.Texture[] = [];
    const extraMats: THREE.Material[] = [];
    const spikeTex = makeStarSpikeTexture(96);
    extraTextures.push(spikeTex);
    const clusterMat = new THREE.SpriteMaterial({
      map: spikeTex,
      color: 0xe8f0ff,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    extraMats.push(clusterMat);

    const entries = bubbles.map((bubble, i) => {
      const rgb = nebulaRgb(bubble.id);
      const color = new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
      const group = new THREE.Group();
      group.position.set(i * GAP, 0, 0);
      strip.add(group);

      const glowTex = makeNebulaGlowTexture(rgb, 256);
      extraTextures.push(glowTex);
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          color,
          transparent: true,
          opacity: 0.38,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const cloudScale = 3.85 + (i % 3) * 0.32;
      halo.scale.set(cloudScale * 1.48, cloudScale * 1.02, 1);
      group.add(halo);

      const nebulaTex = makeNebulaTexture('nebula:' + bubble.id, rgb, 512);
      extraTextures.push(nebulaTex);
      const cloud = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: nebulaTex,
          transparent: true,
          opacity: 1,
          depthWrite: false,
        }),
      );
      cloud.scale.set(cloudScale * 1.18, cloudScale * 0.86, 1);
      group.add(cloud);

      const dustTex = makeNebulaTexture('dust:' + bubble.id, rgb, 256);
      extraTextures.push(dustTex);
      const dust = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: dustTex,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      );
      dust.scale.set(cloudScale * 1.42, cloudScale * 0.7, 1);
      dust.position.z = -0.18;
      group.add(dust);

      const core = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: spikeTex,
          color: 0xffffff,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      core.scale.setScalar(0.34);
      group.add(core);

      const rand = seededRandom('cluster:' + bubble.id);
      const clusterCount = 3 + (i % 2);
      for (let s = 0; s < clusterCount; s++) {
        const star = new THREE.Sprite(clusterMat);
        const a = rand() * Math.PI * 2;
        const rad = 0.55 + rand() * 1.35;
        star.position.set(
          Math.cos(a) * rad * 1.25,
          Math.sin(a) * rad * 0.72,
          (rand() - 0.5) * 0.35,
        );
        star.scale.setScalar(0.04 + rand() * 0.07);
        group.add(star);
      }

      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(1.85, 12, 10),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hit.userData = { index: i };
      group.add(hit);

      const label = createLabel('name-label universe-label');
      label.innerHTML = `${bubble.name}<span class="sub">${bubble.genre ?? '世界'}</span>`;
      overlay.appendChild(label);

      return { bubble, group, halo, cloud, dust, core, hit, label, cloudScale, index: i };
    });

    if (entries.length > 1) {
      const anchors = entries.map((e) => e.group.position.clone());
      const curve = new THREE.CatmullRomCurve3(anchors, false, 'catmullrom', 0.35);
      const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(96));
      const line = new THREE.Line(
        geo,
        new THREE.LineDashedMaterial({
          color: 0xb8c8ee,
          dashSize: 0.22,
          gapSize: 0.14,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      );
      line.computeLineDistances();
      strip.add(line);
    }

    const n = bubbles.length;
    const span = n * GAP;
    const kept = focusIdRef.current ? bubbles.findIndex((b) => b.id === focusIdRef.current) : 0;
    let index = kept >= 0 ? kept : 0;
    let x = index * GAP;
    let targetX = x;
    let vel = 0;
    let dragging = false;
    let downX = 0;
    let downY = 0;
    let lastX = 0;
    let lastT = performance.now();
    let entering = false;
    let enterAt = 0;
    let wheelLock = 0;
    const loopable = n > 1;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const hits = entries.map((e) => e.hit);
    const tmp = new THREE.Vector3();
    renderer.domElement.style.touchAction = 'none';

    const setPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
    };

    const hitIndex = () => {
      const hit = raycaster.intersectObjects(hits, false)[0];
      return hit ? (hit.object.userData.index as number) : -1;
    };

    const snapTo = (next: number) => {
      if (n <= 0) return;
      const dest = loopable ? wrapIndex(next, n) : Math.max(0, Math.min(n - 1, next));
      let destX = dest * GAP;
      if (loopable) destX += Math.round((x - destX) / span) * span;
      index = dest;
      targetX = destX;
      setFocusId(bubbles[dest].id);
    };

    goRef.current = (dir: number) => snapTo(index + dir);

    const enterWorld = (i = index) => {
      if (entering) return;
      entering = true;
      enterAt = performance.now();
      snapTo(i);
      window.setTimeout(() => onEnterRef.current(bubbles[wrapIndex(i, n)]), 220);
    };

    const onDown = (event: PointerEvent) => {
      if (!activeRef.current) return;
      dragging = true;
      downX = lastX = event.clientX;
      downY = event.clientY;
      vel = 0;
      lastT = performance.now();
      renderer.domElement.setPointerCapture(event.pointerId);
    };

    const onMove = (event: PointerEvent) => {
      if (!dragging) {
        renderer.domElement.style.cursor = 'grab';
        return;
      }
      const now = performance.now();
      const dtMove = Math.max(8, now - lastT);
      const dx = event.clientX - lastX;
      const worldDx = (dx / (host.clientWidth || 1)) * GAP * 1.65;
      x -= worldDx;
      if (!loopable) x = Math.max(0, Math.min((n - 1) * GAP, x));
      vel = worldDx / dtMove;
      lastX = event.clientX;
      lastT = now;
      renderer.domElement.style.cursor = 'grabbing';
      const nearest = loopable
        ? wrapIndex(Math.round(x / GAP), n)
        : Math.max(0, Math.min(n - 1, Math.round(x / GAP)));
      if (nearest !== index) {
        index = nearest;
        setFocusId(bubbles[nearest].id);
      }
    };

    const onUp = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      const dist = Math.hypot(event.clientX - downX, event.clientY - downY);
      if (dist < 8) {
        setPointer(event);
        const i = hitIndex();
        if (i === index) enterWorld(i);
        else if (i >= 0) snapTo(i);
        return;
      }
      const swipe = (event.clientX - downX) / (host.clientWidth || 1);
      if (Math.abs(vel) > 0.009 || Math.abs(swipe) > 0.12) {
        snapTo(index + (vel > 0 || swipe > 0 ? -1 : 1));
      } else {
        snapTo(Math.round(x / GAP));
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!activeRef.current) return;
      const now = performance.now();
      if (now < wheelLock) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (Math.abs(delta) < 10) return;
      wheelLock = now + 240;
      snapTo(index + (delta > 0 ? 1 : -1));
    };

    const onKey = (event: KeyboardEvent) => {
      if (!activeRef.current) return;
      if (event.key === 'ArrowRight') snapTo(index + 1);
      else if (event.key === 'ArrowLeft') snapTo(index - 1);
      else if (event.key === 'Enter') enterWorld();
    };

    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointercancel', onUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      setupRenderer(renderer, w, h);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const clock = new THREE.Clock();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!activeRef.current) {
        entering = false;
        dragging = false;
        return;
      }
      if (entering && !enteringRef.current && performance.now() - enterAt > 900) {
        entering = false;
      }
      const dt = Math.min(0.033, clock.getDelta());
      const t = clock.elapsedTime;
      if (!wantsStill()) sky.update(dt, t);

      if (!dragging) {
        const spring = 1 - Math.exp(-dt * 16);
        x += (targetX - x) * spring;
        if (Math.abs(targetX - x) < 0.006) {
          x = targetX;
          if (loopable) {
            const wrapped = ((x % span) + span) % span;
            x = wrapped;
            targetX = wrapped;
          }
        }
        vel *= 0.78;
      }
      const scroll = x / GAP;
      strip.position.x = -x;

      const viewW = host.clientWidth || 1;
      const viewH = host.clientHeight || 1;
      const z = CAM_Z / (entering || enteringRef.current ? 1.28 : 1);
      camera.position.z += (z - camera.position.z) * Math.min(1, dt * 10);
      camera.position.x = 0;
      camera.position.y = 0.18;
      camera.lookAt(0, 0, 0);

      for (const entry of entries) {
        const d = wrapDelta(entry.index, scroll, n);
        entry.group.position.x = x + d * GAP;
        const dist = Math.abs(d);
        const focused = dist < 0.42;
        const enteringThis = entering && entry.index === index;
        const cover = 0.42 + 1.08 * Math.exp(-dist * dist * 1.55);
        const scale =
          (enteringThis ? cover * 1.08 : cover) * (1 + 0.012 * Math.sin(t * 1.2 + entry.index));
        entry.group.scale.setScalar(scale);
        entry.group.position.z = -Math.min(2.4, dist * 1.55);
        entry.cloud.material.opacity = 0.32 + 0.68 * Math.exp(-dist * dist * 1.1);
        entry.dust.material.opacity = 0.12 + 0.38 * Math.exp(-dist * dist);
        entry.halo.material.opacity = 0.16 + 0.56 * Math.exp(-dist * dist);
        entry.core.material.opacity = 0.28 + 0.72 * Math.exp(-dist * dist);
        entry.core.scale.setScalar(
          (focused ? 0.42 : 0.2) * (1 + 0.08 * Math.sin(t * 1.8 + entry.index)),
        );
        if (!wantsStill()) {
          entry.cloud.material.rotation = t * 0.035 + entry.index;
          entry.dust.material.rotation = -t * 0.022 + entry.index * 0.4;
        }

        entry.group.getWorldPosition(tmp);
        const { x: sx, y: sy, visible } = projectToScreen(tmp, camera, viewW, viewH);
        if (!visible || dist > 1.15) {
          entry.label.style.display = 'none';
          continue;
        }
        entry.label.style.display = '';
        entry.label.classList.toggle('focus', focused);
        entry.label.style.left = `${sx}px`;
        entry.label.style.top = `${sy + (focused ? 118 : 72)}px`;
      }

      if (activeRef.current) renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    setFocusId(bubbles[index].id);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointercancel', onUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      for (const entry of entries) entry.label.remove();
      sky.dispose();
      scene.remove(sky.group);
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose?.();
      });
      for (const tex of extraTextures) tex.dispose();
      for (const mat of extraMats) mat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [bubbles]);

  const focused = bubbles.find((b) => b.id === focusId);
  const canLoop = bubbles.length > 1;

  return (
    <div className="view-wrap">
      <div ref={hostRef} className="stage" />
      <div ref={overlayRef} className="overlay-labels" />
      <div className="gallery-slot" aria-hidden="true">
        <i className="c-tr" />
        <i className="c-bl" />
      </div>
      <button
        className="gallery-arrow left"
        type="button"
        aria-label="上一个宇宙"
        disabled={!canLoop}
        onClick={() => goRef.current(-1)}
      >
        ‹
      </button>
      <button
        className="gallery-arrow right"
        type="button"
        aria-label="下一个宇宙"
        disabled={!canLoop}
        onClick={() => goRef.current(1)}
      >
        ›
      </button>
      <div className="gallery-dots" aria-hidden="true">
        {bubbles.map((bubble) => (
          <span key={bubble.id} className={bubble.id === focusId ? 'on' : ''} />
        ))}
      </div>
      <div className="hud-top-left">
        <div className="breadcrumb">
          <span className="crumb">一个宇宙</span>
        </div>
      </div>
      <div className="hint">循环滑动选择宇宙 · 松手后居中停住 · 点击中间星云进入</div>
      {focused && (
        <div className="tooltip universe-tip" style={{ right: 20, bottom: 20 }}>
          <h4>{focused.name}</h4>
          <p>{focused.description || '进入这个世界的空间。'}</p>
        </div>
      )}
    </div>
  );
}
