import {
  AudioQuality,
  IOSOutputFormat,
  type RecordingOptions,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';

import { MAX_VOICE, type Outgoing } from '@/lib/attachments';

/** The phone apps record with the phone's own recorder. */
export const canRecordVoice = true;

/** Speech quality in the format every phone and browser plays (AAC in an .m4a file): one voice, about 0.25 MB a minute. */
const SPEECH: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 32000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
};

/** `onLimit` is called when the longest length is reached, so the chat can stop and send. */
export function useVoiceRecorder(onLimit: () => void) {
  const limit = useRef(onLimit);
  useEffect(() => {
    limit.current = onLimit;
  });
  const recorder = useAudioRecorder(SPEECH);
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

  /** Asks for the microphone and starts. Gives the reason when it cannot. */
  async function start(): Promise<string | null> {
    try {
      const allowed = await requestRecordingPermissionsAsync();
      if (!allowed.granted) return 'The microphone could not be used. Allow it for Doneva in the phone settings and try again.';
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAt.current = Date.now();
      setSeconds(0);
      setRecording(true);
      return null;
    } catch {
      return 'The recording could not be started.';
    }
  }

  /** Stops and gives the recording, or nothing when `keep` is false or nothing was recorded. */
  async function stop(keep: boolean): Promise<Outgoing | null> {
    if (!recording) return null;
    setRecording(false);
    const length = Math.min(MAX_VOICE, (Date.now() - startedAt.current) / 1000);
    try {
      await recorder.stop();
      // Back to normal sound, so the next voice message plays through the loudspeaker.
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {
      return null;
    }
    const uri = recorder.uri;
    if (!keep || !uri || length < 1) return null;
    return { name: 'voice-message.m4a', mimeType: 'audio/mp4', size: 0, body: { uri }, voiceSeconds: length };
  }

  return { recording, seconds, start, stop };
}
