'use client';
import { useState, useRef, useEffect } from 'react';
import { api } from './api';
import { useResource } from './resources';
import type { A3 } from '@/application/a3';
import type { Proposal, Optimization, Workflow } from '@/domain/blueprint';
type View = ReturnType<A3['view']>;
type Evidence = ReturnType<A3['evidence']>;
const labels = {
  observed: 'Beobachtet',
  described_not_observed: 'Nur erklärt · nicht beobachtet',
  hypothetical: 'Hypothetisch',
  open: 'Offen',
};
const outcomes = {
  confirming_test: 'Bestätigender Test',
  evidenced_correction: 'Belegte Korrektur im Review-Draft',
  unknown: 'Unknown · Klärung erforderlich',
};
export function BlueprintPanel({
  processId,
  onChanged,
}: {
  processId: string;
  onChanged: () => Promise<void>;
}) {
  const [versionId, setVersion] = useState(''),
    [selected, select] = useState(''),
    [tab, setTab] = useState('Blueprint'),
    [evidence, setEvidence] = useState<Evidence | null>(null),
    [error, setError] = useState(''),
    [workflowEdit, setWorkflowEdit] = useState(''),
    [edit, setEdit] = useState(''),
    [optimization, setOptimization] = useState(''),
    [eventId, setEvent] = useState('');
  const activeVersion = useRef(versionId);
  activeVersion.current = versionId;
  const root = 'processes/' + processId + '/a3';
  const {
    data,
    refresh,
    error: loadError,
  } = useResource<View>(root + (versionId ? '?versionId=' + encodeURIComponent(versionId) : ''));
  const issueKey = data?.issues.join('|');
  useEffect(() => {
    if (data?.issues.length || (evidence && !data?.claims.some((c) => c.id === evidence.claim.id)))
      setEvidence(null);
  }, [issueKey, data?.contentHash]);
  async function perform(fn: () => Promise<unknown>) {
    try {
      setError('');
      await fn();
      await refresh();
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function changeVersion(id: string) {
    setVersion(id);
    setEvidence(null);
    setEvent('');
  }
  async function openEvidence(id: string) {
    const requestedVersion = versionId;
    try {
      const result = await api<Evidence>(
        root +
          '/evidence/' +
          encodeURIComponent(id) +
          (requestedVersion ? '?versionId=' + encodeURIComponent(requestedVersion) : ''),
      );
      if (activeVersion.current === requestedVersion) {
        setEvidence(result);
        setError('');
      }
    } catch (e) {
      if (activeVersion.current === requestedVersion) {
        setEvidence(null);
        setError((e as Error).message);
      }
    }
  }

  const step = data?.workflow.steps.find((s) => s.id === selected);
  function proposalTemplate() {
    if (!data) return;
    setEdit(
      JSON.stringify(
        {
          baseVersionId: data.improvement?.baseVersionId,
          baseDraftRevision: data.draftRevision,
          baseHash: data.contentHash,
          operations: data.rules.map((rule) => ({
            kind: 'revise_rule',
            rule: { ...rule, review: 'draft' },
          })),
        },
        null,
        2,
      ),
    );
  }
  const baseEvents = [...new Set(data?.claims.flatMap((c) => c.eventIds) || [])];
  return (
    <section className="card" aria-label="A3 Blueprint Evaluate Improve">
      <h2>Blueprint / Evaluate / Improve</h2>
      <p className="muted">Live-Abnahmen A0–A2 offen · Sandbox-Übung · AI-Ausführung deaktiviert</p>
      {data?.sourceMode === 'replay' && (
        <p className="notice">
          TEST-REPLAY · ausdrücklich markierte Testquellen · keine Live-Abnahme
        </p>
      )}
      <label>
        Prozessversion
        <select
          aria-label="Prozessversion"
          value={versionId}
          onChange={(e) => changeVersion(e.target.value)}
        >
          <option value="">Aktueller Draft (unveröffentlicht)</option>
          {data?.versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.id}
              {v.revoked ? ' · widerrufen' : ''}
              {v.parentVersionId ? ' · Folgeversion' : ' · Erstversion'}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        Hash: {data?.contentHash} ·{' '}
        {versionId ? 'Unveränderlicher Snapshot' : 'Draftrevision ' + data?.draftRevision}
      </p>
      <div className="actions" role="tablist" aria-label="A3 Station">
        {['Blueprint', 'Evaluate', 'Improve', 'Optimize'].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={t === tab}
            className="secondary"
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {(error || loadError) && (
        <p role="alert" className="error">
          {error || loadError}
        </p>
      )}
      {data?.issues.map((issue) => (
        <p className="error" key={issue}>
          {issue}
        </p>
      ))}
      {tab === 'Blueprint' && (
        <>
          <h3>Timeline</h3>
          <p className="muted">
            Modellreihenfolge; nur belegte Kanten beschreiben Ablauf und Varianten. Keine ergänzten
            Zielschritte.
          </p>
          {!data?.timeline.length && <p>Keine belegten Prozessschritte.</p>}
          <ol aria-label="Timeline">
            {data?.timeline.map((s) => (
              <li key={s.id}>
                <button
                  className="secondary"
                  aria-pressed={selected === s.id}
                  onClick={() => select(s.id)}
                >
                  {s.title} · {labels[s.provenance]}
                </button>
              </li>
            ))}
          </ol>
          <h3>Workflow-Graph</h3>
          <WorkflowGraph
            workflow={data?.workflow || { steps: [], edges: [] }}
            selected={selected}
            select={select}
          />
        </>
      )}
      {tab === 'Blueprint' && data && !data.versions.length && (
        <details>
          <summary>Initiales Prozessmodell prüfen</summary>
          <p>
            Nur vorhandene Expertenclaims und Originalmomente zuordnen. Schritte, Rollen, Kanten und
            Provenienz ausdrücklich prüfen; offene Inhalte bleiben offen.
          </p>
          <button
            className="secondary"
            onClick={() => setWorkflowEdit(JSON.stringify(data.workflow, null, 2))}
          >
            Prozessmodell öffnen
          </button>
          {workflowEdit && (
            <>
              <textarea
                aria-label="Initiales Prozessmodell"
                rows={12}
                value={workflowEdit}
                onChange={(e) => setWorkflowEdit(e.target.value)}
              />
              <button
                onClick={() =>
                  perform(async () => {
                    await api(root + '/workflow', 'POST', {
                      expectedDraftRevision: data.draftRevision,
                      contentHash: data.contentHash,
                      workflow: JSON.parse(workflowEdit),
                    });
                    setWorkflowEdit('');
                  })
                }
              >
                Prozessmodell geprüft speichern
              </button>
            </>
          )}
        </details>
      )}
      {step && (
        <div className="evidence">
          <h3>Auswahl: {step.title}</h3>
          <p>
            {labels[step.provenance]} · {step.role}
          </p>
          {step.claimIds.map((id) => (
            <button key={id} className="secondary" onClick={() => openEvidence(id)}>
              Evidence öffnen · {id}
            </button>
          ))}
          {data?.rules
            .filter((r) => r.stepId === step.id)
            .map((r) => (
              <div key={r.id}>
                <p>
                  Regel {r.id} · {r.review} · {r.effect.kind} {r.effect.action}
                </p>
                <pre>{JSON.stringify({ when: r.when, effect: r.effect }, null, 2)}</pre>
              </div>
            ))}
        </div>
      )}
      {tab === 'Evaluate' && (
        <>
          <h3>C-01 · hypothetischer Wareneingangstest</h3>
          <p>
            Verändert ausschließlich goodsReceiptConfirmed auf false. Ein Test ist keine neue
            Fachregel und keine beobachtete Handlung.
          </p>
          <label>
            Belegter Basisfall
            <select
              aria-label="C-01 Basisfall"
              value={eventId}
              onChange={(e) => setEvent(e.target.value)}
            >
              <option value="">Basisfall ausdrücklich wählen</option>
              {baseEvents.map((id) => (
                <option key={id}>{id}</option>
              ))}
            </select>
          </label>
          <button
            disabled={!versionId || !eventId}
            onClick={() =>
              perform(() => api(root + '/evaluate', 'POST', { versionId, baseEventId: eventId }))
            }
          >
            C-01 gegen gewählte Version prüfen
          </button>
          {!versionId && (
            <p>Für die Auswertung einen veröffentlichten Snapshot ausdrücklich auswählen.</p>
          )}
          {data?.proposals
            .filter((p) => p.status === 'accepted' && p.baseVersionId === versionId)
            .map((p) => (
              <button
                key={p.id}
                className="secondary"
                disabled={!eventId}
                onClick={() =>
                  perform(() =>
                    api(root + '/evaluate', 'POST', {
                      versionId,
                      baseEventId: eventId,
                      proposalId: p.id,
                    }),
                  )
                }
              >
                C-01 mit angenommenem Diff prüfen
              </button>
            ))}
          {!data?.evaluations.length && <p>Noch keine C-01-Auswertung für diese Auswahl.</p>}
          {data?.evaluations.map((t) => (
            <div key={t.id} className="evidence">
              <strong>{outcomes[t.outcome]}</strong>
              <p>
                Hypothetisch · Version {t.versionId} · {t.sourceMode}
              </p>
              <p>
                Baseline: {t.baseline?.outcome || 'unknown'} · Gegenfall:{' '}
                {t.counterfactual?.outcome || 'unknown'}
              </p>
              {t.candidateHash && (
                <p>Review-Draft-Hash: {t.candidateHash} · noch keine Versionsfreigabe</p>
              )}
              {t.issues.map((i) => (
                <p key={i}>{i}</p>
              ))}
              <p>
                Regeln: {t.ruleIds.join(', ')} · Quellen: {t.evidenceIds.join(', ')}
              </p>
            </div>
          ))}
          <h3>Offene Themen</h3>
          {data?.gaps.map((g) => (
            <p key={g.id}>
              {g.topic} · {g.status}
              {g.critical ? ' · kritisch' : ''}
            </p>
          ))}
          <p>Agent Tests: Noch kein echter Lauf.</p>
        </>
      )}
      {tab === 'Improve' && (
        <>
          <h3>Knowledge · revisionsgebundener Review-Diff</h3>
          <p>
            Originalquellen bleiben erhalten. Annahme verändert den Draft; erneutes Teach-back und
            vier Bestätigungen sind vor Veröffentlichung erforderlich. Bestehende Übungen behalten
            ihre Version.
          </p>
          <button
            disabled={!versionId}
            onClick={() =>
              perform(async () => {
                await api(root + '/begin', 'POST', { versionId });
                changeVersion('');
              })
            }
          >
            Verbesserung der gewählten Version beginnen
          </button>
          {data?.improvement && !versionId && (
            <>
              <button className="secondary" onClick={proposalTemplate}>
                Review-Diff vorbereiten
              </button>
              <p>
                Neue Expertenaussagen über die bestehende Debrief-Quellenerfassung ergänzen. Keine
                automatisch gestartete Aufnahme.
              </p>
              <textarea
                aria-label="Review-Diff"
                value={edit}
                onChange={(e) => setEdit(e.target.value)}
                rows={12}
              />
              <button
                disabled={!edit}
                onClick={() =>
                  perform(async () => {
                    await api(root + '/proposals', 'POST', JSON.parse(edit));
                    setEdit('');
                  })
                }
              >
                Diff zur Prüfung vorlegen
              </button>
            </>
          )}
          {data?.proposals.map((p: Proposal) => (
            <div className="evidence" key={p.id}>
              <p>
                Review-Diff {p.id} · {p.status} · Basis {p.baseVersionId} / Revision{' '}
                {p.baseDraftRevision}
              </p>
              {p.diff.map((d, i) => (
                <div key={i}>
                  <strong>
                    {d.kind} · {d.id}
                  </strong>
                  <div className="grid">
                    <div>
                      <strong>Vorher</strong>
                      <pre>{JSON.stringify(d.before, null, 2)}</pre>
                    </div>
                    <div>
                      <strong>Nachher</strong>
                      <pre>{JSON.stringify(d.after, null, 2)}</pre>
                    </div>
                  </div>
                </div>
              ))}
              <p>
                Betroffene Regeln: {p.affectedRuleIds.join(', ') || 'Alle Regressionen prüfen'} ·
                Bestehende Übungen: {p.affectedRunIds.join(', ') || 'Keine'}
              </p>
              <p>
                Regressionen erneut erforderlich; historische Ergebnisse bleiben an ihrer Version.
                Betroffene C-01-Tests:{' '}
                {p.affectedEvaluationIds?.join(', ') ||
                  'Kleines AP-Regressionsset vollständig prüfen'}
              </p>
              {p.status === 'suggested' && (
                <div className="actions">
                  {(['accept', 'request_clarification', 'reject'] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() =>
                        perform(() =>
                          api(root + '/proposals/' + p.id + '/review', 'POST', { decision: d }),
                        )
                      }
                    >
                      {d === 'accept'
                        ? 'Diff ausdrücklich annehmen'
                        : d === 'reject'
                          ? 'Diff zurückweisen'
                          : 'Klärung anfordern'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}
      {tab === 'Optimize' && (
        <>
          <h3>Optimize · Vorschläge mit Review</h3>
          <p>
            Vorschläge verändern keine Fachregel und führen keine Handlung aus. Keine gemessene
            Zeitersparnis oder ROI vorhanden.
          </p>
          {!data?.optimizations.length && <p>Noch kein belegter Vorschlag.</p>}
          <details>
            <summary>Belegten Reibungspunkt als Vorschlag erfassen</summary>
            <p>
              Eine bestehende Expertenaussage muss den Reibungspunkt belegen. Problem = exaktes
              Zitat; Hypothese, Annahmen und Grenzen getrennt prüfen.
            </p>
            <button
              className="secondary"
              disabled={!versionId}
              onClick={() =>
                setOptimization(
                  JSON.stringify(
                    {
                      versionId,
                      problemClaimId: '',
                      problem: '',
                      hypothesis: '',
                      change: '',
                      assumptions: ['Zu prüfen'],
                      limits: ['Keine Messung vorhanden; keine automatische Anwendung'],
                      guardrailIds:
                        data?.rules.filter((r) => r.effect.kind === 'prohibit').map((r) => r.id) ||
                        [],
                    },
                    null,
                    2,
                  ),
                )
              }
            >
              Optimize-Vorschlag vorbereiten
            </button>
            <textarea
              aria-label="Optimize-Vorschlag"
              rows={10}
              value={optimization}
              onChange={(e) => setOptimization(e.target.value)}
            />
            <button
              disabled={!optimization}
              onClick={() =>
                perform(async () => {
                  await api(root + '/optimizations', 'POST', JSON.parse(optimization));
                  setOptimization('');
                })
              }
            >
              Vorschlag zur Prüfung vorlegen
            </button>
          </details>
          {data?.optimizations.map((o: Optimization) => (
            <div className="evidence" key={o.id}>
              <strong>{o.problem}</strong>
              <p>
                {o.status} · Version {o.versionId}
              </p>
              <p>Hypothese: {o.hypothesis}</p>
              <p>Vorschlag: {o.change}</p>
              <p>Annahmen: {o.assumptions.join('; ')}</p>
              <p>Grenzen: {o.limits.join('; ')}</p>
              <p>Guardrails: {o.guardrailIds.join(', ')}</p>
              <button className="secondary" onClick={() => openEvidence(o.problemClaimId)}>
                Optimize-Beleg öffnen
              </button>
              <div className="actions">
                {(o.status === 'suggested'
                  ? ['expert_reviewed', 'rejected']
                  : o.status === 'expert_reviewed'
                    ? ['approved_for_sandbox', 'rejected']
                    : o.status === 'approved_for_sandbox'
                      ? ['rejected']
                      : []
                ).map((status) => (
                  <button
                    key={status}
                    onClick={() =>
                      perform(() =>
                        api(root + '/optimizations/' + o.id + '/review', 'POST', { status }),
                      )
                    }
                  >
                    {status}
                  </button>
                ))}
              </div>
              <p>
                Sandboxfreigabe ist nur Reviewstatus; Anwendung und echte Optimierungstests
                ausstehend.
              </p>
            </div>
          ))}
        </>
      )}
      {evidence && (
        <aside className="evidence" aria-label="Evidence-Ansicht">
          <h3>Evidence · {evidence.claim.id}</h3>
          {evidence.sourceMode === 'replay' && (
            <p className="notice">TESTQUELLE · keine Live-Abnahme</p>
          )}
          {evidence.revoked && <p className="error">Quellen widerrufen; Verwendung gesperrt.</p>}
          <p>
            Claim: {evidence.claim.meaning} · {evidence.claim.review}
          </p>
          <blockquote>{evidence.claim.quote}</blockquote>
          <p>
            Exakte Zeichen-Zitatspanne [{evidence.claim.start}, {evidence.claim.end}) · Segment{' '}
            {evidence.segment.id} · {evidence.segment.atMs}–{evidence.segment.endMs} ms ·{' '}
            {evidence.segment.timing} · {evidence.segment.phase || 'live'}
          </p>
          <details>
            <summary>Vollständiger Originaltext</summary>
            <p>{evidence.segment.text}</p>
          </details>
          {evidence.frames.map((f) => (
            <figure key={f.eventId}>
              <img
                alt={'Originalframe · ' + f.eventId}
                src={'/api/evidence/' + f.frameId}
                style={{ maxWidth: '100%' }}
              />
              <figcaption>
                Originalmoment {f.atMs} ms · Fall {f.caseId}. Der Basisframe beweist keinen
                hypothetischen Gegenfall.
              </figcaption>
            </figure>
          ))}
          {evidence.audioMode === 'original_expert_audio' ? (
            <>
              <p>Tatsächliches Expertenaudio · {evidence.segment.timing}</p>
              <audio controls src={'/api/evidence/' + evidence.segment.audioId} />
            </>
          ) : (
            <p className="notice">
              Transcript-Ersatzdarstellung · Originalaudio fehlt; kein Audio-Replay.
            </p>
          )}
          <p>
            Bestätigungen:{' '}
            {evidence.confirmations.map((c) => c.kind).join(', ') ||
              'Noch keine aktuellen Bestätigungen'}
          </p>
          {evidence.rules.map((r) => (
            <div key={r.id}>
              <p>
                Regel {r.id} · {r.review}
              </p>
              <pre>{JSON.stringify({ when: r.when, effect: r.effect }, null, 2)}</pre>
            </div>
          ))}
          <button className="secondary" onClick={() => setEvidence(null)}>
            Evidence schließen
          </button>
        </aside>
      )}
    </section>
  );
}

function WorkflowGraph({
  workflow,
  selected,
  select,
}: {
  workflow: Workflow;
  selected: string;
  select: (id: string) => void;
}) {
  const columns = Math.min(3, Math.max(1, workflow.steps.length));
  const width = columns * 310,
    height = Math.max(1, Math.ceil(workflow.steps.length / columns)) * 210;
  const position = (id: string) => {
    const i = workflow.steps.findIndex((s) => s.id === id);
    return { x: (i % columns) * 310 + 30, y: Math.floor(i / columns) * 210 + 40 };
  };
  return (
    <div role="group" aria-label="Workflow-Graph" className="workflow-graph">
      <div className="graph-canvas" style={{ width, height }}>
        <svg width={width} height={height} aria-label="Belegte Workflow-Kanten">
          <defs>
            <marker
              id="workflow-arrow"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="5"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 Z" fill="#a4bbdc" />
            </marker>
          </defs>
          {workflow.edges.map((e) => {
            const from = position(e.from),
              to = position(e.to),
              sx = from.x + 125,
              sy = from.y + 100,
              tx = to.x + 125,
              ty = to.y;
            const mid = Math.max(sy + 36, (sy + ty) / 2);
            return (
              <g key={e.id}>
                <title>
                  {e.kind}: {e.label} · {labels[e.provenance]}
                </title>
                <path
                  d={`M${sx},${sy} C${sx},${mid} ${tx},${mid} ${tx},${ty}`}
                  fill="none"
                  stroke="#a4bbdc"
                  strokeWidth="2"
                  strokeDasharray={e.provenance === 'observed' ? undefined : '6 4'}
                  markerEnd="url(#workflow-arrow)"
                />
                <text
                  x={(sx + tx) / 2}
                  y={mid - 6}
                  fill="#edf3fd"
                  fontSize="12"
                  textAnchor="middle"
                >
                  {e.kind}
                </text>
              </g>
            );
          })}
        </svg>
        {workflow.steps.map((s) => {
          const p = position(s.id);
          return (
            <button
              key={s.id}
              className="graph-node secondary"
              style={{ left: p.x, top: p.y }}
              aria-pressed={selected === s.id}
              onClick={() => select(s.id)}
            >
              <strong>
                {s.kind === 'decision' ? '◆ ' : s.kind === 'handoff' ? '↗ ' : ''}
                {s.title}
              </strong>
              <br />
              {s.kind} · {s.role}
              <br />
              {labels[s.provenance]}
            </button>
          );
        })}
      </div>
      <div className="graph-edge-list">
        {workflow.edges.map((e) => (
          <p key={e.id}>
            <button className="secondary" onClick={() => select(e.from)}>
              {workflow.steps.find((s) => s.id === e.from)?.title}
            </button>{' '}
            →{' '}
            <button className="secondary" onClick={() => select(e.to)}>
              {workflow.steps.find((s) => s.id === e.to)?.title}
            </button>{' '}
            · {e.kind}: {e.label} · {labels[e.provenance]}
          </p>
        ))}
      </div>
      {!workflow.edges.length && (
        <p className="muted">Keine belegte Verbindung; Reihenfolge offen.</p>
      )}
    </div>
  );
}
