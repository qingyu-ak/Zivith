import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RegionSpaceNode } from '../lib/space-model';
import { buildSiteLayout, type SiteLayout, type SiteParcel } from '../lib/site-map-model';
import { createLabel, projectToScreen, setupRenderer } from '../lib/three-helpers';

interface Props {
  region: RegionSpaceNode;
  onClose: () => void;
  onSelectScene: (sceneId: string) => void;
}

function parcelMaterial(parcel: SiteParcel): THREE.MeshStandardMaterial {
  const water = parcel.kind === 'water';
  const scene = parcel.kind === 'scene';
  const road = parcel.kind === 'road';
  return new THREE.MeshStandardMaterial({
    color: parcel.color,
    roughness: water ? 0.18 : road ? 0.62 : 0.78,
    metalness: water ? 0.28 : 0.05,
    emissive: new THREE.Color(scene || water ? parcel.color : '#0c1018'),
    emissiveIntensity: scene ? 0.18 : water ? 0.12 : 0.03,
  });
}

function addEdges(mesh: THREE.Mesh, color = 0xb7c8e4, opacity = 0.32) {
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 22),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
  mesh.add(edges);
}

function addMassing(parcel: SiteParcel, root: THREE.Group): THREE.Object3D {
  const mat = parcelMaterial(parcel);
  if (parcel.kind !== 'scene') {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(parcel.w, parcel.h, parcel.d), mat);
    mesh.position.set(parcel.x, parcel.h * 0.5, parcel.z);
    mesh.rotation.y = parcel.rot;
    mesh.userData = { sceneId: null, kind: parcel.kind };
    addEdges(
      mesh,
      parcel.kind === 'water' ? 0x8fd0ea : 0x9aacc4,
      parcel.kind === 'water' ? 0.18 : 0.28,
    );
    root.add(mesh);
    return mesh;
  }

  const group = new THREE.Group();
  group.position.set(parcel.x, 0, parcel.z);
  group.rotation.y = parcel.rot;
  group.userData = { sceneId: parcel.sceneId ?? null, kind: 'scene' };

  if (parcel.massing === 'tower') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.58, parcel.h, 12), mat);
    shaft.position.y = parcel.h * 0.5;
    addEdges(shaft, 0xd7e4ff, 0.45);
    const lantern = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.38, 10),
      new THREE.MeshStandardMaterial({
        color: '#f4e2a8',
        emissive: '#f4c56a',
        emissiveIntensity: 0.7,
        roughness: 0.35,
      }),
    );
    lantern.position.y = parcel.h + 0.22;
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 0.62, 10),
      new THREE.MeshStandardMaterial({ color: '#2a3140', roughness: 0.7 }),
    );
    roof.position.y = parcel.h + 0.58;
    group.add(shaft, lantern, roof);
  } else if (parcel.massing === 'hall') {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(parcel.w * 0.92, parcel.h, parcel.d * 0.72),
      mat,
    );
    body.position.y = parcel.h * 0.5;
    addEdges(body, 0xd7e4ff, 0.42);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(parcel.w * 1.02, 0.18, parcel.d * 0.82),
      new THREE.MeshStandardMaterial({ color: '#1c2430', roughness: 0.65 }),
    );
    roof.position.y = parcel.h + 0.12;
    roof.rotation.z = 0.08;
    group.add(body, roof);
  } else {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(parcel.w, 0.16, parcel.d), mat);
    pad.position.y = 0.1;
    addEdges(pad, 0xd7e4ff, 0.5);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(parcel.w * 0.22, parcel.w * 0.32, 24),
      new THREE.MeshBasicMaterial({
        color: parcel.color,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.2;
    group.add(pad, ring);
  }

  root.add(group);
  return group;
}

function SitePlanSvg({
  layout,
  onSelectScene,
}: {
  layout: SiteLayout;
  onSelectScene: (sceneId: string) => void;
}) {
  const e = layout.extent;
  const pad = 1.6;
  const view = e + pad * 2;
  const toX = (x: number, w: number) => x - w / 2;
  const toY = (z: number, d: number) => -z - d / 2;

  return (
    <div className="sitemap-plan">
      <svg
        viewBox={`${-view / 2} ${-view / 2} ${view} ${view}`}
        role="img"
        aria-label={`${layout.title}平面图`}
      >
        <defs>
          <pattern id="site-waves" width="0.9" height="0.46" patternUnits="userSpaceOnUse">
            <path
              d="M0 0.26 Q0.22 0.08 0.45 0.26 T0.9 0.26"
              fill="none"
              stroke="#8fd4ea"
              strokeWidth="0.05"
              opacity="0.4"
            />
          </pattern>
          <pattern id="site-hatch" width="1.2" height="1.2" patternUnits="userSpaceOnUse">
            <path d="M0 1.2 L1.2 0" stroke="#6d7c92" strokeWidth="0.05" opacity="0.35" />
          </pattern>
        </defs>
        <rect
          x={-e / 2 - 0.7}
          y={-e / 2 - 0.7}
          width={e + 1.4}
          height={e + 1.4}
          rx="0.4"
          fill="#121820"
          stroke="#5d7190"
          strokeWidth="0.18"
        />
        {layout.parcels
          .filter((p) => p.kind !== 'scene')
          .map((p) => {
            const fill =
              p.kind === 'water'
                ? 'url(#site-waves)'
                : p.kind === 'green'
                  ? 'url(#site-hatch)'
                  : p.color;
            const under = p.kind === 'water' || p.kind === 'green' ? p.color : undefined;
            return (
              <g key={p.id}>
                {under && (
                  <rect
                    x={toX(p.x, p.w)}
                    y={toY(p.z, p.d)}
                    width={p.w}
                    height={p.d}
                    fill={under}
                    opacity="0.95"
                  />
                )}
                <rect
                  x={toX(p.x, p.w)}
                  y={toY(p.z, p.d)}
                  width={p.w}
                  height={p.d}
                  fill={fill}
                  stroke={p.kind === 'road' ? '#8a97aa' : '#6a7c94'}
                  strokeWidth={p.kind === 'road' ? 0.08 : 0.06}
                  opacity={p.kind === 'ground' ? 0.95 : 1}
                />
              </g>
            );
          })}
        {layout.parcels
          .filter((p) => p.kind === 'scene')
          .map((p) => (
            <g
              key={p.id}
              className="scene-hit"
              onClick={() => p.sceneId && onSelectScene(p.sceneId)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && p.sceneId)
                  onSelectScene(p.sceneId);
              }}
            >
              <rect
                x={toX(p.x, p.w)}
                y={toY(p.z, p.d)}
                width={p.w}
                height={p.d}
                rx={p.massing === 'tower' ? 1.05 : 0.28}
                fill={p.color}
                fillOpacity="0.42"
                stroke={p.color}
                strokeWidth="0.16"
              />
              <text
                x={p.x}
                y={-p.z}
                textAnchor="middle"
                dominantBaseline="middle"
                className="plan-label"
              >
                {p.label}
              </text>
            </g>
          ))}
        <g className="plan-compass" transform={`translate(${e / 2 - 2.2} ${-e / 2 + 2.4})`}>
          <circle r="1.15" fill="#0e141c" stroke="#8aa0c0" strokeWidth="0.08" />
          <path d="M0 -0.85 L0.28 0.55 L0 0.28 L-0.28 0.55 Z" fill="#e8eefc" />
          <text y="1.7" textAnchor="middle" className="plan-n">
            N
          </text>
        </g>
        <text x={-e / 2 + 0.8} y={e / 2 - 0.7} className="plan-scale">
          示意平面 · 非测绘
        </text>
      </svg>
    </div>
  );
}

export function SiteMap({ region, onClose, onSelectScene }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'iso' | 'plan'>('iso');
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const layout = useMemo(() => buildSiteLayout(region), [region]);
  const onSelectRef = useRef(onSelectScene);
  onSelectRef.current = onSelectScene;

  useEffect(() => {
    const host = hostRef.current;
    const overlay = overlayRef.current;
    if (!host || !overlay) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    setupRenderer(renderer, host.clientWidth || 1, host.clientHeight || 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setClearColor(new THREE.Color('#0a1018'), 1);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a1018, 36, 78);
    const persp = new THREE.PerspectiveCamera(
      36,
      (host.clientWidth || 1) / (host.clientHeight || 1),
      0.1,
      200,
    );
    const ortho = new THREE.OrthographicCamera(-18, 18, 12, -12, 0.1, 200);
    persp.position.set(26, 24, 26);
    ortho.position.set(0, 32, 0.01);
    ortho.up.set(0, 0, -1);
    ortho.lookAt(0, 0, 0);

    const controls = new OrbitControls(persp, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);
    controls.maxPolarAngle = 1.18;
    controls.minDistance = 18;
    controls.maxDistance = 52;
    controls.enablePan = false;

    scene.add(new THREE.HemisphereLight(0xc8d8f4, 0x1a2430, 0.55));
    const key = new THREE.DirectionalLight(0xfff4e4, 1.28);
    key.position.set(14, 24, 10);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x7aa0ff, 0.28);
    fill.position.set(-16, 10, -8);
    scene.add(fill);

    const root = new THREE.Group();
    scene.add(root);

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(layout.extent + 2.6, 0.2, layout.extent + 2.6),
      new THREE.MeshStandardMaterial({ color: '#10161f', roughness: 0.92 }),
    );
    board.position.y = -0.16;
    root.add(board);

    const scenePick: THREE.Object3D[] = [];
    const labels: Array<{ el: HTMLDivElement; parcel: SiteParcel }> = [];

    for (const parcel of layout.parcels) {
      const obj = addMassing(parcel, root);
      if (parcel.kind === 'scene') {
        scenePick.push(obj);
        const el = createLabel('name-label sitemap-label');
        el.textContent = parcel.label ?? '';
        overlay.appendChild(el);
        labels.push({ el, parcel });
      }
    }

    const grid = new THREE.GridHelper(layout.extent, 14, 0x3a4c66, 0x243044);
    grid.position.y = 0.06;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.28;
    root.add(grid);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    const setPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };
    const activeCam = () => (modeRef.current === 'plan' ? ortho : persp);
    const onMove = (event: PointerEvent) => {
      if (modeRef.current === 'plan') return;
      setPointer(event);
      raycaster.setFromCamera(pointer, activeCam());
      renderer.domElement.style.cursor = raycaster.intersectObjects(scenePick, true)[0]
        ? 'pointer'
        : 'grab';
    };
    const onDown = (event: PointerEvent) => {
      downX = event.clientX;
      downY = event.clientY;
    };
    const onUp = (event: PointerEvent) => {
      if (modeRef.current === 'plan') return;
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > 6) return;
      setPointer(event);
      raycaster.setFromCamera(pointer, activeCam());
      const hit = raycaster.intersectObjects(scenePick, true)[0];
      let obj: THREE.Object3D | null = hit?.object ?? null;
      while (obj && !obj.userData.sceneId) obj = obj.parent;
      const id = obj?.userData.sceneId as string | undefined;
      if (id) onSelectRef.current(id);
    };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      setupRenderer(renderer, w, h);
      persp.aspect = w / h;
      persp.updateProjectionMatrix();
      const aspect = w / h;
      ortho.left = -14 * aspect;
      ortho.right = 14 * aspect;
      ortho.top = 14;
      ortho.bottom = -14;
      ortho.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0;
    const tmp = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const cam = activeCam();
      const plan = modeRef.current === 'plan';
      renderer.domElement.style.visibility = plan ? 'hidden' : 'visible';
      controls.enabled = !plan;
      if (!plan) controls.update();
      const viewW = host.clientWidth || 1;
      const viewH = host.clientHeight || 1;
      for (const item of labels) {
        if (plan) {
          item.el.style.display = 'none';
          continue;
        }
        tmp.set(item.parcel.x, item.parcel.h + 0.55, item.parcel.z);
        const { x, y, visible } = projectToScreen(tmp, cam, viewW, viewH);
        if (!visible) {
          item.el.style.display = 'none';
          continue;
        }
        item.el.style.display = '';
        item.el.style.left = `${x}px`;
        item.el.style.top = `${y - 18}px`;
      }
      if (!plan) renderer.render(scene, cam);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      for (const item of labels) item.el.remove();
      controls.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose?.();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [layout]);

  return (
    <div className="sitemap-layer">
      <div ref={hostRef} className="stage" />
      <div ref={overlayRef} className="overlay-labels" />
      {mode === 'plan' && <SitePlanSvg layout={layout} onSelectScene={onSelectScene} />}
      <div className="sitemap-bar">
        <div className="sitemap-legend">
          <span>
            <i className="swatch scene" />
            场景
          </span>
          <span>
            <i className="swatch block" />
            街区
          </span>
          <span>
            <i className="swatch water" />
            水面
          </span>
        </div>
        <div className="sitemap-actions">
          <button
            type="button"
            className={`hud-chip${mode === 'iso' ? ' on' : ''}`}
            onClick={() => setMode('iso')}
          >
            3D 轴测
          </button>
          <button
            type="button"
            className={`hud-chip${mode === 'plan' ? ' on' : ''}`}
            onClick={() => setMode('plan')}
          >
            2D 平面
          </button>
          <button type="button" className="hud-chip" onClick={onClose}>
            返回俯视
          </button>
        </div>
      </div>
      {layout.parcels.every((p) => p.kind !== 'scene') && (
        <div className="sitemap-empty">
          这个地点还没有场景。在 Studio 里写一场之后，这里会出现可点的空间单元。
        </div>
      )}
      <div className="hint sitemap-hint">点击分区进入场景 · ESC 返回俯视</div>
    </div>
  );
}
