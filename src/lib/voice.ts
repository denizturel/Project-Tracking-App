import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { MAX_VOICE, type Outgoing } from '@/lib/attachments';

/**
 * The website records voice messages with the browser's own recorder (computer and phone browsers).
 * The phone apps use voice.native.ts. Both record small files: speech quality, about 0.25 MB a minute.
 */
export const canRecordVoice =
  Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.mediaDevices && typeof MediaRecorder !== 'undefined';

/** Enough for clear speech. Music quality would be four times larger. */
const VOICE_BITS = 32000;

/** The sound format every browser and phone can play back, when this browser can record it. */
function bestFormat() {
  for (const type of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

/** `onLimit` is called when the longest length is reached, so the chat can stop and send. */
export function useVoiceRecorder(onLimit: () => void) {
  const limit = useRef(onLimit);
  useEffect(() => {
    limit.current = onLimit;
  });
  const recorder = useRef<MediaRecorder | null>(null);
  const parts = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const passed = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(passed);
      if (passed >= MAX_VOICE) limit.current();
    }, 500);
    return () => clearInterval(timer);
  }, [recording]);

  // Leaving the chat while recording switches the microphone off.
  useEffect(
    () => () => {
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  /** Asks for the microphone and starts. Gives the reason when it cannot. */
  async function start(): Promise<string | null> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const format = bestFormat();
      const made = new MediaRecorder(stream, { ...(format ? { mimeType: format } : {}), audioBitsPerSecond: VOICE_BITS });
      parts.current = [];
      made.ondataavailable = (event) => {
        if (event.data.size > 0) parts.current.push(event.data);
      };
      made.start();
      recorder.current = made;
      startedAt.current = Date.now();
      setSeconds(0);
      setRecording(true);
      return null;
    } catch {
      return 'The microphone could not be used. Allow it for this page and try again.';
    }
  }

  /** Stops and gives the recording, or nothing when `keep` is false or nothing was recorded. */
  function stop(keep: boolean): Promise<Outgoing | null> {
    const made = recorder.current;
    recorder.current = null;
    setRecording(false);
    if (!made) return Promise.resolve(null);
    const length = Math.min(MAX_VOICE, (Date.now() - startedAt.current) / 1000);
    return new Promise((resolve) => {
      made.onstop = () => {
        made.stream.getTracks().forEach((track) => track.stop());
        const type = (made.mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(parts.current, { type });
        parts.current = [];
        if (!keep || blob.size === 0 || length < 1) return resolve(null);
        const ending = type.includes('mp4') ? 'm4a' : 'webm';
        resolve({ name: `voice-message.${ending}`, mimeType: type, size: blob.size, body: blob, voiceSeconds: length });
      };
      made.stop();
    });
  }

  return { recording, seconds, start, stop };
}
