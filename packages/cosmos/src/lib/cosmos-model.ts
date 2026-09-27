import * as THREE from 'three';
import type { WorldResourcesDTO } from '../types';
import { relationColor, seededRandom, starColor } from './palette';

/** 角色宇宙：节点 = 角色，边 = 角色间关系 */
export interface StarNode {
  id: string;
  name: string;
  characterId: string;
  degree: number;
  color: string;
  position: THREE.Vector3;
}

export interface StarEdge {
  id: string;
  kind: string;
  label: string;
  description: string;
  direction: string | null;
  color: string;
  /** 节点下标 */
  a: number;
  b: number;
}

export interface CosmosGraph {
  nodes: StarNode[];
  edges: StarEdge[];
}

/**
 * 从世界资源构建角色关系图。
 * 只保留两端都能解析为角色的关系；缺端点/指向地点、场景等的关系被过滤，
 * 那些数据由场景宇宙消费。
 */
export function buildCosmosGraph(resources: WorldResourcesDTO): CosmosGraph {
  const characters = resources.entities.characters ?? [];
  const nodes: StarNode[] = characters.map((c) => ({
    id: c.id,
    name: c.name,
    characterId: c.id,
    degree: 0,
    color: starColor(c.id),
    position: new THREE.Vector3(),
  }));
  const indexOf = new Map(nodes.map((n, i) => [n.id, i] as const));

  const edges: StarEdge[] = [];
  const seen = new Set<string>();
  for (const rel of resources.entities.relationships ?? []) {
    const ai = rel.source_type === 'asset' ? indexOf.get(rel.source_id) : undefined;
    const bi = rel.target_type === 'asset' ? indexOf.get(rel.target_id) : undefined;
    if (ai === undefined || bi === undefined || ai === bi) continue;
    const key = ai < bi ? `${rel.kind}|${ai}|${bi}` : `${rel.kind}|${bi}|${ai}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      id: rel.id,
      kind: rel.kind,
      label: rel.label ?? '',
      description: rel.description ?? '',
      direction: rel.direction ?? null,
      color: relationColor(rel.kind, rel.id),
      a: ai,
      b: bi,
    });
    nodes[ai].degree += 1;
    nodes[bi].degree += 1;
  }

  layoutGraph(nodes, edges);
  return { nodes, edges };
}

/**
 * 简化 3D 力导向布局：斥力 + 关系弹簧 + 向心。
 * 角色数一般在几十以内，O(n²) 一次性离线计算足够。
 */
export function layoutGraph(nodes: StarNode[], edges: StarEdge[], iterations = 300): void {
  const n = nodes.length;
  if (n === 0) return;
  const rand = seededRandom('cosmos:' + nodes.map((nd) => nd.id).join(','));
  const radius = 4.5 + Math.cbrt(n) * 2.4;

  // 初始：球壳上的确定性散布
  for (const node of nodes) {
    const u = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    node.position
      .set(Math.cos(theta) * s, u, Math.sin(theta) * s)
      .multiplyScalar(radius * (0.55 + 0.9 * rand()));
  }

  const restLength = Math.max(2.6, 7.5 / Math.sqrt(Math.max(1, n / 6)));
  const velocity = nodes.map(() => new THREE.Vector3());
  const tmp = new THREE.Vector3();

  for (let iter = 0; iter < iterations; iter++) {
    const cool = 1 - iter / iterations;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        tmp.subVectors(nodes[i].position, nodes[j].position);
        let d = tmp.length();
        if (d < 1e-4) {
          tmp.set(rand() - 0.5, rand() - 0.5, rand() - 0.5);
          d = tmp.length() || 1e-4;
        }
        const repulse = Math.min(26 / (d * d), 2.4);
        tmp.normalize().multiplyScalar(repulse);
        velocity[i].add(tmp);
        velocity[j].sub(tmp);
      }
    }

    for (const edge of edges) {
      tmp.subVectors(nodes[edge.b].position, nodes[edge.a].position);
      const d = tmp.length() || 1e-4;
      tmp.normalize().multiplyScalar((d - restLength) * 0.055);
      velocity[edge.a].add(tmp);
      velocity[edge.b].sub(tmp);
    }

    for (let i = 0; i < n; i++) {
      velocity[i].multiplyScalar(0.82);
      velocity[i].addScaledVector(nodes[i].position, -0.009);
      nodes[i].position.addScaledVector(velocity[i], 0.25 + cool);
    }
  }
}

/** 节点星点大小（world 单位）：度数越高越大 */
export function starScale(degree: number): number {
  return 0.9 + Math.min(degree, 8) * 0.16;
}
