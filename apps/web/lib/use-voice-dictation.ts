'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchVoiceStatus, VoiceDictation } from '@/lib/voice-dictation';

export function useVoiceDictation(options: { disabled?: boolean; insert: (text: string) => void }) {
  const [voiceState, setVoiceState] = useState<'unknown' | 'ready' | 'unavailable'>('unknown');
  const [voiceReason, setVoiceReason] = useState('');
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState('');
  const [notice, setNotice] = useState('');
  const dictationRef = useRef<VoiceDictation | null>(null);
  const insertRef = useRef(options.insert);
  insertRef.current = options.insert;

  useEffect(() => {
    let cancelled = false;
    void fetchVoiceStatus()
      .then((status) => {
        if (cancelled) return;
        setVoiceState(status.available && status.engine ? 'ready' : 'unavailable');
        setVoiceReason(status.reason ?? '');
      })
      .catch(() => {
        if (!cancelled) setVoiceState('unavailable');
      });
    return () => {
      cancelled = true;
      dictationRef.current?.abort();
      dictationRef.current = null;
    };
  }, []);

  async function stop() {
    const session = dictationRef.current;
    if (!session) return;
    dictationRef.current = null;
    setRecording(false);
    try {
      const text = await session.stop();
      insertRef.current(text);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : '结束听写失败');
    } finally {
      setInterim('');
    }
  }

  async function start() {
    if (dictationRef.current?.isRecording) return;
    const session = new VoiceDictation();
    dictationRef.current = session;
    setInterim('');
    setNotice('');
    let surfaced = false;
    try {
      await session.start({
        onPartial: (accumulated, partial) => setInterim(`${accumulated}${partial}`),
        onSegment: (accumulated) => setInterim(accumulated),
        onError: (message) => {
          surfaced = true;
          setNotice(message);
          setInterim('');
          if (dictationRef.current === session) {
            dictationRef.current = null;
            setRecording(false);
          }
        },
      });
      setRecording(true);
    } catch (reason) {
      if (dictationRef.current === session) dictationRef.current = null;
      setInterim('');
      if (!surfaced && reason instanceof Error) setNotice(reason.message);
    }
  }

  function toggle() {
    if (options.disabled) return;
    if (recording) void stop();
    else void start();
  }

  return { voiceState, voiceReason, recording, interim, notice, setNotice, toggle };
}
