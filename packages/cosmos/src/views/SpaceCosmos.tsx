import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { AssetDTO, WorldResourcesDTO } from '../types';
import {
  buildWorldSpace,
  dirFromLatLng,
  slerpDir,
  trackColor,
  type RegionSpaceNode,
} from '../lib/space-model';
import { spacePathTo, spaceTypeLabel } from '../lib/space-tree';
import { buildSpatialContext, spatialContextToPrompt } from '../lib/spatial-context';
import { DEFAULT_STUDIO_ORIGIN, studioWorldHref } from '../lib/zivith-space';
import { createStarfield, type StarfieldHandle } from '../lib/starfield';
import { makeAuroraMesh, tickStarBody } from '../lib/star-body';
import {
  createEarthSurface,
  makeAtmosphereMaterial,
  makeCityLightsTexture,
  makeCloudTexture,
  makeEarthTextures,
} from '../lib/planet-texture';
import { makePlanetRings, type PlanetRingsHandle } from '../lib/planet-rings';
import { worldHasPlanetRings } from '../lib/planet-features';
import { SiteMap } from './SiteMap';
import { relationColor } from '../lib/palette';
import {
  createLabel,
  makeGlowTexture,
  projectToScreen,
  setupRenderer,
  tweenCamera,
  wantsStill,
  type CameraTweenHandle,
} from '../lib/three-helpers';

interface Props {
  resources: WorldResourcesDTO;
  onBackToUniverse?: () => void;
  onBackToSystem?: () => void;
  active?: boolean;
  sourceKind?: 'mock' | 'api';
  /** Studio 画布内嵌：不重复 Inspector 卡片，选中与 Explorer 双向同步。 */
  embedded?: boolean;
  selectedLocationId?: string | null;
  selectedSceneId?: string | null;
  selectedCharacterId?: string | null;
  onSelectLocation?: (id: string | null) => void;
  onSelectScene?: (id: string | null) => void;
  onSelectCharacter?: (id: string | null) => void;
}

/** 世界星球半径（空间层级的根） */
const R = 12;
const WORLD_VIEW_DIST = R * 4.35;
const NADIR_ALT = 3.85;
const SCENE_NADIR_ALT = 2.15;

const WAYPOINT_GLYPHS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫'];

interface RegionEntry {
  region: RegionSpaceNode;
  pin: THREE.Sprite;
  dir: THREE.Vector3;
}

interface SceneEntry {
  regionId: string;
  sceneId: string;
  pin: THREE.Sprite;
  baseScale: number;
  dir: THREE.Vector3;
}

interface SpaceApi {
  selectRegion(regionId: string | null): void;
  selectCharacter(characterId: string | null): void;
  selectScene(sceneId: string | null): void;
}

interface WorldRefs {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  worldGroup: THREE.Group;
  planetMesh: THREE.Mesh;
  regionEntries: RegionEntry[];
  sceneEntries: SceneEntry[];
  selectionRing: THREE.Mesh;
  pathGroup: THREE.Group;
  starfield: StarfieldHandle;
  glowTex: THREE.CanvasTexture;
  labelHost: HTMLDivElement;
  regionLabels: Map<string, HTMLDivElement>;
  sceneLabels: Map<string, HTMLDivElement>;
  waypointHost: HTMLDivElement;
  tween: CameraTweenHandle | null;
  api: SpaceApi;
  resizeObserver: ResizeObserver;
  dispose: () => void;
}

export function SpaceCosmos({
  resources,
  onBackToUniverse,
  onBackToSystem,
  active = true,
  sourceKind = 'mock',
  embedded = false,
  selectedLocationId: externalLocationId = null,
  selectedSceneId: externalSceneId = null,
  selectedCharacterId: externalCharacterId = null,
  onSelectLocation,
  onSelectScene,
  onSelectCharacter,
}: Props) {
  const surface = useMemo(
    () => createEarthSurface('earth:' + resources.project.id),
    [resources.project.id],
  );
  const space = useMemo(() => buildWorldSpace(resources, surface.surface), [resources, surface]);
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<WorldRefs | null>(null);
  const apiRef = useRef<SpaceApi | null>(null);
  const onBackToUniverseRef = useRef(onBackToUniverse);
  const onBackToSystemRef = useRef(onBackToSystem);
  const activeRef = useRef(active);
  onBackToUniverseRef.current = onBackToUniverse;
  onBackToSystemRef.current = onBackToSystem;
  activeRef.current = active;

  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(externalLocationId);
  const [detailSceneId, setDetailSceneId] = useState<string | null>(externalSceneId);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    externalCharacterId,
  );
  const onSelectLocationRef = useRef(onSelectLocation);
  const onSelectSceneRef = useRef(onSelectScene);
  const onSelectCharacterRef = useRef(onSelectCharacter);
  onSelectLocationRef.current = onSelectLocation;
  onSelectSceneRef.current = onSelectScene;
  onSelectCharacterRef.current = onSelectCharacter;
  const [mapOpen, setMapOpen] = useState(false);
  const [hoverRegionId, setHoverRegionId] = useState<string | null>(null);

  // 同步给 three 循环 / 事件处理的当前选择状态
  const hoverRegionRef = useRef<string | null>(null);
  const selectedRegionRef = useRef<string | null>(null);
  const detailSceneRef = useRef<string | null>(null);
  const selectedCharacterRef = useRef<string | null>(null);
  const mapOpenRef = useRef(false);
  hoverRegionRef.current = hoverRegionId;
  selectedRegionRef.current = selectedRegionId;
  detailSceneRef.current = detailSceneId;
  selectedCharacterRef.current = selectedCharacterId;
  mapOpenRef.current = mapOpen;

  const selectedRegion = selectedRegionId ? (space.regionById.get(selectedRegionId) ?? null) : null;
  const detailSceneNode = detailSceneId ? (space.sceneById.get(detailSceneId) ?? null) : null;
  const detailScene = detailSceneNode?.scene ?? null;
  const selectedTrack = selectedCharacterId
    ? (space.tracks.get(selectedCharacterId) ?? null)
    : null;

  const storyById = useMemo(
    () => new Map(resources.entities.stories.map((s) => [s.id, s] as const)),
    [resources],
  );
  const characterById = useMemo(
    () => new Map(resources.entities.characters.map((c) => [c.id, c] as const)),
    [resources],
  );

  /* ---------------- three.js：世界星球 + 空间层级 ---------------- */

  useEffect(() => {
    const host = hostRef.current;
    const overlay = overlayRef.current;
    if (!host || !overlay) return;

    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    setupRenderer(renderer, width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;
    renderer.setClearColor(new THREE.Color('#000105'), 1);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 400);
    const hasRings = worldHasPlanetRings(resources);
    if (hasRings) camera.position.set(R * 0.92, R * 0.36, R * 3.05);
    else camera.position.set(R * 1.35, R * 0.62, R * 4.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.18;
    controls.enablePan = false;
    controls.minDistance = R + 1.45;
    controls.maxDistance = R * 6.4;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight(0x101828, 0.12));
    scene.add(new THREE.HemisphereLight(0x9ec8ff, 0x081018, 0.22));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.55);
    sun.position.set(R * 3.6, R * 1.1, R * 1.8);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x1a3060, 0.06);
    fill.position.set(-R * 3, -R * 0.4, -R * 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x6aa8ff, 0.1);
    rim.position.set(-R * 1.6, R * 0.8, -R * 3.2);
    scene.add(rim);

    const starfield = createStarfield('cosmos-sky', 90, { width: 2048, height: 1024 });
    scene.add(starfield.group);

    const extraTextures: THREE.Texture[] = [];
    const glowTex = makeGlowTexture(128);

    // —— 世界星球（唯一的天体级球体；贴图为 Earth 观感） —— //
    const worldGroup = new THREE.Group();
    worldGroup.rotation.z = 0.16;
    scene.add(worldGroup);
    const worldMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#0d3a75'),
      roughness: 0.8,
      metalness: 0,
      emissive: new THREE.Color('#ffb070'),
      emissiveIntensity: 1.05,
    });
    const planetMesh = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), worldMat);
    worldGroup.add(planetMesh);
    worldGroup.add(makeAtmosphereMaterial('#9ec8ff', R));
    const aurora = makeAuroraMesh(R);
    worldGroup.add(aurora);
    let planetRings: PlanetRingsHandle | null = null;
    if (hasRings) {
      planetRings = makePlanetRings(R, {
        tilt: 0.18,
        particleCount: 3800,
        sizeScale: 68,
        opacity: 0.92,
      });
      worldGroup.add(planetRings.group);
    }

    // Earth 类贴图（颜色 + 海面高光粗糙度 + 地形凹凸），另加独立漂移的云层
    const applyEarthMaps = () => {
      const { map, roughnessMap, bumpMap } = makeEarthTextures(space.world.seed, surface, 2048);
      const lights = makeCityLightsTexture(space.world.seed, surface, 1024);
      extraTextures.push(map, roughnessMap, bumpMap, lights);
      worldMat.map = map;
      worldMat.roughnessMap = roughnessMap;
      worldMat.bumpMap = bumpMap;
      worldMat.bumpScale = 0.22;
      worldMat.roughness = 1;
      worldMat.metalness = 0;
      worldMat.envMapIntensity = 0;
      worldMat.color.set('#ffffff');
      worldMat.emissiveMap = lights;
      worldMat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          `#include <common>
           varying vec3 vWorldPos;`,
        );
        shader.vertexShader = shader.vertexShader.replace(
          '#include <project_vertex>',
          `#include <project_vertex>
           vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
           varying vec3 vWorldPos;`,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           vec3 toSun = normalize(vec3(40.0, 14.0, 22.0) - vWorldPos);
           float night = pow(1.0 - clamp(dot(normal, toSun), 0.0, 1.0), 1.7);
           totalEmissiveRadiance *= night;`,
        );
      };
      worldMat.needsUpdate = true;
    };
    setTimeout(applyEarthMaps, 30);

    const cloudTex = makeCloudTexture(space.world.seed, 1024);
    extraTextures.push(cloudTex);
    const cloudMesh = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.017, 96, 64),
      new THREE.MeshLambertMaterial({
        map: cloudTex,
        transparent: true,
        depthWrite: false,
      }),
    );
    worldGroup.add(cloudMesh);

    // —— 区域 Pin（地点层级：世界表面上的标记，不是球体） —— //
    const regionEntries: RegionEntry[] = space.regions.map((region) => {
      const dir = dirFromLatLng(region.lat, region.lng);
      const material = new THREE.SpriteMaterial({
        map: glowTex,
        color: new THREE.Color(region.color),
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const pin = new THREE.Sprite(material);
      pin.position.copy(dir).multiplyScalar(R * 1.015);
      pin.scale.setScalar(0.9);
      pin.userData = { regionId: region.id };
      worldGroup.add(pin);
      return { region, pin, dir };
    });

    // —— 场景 Pin（地点内的空间单元；仅进入区域后显示） —— //
    const sceneEntries: SceneEntry[] = [];
    for (const region of space.regions) {
      for (const node of region.scenes) {
        const dir = dirFromLatLng(node.lat, node.lng);
        const material = new THREE.SpriteMaterial({
          map: glowTex,
          color: new THREE.Color(node.color),
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const pin = new THREE.Sprite(material);
        pin.position.copy(dir).multiplyScalar(R * 1.02);
        const baseScale = 0.55;
        pin.scale.setScalar(baseScale);
        pin.userData = { sceneId: node.scene.id, regionId: region.id };
        pin.visible = false;
        worldGroup.add(pin);
        sceneEntries.push({ regionId: region.id, sceneId: node.scene.id, pin, baseScale, dir });
      }
    }

    // —— 区域选中环 —— //
    const selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(1.05, 1.4, 48),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#4d6bfe'),
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    selectionRing.visible = false;
    worldGroup.add(selectionRing);

    // —— 角色移动轨迹（空间 × 时间） —— //
    const pathGroup = new THREE.Group();
    pathGroup.visible = false;
    worldGroup.add(pathGroup);

    // —— HTML 名牌 —— //
    const labelHost = createLabel('overlay-labels');
    overlay.appendChild(labelHost);
    const regionLabels = new Map<string, HTMLDivElement>();
    for (const entry of regionEntries) {
      const label = createLabel('name-label');
      label.textContent = entry.region.name;
      const sub = document.createElement('span');
      sub.className = 'sub';
      sub.textContent = entry.region.orphan
        ? `${entry.region.scenes.length} 个场景`
        : `${spaceTypeLabel(space.rootSpace.children.find((c) => c.id === entry.region.id)?.type ?? 'location')} · ${entry.region.scenes.length} 个场景`;
      label.appendChild(sub);
      labelHost.appendChild(label);
      regionLabels.set(entry.region.id, label);
    }
    const sceneLabels = new Map<string, HTMLDivElement>();
    for (const entry of sceneEntries) {
      const label = createLabel('name-label marker');
      label.textContent = space.sceneById.get(entry.sceneId)?.scene.title ?? '';
      label.style.display = 'none';
      labelHost.appendChild(label);
      sceneLabels.set(entry.sceneId, label);
    }
    const waypointHost = createLabel('overlay-labels');
    overlay.appendChild(waypointHost);

    /* —— 选中状态与镜头 —— */
    let tween: CameraTweenHandle | null = null;
    const sel = { regionId: null as string | null, characterId: null as string | null };
    let spinFactor = 1;

    const tangentUp = (dir: THREE.Vector3) => {
      const up = new THREE.Vector3(0, 1, 0);
      if (Math.abs(dir.dot(up)) > 0.92) up.set(0, 0, 1);
      return up.addScaledVector(dir, -up.dot(dir)).normalize();
    };

    const fly = (
      toPosition: THREE.Vector3,
      toTarget: THREE.Vector3,
      durationMs = 1400,
      onDone?: () => void,
      toUp?: THREE.Vector3,
    ) => {
      tween?.cancel();
      tween = tweenCamera({ camera, controls, toPosition, toTarget, durationMs, onDone, toUp });
    };

    const setFov = (fov: number) => {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    };

    const flyNadir = (dirWorld: THREE.Vector3, alt: number, durationMs = 1120) => {
      const dir = dirWorld.clone().normalize();
      const up = tangentUp(dir);
      setFov(50);
      controls.minDistance = Math.max(0.8, alt * 0.45);
      controls.maxDistance = alt * 3.4;
      fly(
        dir
          .clone()
          .multiplyScalar(R + alt)
          .add(up.clone().multiplyScalar(alt * 0.38)),
        dir.clone().multiplyScalar(R * 0.995),
        durationMs,
        undefined,
        up,
      );
    };

    const flyGlobe = () => {
      setFov(40);
      camera.up.set(0, 1, 0);
      controls.minDistance = R + 1.45;
      controls.maxDistance = R * 6.4;
      fly(
        camera.position.clone().normalize().multiplyScalar(WORLD_VIEW_DIST),
        new THREE.Vector3(0, 0, 0),
        1300,
        undefined,
        new THREE.Vector3(0, 1, 0),
      );
    };

    const buildPath = (characterId: string | null) => {
      pathGroup.clear();
      if (!characterId) {
        pathGroup.visible = false;
        return;
      }
      const track = space.tracks.get(characterId);
      if (!track || track.stops.length === 0) {
        pathGroup.visible = false;
        return;
      }
      const color = new THREE.Color(trackColor(characterId));
      const dirs = track.stops.map((stop) => {
        const node = space.sceneById.get(stop.scene.id);
        const region = space.regionById.get(node?.regionId ?? stop.region.id);
        return dirFromLatLng(node?.lat ?? region?.lat ?? 0, node?.lng ?? region?.lng ?? 0);
      });

      // 相邻登场场景之间的球面弧线（带拱起）
      const points: THREE.Vector3[] = [];
      for (let i = 1; i < dirs.length; i++) {
        const steps = 24;
        for (let k = 0; k < steps; k++) {
          const t = k / steps;
          const dir = slerpDir(dirs[i - 1], dirs[i], t);
          const lift = R * (1.02 + 0.055 * Math.sin(Math.PI * t));
          points.push(dir.clone().multiplyScalar(lift));
        }
      }
      if (points.length >= 2) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        pathGroup.add(
          new THREE.Line(
            geometry,
            new THREE.LineBasicMaterial({
              color,
              transparent: true,
              opacity: 0.85,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            }),
          ),
        );
      }
      // 轨迹站点
      track.stops.forEach((_stop, i) => {
        const material = new THREE.SpriteMaterial({
          map: glowTex,
          color,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const dot = new THREE.Sprite(material);
        dot.position.copy(dirs[i]).multiplyScalar(R * 1.03);
        dot.scale.setScalar(0.5);
        dot.userData = { waypointIndex: i };
        pathGroup.add(dot);
      });
      pathGroup.visible = true;
    };

    const rebuildWaypointLabels = (characterId: string | null) => {
      waypointHost.textContent = '';
      waypointHost.replaceChildren();
      if (!characterId) return;
      const track = space.tracks.get(characterId);
      if (!track) return;
      track.stops.forEach((stop, i) => {
        const label = createLabel('name-label marker');
        label.textContent = `${WAYPOINT_GLYPHS[i] ?? i + 1} ${stop.scene.title}`;
        waypointHost.appendChild(label);
        label.dataset.sceneId = stop.scene.id;
      });
    };

    const applySelection = () => {
      for (const entry of regionEntries) {
        const mat = entry.pin.material;
        const active = sel.regionId === null || sel.regionId === entry.region.id;
        mat.opacity = active ? 0.95 : 0.18;
        entry.pin.scale.setScalar(sel.regionId === entry.region.id ? 1.15 : 0.9);
        entry.pin.visible = true;
      }
      for (const entry of sceneEntries) {
        entry.pin.visible = sel.regionId === entry.regionId;
      }
      selectionRing.visible = false;
      spinFactor = sel.regionId || sel.characterId ? 0 : 1;
      controls.autoRotate = sel.regionId === null && sel.characterId === null && !wantsStill();
    };

    const selectRegion = (regionId: string | null) => {
      sel.regionId = regionId;
      applySelection();
      if (regionId) {
        const entry = regionEntries.find((r) => r.region.id === regionId);
        if (entry) {
          const sunDir = sun.position.clone().normalize();
          worldGroup.quaternion.identity();
          worldGroup.rotation.set(0, 0, 0);
          worldGroup.quaternion.setFromUnitVectors(entry.dir.clone().normalize(), sunDir);
          worldGroup.updateMatrixWorld(true);
          flyNadir(sunDir, NADIR_ALT);
        }
      } else {
        worldGroup.quaternion.identity();
        worldGroup.rotation.set(0, 0, 0.16);
        flyGlobe();
      }
    };

    const selectCharacter = (characterId: string | null) => {
      sel.characterId = characterId;
      buildPath(characterId);
      rebuildWaypointLabels(characterId);
      applySelection();
      if (characterId) {
        worldGroup.quaternion.identity();
        worldGroup.rotation.set(0, 0, 0.16);
        setFov(40);
        camera.up.set(0, 1, 0);
        controls.minDistance = R + 1.45;
        controls.maxDistance = R * 6.4;
        fly(
          camera.position
            .clone()
            .normalize()
            .multiplyScalar(WORLD_VIEW_DIST * 1.05),
          new THREE.Vector3(0, 0, 0),
          1500,
          undefined,
          new THREE.Vector3(0, 1, 0),
        );
      }
    };

    const selectScene = (sceneId: string | null) => {
      if (!sceneId) return;
      const entry = sceneEntries.find((item) => item.sceneId === sceneId);
      if (!entry) return;
      flyNadir(entry.pin.getWorldPosition(new THREE.Vector3()), SCENE_NADIR_ALT, 980);
    };

    apiRef.current = { selectRegion, selectCharacter, selectScene };

    if (selectedRegionRef.current) {
      selectRegion(selectedRegionRef.current);
    } else if (wantsStill()) {
      camera.position.set(R * 1.05, R * 0.28, WORLD_VIEW_DIST);
    } else {
      fly(
        new THREE.Vector3(R * 1.05, R * 0.28, WORLD_VIEW_DIST),
        new THREE.Vector3(0, 0, 0),
        980,
        () => {
          controls.autoRotate = true;
        },
      );
    }
    if (selectedCharacterRef.current) selectCharacter(selectedCharacterRef.current);
    if (detailSceneRef.current) selectScene(detailSceneRef.current);

    for (const entry of regionEntries) {
      const label = regionLabels.get(entry.region.id);
      if (!label) continue;
      label.style.pointerEvents = 'auto';
      label.style.cursor = 'pointer';
      label.setAttribute('role', 'button');
      label.tabIndex = 0;
      label.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setSelectedRegionId(entry.region.id);
        setSelectedCharacterId(null);
        setDetailSceneId(null);
        selectRegion(entry.region.id);
        onSelectLocationRef.current?.(entry.region.id);
      });
    }

    for (const entry of sceneEntries) {
      const label = sceneLabels.get(entry.sceneId);
      if (!label) continue;
      label.style.pointerEvents = 'auto';
      label.style.cursor = 'pointer';
      label.setAttribute('role', 'button');
      label.tabIndex = 0;
      label.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setDetailSceneId(entry.sceneId);
        setSelectedCharacterId(null);
        setSelectedRegionId(entry.regionId);
        selectScene(entry.sceneId);
        onSelectSceneRef.current?.(entry.sceneId);
      });
    }

    /* —— 交互 —— */
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const setPointer = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
    };

    const onPointerMove = (event: PointerEvent) => {
      setPointer(event);
      const hitRegion = raycaster.intersectObjects(
        regionEntries.map((r) => r.pin),
        false,
      )[0];
      const hitScene = raycaster.intersectObjects(
        sceneEntries.filter((s) => s.pin.visible).map((s) => s.pin),
        false,
      )[0];
      setHoverRegionId(
        hitRegion && !hitScene ? (hitRegion.object.userData.regionId as string) : null,
      );
      renderer.domElement.style.cursor = hitRegion || hitScene ? 'pointer' : 'grab';
    };

    const onPointerDown = (event: PointerEvent) => {
      downX = event.clientX;
      downY = event.clientY;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > 5) return;
      setPointer(event);
      const hitScene = raycaster.intersectObjects(
        sceneEntries.filter((s) => s.pin.visible).map((s) => s.pin),
        false,
      )[0];
      if (hitScene) {
        const sceneId = hitScene.object.userData.sceneId as string;
        const regionId = hitScene.object.userData.regionId as string | undefined;
        setDetailSceneId(sceneId);
        setSelectedCharacterId(null);
        if (regionId) setSelectedRegionId(regionId);
        selectScene(sceneId);
        onSelectSceneRef.current?.(sceneId);
        return;
      }
      const hitRegion = raycaster.intersectObjects(
        regionEntries.map((r) => r.pin),
        false,
      )[0];
      if (hitRegion) {
        const regionId = hitRegion.object.userData.regionId as string;
        setSelectedRegionId(regionId);
        setSelectedCharacterId(null);
        setDetailSceneId(null);
        selectRegion(regionId);
        onSelectLocationRef.current?.(regionId);
      }
    };

    const onKey = (event: KeyboardEvent) => {
      if (!activeRef.current) return;
      if (event.key !== 'Escape') return;
      if (mapOpenRef.current) {
        setMapOpen(false);
        return;
      }
      if (selectedCharacterRef.current) {
        setSelectedCharacterId(null);
        selectCharacter(null);
        if (selectedRegionRef.current) onSelectLocationRef.current?.(selectedRegionRef.current);
        else onSelectCharacterRef.current?.(null);
      } else if (detailSceneRef.current) {
        setDetailSceneId(null);
        if (selectedRegionRef.current) {
          selectRegion(selectedRegionRef.current);
          onSelectLocationRef.current?.(selectedRegionRef.current);
        }
      } else if (selectedRegionRef.current) {
        setSelectedRegionId(null);
        selectRegion(null);
        onSelectLocationRef.current?.(null);
      } else {
        (onBackToSystemRef.current ?? onBackToUniverseRef.current)?.();
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
      setupRenderer(renderer, w, h);
    });
    resizeObserver.observe(host);

    /* —— 动画循环 —— */
    const clock = new THREE.Clock();
    const tmpVec = new THREE.Vector3();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!activeRef.current) return;
      const dt = clock.getDelta();
      const t = clock.elapsedTime;
      controls.update();
      const viewW = host.clientWidth || 1;
      const viewH = host.clientHeight || 1;

      // 世界自转：有选中内容时暂停，避免镜头目标漂移；云层相对地表缓慢漂移
      const targetSpin = sel.regionId || sel.characterId ? 0 : 1;
      spinFactor += (targetSpin - spinFactor) * Math.min(1, dt * 3);
      if (!sel.regionId && !sel.characterId && !wantsStill()) {
        worldGroup.rotation.y += 0.02 * dt * spinFactor;
      }
      if (!sel.regionId) cloudMesh.rotation.y += 0.0035 * dt * (0.4 + 0.6 * spinFactor);
      tickStarBody(aurora, t);
      if (planetRings) {
        planetMesh.getWorldPosition(tmpVec);
        planetRings.tick(t, tmpVec, sun.position.clone().normalize());
      }

      starfield.update(dt, t);

      selectionRing.material.opacity = 0.4 + 0.18 * Math.sin(t * 2.4);

      // 区域名牌
      for (const entry of regionEntries) {
        const label = regionLabels.get(entry.region.id)!;
        if (sel.regionId !== null) {
          label.style.display = 'none';
          continue;
        }
        entry.pin.getWorldPosition(tmpVec);
        const { x, y, visible } = projectToScreen(tmpVec, camera, viewW, viewH);
        if (!visible) {
          label.style.display = 'none';
          continue;
        }
        const hovered = hoverRegionRef.current === entry.region.id;
        label.style.display = '';
        label.classList.toggle(
          'dim',
          !hovered && regionEntries.length > 6 && sel.regionId === null,
        );
        label.style.left = `${x}px`;
        label.style.top = `${y - 34}px`;
      }

      // 场景名牌（进入区域后）
      for (const entry of sceneEntries) {
        const label = sceneLabels.get(entry.sceneId)!;
        if (!entry.pin.visible) {
          label.style.display = 'none';
          continue;
        }
        entry.pin.getWorldPosition(tmpVec);
        const { x, y, visible } = projectToScreen(tmpVec, camera, viewW, viewH);
        if (!visible) {
          label.style.display = 'none';
          continue;
        }
        label.style.display = '';
        label.style.left = `${x}px`;
        label.style.top = `${y - 16}px`;
      }

      // 轨迹站点名牌（① ② ③ …）
      if (pathGroup.visible) {
        const labels = Array.from(waypointHost.children) as HTMLDivElement[];
        const track = sel.characterId ? space.tracks.get(sel.characterId) : null;
        labels.forEach((label, i) => {
          const stop = track?.stops[i];
          if (!stop) {
            label.style.display = 'none';
            return;
          }
          const node = space.sceneById.get(stop.scene.id);
          const dir = dirFromLatLng(node?.lat ?? 0, node?.lng ?? 0);
          tmpVec.copy(dir).multiplyScalar(R * 1.03);
          worldGroup.localToWorld(tmpVec);
          const { x, y, visible } = projectToScreen(tmpVec, camera, viewW, viewH);
          if (!visible) {
            label.style.display = 'none';
            return;
          }
          label.style.display = '';
          label.style.left = `${x}px`;
          label.style.top = `${y - 18}px`;
        });
      }

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    worldRef.current = {
      renderer,
      camera,
      controls,
      worldGroup,
      planetMesh,
      regionEntries,
      sceneEntries,
      selectionRing,
      pathGroup,
      starfield,
      glowTex,
      labelHost,
      regionLabels,
      sceneLabels,
      waypointHost,
      tween,
      api: apiRef.current,
      resizeObserver,
      dispose: () => {
        cancelAnimationFrame(raf);
        tween?.cancel();
        resizeObserver.disconnect();
        renderer.domElement.removeEventListener('pointermove', onPointerMove);
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer.domElement.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('keydown', onKey);
        controls.dispose();
        starfield.dispose();
        scene.remove(starfield.group);
        scene.traverse((obj) => {
          const anyObj = obj as unknown as {
            geometry?: { dispose(): void };
            material?: { dispose(): void; map?: { dispose(): void } };
          };
          anyObj.geometry?.dispose?.();
          const mat = anyObj.material;
          if (mat) mat.dispose();
        });
        for (const tex of extraTextures) tex.dispose();
        glowTex.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        labelHost.remove();
        waypointHost.remove();
      },
    };

    return () => {
      worldRef.current?.dispose();
      worldRef.current = null;
      apiRef.current = null;
    };
    // 仅在 space 变化时重建 Three 世界；其余 props 通过 ref / 独立 effect 同步。
  }, [space]);

  useEffect(() => {
    if (!embedded) return;
    const api = apiRef.current;
    if (externalCharacterId) {
      if (externalCharacterId !== selectedCharacterId) {
        setSelectedCharacterId(externalCharacterId);
        setDetailSceneId(null);
        api?.selectCharacter(externalCharacterId);
      }
      return;
    }
    if (externalSceneId) {
      const node = space.sceneById.get(externalSceneId);
      const nextRegion = node?.regionId ?? selectedRegionId;
      if (
        externalSceneId !== detailSceneId ||
        nextRegion !== selectedRegionId ||
        selectedCharacterId
      ) {
        setSelectedCharacterId(null);
        setDetailSceneId(externalSceneId);
        if (nextRegion) setSelectedRegionId(nextRegion);
        api?.selectCharacter(null);
        api?.selectScene(externalSceneId);
      }
      return;
    }
    if (externalLocationId) {
      if (externalLocationId !== selectedRegionId || detailSceneId || selectedCharacterId) {
        setSelectedCharacterId(null);
        setDetailSceneId(null);
        setSelectedRegionId(externalLocationId);
        api?.selectCharacter(null);
        api?.selectRegion(externalLocationId);
      }
      return;
    }
    if (selectedRegionId || detailSceneId || selectedCharacterId) {
      setSelectedCharacterId(null);
      setDetailSceneId(null);
      setSelectedRegionId(null);
      api?.selectCharacter(null);
      api?.selectRegion(null);
    }
  }, [
    embedded,
    externalCharacterId,
    externalSceneId,
    externalLocationId,
    selectedCharacterId,
    detailSceneId,
    selectedRegionId,
    space,
  ]);

  useEffect(() => {
    if (space.regions.length > 0) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      (onBackToSystemRef.current ?? onBackToUniverseRef.current)?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [space.regions.length]);

  /* ---------------- React UI ---------------- */

  if (space.regions.length === 0) {
    return (
      <div className="view-wrap">
        <div className="hud-top-left">
          <div className="breadcrumb">
            {onBackToUniverse && (
              <>
                <button className="crumb link" onClick={onBackToUniverse} type="button">
                  宇宙
                </button>
                <span className="sep">/</span>
              </>
            )}
            {onBackToSystem && (
              <>
                <button className="crumb link" onClick={onBackToSystem} type="button">
                  恒星系
                </button>
                <span className="sep">/</span>
              </>
            )}
            <span className="crumb">{resources.project.name}</span>
          </div>
        </div>
        <div className="empty-state">
          <div>
            {embedded
              ? '这个世界还没有地点。在左侧资源树新建地点后，星球上会出现可以点进的标记。'
              : '这个世界还没有空间信息。在 Zivith Studio 里创建地点与场景后，这里会升起一颗可以进入的星球。'}
          </div>
        </div>
        <div className="hint">
          {onBackToSystem ? 'ESC 返回恒星系' : onBackToUniverse ? 'ESC 返回宇宙' : ''}
        </div>
      </div>
    );
  }

  const detailStory = detailScene ? storyById.get(detailScene.story_id) : null;
  const sceneCharacters = detailSceneId ? (space.charactersAtScene.get(detailSceneId) ?? []) : [];
  const sceneEvents = detailSceneId ? (space.eventsAtScene.get(detailSceneId) ?? []) : [];

  const trackRelations = selectedTrack
    ? space.characterRelations
        .map((rel) => {
          const otherId =
            rel.source_id === selectedTrack.character.id
              ? rel.target_id
              : rel.target_id === selectedTrack.character.id
                ? rel.source_id
                : null;
          if (!otherId || rel.source_type !== 'asset' || rel.target_type !== 'asset') return null;
          const other = characterById.get(otherId);
          if (!other) return null;
          return { rel, other, dir: rel.source_id === selectedTrack.character.id ? '→' : '←' };
        })
        .filter(
          (
            v,
          ): v is {
            rel: (typeof space.characterRelations)[number];
            other: AssetDTO;
            dir: string;
          } => v !== null,
        )
    : [];

  const stateLabel: Record<string, string> = { draft: '草稿', review: '复审', approved: '定稿' };

  const locationCharacters = useMemo(() => {
    if (!selectedRegion) return [];
    const seen = new Map<string, AssetDTO>();
    for (const node of selectedRegion.scenes) {
      for (const character of space.charactersAtScene.get(node.scene.id) ?? []) {
        seen.set(character.id, character);
      }
    }
    return [...seen.values()];
  }, [selectedRegion, space]);

  const locationSpaceType = selectedRegion
    ? spaceTypeLabel(
        space.rootSpace.children.find((child) => child.id === selectedRegion.id)?.type ??
          'location',
      )
    : '地点';

  const studioHref = (kind: 'location' | 'scene' | 'character', id: string) => {
    if (sourceKind !== 'api') return null;
    try {
      const origin = localStorage.getItem('cosmos_zivith_studio') || DEFAULT_STUDIO_ORIGIN;
      return studioWorldHref(origin, resources.project.id, { kind, id });
    } catch {
      return studioWorldHref(DEFAULT_STUDIO_ORIGIN, resources.project.id, { kind, id });
    }
  };

  const handleRegionCrumb = () => {
    setMapOpen(false);
    setDetailSceneId(null);
    setSelectedCharacterId(null);
    apiRef.current?.selectCharacter(null);
    apiRef.current?.selectRegion(null);
    setSelectedRegionId(null);
    onSelectLocationRef.current?.(null);
  };

  const handleLocationCrumb = (locationId: string) => {
    setMapOpen(false);
    setDetailSceneId(null);
    setSelectedCharacterId(null);
    apiRef.current?.selectCharacter(null);
    setSelectedRegionId(locationId);
    apiRef.current?.selectRegion(locationId);
    onSelectLocationRef.current?.(locationId);
  };

  const handleStopClick = (stop: { region: RegionSpaceNode; scene: { id: string } }) => {
    const regionId = stop.region.id;
    setSelectedRegionId(regionId);
    setSelectedCharacterId(null);
    apiRef.current?.selectCharacter(null);
    apiRef.current?.selectRegion(regionId);
    setDetailSceneId(stop.scene.id);
    apiRef.current?.selectScene(stop.scene.id);
    onSelectSceneRef.current?.(stop.scene.id);
  };

  const crumbTargetId = detailSceneId ?? selectedRegionId ?? space.rootSpace.id;
  const crumbPath = spacePathTo(space.rootSpace, crumbTargetId);
  const spatial = buildSpatialContext({
    root: space.rootSpace,
    selectedLocationId: selectedRegionId,
    selectedSceneId: detailSceneId,
    scene: detailScene,
    storyTitle: detailScene ? (storyById.get(detailScene.story_id)?.title ?? null) : null,
    charactersHere: sceneCharacters,
    eventsHere: sceneEvents,
  });

  return (
    <div className="view-wrap">
      <div ref={hostRef} className="stage" />
      <div ref={overlayRef} className={`overlay-labels${mapOpen ? ' is-dim' : ''}`} />

      <div className="hud-top-left">
        <div className="breadcrumb">
          {onBackToUniverse && (
            <>
              <button className="crumb link" onClick={onBackToUniverse} type="button">
                宇宙
              </button>
              <span className="sep">/</span>
            </>
          )}
          {onBackToSystem && (
            <>
              <button className="crumb link" onClick={onBackToSystem} type="button">
                恒星系
              </button>
              <span className="sep">/</span>
            </>
          )}
          {crumbPath.map((node, index) => {
            const last = index === crumbPath.length - 1;
            const go = () => {
              if (node.id === space.rootSpace.id) {
                handleRegionCrumb();
                return;
              }
              if (node.type === 'scene') return;
              handleLocationCrumb(node.id);
            };
            return (
              <span key={node.id} className="crumb-wrap">
                {index > 0 && <span className="sep">/</span>}
                <button
                  type="button"
                  className={`crumb ${last ? '' : 'link'}`}
                  disabled={last}
                  onClick={go}
                  title={spaceTypeLabel(node.type)}
                >
                  {node.name}
                </button>
              </span>
            );
          })}
          {mapOpen && selectedRegion && (
            <>
              <span className="sep">/</span>
              <span className="crumb">平面图</span>
            </>
          )}
        </div>
        {selectedRegion && !mapOpen && (
          <button type="button" className="hud-chip primary" onClick={() => setMapOpen(true)}>
            打开平面图
          </button>
        )}
        {!mapOpen && !selectedRegion && !selectedTrack && (
          <div className="agent-context" title={spatialContextToPrompt(spatial)}>
            <span className="kicker">Agent 空间上下文</span>
            <div className="path">
              {spatial.spacePath.map((node) => spaceTypeLabel(node.type)).join(' → ')}
            </div>
            {spatial.currentTime && (
              <div className="meta">
                《{spatial.currentTime.storyTitle}》第 {spatial.currentTime.sceneOrder} 场
              </div>
            )}
            {spatial.nearbyEntities.filter((e) => e.kind === 'character').length > 0 && (
              <div className="meta">
                在场：
                {spatial.nearbyEntities
                  .filter((e) => e.kind === 'character')
                  .map((e) => e.name)
                  .join('、')}
              </div>
            )}
          </div>
        )}
      </div>

      {!mapOpen && (
        <div className="hint">
          {selectedRegion
            ? '地点俯视 · 滚轮远近 · 点击场景标记或打开平面图 · ESC 返回星球'
            : onBackToSystem
              ? '拖拽旋转星球 · 点击地点进入俯视 · ESC 返回恒星系'
              : '拖拽旋转星球 · 点击地点进入俯视'}
        </div>
      )}

      {!mapOpen && !selectedRegion && hoverRegionId && space.regionById.get(hoverRegionId) && (
        <div className="tooltip" style={{ right: 20, bottom: 20 }}>
          {(() => {
            const region = space.regionById.get(hoverRegionId)!;
            return (
              <>
                <h4>{region.name}</h4>
                <div className="meta-row" style={{ margin: '6px 0' }}>
                  {region.tags.slice(0, 4).map((tag) => (
                    <span className="chip" key={tag}>
                      {tag}
                    </span>
                  ))}
                  <span className="chip accent">{region.scenes.length} 个场景</span>
                </div>
                {region.description && <p>{region.description}</p>}
              </>
            );
          })()}
        </div>
      )}

      {/* 地点简介：独立实验里用侧卡；Studio 内嵌时由 Inspector 编辑同一份描述 */}
      {!embedded && selectedRegion && !detailScene && !selectedTrack && !mapOpen && (
        <aside className="side-card">
          <button className="close-btn" onClick={handleRegionCrumb} aria-label="关闭">
            ×
          </button>
          <h3>{selectedRegion.name}</h3>
          <div className="kicker">
            {locationSpaceType}
            {selectedRegion.orphan ? ' · 未归档场景' : ''}
          </div>
          <div className="meta-row">
            {selectedRegion.tags.slice(0, 6).map((tag) => (
              <span className="chip" key={tag}>
                {tag}
              </span>
            ))}
            <span className="chip accent">{selectedRegion.scenes.length} 个场景</span>
            {locationCharacters.length > 0 && (
              <span className="chip">{locationCharacters.length} 位角色到过</span>
            )}
          </div>
          {selectedRegion.description ? (
            <p className="desc">{selectedRegion.description}</p>
          ) : (
            <p className="desc muted">
              这个地点还没有简介。简介写在 Studio 的地点资产描述里，这里和 Inspector 读同一份。
            </p>
          )}
          {selectedRegion.scenes.length > 0 && (
            <div className="rel-list">
              <div className="rel-item" style={{ color: 'var(--muted)' }}>
                这里的场景
              </div>
              {selectedRegion.scenes.map((node) => (
                <button
                  key={node.scene.id}
                  className="rel-item"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '2px 0',
                    cursor: 'pointer',
                    textAlign: 'left',
                    font: 'inherit',
                    color: '#aebadf',
                  }}
                  onClick={() => {
                    setDetailSceneId(node.scene.id);
                    setSelectedCharacterId(null);
                    apiRef.current?.selectScene(node.scene.id);
                  }}
                >
                  <b style={{ color: 'var(--text)' }}>{node.scene.title}</b>
                  {node.scene.time_of_day ? (
                    <span style={{ color: 'var(--muted)' }}> · {node.scene.time_of_day}</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
          {locationCharacters.length > 0 && (
            <div className="meta-row">
              {locationCharacters.map((character) => (
                <button
                  key={character.id}
                  className="chip accent"
                  style={{ cursor: 'pointer', border: 'none' }}
                  onClick={() => {
                    setSelectedCharacterId(character.id);
                    setDetailSceneId(null);
                    apiRef.current?.selectCharacter(character.id);
                  }}
                >
                  ✦ {character.name}
                </button>
              ))}
            </div>
          )}
          {studioHref('location', selectedRegion.id) && (
            <a
              className="studio-link"
              href={studioHref('location', selectedRegion.id)!}
              target="_blank"
              rel="noreferrer"
            >
              在 Studio 编辑
            </a>
          )}
        </aside>
      )}

      {/* 场景详情：这里发生什么 */}
      {!embedded && detailScene && !selectedTrack && !mapOpen && (
        <aside className="side-card">
          <button className="close-btn" onClick={() => setDetailSceneId(null)} aria-label="关闭">
            ×
          </button>
          <h3>{detailScene.title}</h3>
          <div className="kicker">
            {[
              selectedRegion?.name ?? space.regionById.get(detailSceneNode?.regionId ?? '')?.name,
              detailStory && `《${detailStory.title}》第 ${detailScene.order} 场`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {selectedRegion?.description ? (
            <p className="place-brief">
              <span className="kicker">地点简介</span>
              {selectedRegion.description}
            </p>
          ) : null}
          <div className="meta-row">
            {detailScene.time_of_day && <span className="chip">{detailScene.time_of_day}</span>}
            {detailScene.weather && <span className="chip">{detailScene.weather}</span>}
            {detailScene.mood && <span className="chip">{detailScene.mood}</span>}
            {typeof detailScene.shot_count === 'number' && (
              <span className="chip accent">{detailScene.shot_count} 分镜</span>
            )}
            {detailScene.state && (
              <span className="chip">{stateLabel[detailScene.state] ?? detailScene.state}</span>
            )}
          </div>
          {(detailScene.summary || detailScene.description) && (
            <p className="desc">{detailScene.summary ?? detailScene.description}</p>
          )}
          {sceneCharacters.length > 0 && (
            <>
              <div className="rel-list">
                <div className="rel-item" style={{ color: 'var(--muted)' }}>
                  在此出现的角色
                </div>
              </div>
              <div className="meta-row">
                {sceneCharacters.map((c) => (
                  <button
                    key={c.id}
                    className="chip accent"
                    style={{ cursor: 'pointer', border: 'none' }}
                    onClick={() => {
                      setSelectedCharacterId(c.id);
                      setDetailSceneId(null);
                      apiRef.current?.selectCharacter(c.id);
                    }}
                  >
                    ✦ {c.name}
                  </button>
                ))}
              </div>
            </>
          )}
          {sceneEvents.length > 0 && (
            <div className="rel-list">
              {sceneEvents.map((ev) => (
                <div className="rel-item" key={ev.id}>
                  ◈ <b>{ev.title}</b>
                  {ev.description ? (
                    <span style={{ color: 'var(--muted)' }}> — {ev.description}</span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {studioHref('scene', detailScene.id) && (
            <a
              className="studio-link"
              href={studioHref('scene', detailScene.id)!}
              target="_blank"
              rel="noreferrer"
            >
              在 Studio 编辑
            </a>
          )}
        </aside>
      )}

      {/* 角色详情 + 空间轨迹（谁 · 什么时候 · 在哪里） */}
      {!embedded && selectedTrack && !mapOpen && (
        <aside className="side-card">
          <button
            className="close-btn"
            onClick={() => {
              setSelectedCharacterId(null);
              apiRef.current?.selectCharacter(null);
            }}
            aria-label="关闭"
          >
            ×
          </button>
          <h3>{selectedTrack.character.name}</h3>
          <div className="kicker">{selectedTrack.character.personality ?? '角色'}</div>
          <div className="meta-row">
            {(selectedTrack.character.tags ?? []).map((tag) => (
              <span className="chip" key={tag}>
                {tag}
              </span>
            ))}
            <span className="chip accent">{selectedTrack.stops.length} 站轨迹</span>
          </div>
          <p className="desc">{selectedTrack.character.description}</p>
          <div className="rel-list">
            <div className="rel-item" style={{ color: 'var(--muted)' }}>
              空间轨迹（按故事顺序）
            </div>
            {selectedTrack.stops.map((stop, i) => (
              <button
                key={stop.scene.id}
                className="rel-item"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '2px 0',
                  cursor: 'pointer',
                  textAlign: 'left',
                  font: 'inherit',
                  color: '#aebadf',
                }}
                onClick={() => handleStopClick(stop)}
                title="进入该场景所在地点"
              >
                {WAYPOINT_GLYPHS[i] ?? i + 1}{' '}
                <b style={{ color: 'var(--text)' }}>{stop.scene.title}</b>
                <span style={{ color: 'var(--muted)' }}>
                  {' '}
                  · {stop.region.name} · 《{stop.storyTitle}》第 {stop.scene.order} 场
                </span>
              </button>
            ))}
          </div>
          {trackRelations.length > 0 && (
            <div className="rel-list">
              <div className="rel-item" style={{ color: 'var(--muted)' }}>
                人物关系（辅助）
              </div>
              {trackRelations.map(({ rel, other, dir }) => (
                <div className="rel-item" key={rel.id}>
                  {dir === '→' ? '→' : '←'} <b>{other.name}</b>
                  <span style={{ color: relationColor(rel.kind, rel.id) }}>
                    {' '}
                    · {rel.label || rel.kind}
                  </span>
                </div>
              ))}
            </div>
          )}
        </aside>
      )}

      {mapOpen && selectedRegion && (
        <SiteMap
          region={selectedRegion}
          onClose={() => setMapOpen(false)}
          onSelectScene={(sceneId) => {
            setMapOpen(false);
            setDetailSceneId(sceneId);
            setSelectedCharacterId(null);
            apiRef.current?.selectScene(sceneId);
            onSelectSceneRef.current?.(sceneId);
          }}
        />
      )}
    </div>
  );
}
