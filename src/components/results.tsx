'use client';
import { useState } from 'react';
import { api } from './api';
import { useResource } from './resources';
import type { LearningRun } from '@/domain/learning';
type Result = {
  run: LearningRun;
  version: {
    id: string;
    contentHash: string;
    scopeId: string;
    sourceMode: string;
    revoked: boolean;
  };
  assessment: { action: { status: string }; reason: { status: string }; limitation: string };
  claims: { id: string; quote: string; meaning: string }[];
};
type Evidence = {
  claim: { quote: string; start: number; end: number };
  segment: { text: string; audioId: string | null; timing: string; atMs: number; endMs: number };
  frames: { frameId: string; atMs: number; caseId: string }[];
  audioMode: string;
};
export function Results({ id }: { id: string }) {
  const { data, error, refresh } = useResource<Result>('a4/' + id + '/results');
  const [evidence, setEvidence] = useState<Evidence | null>(null),
    [localError, setError] = useState(''),
    [note, setNote] = useState('');
  async function perform(fn: () => Promise<unknown>) {
    try {
      setError('');
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="card" aria-label="Results">
      <h1>Results · {data?.run.learningCase || 'Neuer Fall'}</h1>
      {(error || localError) && (
        <p role="alert" className="error">
          {error || localError}
        </p>
      )}
      {data && (
        <>
          <p className="notice">
            {data.version.sourceMode === 'replay'
              ? 'TEST-REPLAY · keine Live-Abnahme'
              : 'Live-Quellen · Live-Abnahme separat erforderlich'}{' '}
            · {data.run.type === 'independent' ? 'Unabhängiger Versuch' : 'Gecoachter Versuch'}
          </p>
          <p>
            Version {data.version.id} · Scope {data.version.scopeId}
          </p>
          <p className="muted">Hash {data.version.contentHash}</p>
          {data.version.revoked && (
            <p className="error">
              Historisches Ergebnis · Version widerrufen · keine weitere Nutzung
            </p>
          )}
          <h2>Erstentscheidung vor Feedback</h2>
          <p>
            {data.run.firstAttempt?.action} · {data.run.firstAttempt?.reason}
          </p>
          <p className="muted">
            {data.run.firstRecord
              ? `Gespeichert ${new Date(data.run.firstRecord.at).toLocaleString('de-DE')} · factsRevision ${data.run.firstRecord.factsRevision}`
              : 'Historischer Versuch ohne A4-Zeit-/Faktennachweis; kein selbstständiger Nachweis.'}
          </p>
          <h2>Lernziele dieses Falls</h2>
          <p>
            Aktion: <strong>{data.assessment.action.status}</strong>
          </p>
          <p>
            Begründung: <strong>{data.assessment.reason.status}</strong>
          </p>
          <p>{data.assessment.limitation}</p>
          <h2>Hilfe und finale Handlung</h2>
          <p>{data.run.assistance.join(', ') || 'Keine Hilfe erfasst.'}</p>
          {data.run.decisions?.map((d, i) => (
            <p key={i}>
              {d.action} · {d.outcome} · {d.committed ? 'Commit gespeichert' : 'Kein Commit'} ·
              factsRevision {d.factsRevision}
            </p>
          ))}
          <h2>Originalbelege der gepinnten Version</h2>
          {data.claims.map((c) => (
            <div className="evidence" key={c.id}>
              <p>{c.meaning}</p>
              <blockquote>„{c.quote}“</blockquote>
              <button
                className="secondary"
                onClick={() =>
                  perform(async () =>
                    setEvidence(
                      await api<Evidence>('a4/' + id + '/evidence', 'POST', { claimId: c.id }),
                    ),
                  )
                }
              >
                Originalmoment öffnen · {c.id}
              </button>
            </div>
          ))}
          {evidence && !data.version.revoked && (
            <aside aria-label="Originalmoment">
              <blockquote>„{evidence.claim.quote}“</blockquote>
              <p>
                Originaltext · Zeichen [{evidence.claim.start}, {evidence.claim.end})
              </p>
              <p>{evidence.segment.text}</p>
              <p>
                Zeit {evidence.segment.atMs}–{evidence.segment.endMs} ms · {evidence.segment.timing}
              </p>
              {evidence.segment.audioId ? (
                <audio controls src={'/api/evidence/' + evidence.segment.audioId} />
              ) : (
                <p>Transcript-Ersatzdarstellung · Originalaudio fehlt.</p>
              )}
              {evidence.frames.map((f) => (
                <figure key={f.frameId}>
                  <img
                    className="frame"
                    alt="Maskierter Originalframe"
                    src={'/api/evidence/' + f.frameId}
                  />
                  <figcaption>
                    Fall {f.caseId} · {f.atMs} ms
                  </figcaption>
                </figure>
              ))}
            </aside>
          )}
          {!data.version.revoked && (
            <>
              <h2>Fachliches Review der Originalbegründung</h2>
              <p>
                Lokale Demo-Owner-Rolle. Prüfe, ob die erste Begründung die Voraussetzungen dieses
                Falls anhand der Originalbelege erklärt.
              </p>
              <label>
                Reviewnotiz
                <textarea value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <div className="actions">
                {[true, false].map((supported) => (
                  <button
                    key={String(supported)}
                    disabled={!note.trim()}
                    onClick={() =>
                      perform(() => api('a4/' + id + '/review', 'POST', { supported, note }))
                    }
                  >
                    {supported ? 'Begründung fachlich bestätigt' : 'Begründung braucht Übung'}
                  </button>
                ))}
              </div>
              <h2>Weiterer ungesehener Fall</h2>
              <div className="actions">
                {(['L-01', 'L-02', 'L-03'] as const).map((learningCase) => (
                  <button
                    key={learningCase}
                    onClick={() =>
                      perform(async () => {
                        const r = await api<LearningRun>('a4/start', 'POST', {
                          versionId: data.version.id,
                          learningCase,
                        });
                        window.location.href = '/teach/' + r.id;
                      })
                    }
                  >
                    {learningCase} starten
                  </button>
                ))}
              </div>
            </>
          )}
          <a href={'/teach/' + id}>Zur Übung</a>
        </>
      )}
    </section>
  );
}
