/// <reference types="vitest/globals" />
import {
  clampContextWindow,
  formatContextWindow,
  hasContextWindowChoice,
  modelCapabilities,
  modelEffortStops,
  starBrightness,
  stopFill,
  stopThumbOffset,
} from './model-capabilities';

describe('model capabilities', () => {
  it('shows Deep thinking for known DeepSeek V4 chat models', () => {
    expect(modelCapabilities('deepseek-v4-flash').thinking).toBe(true);
    expect(modelCapabilities('deepseek-v4-pro').thinking).toBe(true);
    expect(modelCapabilities('deepseek-reasoner').thinking).toBe(true);
    expect(modelCapabilities('provider/deepseek-v4-flash').thinking).toBe(true);
  });

  it('hides Deep thinking when the model has no chain-of-thought', () => {
    expect(modelCapabilities('mock-text-v1').thinking).toBe(false);
    expect(modelCapabilities('deepseek-chat').thinking).toBe(false);
    expect(modelCapabilities('Qwen/Qwen3.6-27B').thinking).toBe(false);
  });

  it('detects reasoner-style ids without inventing context windows', () => {
    expect(modelCapabilities('deepseek-r1').thinking).toBe(true);
    expect(modelCapabilities('Qwen/QwQ-32B').thinking).toBe(true);
    expect(modelCapabilities('deepseek-v4-flash').contextWindows).toEqual([]);
    expect(hasContextWindowChoice(modelCapabilities('deepseek-v4-pro').contextWindows)).toBe(
      false,
    );
  });

  it('gives each model three to five effort stops', () => {
    expect(modelEffortStops('mock-text-v1')).toHaveLength(3);
    expect(modelEffortStops('deepseek-chat')).toHaveLength(3);
    expect(modelEffortStops('deepseek-v4-flash')).toHaveLength(4);
    expect(modelEffortStops('deepseek-v4-pro')).toHaveLength(5);
    expect(modelEffortStops('deepseek-reasoner').map((item) => item.label)).toEqual([
      '快速',
      '均衡',
      '高',
      '极深',
      '最深',
    ]);
    expect(modelEffortStops('Qwen/Qwen3.6-27B')).toHaveLength(3);
    expect(starBrightness(0, 5, false)).toBeLessThan(starBrightness(4, 5, false));
    expect(starBrightness(2, 5, true)).toBeGreaterThan(starBrightness(2, 5, false));
    expect(stopFill(0, 4)).toBe('22px');
    expect(stopFill(3, 4)).toBe('100%');
    expect(stopFill(1, 5)).toBe('calc(22px + (100% - 22px) * 1 / 4)');
    expect(stopThumbOffset(0, 5)).toBe('0px');
    expect(stopThumbOffset(2, 5)).toBe('calc((100% - 22px) * 2 / 4)');
    expect(stopThumbOffset(4, 5)).toBe('calc(100% - 22px)');
  });

  it('only offers a context chip when a model has more than one window', () => {
    expect(hasContextWindowChoice([])).toBe(false);
    expect(hasContextWindowChoice([128_000])).toBe(false);
    expect(hasContextWindowChoice([32_000, 128_000])).toBe(true);
    expect(clampContextWindow(null, [32_000, 128_000])).toBe(128_000);
    expect(clampContextWindow(32_000, [32_000, 128_000])).toBe(32_000);
    expect(clampContextWindow(999, [32_000, 128_000])).toBe(128_000);
    expect(formatContextWindow(128_000)).toBe('128k');
    expect(formatContextWindow(1_000_000)).toBe('1M');
  });
});
