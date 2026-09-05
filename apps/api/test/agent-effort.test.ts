import { describe, expect, it } from 'vitest';
import { asAgentEffortLevel, resolveAgentEffort } from '../src/contexts/agent-effort.js';

describe('resolveAgentEffort', () => {
  it('defaults missing values to balanced', () => {
    expect(asAgentEffortLevel(undefined)).toBe('balanced');
    expect(asAgentEffortLevel({ level: 'nope' })).toBe('balanced');
    expect(resolveAgentEffort().effective_level).toBe('balanced');
  });

  it('accepts a bare level or { level } envelope', () => {
    expect(asAgentEffortLevel('fast')).toBe('fast');
    expect(asAgentEffortLevel({ level: 'deep' })).toBe('deep');
  });

  it('fast stays narrower than deep and never raises gates', () => {
    const fast = resolveAgentEffort('fast');
    const deep = resolveAgentEffort('deep');
    expect(fast.limits.max_context_tokens).toBeLessThan(deep.limits.max_context_tokens);
    expect(fast.schedule.scan_conflicts).toBe(false);
    expect(deep.schedule.scan_conflicts).toBe(true);
    expect(fast.schedule.max_proposals).toBeLessThanOrEqual(deep.schedule.max_proposals);
  });
});
