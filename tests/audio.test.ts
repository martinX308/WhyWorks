import { it, expect, vi, afterEach } from 'vitest';
const fake = vi.hoisted(() => ({
  close: vi.fn(),
  send: vi.fn(),
  listeners: new Map<string, (data: unknown) => void>(),
}));
vi.mock('@elevenlabs/client', () => ({
  Scribe: {
    connect: async () => ({
      close: fake.close,
      send: fake.send,
      on: (name: string, fn: (data: unknown) => void) => fake.listeners.set(name, fn),
    }),
  },
  AudioFormat: { PCM_16000: 'pcm_16000' },
  CommitStrategy: { VAD: 'vad' },
  RealtimeEvents: {
    PARTIAL_TRANSCRIPT: 'partial',
    COMMITTED_TRANSCRIPT_WITH_TIMESTAMPS: 'committed',
    ERROR: 'error',
  },
}));
import { captureAudio } from '../src/components/audio';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fake.close.mockClear();
  fake.send.mockClear();
  fake.listeners.clear();
});
it('abgelehntes Mikrofon schließt bereits gestartete Scribe-Verbindung', async () => {
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error('permission denied')) },
  });
  await expect(
    captureAudio(
      'token',
      () => {},
      () => {},
      () => {},
    ),
  ).rejects.toThrow('permission denied');
  expect(fake.close).toHaveBeenCalledTimes(1);
});
it('Worklet-Fehler beendet Mikrofon und Audiokontext', async () => {
  const stop = vi.fn(),
    close = vi.fn();
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop }] }) },
  });
  vi.stubGlobal(
    'AudioContext',
    class {
      sampleRate = 16000;
      state = 'running';
      resume = async () => {};
      close = close;
      audioWorklet = {
        addModule: async () => {
          throw new Error('worklet failed');
        },
      };
    },
  );
  await expect(
    captureAudio(
      'token',
      () => {},
      () => {},
      () => {},
    ),
  ).rejects.toThrow('worklet failed');
  expect(stop).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  expect(fake.close).toHaveBeenCalledOnce();
});
it('Wortzeit liefert Original-WAV mit Rand; Stop verhindert neue Sends und commits', async () => {
  const stop = vi.fn(),
    committed = vi.fn(),
    nodes: { port: { onmessage: ((e: { data: Float32Array }) => void) | null } }[] = [];
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop }] }) },
  });
  vi.stubGlobal(
    'AudioContext',
    class {
      sampleRate = 16000;
      state = 'running';
      destination = {};
      resume = async () => {};
      close = async () => {};
      audioWorklet = { addModule: async () => {} };
      createMediaStreamSource() {
        return { connect: () => {}, disconnect: () => {} };
      }
      createGain() {
        return { gain: { value: 0 }, connect: () => {} };
      }
    },
  );
  vi.stubGlobal(
    'AudioWorkletNode',
    class {
      port = { onmessage: null as ((e: { data: Float32Array }) => void) | null };
      constructor() {
        nodes.push(this);
      }
      connect() {}
      disconnect() {}
    },
  );
  const audio = await captureAudio(
    'token',
    () => {},
    committed,
    () => {},
  );
  nodes[0].port.onmessage!({ data: new Float32Array(16000).fill(0.2) });
  fake.listeners.get('committed')!({
    text: 'Originalwort',
    words: [{ text: 'Originalwort', start: 0.1, end: 0.4 }],
  });
  const result = committed.mock.calls[0][0];
  const clip = Buffer.from(result.audio, 'base64');
  expect(clip.subarray(0, 4).toString()).toBe('RIFF');
  expect(clip.readUInt32LE(24)).toBe(16000);
  expect(clip.length).toBe(44 + 10400 * 2);
  expect(result.anchorMs).toBe(0);
  await audio.stop();
  expect(stop).toHaveBeenCalledOnce();
  expect(nodes[0].port.onmessage).toBeNull();
  fake.listeners.get('committed')!({ text: 'Off record', words: [] });
  expect(committed).toHaveBeenCalledOnce();
  expect(fake.send).toHaveBeenCalledOnce();
});
