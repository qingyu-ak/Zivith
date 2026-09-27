// 流式 zipformer 的已知伪影(ADR-0017 附录):重复字、静音噪声被当成拉丁字母。
// 在适配器出口收敛,不改引擎本身。

const SPEECH_RMS = 0.025;
const MIN_VOICED_FRAMES = 2;

/** 连续 3 个以上相同汉字收成 2 个:「今天天天气」→「今天天气」,「爸爸」保留。 */
export function collapseRepeatArtifacts(text: string): string {
  return text.replace(/([\u4e00-\u9fff])\1{2,}/g, '$1$1');
}

export function isLikelyUtterance(text: string): boolean {
  const cleaned = collapseRepeatArtifacts(text).replace(/\s+/g, ' ').trim();
  if (cleaned.length < 2) return false;
  const cjk = cleaned.replace(/[^\u4e00-\u9fff]/g, '');
  if (cjk.length >= 2) return true;
  return /[A-Za-z]{3,}/.test(cleaned);
}

export function frameRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

export function isVoicedFrame(samples: Float32Array): boolean {
  return frameRms(samples) >= SPEECH_RMS;
}

export function shouldKeepTranscript(text: string, voicedFrames: number): boolean {
  return voicedFrames >= MIN_VOICED_FRAMES && isLikelyUtterance(text);
}
