import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { WorldResourcesDTO } from '../types';
import { buildCosmosGraph, starScale, type CosmosGraph } from '../lib/cosmos-model';
import {
  createLabel,
  makeGlowTexture,
  projectToScreen,
  tweenCamera,
  wantsStill,
  type CameraTweenHandle,
} from '../lib/three-helpers';

interface Props {
  resources: WorldResourcesDTO;
}

const OVERVIEW_POSITION = new THREE.Vector3(0, 7, 24);
const OVERVIEW_TARGET = new THREE.Vector3(0, 0, 0);

interface WorldRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  sprites: THREE.Sprite[];
  edgeLines: THREE.LineSegments;
  edgeColors: THREE.BufferAttribute;
  baseEdgeColors: Float32Array;
  dustLayers: Array<{ points: THREE.Points; speed: number; baseOpacity: number; phase: number }>;
  glowTex: THREE.CanvasTexture;
  tween: CameraTweenHandle | null;
  hoverIdxRef: { current: number | null };
  selectedIdxRef: { current: number | null };
  labelHost: HTMLDivElement;
  hoverLabel: HTMLDivElement;
  selectLabel: HTMLDivElement;
  resizeObserver: ResizeObserver;
  raf: number;
  dispose: () => void;
}

export function CharacterCosmos({ resources }: Props) {
  const graph = useMemo(() => buildCosmosGraph(resources), [resources]);
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<WorldRefs | null>(null);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const hoverIdxRef = useRef<number | null>(null);
  const selectedIdxRef = useRef<number | null>(null);
  hoverIdxRef.current = hoverIdx;
  selectedIdxRef.current = selectedIdx;

  const edgesOf = (idx: number) =>
    graph.edges
      .map((edge) => {
        const other = edge.a === idx ? edge.b : edge.b === idx ? edge.a : -1;
        return other >= 0 ? { edge, other } : null;
      })
      .filter((v): v is { edge: CosmosGraph['edges'][number]; other: number } => v !== null);

  const hoveredNode = hoverIdx !== null ? graph.nodes[hoverIdx] : null;
  const selectedNode = selectedIdx !== null ? graph.nodes[selectedIdx] : null;
  const selectedEdges = selectedIdx !== null ? edgesOf(selectedIdx) : [];

  const searchResults =
    query.trim().length > 0
      ? graph.nodes.filter((n) => n.name.toLowerCase().includes(query.trim().toLowerCase()))
      : [];

  /* ---------------- three.js 场景 ---------------- */

  useEffect(() => {
    const host = hostRef.current;
    const overlay = overlayRef.current;
    if (!host || !overlay) return;

    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(new THREE.Color('#04050c'), 1);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 800);
    camera.position.copy(OVERVIEW_POSITION);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.autoRotate = !wantsStill();
    controls.autoRotateSpeed = 0.35;
    controls.minDistance = 4;
    controls.maxDistance = 90;
    controls.target.copy(OVERVIEW_TARGET);

    const glowTex = makeGlowTexture(160);

    // —— 星座连线 —— //
    const edgePositions = new Float32Array(graph.edges.length * 6);
    const baseEdgeColors = new Float32Array(graph.edges.length * 6);
    const edgeBaseColorObjects = graph.edges.map((e) => new THREE.Color(e.color));
    graph.edges.forEach((edge, i) => {
      const a = graph.nodes[edge.a].position;
      const b = graph.nodes[edge.b].position;
      edgePositions.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
      baseEdgeColors.set(
        [
          edgeBaseColorObjects[i].r,
          edgeBaseColorObjects[i].g,
          edgeBaseColorObjects[i].b,
          edgeBaseColorObjects[i].r * 0.55,
          edgeBaseColorObjects[i].g * 0.55,
          edgeBaseColorObjects[i].b * 0.55,
        ],
        i * 6,
      );
    });
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));
    const edgeColors = new THREE.BufferAttribute(new Float32Array(baseEdgeColors), 3);
    edgeGeometry.setAttribute('color', edgeColors);
    const edgeLines = new THREE.LineSegments(
      edgeGeometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    scene.add(edgeLines);

    // —— 星点 —— //
    const sprites: THREE.Sprite[] = [];
    for (const node of graph.nodes) {
      const material = new THREE.SpriteMaterial({
        map: glowTex,
        color: new THREE.Color(node.color),
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(node.position);
      const s = starScale(node.degree);
      sprite.scale.setScalar(s);
      sprite.userData = { nodeIndex: graph.nodes.indexOf(node), baseScale: s };
      scene.add(sprite);
      sprites.push(sprite);
    }

    // —— 远景星尘（三层） —— //
    const dustLayers: WorldRefs['dustLayers'] = [];
    const dustSpecs: Array<{
      count: number;
      radius: number;
      size: number;
      speed: number;
      opacity: number;
    }> = [
      { count: 700, radius: 60, size: 0.5, speed: 0.005, opacity: 0.55 },
      { count: 500, radius: 95, size: 0.9, speed: -0.0035, opacity: 0.4 },
      { count: 350, radius: 140, size: 1.4, speed: 0.002, opacity: 0.28 },
    ];
    for (const spec of dustSpecs) {
      const positions = new Float32Array(spec.count * 3);
      const rand = (seed: number) => {
        const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
        return x - Math.floor(x);
      };
      for (let i = 0; i < spec.count; i++) {
        const u = rand(i * 3 + spec.radius) * 2 - 1;
        const theta = rand(i * 7 + spec.radius) * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        const r = spec.radius * (0.85 + rand(i * 11) * 0.3);
        positions.set([Math.cos(theta) * s * r, u * r, Math.sin(theta) * s * r], i * 3);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color: new THREE.Color('#9db4ff'),
        size: spec.size,
        sizeAttenuation: true,
        transparent: true,
        opacity: spec.opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(geometry, material);
      scene.add(points);
      dustLayers.push({
        points,
        speed: spec.speed,
        baseOpacity: spec.opacity,
        phase: Math.random() * 6,
      });
    }

    // —— HTML 名牌 —— //
    const labelHost = createLabel('overlay-labels');
    overlay.appendChild(labelHost);
    const hoverLabel = createLabel('name-label');
    const selectLabel = createLabel('name-label');
    hoverLabel.style.display = 'none';
    selectLabel.style.display = 'none';
    labelHost.appendChild(hoverLabel);
    labelHost.appendChild(selectLabel);

    // —— 焦点逻辑 —— //
    let tween: CameraTweenHandle | null = null;
    const applyFocus = (focusIdx: number | null) => {
      const neighbors = new Set<number>();
      if (focusIdx !== null) {
        for (const edge of graph.edges) {
          if (edge.a === focusIdx) neighbors.add(edge.b);
          if (edge.b === focusIdx) neighbors.add(edge.a);
        }
      }
      sprites.forEach((sprite, i) => {
        const mat = sprite.material;
        const base = sprite.userData.baseScale as number;
        if (focusIdx === null) {
          mat.opacity = 1;
          sprite.scale.setScalar(base);
        } else if (i === focusIdx) {
          mat.opacity = 1;
          sprite.scale.setScalar(base * 1.25);
        } else if (neighbors.has(i)) {
          mat.opacity = 0.95;
          sprite.scale.setScalar(base);
        } else {
          mat.opacity = 0.16;
          sprite.scale.setScalar(base * 0.7);
        }
      });
      const colorArr = edgeColors.array as Float32Array;
      for (let e = 0; e < graph.edges.length; e++) {
        const edge = graph.edges[e];
        const active = focusIdx === null || edge.a === focusIdx || edge.b === focusIdx;
        const k = active ? 1 : 0.1;
        for (let v = 0; v < 6; v++) {
          colorArr[e * 6 + v] = baseEdgeColors[e * 6 + v] * k;
        }
      }
      edgeColors.needsUpdate = true;
    };

    const flyTo = (idx: number) => {
      const node = graph.nodes[idx];
      const dir = node.position.clone();
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      const camPos = node.position
        .clone()
        .addScaledVector(dir, 6.5)
        .add(new THREE.Vector3(0, 1.6, 0));
      tween?.cancel();
      controls.autoRotate = false;
      tween = tweenCamera({
        camera,
        controls,
        toPosition: camPos,
        toTarget: node.position.clone(),
        durationMs: 1100,
      });
    };

    const flyBack = () => {
      tween?.cancel();
      controls.autoRotate = !wantsStill();
      tween = tweenCamera({
        camera,
        controls,
        toPosition: OVERVIEW_POSITION.clone(),
        toTarget: OVERVIEW_TARGET.clone(),
        durationMs: 1100,
      });
    };

    // —— 交互 —— //
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const pick = (event: PointerEvent): number | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(sprites, false);
      const first = hits.find((h) => (h.object as THREE.Sprite).material.opacity > 0.3);
      return first ? (first.object.userData.nodeIndex as number) : null;
    };

    const onPointerMove = (event: PointerEvent) => {
      const idx = pick(event);
      setHoverIdx(idx);
      renderer.domElement.style.cursor = idx !== null ? 'pointer' : 'grab';
    };
    const onPointerDown = (event: PointerEvent) => {
      downX = event.clientX;
      downY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > 5) return;
      const idx = pick(event);
      if (idx !== null) {
        setSelectedIdx(idx);
        applyFocus(idx);
        flyTo(idx);
      } else if (selectedIdxRef.current !== null) {
        setSelectedIdx(null);
        applyFocus(null);
        flyBack();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedIdxRef.current !== null) {
        setSelectedIdx(null);
        applyFocus(null);
        flyBack();
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKey);

    const resizeObserver = new ResizeObserver(() => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(host);

    // —— 动画循环 —— //
    const clock = new THREE.Clock();
    const tmpVec = new THREE.Vector3();
    const loop = () => {
      const dt = clock.getDelta();
      const t = clock.elapsedTime;
      controls.update();

      const viewW = host.clientWidth || 1;
      const viewH = host.clientHeight || 1;

      for (const layer of dustLayers) {
        layer.points.rotation.y += layer.speed * dt * 8;
        (layer.points.material as THREE.PointsMaterial).opacity =
          layer.baseOpacity * (0.82 + 0.18 * Math.sin(t * 1.7 + layer.phase));
      }

      const hov = hoverIdxRef.current;
      const sel = selectedIdxRef.current;
      sprites.forEach((sprite, i) => {
        const base = sprite.userData.baseScale as number;
        if (i === hov || i === sel) {
          const pulse = i === sel ? 1.28 + 0.06 * Math.sin(t * 3) : 1.16;
          sprite.scale.setScalar(base * pulse);
        } else if (sel === null && hov === null) {
          sprite.scale.setScalar(base);
        }
      });

      const project = (idx: number | null, label: HTMLDivElement, sub: string) => {
        if (idx === null) {
          label.style.display = 'none';
          return;
        }
        const sprite = sprites[idx];
        sprite.getWorldPosition(tmpVec);
        const { x, y, visible } = projectToScreen(tmpVec, camera, viewW, viewH);
        if (!visible) {
          label.style.display = 'none';
          return;
        }
        label.style.display = '';
        label.style.left = `${x}px`;
        label.style.top = `${y - 26}px`;
        if (label.dataset.text !== graph.nodes[idx].name) {
          label.dataset.text = graph.nodes[idx].name;
          label.textContent = graph.nodes[idx].name;
          const subEl = document.createElement('span');
          subEl.className = 'sub';
          subEl.textContent = sub;
          label.appendChild(subEl);
        }
      };
      project(hov, hoverLabel, hov !== null ? `${graph.nodes[hov].degree} 条关系` : '');
      project(sel, selectLabel, sel !== null ? `${graph.nodes[sel].degree} 条关系` : '');

      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    let raf = requestAnimationFrame(loop);

    worldRef.current = {
      renderer,
      scene,
      camera,
      controls,
      sprites,
      edgeLines,
      edgeColors,
      baseEdgeColors,
      dustLayers,
      glowTex,
      tween,
      hoverIdxRef,
      selectedIdxRef,
      labelHost,
      hoverLabel,
      selectLabel,
      resizeObserver,
      raf,
      dispose: () => {
        cancelAnimationFrame(raf);
        tween?.cancel();
        resizeObserver.disconnect();
        renderer.domElement.removeEventListener('pointermove', onPointerMove);
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer.domElement.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('keydown', onKey);
        controls.dispose();
        scene.traverse((obj) => {
          if (
            obj instanceof THREE.Sprite ||
            obj instanceof THREE.Points ||
            obj instanceof THREE.LineSegments
          ) {
            // instanceof 对泛型类收窄为 <any>，这里显式声明可释放面。
            const { geometry, material } = obj as unknown as {
              geometry: THREE.BufferGeometry;
              material: THREE.Material | THREE.Material[];
            };
            geometry.dispose();
            if (Array.isArray(material)) material.forEach((item) => item.dispose());
            else material.dispose();
          }
        });
        edgeGeometry.dispose();
        glowTex.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        labelHost.remove();
      },
    };

    return () => {
      worldRef.current?.dispose();
      worldRef.current = null;
    };
    // 仅在 graph 变化时重建 Three 世界；交互状态通过 ref 同步。
  }, [graph]);

  /* ---------------- React UI ---------------- */

  const focusFromSearch = (idx: number) => {
    setSelectedIdx(idx);
    setSearchOpen(false);
    setQuery('');
    // 复用 three 侧的聚焦：模拟一次点击
    const world = worldRef.current;
    if (!world) return;
    const neighbors = new Set<number>();
    for (const edge of graph.edges) {
      if (edge.a === idx) neighbors.add(edge.b);
      if (edge.b === idx) neighbors.add(edge.a);
    }
    world.sprites.forEach((sprite, i) => {
      const mat = sprite.material;
      const base = sprite.userData.baseScale as number;
      if (i === idx) {
        mat.opacity = 1;
        sprite.scale.setScalar(base * 1.25);
      } else if (neighbors.has(i)) {
        mat.opacity = 0.95;
      } else {
        mat.opacity = 0.16;
        sprite.scale.setScalar(base * 0.7);
      }
    });
    const colorArr = world.edgeColors.array as Float32Array;
    for (let e = 0; e < graph.edges.length; e++) {
      const edge = graph.edges[e];
      const k = edge.a === idx || edge.b === idx ? 1 : 0.1;
      for (let v = 0; v < 6; v++) colorArr[e * 6 + v] = world.baseEdgeColors[e * 6 + v] * k;
    }
    world.edgeColors.needsUpdate = true;
    const node = graph.nodes[idx];
    const dir = node.position.clone().normalize();
    world.tween?.cancel();
    world.controls.autoRotate = false;
    world.tween = tweenCamera({
      camera: world.camera,
      controls: world.controls,
      toPosition: node.position
        .clone()
        .addScaledVector(dir, 6.5)
        .add(new THREE.Vector3(0, 1.6, 0)),
      toTarget: node.position.clone(),
      durationMs: 1100,
    });
  };

  const clearFocus = () => {
    setSelectedIdx(null);
    const world = worldRef.current;
    if (!world) return;
    world.sprites.forEach((sprite) => {
      sprite.material.opacity = 1;
      sprite.scale.setScalar(sprite.userData.baseScale as number);
    });
    const colorArr = world.edgeColors.array as Float32Array;
    colorArr.set(world.baseEdgeColors);
    world.edgeColors.needsUpdate = true;
    world.tween?.cancel();
    world.controls.autoRotate = !wantsStill();
    world.tween = tweenCamera({
      camera: world.camera,
      controls: world.controls,
      toPosition: OVERVIEW_POSITION.clone(),
      toTarget: OVERVIEW_TARGET.clone(),
      durationMs: 1100,
    });
  };

  if (graph.nodes.length === 0) {
    return (
      <div className="view-wrap">
        <div className="empty-state">
          <div>
            这个世界还没有角色。
            <br />在 Zivith Studio 里创建角色后，这里就会亮起第一颗星。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="view-wrap">
      <div ref={hostRef} className="stage" />
      <div ref={overlayRef} className="overlay-labels" />

      <div className="hud-top-left">
        <div className="search-pop">
          <input
            className="input"
            placeholder="搜索角色…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
          />
          {searchOpen && searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.slice(0, 8).map((node) => (
                <button
                  key={node.id}
                  className="search-result"
                  onClick={() => focusFromSearch(graph.nodes.indexOf(node))}
                >
                  {node.name}
                  <small>{node.degree} 条关系</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="hint">拖拽旋转 · 滚轮缩放 · 点击星辰聚焦 · ESC 返回全景</div>

      {hoveredNode && hoveredNode !== selectedNode && (
        <div className="tooltip" style={{ right: 20, bottom: 20 }}>
          <h4>{hoveredNode.name}</h4>
          {edgesOf(hoverIdx!)
            .slice(0, 4)
            .map(({ edge, other }) => (
              <div className="rel-line" key={edge.id}>
                {directionGlyph(edge.direction)} {graph.nodes[other].name}
                {edge.label ? ` · ${edge.label}` : ` · ${edge.kind}`}
              </div>
            ))}
          {edgesOf(hoverIdx!).length > 4 && <p>…共 {edgesOf(hoverIdx!).length} 条关系</p>}
        </div>
      )}

      {selectedNode && (
        <aside className="side-card">
          <button className="close-btn" onClick={clearFocus} aria-label="关闭">
            ×
          </button>
          <h3>{selectedNode.name}</h3>
          <div className="kicker">
            {resources.entities.characters.find((c) => c.id === selectedNode.id)?.personality ??
              '角色'}
          </div>
          <div className="meta-row">
            {(resources.entities.characters.find((c) => c.id === selectedNode.id)?.tags ?? []).map(
              (tag) => (
                <span className="chip" key={tag}>
                  {tag}
                </span>
              ),
            )}
            <span className="chip accent">{selectedNode.degree} 条关系</span>
          </div>
          <p className="desc">
            {resources.entities.characters.find((c) => c.id === selectedNode.id)?.description}
          </p>
          <div className="rel-list">
            {selectedEdges.map(({ edge, other }) => (
              <div className="rel-item" key={edge.id}>
                {directionGlyph(edge.direction)} <b>{graph.nodes[other].name}</b>
                <span style={{ color: edge.color }}> · {edge.label || edge.kind}</span>
                {edge.description ? (
                  <span style={{ color: 'var(--muted)' }}> — {edge.description}</span>
                ) : null}
              </div>
            ))}
            {selectedEdges.length === 0 && <div className="rel-item">暂无角色间关系</div>}
          </div>
        </aside>
      )}
    </div>
  );
}

function directionGlyph(direction: string | null): string {
  if (direction === 'one_way') return '→';
  return '—';
}
