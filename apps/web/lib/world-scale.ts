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

/** 条目默认半宽 0.35，轴两端再留一点空隙，避免第一条压进轨名栏。 */
export const ORDER_VIEW_PAD = 0.5;

export function paddedOrderDomain(
  min: number,
  max: number,
  pad = ORDER_VIEW_PAD,
): [number, number] {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return [lo - pad, hi + pad];
}

export function clipPlotBox(
  span: { start: number; end: number },
  scale: OrderScale,
  minWidth: number,
  bounds?: { minX: number; maxX: number; maxWidth?: number },
): { x: number; width: number } {
  const start = scale(span.start);
  const end = scale(span.end);
  let width = Math.max(minWidth, end - start);
  if (bounds?.maxWidth != null) width = Math.min(width, Math.max(minWidth, bounds.maxWidth));
  let x = (start + end) / 2 - width / 2;
  if (bounds) {
    if (x < bounds.minX) x = bounds.minX;
    if (x + width > bounds.maxX) x = Math.max(bounds.minX, bounds.maxX - width);
  }
  return { x, width };
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

/**
 * 按像素间距抽稀：保留首尾，中间只留下与上一保留点至少相距 minGap 的项。
 * 若末点与最后保留点过近，丢掉末点之前那个挤着的点。
 */
export function thinByMinGap(positions: number[], minGap: number): boolean[] {
  const count = positions.length;
  const keep = Array.from({ length: count }, () => false);
  const first = positions[0];
  if (count === 0 || first === undefined) return keep;
  keep[0] = true;
  if (count === 1) return keep;
  let lastKeptX = first;
  for (let index = 1; index < count - 1; index += 1) {
    const x = positions[index];
    if (x === undefined) continue;
    if (x - lastKeptX >= minGap) {
      keep[index] = true;
      lastKeptX = x;
    }
  }
  const lastX = positions[count - 1];
  if (lastX === undefined) return keep;
  keep[count - 1] = true;
  if (lastX - lastKeptX < minGap) {
    for (let index = count - 2; index >= 1; index -= 1) {
      if (!keep[index]) continue;
      const previous = positions[index];
      if (previous !== undefined && lastX - previous < minGap) keep[index] = false;
      else break;
    }
  }
  return keep;
}
