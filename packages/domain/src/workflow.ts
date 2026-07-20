import type { AutomationLevel } from './agent.js';

export const STORY_TO_VIDEO_STEPS = [
  'story',
  'story_review',
  'scene',
  'scene_review',
  'visual_prep',
  'visual_assets_review',
  'shot',
  'shot_review',
  'prompt',
  'prompt_review',
  'video',
  'video_review',
] as const;

export type StoryToVideoStep = (typeof STORY_TO_VIDEO_STEPS)[number];
export type ReviewStep = Extract<StoryToVideoStep, `${string}_review`>;
export type WorkflowReviewAction =
  | 'approve'
  | 'approve_all'
  | 'reject'
  | 'retry'
  | 'retry_with_feedback';

export type StageAutomation = Partial<
  Record<'story' | 'scene' | 'visual_assets' | 'shot' | 'prompt' | 'video', AutomationLevel>
>;

export interface StoryToVideoWorkflowState {
  version: 1;
  current_step_index: number;
  awaiting_review: ReviewStep | null;
  automation: StageAutomation;
  revision: number;
  feedback: string | undefined;
}

const reviewStage: Record<ReviewStep, keyof StageAutomation> = {
  story_review: 'story',
  scene_review: 'scene',
  visual_assets_review: 'visual_assets',
  shot_review: 'shot',
  prompt_review: 'prompt',
  video_review: 'video',
};

const mandatoryReviewSteps = new Set<ReviewStep>([
  'visual_assets_review',
  'prompt_review',
]);

export function createStoryToVideoState(
  automation: StageAutomation = {},
): StoryToVideoWorkflowState {
  return {
    version: 1,
    current_step_index: 0,
    awaiting_review: null,
    automation,
    revision: 0,
    feedback: undefined,
  };
}

export function currentWorkflowStep(
  state: StoryToVideoWorkflowState,
): StoryToVideoStep | null {
  return STORY_TO_VIDEO_STEPS[state.current_step_index] ?? null;
}

export function isReviewStep(step: StoryToVideoStep): step is ReviewStep {
  return step.endsWith('_review');
}

export function requiresHumanReview(
  step: ReviewStep,
  state: StoryToVideoWorkflowState,
): boolean {
  if (mandatoryReviewSteps.has(step)) return true;
  const level = state.automation[reviewStage[step]] ?? 'assisted';
  return level !== 'full_auto';
}

export function completeWorkflowStep(
  state: StoryToVideoWorkflowState,
  completedStep: StoryToVideoStep,
): StoryToVideoWorkflowState {
  const current = currentWorkflowStep(state);
  if (current !== completedStep) {
    throw new Error(`Cannot complete ${completedStep}; current workflow step is ${current ?? 'done'}`);
  }
  if (isReviewStep(completedStep) && requiresHumanReview(completedStep, state)) {
    throw new Error(`Review step ${completedStep} requires an explicit decision`);
  }
  return {
    ...state,
    current_step_index: state.current_step_index + 1,
    awaiting_review: null,
    revision: state.revision + 1,
    feedback: undefined,
  };
}

export function enterReview(
  state: StoryToVideoWorkflowState,
  step: ReviewStep,
): StoryToVideoWorkflowState {
  if (currentWorkflowStep(state) !== step) {
    throw new Error(`Cannot enter review ${step}; it is not the current workflow step`);
  }
  if (!requiresHumanReview(step, state)) return completeWorkflowStep(state, step);
  return { ...state, awaiting_review: step, revision: state.revision + 1 };
}

export function applyReviewDecision(
  state: StoryToVideoWorkflowState,
  step: ReviewStep,
  action: WorkflowReviewAction,
  feedback?: string,
): StoryToVideoWorkflowState {
  if (state.awaiting_review !== step || currentWorkflowStep(state) !== step) {
    throw new Error(`Workflow is not awaiting review for ${step}`);
  }
  if (action === 'approve' || action === 'approve_all') {
    return {
      ...state,
      current_step_index: state.current_step_index + 1,
      awaiting_review: null,
      revision: state.revision + 1,
      feedback: undefined,
    };
  }

  const previousAgentIndex = Math.max(0, state.current_step_index - 1);
  return {
    ...state,
    current_step_index: previousAgentIndex,
    awaiting_review: null,
    revision: state.revision + 1,
    feedback: action === 'retry_with_feedback' || action === 'reject' ? feedback : undefined,
  };
}
