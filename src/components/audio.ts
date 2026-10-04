'use client';
import { Scribe, AudioFormat, CommitStrategy, RealtimeEvents } from '@elevenlabs/client';
export function wav(samples: Int16Array) {
  const b = new ArrayBuffer(44 + samples.length * 2),
    v = new DataView(b);
  const text = (offset: number, t: string) =>
    [...t].forEach((c, i) => v.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, b.byteLength - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true);
  v.setUint32(28, 32000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, s, true));
  return b;
}
export function base64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.length; i += 8192)
    str += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(str);
}
export async function captureAudio(
  token: string,
  onPartial: (text: string) => void,
  onCommit: (data: {
    text: string;
    startMs: number;
    endMs: number;
    audio: string | null;
    anchorMs: number;
  }) => void,
  onError: (message: string) => void,
) {
  const connection = await Scribe.connect({
    token,
    modelId: 'scribe_v2_realtime',
    audioFormat: AudioFormat.PCM_16000,
    sampleRate: 16000,
    commitStrategy: CommitStrategy.VAD,
    languageCode: 'en',
    includeTimestamps: true,
  });
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    context = new AudioContext({ sampleRate: 16000 });
    await context.resume();
    const audioContext = context;
    const audioStream = stream;
    if (context.sampleRate !== 16000) {
      stream.getTracks().forEach((t) => t.stop());
      connection.close();
      await context.close();
      throw new Error('16-kHz-Audiokontext nicht unterstützt.');
    }
    await context.audioWorklet.addModule('/pcm-worklet.js');
    const source = context.createMediaStreamSource(stream),
      node = new AudioWorkletNode(context, 'pcm-recorder');
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(node);
    node.connect(mute);
    mute.connect(context.destination);
    let anchorMs = Date.now();
    let anchored = false;
    let active = true,
      total = 0;
    const chunks: { start: number; samples: Int16Array }[] = [];
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (!active) return;
      const samples = Int16Array.from(event.data, (n) =>
        Math.round(Math.max(-1, Math.min(1, n)) * (n < 0 ? 32768 : 32767)),
      );
      if (!anchored) {
        anchorMs = Date.now() - samples.length / 16;
        anchored = true;
      }
      chunks.push({ start: total, samples });
      total += samples.length;
      while (chunks.length && total - chunks[0].start > 16000 * 120) chunks.shift();
      connection.send({ audioBase64: base64(samples.buffer), sampleRate: 16000 });
    };
    connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (e) => {
      if (active) onPartial(e.text);
    });
    connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT_WITH_TIMESTAMPS, (e) => {
      if (!active) return;
      const words = e.words?.filter((w) => w.start !== undefined && w.end !== undefined) || [];
      const start = words[0]?.start,
        end = words.at(-1)?.end;
      let audio: string | null = null;
      if (start !== undefined && end !== undefined) {
        const from = Math.max(0, Math.floor((start - 0.25) * 16000)),
          to = Math.min(total, Math.ceil((end + 0.25) * 16000));
        if (chunks[0] && from >= chunks[0].start && to > from) {
          const clip = new Int16Array(to - from);
          for (const c of chunks) {
            const a = Math.max(from, c.start),
              b = Math.min(to, c.start + c.samples.length);
            if (b > a) clip.set(c.samples.subarray(a - c.start, b - c.start), a - from);
          }
          audio = base64(wav(clip));
        }
      }
      onCommit({
        text: e.text,
        startMs: start === undefined ? total / 16 : start * 1000,
        endMs: end === undefined ? total / 16 : end * 1000,
        audio,
        anchorMs,
      });
    });
    connection.on(RealtimeEvents.ERROR, () => {
      if (active)
        onError('Scribe-Verbindung fehlgeschlagen. Capture pausieren und erneut verbinden.');
    });
    return {
      stop: async () => {
        active = false;
        node.port.onmessage = null;
        node.disconnect();
        source.disconnect();
        audioStream.getTracks().forEach((t) => t.stop());
        connection.close();
        chunks.length = 0;
        await audioContext.close();
      },
    };
  } catch (error) {
    connection.close();
    stream?.getTracks().forEach((track) => track.stop());
    if (context && context.state !== 'closed') await context.close();
    throw error;
  }
}
