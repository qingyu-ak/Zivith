import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { WorldResourcesDTO } from '../types';
import { createStarfield } from '../lib/starfield';
import {
  makeCoronaMesh,
  makeProminenceGroup,
  makeSunMaterial,
  tickStarBody,
} from '../lib/star-body';
import {
  createEarthSurface,
  makeAtmosphereMaterial,
  makeCityLightsTexture,
  makeCloudTexture,
  makeEarthTextures,
} from '../lib/planet-texture';
import { makePlanetRings, type PlanetRingsHandle } from '../lib/planet-rings';
import { worldHasPlanetRings } from '../lib/planet-features';
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
  onEnterPlanet: () => void;
  onBackToUniverse?: () => void;
  active?: boolean;
  embedded?: boolean;
}

const STAR_R = 1.82;
const PLANET_R = 0.54;
const ORBIT_R = 7.35;
const HOME_POS = new THREE.Vector3(0, 4.05, 16.4);
const HOME_TARGET = new THREE.Vector3(0, 0, 0);
const LS_ORBIT_TICKS = 'zivith-cosmos-orbit-ticks';

function readOrbitTicks(): boolean {
  try {
    return localStorage.getItem(LS_ORBIT_TICKS) === '1';
  } catch {
    return false;
  }
}

function writeOrbitTicks(on: boolean): void {
  try {
    localStorage.setItem(LS_ORBIT_TICKS, on ? '1' : '0');
  } catch {
    /* ignore quota / private mode */
  }
}

function makeOrbitRing(radius: number, tube: number, color: number, opacity: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 12, 256),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

export function SystemView({
  resources,
  onEnterPlanet,
  onBackToUniverse,
  active = true,
  embedded = false,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const onEnterRef = useRef(onEnterPlanet);
  const onBackRef = useRef(onBackToUniverse);
  const activeRef = useRef(active);
  void embedded;
  const [showTicks, setShowTicks] = useState(readOrbitTicks);
  const showTicksRef = useRef(showTicks);
  showTicksRef.current = showTicks;
  onEnterRef.current = onEnterPlanet;
  onBackRef.current = onBackToUniverse;
  activeRef.current = active;

  const surface = useMemo(
    () => createEarthSurface('earth:' + resources.project.id),
    [resources.project.id],
  );

  useEffect(() => {
    const host = hostRef.current;
    const overlay = overlayRef.current;
    if (!host || !overlay) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    setupRenderer(renderer, host.clientWidth || 1, host.clientHeight || 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setClearColor(new THREE.Color('#000105'), 1);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      38,
      (host.clientWidth || 1) / (host.clientHeight || 1),
      0.1,
      400,
    );
    camera.position.copy(HOME_POS);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 10;
    controls.maxDistance = 26;
    controls.target.copy(HOME_TARGET);
    controls.autoRotate = !wantsStill();
    controls.autoRotateSpeed = 0.12;
    controls.minPolarAngle = 1.18;
    controls.maxPolarAngle = 1.46;

    scene.add(new THREE.AmbientLight(0x1a2438, 0.06));
    const sunLight = new THREE.PointLight(0xfff0c8, 165, 52, 1.35);
    scene.add(sunLight);
    const fill = new THREE.DirectionalLight(0x9bb4ff, 0.08);
    fill.position.set(-8, 4, 10);
    scene.add(fill);

    const sky = createStarfield('cosmos-sky', 90, { width: 2048, height: 1024 });
    scene.add(sky.group);

    const system = new THREE.Group();
    scene.add(system);

    const extraTextures: THREE.Texture[] = [];
    const extraGeos: THREE.BufferGeometry[] = [];
    const extraMats: THREE.Material[] = [];
    const glowTex = makeGlowTexture(256, [
      [0, 'rgba(255,255,255,1)'],
      [0.1, 'rgba(255,244,214,0.45)'],
      [0.28, 'rgba(255,210,120,0.08)'],
      [1, 'rgba(0,0,0,0)'],
    ]);
    extraTextures.push(glowTex);

    const starMat = makeSunMaterial();
    extraMats.push(starMat);
    const starGeo = new THREE.SphereGeometry(STAR_R, 96, 64);
    extraGeos.push(starGeo);
    const star = new THREE.Mesh(starGeo, starMat);
    system.add(star);

    const corona = makeCoronaMesh(STAR_R);
    extraGeos.push(corona.geometry);
    extraMats.push(corona.material as THREE.Material);
    system.add(corona);

    const prominences = makeProminenceGroup(STAR_R);
    system.add(prominences);

    const starHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xfff8ee,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    starHalo.scale.setScalar(2.85);
    system.add(starHalo);
    extraMats.push(starHalo.material);

    system.add(makeOrbitRing(5.2, 0.008, 0x6d7fb8, 0.18));
    const mainOrbit = makeOrbitRing(ORBIT_R, 0.02, 0xc5d8ff, 0.72);
    system.add(mainOrbit);
    const mainGlow = makeOrbitRing(ORBIT_R, 0.048, 0x8eb4ff, 0.12);
    system.add(mainGlow);

    const tickGroup = new THREE.Group();
    tickGroup.visible = showTicksRef.current;
    const tickMat = new THREE.MeshBasicMaterial({
      color: 0xb4c8ee,
      transparent: true,
      opacity: 0.55,
    });
    extraMats.push(tickMat);
    const tickGeoA = new THREE.BoxGeometry(0.035, 0.035, 0.32);
    const tickGeoB = new THREE.BoxGeometry(0.028, 0.028, 0.16);
    extraGeos.push(tickGeoA, tickGeoB);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const tick = new THREE.Mesh(i % 6 === 0 ? tickGeoA : tickGeoB, tickMat);
      tick.position.set(Math.cos(a) * ORBIT_R, 0, Math.sin(a) * ORBIT_R);
      tick.lookAt(0, 0, 0);
      tickGroup.add(tick);
    }
    system.add(tickGroup);

    const planetPivot = new THREE.Group();
    system.add(planetPivot);
    const planetGroup = new THREE.Group();
    planetGroup.position.set(ORBIT_R, 0, 0);
    planetPivot.add(planetGroup);

    const planetMat = new THREE.MeshStandardMaterial({
      color: '#0d3a75',
      roughness: 0.8,
      metalness: 0,
      emissive: new THREE.Color('#ffb070'),
      emissiveIntensity: 0.7,
    });
    extraMats.push(planetMat);
    const planetGeo = new THREE.SphereGeometry(PLANET_R, 80, 56);
    extraGeos.push(planetGeo);
    const planet = new THREE.Mesh(planetGeo, planetMat);
    planet.userData = { isPlanet: true };
    planet.rotation.z = 0.41;
    planetGroup.add(planet);
    planetGroup.add(makeAtmosphereMaterial('#9ec8ff', PLANET_R));
    let planetRings: PlanetRingsHandle | null = null;
    if (worldHasPlanetRings(resources)) {
      planetRings = makePlanetRings(PLANET_R, {
        tilt: 0.12,
        particleCount: 900,
        sizeScale: 18,
        opacity: 0.42,
      });
      planetRings.group.rotation.z = 0.41;
      planetGroup.add(planetRings.group);
    }

    const applyMaps = () => {
      const { map, roughnessMap, bumpMap } = makeEarthTextures(resources.project.id, surface, 1024);
      const lights = makeCityLightsTexture(resources.project.id, surface, 1024);
      extraTextures.push(map, roughnessMap, bumpMap, lights);
      map.anisotropy = 8;
      roughnessMap.anisotropy = 8;
      bumpMap.anisotropy = 8;
      planetMat.map = map;
      planetMat.roughnessMap = roughnessMap;
      planetMat.bumpMap = bumpMap;
      planetMat.bumpScale = 0.42;
      planetMat.roughness = 1;
      planetMat.metalness = 0;
      planetMat.envMapIntensity = 0;
      planetMat.color.set('#ffffff');
      planetMat.emissiveMap = lights;
      planetMat.onBeforeCompile = (shader) => {
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
           vec3 toSun = normalize(-vWorldPos);
           float night = pow(1.0 - clamp(dot(normal, toSun), 0.0, 1.0), 1.7);
           totalEmissiveRadiance *= night;`,
        );
      };
      planetMat.needsUpdate = true;
    };
    requestAnimationFrame(() => requestAnimationFrame(applyMaps));

    const cloudTex = makeCloudTexture('sys-cloud:' + resources.project.id, 1024);
    extraTextures.push(cloudTex);
    const cloudGeo = new THREE.SphereGeometry(PLANET_R * 1.018, 64, 48);
    extraGeos.push(cloudGeo);
    const cloudMat = new THREE.MeshLambertMaterial({
      map: cloudTex,
      transparent: true,
      depthWrite: false,
    });
    extraMats.push(cloudMat);
    const clouds = new THREE.Mesh(cloudGeo, cloudMat);
    planetGroup.add(clouds);

    planetPivot.rotation.y = 0.18;

    const label = createLabel('name-label universe-label focus');
    label.innerHTML = `${resources.project.name}<span class="sub">世界星球 · 点击进入</span>`;
    overlay.appendChild(label);

    let tween: CameraTweenHandle | null = null;
    let entering = false;
    const readyAt = performance.now() + 700;
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

    const enterPlanet = () => {
      if (entering) return;
      entering = true;
      const worldPos = planet.getWorldPosition(new THREE.Vector3());
      tween?.cancel();
      tween = tweenCamera({
        camera,
        controls,
        toPosition: worldPos.clone().add(new THREE.Vector3(0.45, 0.6, 2.9)),
        toTarget: worldPos,
        durationMs: 920,
        onDone: () => onEnterRef.current(),
      });
    };

    const onMove = (event: PointerEvent) => {
      setPointer(event);
      const hit = raycaster.intersectObject(planet, false)[0];
      renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
    };
    const onDown = (event: PointerEvent) => {
      downX = event.clientX;
      downY = event.clientY;
    };
    const onUp = (event: PointerEvent) => {
      if (!activeRef.current || entering) return;
      if (Math.hypot(event.clientX - downX, event.clientY - downY) > 6) return;
      setPointer(event);
      if (raycaster.intersectObject(planet, false)[0]) enterPlanet();
    };
    const onKey = (event: KeyboardEvent) => {
      if (!activeRef.current) return;
      if (event.key === 'Escape') {
        if (!onBackRef.current) return;
        entering = false;
        tween?.cancel();
        onBackRef.current();
      }
      if (event.key === 'Enter' && performance.now() >= readyAt) enterPlanet();
    };

    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);

    const resize = () => {
      setupRenderer(renderer, host.clientWidth || 1, host.clientHeight || 1);
      camera.aspect = (host.clientWidth || 1) / (host.clientHeight || 1);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const clock = new THREE.Clock();
    const tmp = new THREE.Vector3();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!activeRef.current) {
        entering = false;
        tween?.cancel();
        camera.position.copy(HOME_POS);
        controls.target.copy(HOME_TARGET);
        return;
      }
      const dt = Math.min(0.033, clock.getDelta());
      const t = clock.elapsedTime;
      controls.update();
      tickGroup.visible = showTicksRef.current;
      starMat.uniforms.uTime.value = t;
      tickStarBody(corona, t);
      tickStarBody(prominences, t);
      if (planetRings) {
        planet.getWorldPosition(tmp);
        planetRings.tick(t, tmp, tmp.clone().multiplyScalar(-1).normalize());
      }
      if (!wantsStill()) {
        sky.update(dt, t);
        if (!entering) planetPivot.rotation.y += dt * 0.12;
        planet.rotation.y += dt * 0.38;
        clouds.rotation.y += dt * 0.22;
        prominences.rotation.y += dt * 0.08;
        starHalo.material.opacity = 0.14 + 0.04 * Math.sin(t * 0.9);
      }

      const viewW = host.clientWidth || 1;
      const viewH = host.clientHeight || 1;
      planet.getWorldPosition(tmp);
      const { x, y, visible } = projectToScreen(tmp, camera, viewW, viewH);
      if (visible) {
        label.style.display = '';
        label.style.left = `${x + 56}px`;
        label.style.top = `${y}px`;
      } else label.style.display = 'none';

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      tween?.cancel();
      ro.disconnect();
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      label.remove();
      controls.dispose();
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
      for (const geo of extraGeos) geo.dispose();
      for (const mat of extraMats) mat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [resources, surface]);

  return (
    <div className="view-wrap">
      <div ref={hostRef} className="stage" />
      <div ref={overlayRef} className="overlay-labels" />
      <div className="hud-top-left">
        <div className="breadcrumb">
          {onBackToUniverse ? (
            <>
              <button className="crumb link" type="button" onClick={onBackToUniverse}>
                宇宙
              </button>
              <span className="sep">/</span>
            </>
          ) : null}
          <span className="crumb">{resources.project.name}</span>
        </div>
        <button
          type="button"
          className={`hud-chip${showTicks ? ' on' : ''}`}
          aria-pressed={showTicks}
          onClick={() => {
            setShowTicks((prev) => {
              const next = !prev;
              writeOrbitTicks(next);
              return next;
            });
          }}
        >
          轨道刻度
        </button>
      </div>
      <div className="hint">
        {onBackToUniverse
          ? '拖拽旋转 · 点击星球或按 Enter 进入地表 · ESC 返回宇宙'
          : '拖拽旋转 · 点击星球或按 Enter 进入地表'}
      </div>
    </div>
  );
}
