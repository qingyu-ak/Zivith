'use client';

import { IconMic } from '@/components/nav-icons';

export function VoiceMicButton({
  recording,
  voiceState,
  voiceReason,
  disabled,
  onToggle,
  size = 'md',
}: {
  recording: boolean;
  voiceState: 'unknown' | 'ready' | 'unavailable';
  voiceReason: string;
  disabled?: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md';
}) {
  const box = size === 'sm' ? 'size-7' : 'size-8';
  const icon = size === 'sm' ? 'size-3.5' : 'size-4';
  return (
    <button
      type="button"
      className={`grid ${box} place-items-center rounded-full ${
        recording
          ? 'animate-pulse bg-red-50 text-red-600'
          : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
      }`}
      aria-label={recording ? '结束听写' : '语音输入(本地识别)'}
      aria-pressed={recording}
      title={
        voiceState === 'ready'
          ? recording
            ? '结束听写并插入文本'
            : '语音输入(本地识别,音频不出机器)'
          : voiceState === 'unavailable'
            ? `语音输入不可用:${voiceReason || '本机语音引擎未就绪(可运行 node scripts/voice-model.mjs)'}`
            : '正在检查本机语音服务…'
      }
      disabled={disabled || voiceState === 'unavailable'}
      onClick={onToggle}
    >
      <IconMic className={icon} />
    </button>
  );
}
