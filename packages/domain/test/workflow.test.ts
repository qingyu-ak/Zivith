import { describe, expect, it } from 'vitest';
import {
  applyReviewDecision,
  completeWorkflowStep,
  createStoryToVideoState,
  currentWorkflowStep,
  enterReview,
  requiresHumanReview,
} from '../src/index.js';

describe('story-to-video workflow state machine', () => {
  it('advances in the canonical pipeline order', () => {
    let state = createStoryToVideoState({ story: 'full_auto' });
    state = completeWorkflowStep(state, 'story');
    expect(currentWorkflowStep(state)).toBe('story_review');

    state = enterReview(state, 'story_review');
    expect(currentWorkflowStep(state)).toBe('scene');
    expect(state.awaiting_review).toBeNull();
  });

  it('never bypasses visual-assets or prompt review in full-auto mode', () => {
    const automation = {
      visual_assets: 'full_auto',
      prompt: 'full_auto',
    } as const;
    expect(requiresHumanReview('visual_assets_review', createStoryToVideoState(automation))).toBe(
      true,
    );
    expect(requiresHumanReview('prompt_review', createStoryToVideoState(automation))).toBe(true);
  });

  it('pauses at mandatory review and continues after approval', () => {
    let state = createStoryToVideoState({ prompt: 'full_auto' });
    state = { ...state, current_step_index: 9 };
    state = enterReview(state, 'prompt_review');

    expect(state.awaiting_review).toBe('prompt_review');
    expect(() => completeWorkflowStep(state, 'prompt_review')).toThrow('explicit decision');

    state = applyReviewDecision(state, 'prompt_review', 'approve');
    expect(currentWorkflowStep(state)).toBe('video');
    expect(state.awaiting_review).toBeNull();
  });

  it('returns to the producing agent with feedback after rejection', () => {
    let state = createStoryToVideoState();
    state = { ...state, current_step_index: 3 };
    state = enterReview(state, 'scene_review');
    state = applyReviewDecision(state, 'scene_review', 'retry_with_feedback', '减少场景数量');

    expect(currentWorkflowStep(state)).toBe('scene');
    expect(state.feedback).toBe('减少场景数量');
  });
});
