'use client';
import { useState, useRef, useEffect } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { api } from './api';
import { useResource } from './resources';
import { FactForm } from './facts';
import type { Run, Case, Rule, Claim, Facts, Action } from '@/domain/contracts';
type Data = {
  run: Run;
  context: {
    sourceMode: 'live' | 'replay';
    versionId: string;
    contentHash: string;
    scopeId: string;
    facts: Facts;
    rules: Rule[];
    claims: Claim[];
  };
  case: Case;
};
export function Teach({ id }: { id: string }) {
  return (
    <ConversationProvider>
      <Inner id={id} />
    </ConversationProvider>
  );
}
function Inner({ id }: { id: string }) {
  const { data, error, refresh } = useResource<Data>('a4/' + id + '/context'),
    [localError, setError] = useState(''),
    [reason, setReason] = useState(''),
    [action, setAction] = useState<Action>('approve'),
    [result, setResult] = useState<{
      outcome: string;
      committed: boolean;
      evidenceIds: string[];
      ruleIds: string[];
    } | null>(null),
    [evidence, setEvidence] = useState<{
      kind: string;
      text?: string;
      audioId?: string | null;
      assetId?: string;
    } | null>(null),
    [facts, setFacts] = useState<Facts | null>(null),
    [pending, setPending] = useState(false),
    [highlighted, setHighlighted] = useState<string | null>(null);
  const voiceGeneration = useRef(0);
  const current = useRef(data);
  current.current = data;
  useEffect(() => {
    const last = (data?.run as import('@/domain/learning').LearningRun | undefined)?.decisions?.at(
      -1,
    );
    if (last) setResult(last);
  }, [data]);
  const conversation = useConversation({
    onConnect: () => {
      const c = current.current;
      if (c)
        voice.current.sendContextualUpdate('PINNED_EXERCISE_CONTEXT ' + JSON.stringify(c.context));
    },
    clientTools: {
      get_current_facts: async () =>
        JSON.stringify(
          await api('exercises/' + id + '/tools', 'POST', { name: 'get_current_facts' }),
        ),
      get_confirmed_rule: async (p: { id?: string }) =>
        JSON.stringify(
          await api('exercises/' + id + '/tools', 'POST', { name: 'get_confirmed_rule', id: p.id }),
        ),
      show_evidence: async (p: { id: string }) => {
        const e = await api<NonNullable<typeof evidence>>('exercises/' + id + '/tools', 'POST', {
          name: 'show_evidence',
          id: p.id,
        });
        setEvidence(e);
        return JSON.stringify(e);
      },
      highlight_field: async (p: { id: string }) => {
        const result = await api('exercises/' + id + '/tools', 'POST', {
          name: 'highlight_field',
          id: p.id,
        });
        setHighlighted(p.id);
        return JSON.stringify(result);
      },
    },
  });
  const voice = useRef(conversation);
  voice.current = conversation;
  useEffect(() => {
    if (error) {
      voiceGeneration.current++;
      setEvidence(null);
      setHighlighted(null);
      voice.current.endSession();
    }
  }, [error]);
  useEffect(
    () => () => {
      voiceGeneration.current++;
      voice.current.endSession();
    },
    [],
  );
  async function perform(fn: () => Promise<unknown>) {
    try {
      setError('');
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function commit() {
    setPending(true);
    try {
      const latest = await api<Data>('a4/' + id + '/context');
      if (!latest.run.firstAttempt) await api('a4/' + id + '/attempts', 'POST', { action, reason });
      const storageKey = 'blueprint-pending-action-' + id;
      let request = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (!request) {
        request = {
          action,
          expectedRecordRevision: latest.case.recordRevision,
          expectedFactsRevision: latest.case.factsRevision,
          idempotencyKey: crypto.randomUUID(),
        };
        sessionStorage.setItem(storageKey, JSON.stringify(request));
      }
      const response = await api<NonNullable<typeof result>>(
        'a4/' + id + '/actions',
        'POST',
        request,
      );
      sessionStorage.removeItem(storageKey);
      setResult(response);
      voice.current.sendContextualUpdate('SERVER_GATE ' + JSON.stringify(response));
      await refresh();
    } catch (e) {
      setError(
        (e as Error).message +
          ' Der gespeicherte Request kann mit demselben Schlüssel erneut geprüft werden.',
      );
    } finally {
      setPending(false);
    }
  }
  function abandonPendingRequest() {
    sessionStorage.removeItem('blueprint-pending-action-' + id);
    setError(
      'Veralteten Request verworfen. Aktuelle Revision prüfen; bei geändertem Erstfall neue Übung starten.',
    );
    void refresh();
  }
  async function startVoice() {
    const generation = voiceGeneration.current;
    const token = await api<{ conversationToken: string }>(
      'sessions/' + data!.case.sessionId + '/provider-tokens',
      'POST',
      { exerciseRunId: id },
    );
    if (generation !== voiceGeneration.current) return;
    await voice.current.startSession({
      conversationToken: token.conversationToken,
      connectionType: 'webrtc',
    });
    if (generation !== voiceGeneration.current) await voice.current.endSession();
  }
  if (error)
    return (
      <>
        <h1>Teach · Zugriff pausiert</h1>
        <div role="alert" className="error">
          {error}
        </div>
        <button onClick={refresh}>Aktuellen Zustand erneut laden</button>
        <a href="/">Zur Prozessübersicht</a>
      </>
    );
  return (
    <>
      {data?.context.sourceMode === 'replay' && (
        <div className="notice">TEST-REPLAY · keine Live-Abnahme</div>
      )}
      <p className="muted">
        Gepinnte Übungsversion {data?.context.versionId} · Nur Übungen
        <br />
        Hash {data?.context.contentHash}
      </p>
      <h1>Teach · Entscheidung auf neuem Fall</h1>
      {data && (
        <div className="actions">
          {(['L-01', 'L-02', 'L-03'] as const).map((learningCase) => (
            <button
              className="secondary"
              key={learningCase}
              onClick={() =>
                perform(async () => {
                  const run = await api<Run>('a4/start', 'POST', {
                    versionId: data.context.versionId,
                    learningCase,
                  });
                  window.location.href = '/teach/' + run.id;
                })
              }
            >
              {learningCase} starten{learningCase === 'L-03' ? ' · unabhängig' : ' · gecoacht'}
            </button>
          ))}
        </div>
      )}
      {(error || localError) && (
        <div className="error" role="alert">
          {error || localError}
          <button onClick={abandonPendingRequest}>Veralteten Request verwerfen / neu laden</button>
        </div>
      )}
      <div className="grid">
        <section className="card">
          <h2>Aktuelle Geschäftsfakten</h2>
          {data && (
            <>
              <fieldset
                disabled={!!(data.run as import('@/domain/learning').LearningRun).learningCase}
              >
                <FactForm
                  facts={facts || data.case.facts}
                  onChange={setFacts}
                  highlighted={highlighted}
                />
                <button
                  className="secondary"
                  disabled={!facts}
                  onClick={() =>
                    perform(async () => {
                      await api('sandbox/cases/' + data.case.id, 'PATCH', {
                        facts,
                        expectedRecordRevision: data.case.recordRevision,
                        expectedFactsRevision: data.case.factsRevision,
                      });
                      setFacts(null);
                      setResult(null);
                    })
                  }
                >
                  Faktenänderung speichern
                </button>
              </fieldset>
              <p className="muted">
                Status {data.case.status} · recordRevision {data.case.recordRevision} ·
                factsRevision {data.case.factsRevision}
              </p>
            </>
          )}
          <label>
            Deine Entscheidung
            <select value={action} onChange={(e) => setAction(e.target.value as Action)}>
              <option value="approve">Approve</option>
              <option value="hold">Hold</option>
              <option value="escalate">Escalate</option>
            </select>
          </label>
          <label>
            Begründung vor Feedback
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={!!data?.run.firstAttempt}
              placeholder="Welche Fakten und Voraussetzungen bestimmen deine Entscheidung?"
            />
          </label>
          <button
            disabled={pending || !data || (!reason.trim() && !data.run.firstAttempt) || !!facts}
            onClick={commit}
          >
            {pending ? 'Server prüft …' : 'Entscheidung prüfen und speichern'}
          </button>
          {result && (
            <div role="status" className={result.committed ? 'notice' : 'error'}>
              <strong>
                {result.outcome} · {result.committed ? 'Commit gespeichert' : 'Kein Commit'}
              </strong>
              <p>
                {result.ruleIds.length
                  ? 'Bestätigte Regeln: ' + result.ruleIds.join(', ')
                  : 'Kein belegtes Permit oder unvollständige Grundlage.'}
              </p>
              {result.evidenceIds.map((eid) => (
                <button
                  className="secondary"
                  key={eid}
                  onClick={() =>
                    perform(async () =>
                      setEvidence(
                        await api('exercises/' + id + '/tools', 'POST', {
                          name: 'show_evidence',
                          id: eid,
                        }),
                      ),
                    )
                  }
                >
                  Originalbeleg öffnen · {eid.slice(0, 10)}
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="card">
          <h2>Versiongebundener Tutor</h2>
          {data?.run.type === 'independent' && !data.run.firstAttempt ? (
            <p className="notice">
              Zuerst Entscheidung und Begründung abgeben. Bis dahin keine Hinweise oder Replay.
            </p>
          ) : (
            <>
              <div className="actions">
                <button
                  disabled={!data || conversation.status !== 'disconnected'}
                  onClick={() => perform(startVoice)}
                >
                  Tutor verbinden
                </button>
                <button className="secondary" onClick={() => conversation.endSession()}>
                  Voice beenden
                </button>
              </div>
              <p className="muted">
                {conversation.status} · {conversation.mode}
              </p>
              {data?.context.claims.map((c) => (
                <div className="evidence" key={c.id}>
                  <p>{c.meaning}</p>
                  <blockquote>„{c.quote}“</blockquote>
                </div>
              ))}
            </>
          )}
          <h3>Ergebnis dieses Versuchs</h3>
          {data?.run.firstAttempt && (
            <a href={'/results/' + id}>Versionsgebundene Results öffnen</a>
          )}
          <p>
            {data?.run.firstAttempt
              ? `Erstentscheidung: ${data.run.firstAttempt.action} · ${data.run.firstAttempt.reason}`
              : 'Noch keine Erstentscheidung.'}
          </p>
          <p className="muted">
            {data?.run.assistance.length
              ? `Hilfeereignisse: ${data.run.assistance.join(', ')}. Ein eigenständiger Erfolgsnachweis ist für diesen Versuch beendet.`
              : 'Noch keine Hilfeereignisse.'}
          </p>
          {evidence && (
            <div className="evidence">
              <p>{evidence.text}</p>
              {evidence.audioId && (
                <audio controls src={'/api/evidence/' + evidence.audioId} />
              )}{' '}
              {evidence.assetId && (
                <img
                  className="frame"
                  alt="Maskierter Originalframe"
                  src={'/api/evidence/' + evidence.assetId}
                />
              )}
            </div>
          )}
          <p className="muted">Produktionsfreigabe ausstehend · AI-Ausführung deaktiviert.</p>
          <a href="/">Zur Prozessübersicht</a>
        </section>
      </div>
    </>
  );
}
