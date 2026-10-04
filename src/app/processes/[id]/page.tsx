'use client';
import { use, useState } from 'react';
import { BlueprintPanel } from '@/components/blueprint';
import { api } from '@/components/api';
import { useResource } from '@/components/resources';
import { FactForm, emptyFacts } from '@/components/facts';
import type {
  Process,
  Session,
  Snapshot,
  Confirmation,
  Case,
  Run,
  Facts,
  Patch,
  CaptureState,
} from '@/domain/contracts';
type Data = {
  process: Process;
  session: Session;
  contentHash: string;
  confirmations: Confirmation[];
  version: Snapshot | null;
};
const confirmations = [
  ['assignment', 'Zuordnung der Quellen geprüft'],
  ['representation', 'Wiedergabe des Expertenwissens geprüft'],
  ['domain_validity', 'Für diese Übung fachlich bestätigt'],
  ['version_release', 'Als Process Owner diese Übungsversion freigeben'],
] as const;
export default function Review({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params),
    { data, error, refresh } = useResource<Data>('processes/' + id),
    [localError, setError] = useState(''),
    [pending, setPending] = useState(false),
    [facts, setFacts] = useState<Facts>(emptyFacts),
    [type, setType] = useState<'coached' | 'independent'>('coached'),
    [edit, setEdit] = useState('');
  async function perform(fn: () => Promise<unknown>) {
    setPending(true);
    try {
      setError('');
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function state(next: CaptureState) {
    await api('sessions/' + data!.session.id + '/capture-state', 'POST', {
      state: next,
      expectedEpoch: data!.session.epoch,
    });
  }
  async function exercise() {
    const c = await api<Case>('sandbox/cases', 'POST', { sessionId: data!.session.id, facts });
    const r = await api<Run>('exercises', 'POST', {
      versionId: data!.version!.id,
      caseId: c.id,
      type,
    });
    location.href = '/teach/' + r.id;
  }
  const s = data?.session;
  return (
    <>
      <p className="muted">
        Technical spike · unveröffentlichter Draft und bestätigte Version getrennt
      </p>
      {s?.sourceMode === 'replay' && <div className="notice">TEST-REPLAY · keine Live-Abnahme</div>}
      <h1>{data?.process.title || 'Blueprint laden'}</h1>
      <p>
        {s?.state} · Draftrevision {s?.draft.revision} ·{' '}
        {data?.version ? 'Version ' + data.version.id.slice(0, 8) : 'Noch keine Veröffentlichung'}
      </p>
      {(error || localError) && (
        <div role="alert" className="error">
          {error || localError}
        </div>
      )}
      <BlueprintPanel processId={id} onChanged={refresh} />
      <div className="grid">
        <section className="card">
          <h2>Wissen mit Herkunft</h2>
          {s?.draft.claims.map((c) => (
            <div key={c.id} className="evidence">
              <p>{c.meaning}</p>
              <blockquote>„{c.quote}“</blockquote>
              <p className="muted">
                {c.id} · {c.review} · Originalspanne {c.start}–{c.end}
              </p>
              <div className="actions">
                <button
                  className="secondary"
                  onClick={() =>
                    perform(async () => {
                      const seg = await api<{ audioId: string | null; text: string }>(
                        'evidence/' + c.segmentId,
                      );
                      setError('');
                      const drawer = document.getElementById('source-' + c.id);
                      if (drawer) drawer.textContent = seg.text;
                    })
                  }
                >
                  Originaltext öffnen
                </button>
                <a href={'/api/evidence/' + c.segmentId} target="_blank" rel="noreferrer">
                  Quelldaten
                </a>
              </div>
              <p id={'source-' + c.id} />
            </div>
          ))}
          {!s?.draft.claims.length && (
            <p className="muted">Noch keine belegten Claims. Capture durchführen.</p>
          )}
          <h3>Ausführbare Regeln</h3>
          {s?.draft.rules.map((r) => (
            <div key={r.id}>
              <p>
                {r.effect.kind} · {r.effect.action} · {r.scopeId}
              </p>
              <pre>{JSON.stringify(r.when, null, 2)}</pre>
              <p className="muted">Belegt durch {r.claimIds.join(', ')}</p>
            </div>
          ))}
          <h3>Offene Themen</h3>
          {s?.draft.gaps.map((g) => (
            <div className="row" key={g.id}>
              <span>{g.topic}</span>
              <span>
                {g.status}
                {g.critical ? ' · kritisch' : ''}
              </span>
            </div>
          ))}
          <h3>Antwortzuordnung</h3>
          {s?.draft.answerLinks.map((l) => (
            <div key={l.id} className="evidence">
              <p>
                {l.questionId} → {l.segmentIds.join(', ')} → {l.gapIds.join(', ')}
              </p>
              <button
                className="secondary"
                onClick={() => {
                  const segments = window.prompt(
                    'Segment-IDs (Komma getrennt)',
                    l.segmentIds.join(','),
                  );
                  if (segments !== null)
                    void perform(() =>
                      api('sessions/' + s.id + '/answer-links', 'POST', {
                        id: l.id,
                        expectedDraftRevision: s.draft.revision,
                        segmentIds: segments
                          .split(',')
                          .map((x) => x.trim())
                          .filter(Boolean),
                        claimIds: l.claimIds,
                        gapIds: l.gapIds,
                      }),
                    );
                }}
              >
                {l.confirmed
                  ? 'Zuordnung bestätigt · korrigieren'
                  : 'Zuordnung prüfen / korrigieren'}
              </button>
            </div>
          ))}
        </section>
        <section className="card">
          <h2>Debrief → Teach-back → Freigabe</h2>
          <p>
            Prüfe Aussagen, Quellen und sichtbare Umrechnung in Basispunkte. Unklare Fachregeln
            bleiben unveröffentlicht.
          </p>
          <div className="actions">
            {s?.state === 'drafting' && (
              <button onClick={() => perform(() => state('debrief'))}>Debrief öffnen</button>
            )}
            {s?.state === 'debrief' && (
              <a className="button" href={'/capture/' + s.id}>
                Gesprochenen Debrief öffnen
              </a>
            )}
            {s?.state === 'debrief' && (
              <button onClick={() => perform(() => state('teachback'))}>
                Teach-back vorbereiten
              </button>
            )}
            {s?.state === 'teachback' && (
              <button
                onClick={() => perform(() => api('sessions/' + s.id + '/teachback', 'POST', {}))}
              >
                Teach-back als Audio erzeugen
              </button>
            )}
          </div>
          {s?.teachback && (
            <>
              <p>{s.teachback.text}</p>
              <audio
                controls
                src={'/api/evidence/' + s.teachback.audioId}
                onEnded={() =>
                  perform(() =>
                    api('sessions/' + s.id + '/teachback-played', 'POST', {
                      contentHash: s.teachback!.hash,
                      audioId: s.teachback!.audioId,
                    }),
                  )
                }
              />
              <p className="muted">
                {s.teachback.spoken ? 'Vollständig abgespielt' : 'Bitte vollständig anhören'}
              </p>
            </>
          )}
          {s?.state === 'teachback' && (
            <button disabled={!s.teachback?.spoken} onClick={() => perform(() => state('review'))}>
              Inhalt prüfen und bestätigen
            </button>
          )}
          {s?.state === 'review' && (
            <>
              <p className="muted">Jeder Bestätigungsakt bindet an den aktuellen Inhalts-Hash.</p>
              {confirmations.map(([kind, label]) => {
                const checked = data!.confirmations.some(
                  (c) => c.kind === kind && c.subjectHash === data!.contentHash,
                );
                return (
                  <div className="actions" key={kind}>
                    <button
                      className="secondary"
                      disabled={checked || pending}
                      onClick={() =>
                        perform(() =>
                          api('confirmations', 'POST', {
                            sessionId: s.id,
                            kind,
                            subjectHash: data!.contentHash,
                          }),
                        )
                      }
                    >
                      {checked ? '✓ ' : ''}
                      {label}
                    </button>
                  </div>
                );
              })}
              <button
                disabled={
                  pending ||
                  !confirmations.every(([kind]) =>
                    data!.confirmations.some(
                      (c) => c.kind === kind && c.subjectHash === data!.contentHash,
                    ),
                  )
                }
                onClick={() =>
                  perform(() =>
                    api('processes/' + id + '/publish', 'POST', {
                      expectedDraftRevision: s.draft.revision,
                      scopeId: 'scope-spike',
                      contentHash: data!.contentHash,
                      confirmationIds: data!.confirmations
                        .filter((c) => c.subjectHash === data!.contentHash)
                        .map((c) => c.id),
                    }),
                  )
                }
              >
                {s.improvement ? 'Neue Version veröffentlichen' : 'Spike-Version veröffentlichen'}
              </button>
            </>
          )}
          {s && !s.improvement && ['debrief', 'review', 'teachback'].includes(s.state) && (
            <details>
              <summary>Draft fachlich korrigieren</summary>
              <p className="muted">
                Strukturierter Patch; Zitate und Referenzen werden erneut geprüft. Jede Änderung
                verlangt neues Teach-back und neue Bestätigungen.
              </p>
              <button
                className="secondary"
                onClick={() =>
                  setEdit(
                    JSON.stringify(
                      {
                        baseDraftRevision: s.draft.revision,
                        claims: s.draft.claims,
                        rules: s.draft.rules,
                        gaps: s.draft.gaps.map((g) => ({
                          ...g,
                          status: g.status === 'confirmed' ? 'provisionally_answered' : g.status,
                        })),
                        answerLinks: [],
                      },
                      null,
                      2,
                    ),
                  )
                }
              >
                Aktuellen Patch öffnen
              </button>
              {edit && (
                <>
                  <textarea
                    aria-label="Draft-Patch"
                    style={{ minHeight: 320 }}
                    value={edit}
                    onChange={(e) => setEdit(e.target.value)}
                  />
                  <button
                    onClick={() =>
                      perform(async () => {
                        if (s.state !== 'debrief') await state('debrief');
                        await api('sessions/' + s.id + '/review-patch', 'POST', {
                          patch: JSON.parse(edit),
                        });
                        setEdit('');
                      })
                    }
                  >
                    Korrektur speichern
                  </button>
                </>
              )}
            </details>
          )}
          {data?.version && (
            <>
              <h3>Neuer Übungsfall</h3>
              <p className="muted">
                Frische Faktenkombination. Es wird keine Musterlösung vorgeladen.
              </p>
              <FactForm facts={facts} onChange={setFacts} />
              <label>
                Übungsart
                <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                  <option value="coached">Gecoacht</option>
                  <option value="independent">Ohne Hinweise bis zur Erstentscheidung</option>
                </select>
              </label>
              <button disabled={data.version.revoked} onClick={() => perform(exercise)}>
                Neue Übung starten
              </button>
            </>
          )}
          <div className="actions">
            {s && (
              <>
                <a href={'/capture/' + s.id}>Zur Capture-Session</a>
                <button
                  className="secondary"
                  onClick={() =>
                    perform(async () => {
                      const exported = await api('sessions/' + s.id + '/export', 'POST', {});
                      const url = URL.createObjectURL(
                        new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }),
                      );
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'blueprint-' + s.id + '.json';
                      a.click();
                      URL.revokeObjectURL(url);
                    })
                  }
                >
                  Session lokal exportieren
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Lokale Quellen verwerfen und alle abhängigen Übungen sperren?',
                      )
                    )
                      void perform(() => api('sessions/' + s.id, 'DELETE'));
                  }}
                >
                  Lokale Quellen verwerfen
                </button>
              </>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
