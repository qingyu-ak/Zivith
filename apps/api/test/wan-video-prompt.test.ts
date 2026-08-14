import { describe, expect, it } from 'vitest';
import { toWanVideoPrompt } from '../src/adapters/wan-video-prompt.js';

describe('toWanVideoPrompt', () => {
  it('collapses structured Studio prompts into a Wan narrative paragraph', () => {
    const structured =
      'Cinematography: angle eye_level, movement dolly_in, shot type wide_shot, focal length 24mm, depth of field deep. Composition: framing wide, background starry sky. Lighting: type natural, direction side. Mood: 壮丽、自由. Characters: 星辉幼龙, physical, 壮丽; 艾琳, physical, 壮丽. Action: description 艾琳骑上星辉幼龙，飞入星空。月蚀结束，月光洒下，她与龙的身影消失在星河中。, duration hint 5. Environment: 星空, 飞入星空, 月蚀结束';

    const prompt = toWanVideoPrompt(structured);
    expect(prompt).toContain('艾琳骑上星辉幼龙');
    expect(prompt).toContain('Featuring 星辉幼龙 and 艾琳');
    expect(prompt).toContain('Setting:');
    expect(prompt).toMatch(/Camera:.*wide shot/i);
    expect(prompt).toMatch(/eye level/i);
    expect(prompt).toMatch(/dolly in/i);
    expect(prompt).not.toMatch(/Cinematography:/i);
    expect(prompt).not.toMatch(/duration hint/i);
    expect(prompt.split(/\s+/).length).toBeLessThanOrEqual(180);
  });

  it('leaves already-narrative prompts mostly intact', () => {
    const narrative =
      'A young woman rides a glowing dragon into a starry sky as moonlight returns after an eclipse.';
    expect(toWanVideoPrompt(narrative)).toBe(narrative);
  });
});
