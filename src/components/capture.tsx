'use client';
import { QuestionPlayback } from '@/domain/question-playback';
import { useState, useRef, useEffect } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { api } from './api';
import { useResource } from './resources';
import { verifyAndMask } from './screen';
import { captureAudio } from './audio';
import type { Session, ScreenEvent, Segment, Operation, CaptureState } from '@/domain/contracts';
type State = {
  session: Session;
  contentHash: string;
  events: ScreenEvent[];
  segments: Segment[];
  operations: Operation[];
};
type Live = {
  epoch: number;
  startRevision: number;
  speechCaseId: string | null;
  speechCrossedCase: boolean;
  contextAt: number;
  screenHash: string | null;
  abort: AbortController;
  stream: MediaStream;
  video: HTMLVideoElement;
  audio: Awaited<ReturnType<typeof captureAudio>> | null;
  timer: ReturnType<typeof setInterval> | null;
  active: boolean;
  geometry: string | null;
  busy: boolean;
  previousFrameId: string | null;
  caseId: string;
  sequence: number;
  segmentSequence: number;
  visionCalls: number;
  lastActivity: number;
  lastScreenChange: number;
  lastQuestion: number;
  questionTimes: number[];
  playback: QuestionPlayback | null;
  pendingQuestion: null | {
    id: string;
    question: string;
    expiresAt: number;
    draftRevision: number;
    caseId: string;
    epoch: number;
  };
};
export function Capture({ id }: { id: string }) {
  return (
    <ConversationProvider>
      <CaptureInner id={id} />
    </ConversationProvider>
  );
}
function CaptureInner({ id }: { id: string }) {
  const { data, error, refresh } = useResource<State>('sessions/' + id + '/state');
  const [localError, setError] = useState(''),
    [consent, setConsent] = useState(false),
    [active, setActive] = useState(false),
    [partial, setPartial] = useState(''),
    [waiting, setWaiting] = useState(false),
    [pending, setPending] = useState(false);
  const live = useRef<Live | null>(null),
    current = useRef(data),
    video = useRef<HTMLVideoElement>(null);
  if (!live.current || (data && data.session.stateRevision >= live.current.startRevision))
    current.current = data;
  const conversation = useConversation({
    onMessage: (m) => {
      const l = live.current;
      if (!l?.active) return;
      if (m.source === 'ai') l.playback?.message(m.message);
    },
    onModeChange: ({ mode }) => {
      live.current?.playback?.mode(mode);
    },
    onInterruption: () => {
      live.current?.playback?.interrupt();
    },
    onDisconnect: () => {
      if (live.current?.active) {
        setError('Agent-Verbindung beendet. Capture pausiert.');
        void stop('paused');
      }
    },
    onError: () => {
      setError('Agent-Verbindung fehlgeschlagen. Bitte Capture pausieren.');
      void stop('paused');
    },
  });
  const voice = useRef(conversation);
  voice.current = conversation;
  async function stop(next: 'paused' | 'off_record' | 'drafting') {
    const l = live.current;
    if (l) {
      l.active = false;
      l.abort.abort();
      if (l.timer) clearInterval(l.timer);
      l.stream.getTracks().forEach((t) => t.stop());
      void l.audio?.stop();
      voice.current.endSession();
      live.current = null;
    }
    setActive(false);
    setPartial('');
    setPending(false);
    const s = current.current?.session;
    if (!s) return;
    try {
      await api('sessions/' + id + '/capture-state', 'POST', {
        state: next,
        expectedEpoch: s.epoch,
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    const activity = (event?: Event) => {
      if (event?.target instanceof Element && event.target.closest('[data-conversation-control]'))
        return;
      const l = live.current;
      if (l) {
        l.lastActivity = performance.now();
        voice.current.sendUserActivity();
      }
    };
    window.addEventListener('keydown', activity);
    window.addEventListener('pointerdown', activity);
    window.addEventListener('scroll', activity);
    const channel = new BroadcastChannel('blueprint-activity-' + id);
    channel.onmessage = () => activity();
    return () => {
      channel.close();
      window.removeEventListener('keydown', activity);
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('scroll', activity);
      const l = live.current;
      if (l) {
        l.active = false;
        l.abort.abort();
        if (l.timer) clearInterval(l.timer);
        l.stream.getTracks().forEach((t) => t.stop());
        void l.audio?.stop();
        voice.current.endSession();
      }
    };
  }, [id]);
  useEffect(() => {
    if (
      data &&
      live.current &&
      data.session.stateRevision >= live.current.startRevision &&
      (!['capture'].includes(data.session.state) || data.session.epoch !== live.current.epoch)
    ) {
      const l = live.current;
      l.active = false;
      l.abort.abort();
      if (l.timer) clearInterval(l.timer);
      l.stream.getTracks().forEach((t) => t.stop());
      void l.audio?.stop();
      voice.current.endSession();
      live.current = null;
      setActive(false);
    }
  }, [data]);
  async function sample(l: Live) {
    if (!l.active || l.busy) return;
    if (
      Date.now() -
        current.current!.session.epochStartedAt +
        (current.current!.session.captureMs || 0) >=
      600000
    ) {
      void stop('drafting');
      return;
    }
    l.busy = true;
    try {
      const shot = verifyAndMask(l.video, current.current!.session.marker);
      if (l.geometry && l.geometry !== shot.geometry)
        throw new Error('Layout/Quellgröße verändert. Quelle erneut wählen.');
      l.geometry = shot.geometry;
      const digest = Array.from(
        new Uint8Array(
          await crypto.subtle.digest('SHA-256', new TextEncoder().encode(shot.base64)),
        ),
      ).join(',');
      if (l.screenHash !== digest) {
        l.lastScreenChange = performance.now();
        l.screenHash = digest;
      }
      if (shot.caseId === '00000000-0000-0000-0000-000000000000')
        throw new Error('Zuerst einen Sandbox-Fall speichern.');
      if (l.caseId !== shot.caseId) {
        if (l.speechCaseId) l.speechCrossedCase = true;
        l.previousFrameId = null;
        l.caseId = shot.caseId;
        l.lastScreenChange = performance.now();
        l.pendingQuestion = null;
        setPending(false);
      }
      if (++l.visionCalls > 300) throw new Error('Vision-Limit erreicht. Capture beenden.');
      const asset = await api<{ id: string }>(
        'sessions/' + id + '/assets',
        'POST',
        {
          epoch: l.epoch,
          kind: 'frame',
          mime: 'image/png',
          base64: shot.base64,
          atMs: Date.now() - current.current!.session.startedAt,
        },
        l.abort.signal,
      );
      if (!l.active) return;
      const operation = await api<Operation>(
        'sessions/' + id + '/vision',
        'POST',
        {
          epoch: l.epoch,
          marker: current.current!.session.marker,
          layoutVersion: 1,
          frameId: asset.id,
          previousFrameId: l.previousFrameId,
          caseId: shot.caseId,
          sequence: ++l.sequence,
          atMs: Date.now() - current.current!.session.startedAt,
        },
        l.abort.signal,
      );
      l.previousFrameId = asset.id;
      let op = operation;
      const deadline = Date.now() + 35000;
      while (l.active && ['queued', 'running'].includes(op.status) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        op = await api<Operation>('operations/' + operation.id, 'GET', undefined, l.abort.signal);
      }
      if (op.status !== 'succeeded')
        throw new Error(op.error || 'Vision-Kontext zu spät; keine neue Frage freigeben.');
      await refresh();
      const event = await api<ScreenEvent>(
        'evidence/' + op.resultRef,
        'GET',
        undefined,
        l.abort.signal,
      );
      l.contextAt = event.atMs + current.current!.session.startedAt;
      if (l.active)
        voice.current.sendContextualUpdate(JSON.stringify({ kind: 'SCREEN_CONTEXT', event }));
    } catch (e) {
      if (l.active) {
        setError((e as Error).message);
        void stop('paused');
      }
    } finally {
      l.busy = false;
    }
  }
  async function start() {
    setError('');
    setWaiting(true);
    let stream: MediaStream | null = null;
    try {
      if (!consent) throw new Error('Bitte lokale Originalaudio-Aufnahme bestätigen.');
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const v = video.current!;
      v.srcObject = stream;
      await v.play();
      const shot = verifyAndMask(v, data!.session.marker);
      const s = await api<Session>('sessions/' + id + '/capture-state', 'POST', {
        state: 'capture',
        expectedEpoch: data!.session.epoch,
      });
      const l: Live = {
        epoch: s.epoch,
        startRevision: s.stateRevision,
        speechCaseId: null,
        speechCrossedCase: false,
        contextAt: 0,
        screenHash: null,
        abort: new AbortController(),
        stream,
        video: v,
        audio: null,
        timer: null,
        active: true,
        geometry: shot.geometry,
        busy: false,
        previousFrameId: null,
        caseId: shot.caseId,
        sequence: Math.max(0, ...data!.events.map((x) => x.sequence)),
        segmentSequence: Math.max(0, ...data!.segments.map((x) => x.sequence)),
        visionCalls: 0,
        lastActivity: performance.now(),
        lastScreenChange: performance.now(),
        lastQuestion: -Infinity,
        questionTimes: [],
        pendingQuestion: null,
        playback: null,
      };
      live.current = l;
      current.current = { ...data!, session: s };
      const token = await api<{ conversationToken: string; scribeToken: string }>(
        'sessions/' + id + '/provider-tokens',
        'POST',
        {},
        l.abort.signal,
      );
      if (!l.active) return;
      voice.current.startSession({
        conversationToken: token.conversationToken,
        connectionType: 'webrtc',
      });
      l.audio = await captureAudio(
        token.scribeToken,
        (t) => {
          if (l.active) {
            if (voice.current.isSpeaking && t.trim()) l.playback?.interrupt();
            if (!l.speechCaseId && t.trim()) l.speechCaseId = l.caseId;
            setPartial(t);
            l.lastActivity = performance.now();
          }
        },
        async (segment) => {
          if (!l.active) return;
          try {
            let audioId: string | null = null;
            const caseId = l.speechCaseId || l.caseId;
            const crossed = l.speechCrossedCase;
            l.speechCaseId = null;
            l.speechCrossedCase = false;
            if (crossed) {
              setPartial('');
              throw new Error(
                'Fallwechsel während der Aussage: Zuordnung unklar; bitte erneut erklären.',
              );
            }
            if (segment.audio) {
              const asset = await api<{ id: string }>(
                'sessions/' + id + '/assets',
                'POST',
                {
                  epoch: l.epoch,
                  kind: 'audio',
                  mime: 'audio/wav',
                  base64: segment.audio,
                  atMs: segment.anchorMs - s.startedAt + segment.startMs,
                },
                l.abort.signal,
              );
              audioId = asset.id;
            }
            if (!l.active) return;
            await api(
              'sessions/' + id + '/observations',
              'POST',
              {
                events: [],
                segments: [
                  {
                    id: crypto.randomUUID(),
                    sequence: ++l.segmentSequence,
                    epoch: l.epoch,
                    atMs: segment.anchorMs - s.startedAt + segment.startMs,
                    endMs: segment.anchorMs - s.startedAt + segment.endMs,
                    caseId,
                    source: 'expert_statement',
                    text: segment.text,
                    committed: true,
                    audioId,
                    timing: audioId ? 'word_aligned' : 'audio_unavailable',
                  },
                ],
              },
              l.abort.signal,
            );
            setPartial('');
            await refresh();
          } catch (e) {
            if (l.active) setError((e as Error).message);
          }
        },
        (message) => {
          if (l.active) {
            setError(message);
            void stop('paused');
          }
        },
      );
      if (!l.active) {
        await l.audio.stop();
        return;
      }
      stream.getVideoTracks()[0].onended = () => {
        if (l.active) {
          setError('Screenfreigabe beendet.');
          void stop('paused');
        }
      };
      setActive(true);
      await refresh();
      await sample(l);
      if (l.active) l.timer = setInterval(() => void sample(l), 1500);
    } catch (e) {
      setError((e as Error).message);
      stream?.getTracks().forEach((t) => t.stop());
      if (live.current) await stop('paused');
    } finally {
      setWaiting(false);
    }
  }
  async function state(next: CaptureState) {
    try {
      await api('sessions/' + id + '/capture-state', 'POST', {
        state: next,
        expectedEpoch: data!.session.epoch,
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function planQuestion() {
    const l = live.current;
    if (!l?.active) return;
    try {
      const q = await api<NonNullable<Live['pendingQuestion']>>(
        'sessions/' + id + '/questions/plan',
        'POST',
        {},
        l.abort.signal,
      );
      l.pendingQuestion = q;
      setPending(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function speak() {
    const l = live.current;
    if (!l?.pendingQuestion) return;
    const q = l.pendingQuestion,
      now = performance.now();
    if (
      Date.now() - l.contextAt > 5000 ||
      q.expiresAt < Date.now() ||
      q.epoch !== l.epoch ||
      q.caseId !== l.caseId ||
      q.draftRevision !== current.current?.session.draft.revision
    ) {
      l.pendingQuestion = null;
      setPending(false);
      setError('Fragenkandidat veraltet. Neu planen.');
      return;
    }
    if (
      voice.current.isSpeaking ||
      voice.current.getInputVolume() > 0.08 ||
      now - l.lastActivity < 2000 ||
      now - l.lastScreenChange < 1500 ||
      now - l.lastQuestion < 30000 ||
      l.questionTimes.filter((t) => now - t < 600000).length >= 5
    ) {
      setError(
        'Noch keine Gesprächspause. Zwei Sekunden warten; Sprache/Aktivität und Fragenabstand werden geprüft.',
      );
      return;
    }
    try {
      const result = await api<{ decision: string }>(
        'sessions/' + id + '/questions/release',
        'POST',
        {
          id: q.id,
          activity: {
            recordedAt: Date.now(),
            lastActivityAt: Date.now() - (now - l.lastActivity),
            screenStableSince: Date.now() - (now - l.lastScreenChange),
            expertSpeaking: false,
            agentSpeaking: voice.current.isSpeaking,
            boundary: 'explicit_request',
          },
        },
        l.abort.signal,
      );
      if (result.decision !== 'release') {
        setError('Frage zurückgestellt oder verworfen.');
        return;
      }
      if (
        !l.active ||
        q.epoch !== l.epoch ||
        q.caseId !== l.caseId ||
        q.draftRevision !== current.current?.session.draft.revision ||
        Date.now() - l.contextAt > 5000 ||
        performance.now() - l.lastScreenChange < 1500 ||
        voice.current.isSpeaking ||
        voice.current.getInputVolume() > 0.08 ||
        performance.now() - l.lastActivity < 2000
      ) {
        await api(
          'sessions/' + id + '/questions/cancel',
          'POST',
          { id: q.id, epoch: l.epoch },
          l.abort.signal,
        );
        l.pendingQuestion = null;
        setPending(false);
        setError('Erneute Aktivität; Frage nicht ausgelöst.');
        return;
      }
      l.playback = new QuestionPlayback((outcome, transcript) => {
        if (!l.active) return;
        l.pendingQuestion = null;
        setPending(false);
        void api(
          'sessions/' + id + '/questions/spoken',
          'POST',
          { id: q.id, epoch: l.epoch, outcome, transcript },
          l.abort.signal,
        ).catch((e) => setError(e.message));
      });
      voice.current.sendUserMessage('FREIGEGEBENE_FRAGE ' + q.question);
      l.lastQuestion = performance.now();
      l.questionTimes.push(l.lastQuestion);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <p className="muted">Live-Regelbasis beginnt leer · Originalquellen lokal · Übungsfreigabe</p>
      {data?.session.sourceMode === 'replay' && (
        <div className="notice">TEST-REPLAY · keine Live-Abnahme</div>
      )}
      <h1>Capture · {data?.session.state || 'Laden'}</h1>
      {(error || localError) && (
        <div role="alert" className="error">
          {error || localError}
        </div>
      )}
      <div className="grid">
        <section className="card">
          <h2>Expertenmoment erfassen</h2>
          <p>
            Öffne die Sandbox, speichere synthetische Fakten und wähle diesen Tab als Screenquelle.
            Kopfhörer verwenden.
          </p>
          <a className="button" target="_blank" rel="noreferrer" href={'/sandbox/' + id}>
            Sandbox in zweitem Tab öffnen
          </a>
          <label>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Ich stimme lokaler Aufnahme des Originalaudios und Übertragung maskierter Bilder/Audio
            an die Provider zu.
          </label>
          <p className="muted">
            Providerretention muss im Konto separat geprüft werden. Es wird ausschließlich das
            kontrollierte Sandbox-Layout akzeptiert.
          </p>
          <div className="actions">
            <button
              disabled={
                !data ||
                active ||
                waiting ||
                !['ready', 'paused', 'off_record'].includes(data.session.state)
              }
              onClick={start}
            >
              {waiting ? 'Verbinden …' : 'Screen und Voice starten / Resume'}
            </button>
            <button className="secondary" disabled={!active} onClick={() => stop('paused')}>
              Pause
            </button>
            <button
              className="danger"
              disabled={!data || !['capture', 'paused'].includes(data.session.state)}
              onClick={() => stop('off_record')}
            >
              Off record
            </button>
            <button
              className="secondary"
              disabled={!data || !['capture', 'paused'].includes(data.session.state)}
              onClick={() => stop('drafting')}
            >
              Capture abschließen
            </button>
          </div>
          <video muted playsInline ref={video} />
          <p aria-live="polite">{partial || 'Kein vorläufiges Transkript.'}</p>
          <p className="muted">
            Agent: {conversation.status} · {conversation.mode}
          </p>
          <div className="actions">
            <button className="secondary" disabled={!active} onClick={planQuestion}>
              Nächste Frage planen
            </button>
            <button data-conversation-control disabled={!pending} onClick={speak}>
              Frag jetzt
            </button>
          </div>
        </section>
        <section className="card">
          <h2>Gespeicherte Quellen</h2>
          {data?.segments.map((s) => (
            <div className="evidence" key={s.id}>
              <blockquote>{s.text}</blockquote>
              <p className="muted">
                {Math.round(s.atMs / 1000)}–{Math.round(s.endMs / 1000)} s ·{' '}
                {s.timing === 'audio_unavailable' ? 'Originalaudio nicht verfügbar' : s.timing}
              </p>
              {s.audioId && <audio controls src={'/api/evidence/' + s.audioId} />}
            </div>
          ))}
          {!data?.segments.length && (
            <p className="muted">Noch keine committed Expertensegmente.</p>
          )}
          <p>{data?.events.length || 0} echte ScreenEvents</p>
          {data?.operations.slice(-4).map((op) => (
            <div className="row" key={op.id}>
              <span>
                {op.kind} · {op.status}
              </span>
              {op.error && <span>{op.error}</span>}
            </div>
          ))}
          <div className="actions">
            <button
              className="secondary"
              disabled={!data?.segments.length}
              onClick={async () => {
                try {
                  await api('sessions/' + id + '/extract', 'POST', {});
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Extraktion prüfen / erneut starten
            </button>
            {data?.session.state === 'drafting' && (
              <button onClick={() => state('debrief')}>Zum Debrief</button>
            )}
            {data && (
              <a className="button" href={'/processes/' + data.session.processId}>
                Draft und Review öffnen
              </a>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
