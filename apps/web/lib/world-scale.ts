// world-scale.ts — 世界线刻度工具
//
// 借鉴 d3-scale 的 domain→range 线性映射抽象（MIT 思路，零依赖实现）。
// 世界线的"时间"是抽象序数（presentation_order / order），不是真实日历时间，
// 因此 v1 只需线性映射 + clamp；未来接入真实世界时间数据时，
// 可在此处替换为分段/非线性映射，消费方无感。
//
// 借鉴评估（见 docs/engineering/Code-Agent-Design-Guide.md §13.2）：
// - vis-timeline：命令式 API + 强绑定真实日历时间 + 维护停滞 → 不采用，只借鉴其
//   "轨道(group)+条目(item)" 数据模型（见 lib/world-line.ts）
// - d3-scale：domain→range + tick 抽象值得借鉴，但引入新依赖会扰动当前 hoisted
//   node_modules 环境 → 手写等价实现

export interface OrderScale {
  /** order → 像素 x（clamp 到 range） */
  (order: number): number;
  /** 像素 x → order（反解，用于命中检测 / 刻度生成） */
  invert(px: number): number;
  domain(): [number, number];
}

/** 线性 domain→range 映射，clamp 到 range 两端。 */
export function createOrderScale(domain: [number, number], range: [number, number]): OrderScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = (r1 - r0) / (d1 - d0 || 1);

  const scale = ((order: number): number => {
    const px = r0 + (order - d0) * k;
    return px < r0 ? r0 : px > r1 ? r1 : px;
  }) as OrderScale;

  scale.invert = (px: number): number => {
    const order = d0 + (px - r0) / k;
    return order < d0 ? d0 : order > d1 ? d1 : order;
  };

  scale.domain = () => domain;
  return scale;
}

/** 在 [min, max] 区间内均匀插入 count 个刻度（角色/地点无显式 order 时使用）。 */
export function interpolateOrders(count: number, min: number, max: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [min + (max - min) / 2];
  const step = (max - min) / (count + 1);
  return Array.from({ length: count }, (_, index) => min + step * (index + 1));
}

/** 整数刻度序列（事件 presentation_order 渲染刻度轴用）。 */
export function integerTicks(min: number, max: number): number[] {
  const start = Math.ceil(min);
  const end = Math.floor(max);
  if (start > end) return [Math.round(min)];
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
