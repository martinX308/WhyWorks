import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { Store } from '../src/adapters/store';
import { Blueprint } from '../src/application/service';
import { A3 } from '../src/application/a3';
import { testFacts, learnedPatch, testWords } from './fixtures';
import type { Session, Confirmation, Snapshot, Predicate } from '../src/domain/contracts';
import { projectWorkflow } from '../src/domain/blueprint';
const owner = 'test-owner';
function setup(store = new Store(), receipt = true, extraWords = '') {
  const app = new Blueprint(store),
    a3 = new A3(app),
    { process, session } = app.create(owner, 'A3 TESTQUELLEN', 'replay');
  let s = app.state(session.id, owner, 'capture', 1);
  store.put(
    'assets',
    {
      id: 'frame-' + s.id,
      ownerId: owner,
      sessionId: s.id,
      epoch: s.epoch,
      kind: 'frame',
      caseId: 'demo',
    },
    owner,
    s.id,
  );
  const text = receipt
    ? testWords() + extraWords
    : 'Unter 200 Basispunkten freigeben bei bekanntem Lieferant, passender Bestellung und unveränderten Bankdaten.';
  app.observations(
    owner,
    s.id,
    [
      {
        id: 'event-' + s.id,
        epoch: s.epoch,
        sequence: 1,
        atMs: 0,
        caseId: 'demo',
        source: 'screen_observation',
        facts: testFacts,
        frameId: 'frame-' + s.id,
      },
    ],
    [
      {
        id: 'segment-' + s.id,
        epoch: s.epoch,
        sequence: 1,
        atMs: 0,
        endMs: 100,
        caseId: 'demo',
        source: 'expert_statement',
        text,
        committed: true,
        audioId: null,
        timing: 'audio_unavailable',
      },
    ],
  );
  const patch = learnedPatch(text, 'event-' + s.id, 'segment-' + s.id);
  if (!receipt)
    (patch.rules[1].when as { items: Predicate[] }).items = (
      patch.rules[1].when as { items: Predicate[] }
    ).items.filter((p) => !('field' in p) || p.field !== 'goodsReceiptConfirmed');
  app.applyPatch(owner, s.id, s.epoch, patch, 1);
  for (const state of ['drafting', 'debrief', 'teachback'] as const)
    s = app.state(s.id, owner, state, s.epoch);
  const version = publish(app, s);
  return {
    app,
    a3,
    store,
    process,
    sessionId: s.id,
    version,
    eventId: 'event-' + s.id,
    segmentId: 'segment-' + s.id,
  };
}
function publish(app: Blueprint, s: Session, confirmations?: string[]) {
  s = app.session(s.id, owner);
  if (s.state === 'debrief') s = app.state(s.id, owner, 'teachback', s.epoch);
  s.teachback = {
    hash: app.contentHash(s),
    text: 'TEST Teach-back',
    audioId: 'test-only-audio',
    spoken: true,
  };
  app.saveSession(s);
  if (s.state !== 'review') s = app.state(s.id, owner, 'review', s.epoch);
  const hash = app.contentHash(s);
  const ids =
    confirmations ||
    (
      [
        'assignment',
        'representation',
        'domain_validity',
        'version_release',
      ] as Confirmation['kind'][]
    ).map((k) => app.confirm(owner, s.id, k, hash).id);
  return app.publish(owner, s.processId, {
    expectedDraftRevision: s.draft.revision,
    scopeId: 'scope-spike',
    contentHash: hash,
    confirmationIds: ids,
  });
}
function change(x: ReturnType<typeof setup>) {
  x.a3.begin(owner, x.process.id, x.version.id);
  const s = x.app.session(x.sessionId, owner);
  const rule = structuredClone(s.draft.rules[0]);
  rule.when = { kind: 'compare', field: 'varianceBps', op: 'gte', value: 100 };
  return {
    baseVersionId: x.version.id,
    baseDraftRevision: s.draft.revision,
    baseHash: x.app.contentHash(s),
    operations: [{ kind: 'revise_rule' as const, rule }],
  };
}
describe('A3 – versionierte Projektionen, Gegenfall und Review', () => {
  it('Timeline/Graph projizieren denselben Snapshot ohne erfundene Schritte/Kanten; Evidence enthält exakte Originalspanne', () => {
    const x = setup(),
      view = x.a3.view(owner, x.process.id, x.version.id);
    expect(view.timeline).toEqual(view.workflow.steps);
    expect(view.timeline).toHaveLength(1);
    expect(view.workflow.edges).toEqual([]);
    expect(view.timeline[0].provenance).toBe('described_not_observed');
    const e = x.a3.evidence(owner, x.process.id, x.version.id, 'cl-1');
    expect(e.segment.text.slice(e.claim.start, e.claim.end)).toBe(e.claim.quote);
    expect(e.audioMode).toBe('transcript_substitute');
    expect(e.confirmations).toHaveLength(4);
    expect(() => x.a3.evidence(owner, x.process.id, x.version.id, 'missing')).toThrow();
    x.store.close();
  });
  it('bekannter Wareneingang ergibt bestätigenden hypothetischen Test; neue Erkenntnis bleibt Unknown ohne Diff', () => {
    const x = setup(),
      result = x.a3.evaluate(owner, x.process.id, x.version.id, x.eventId);
    expect(result.outcome).toBe('confirming_test');
    expect(result.provenance).toBe('hypothetical');
    expect(result.facts).toEqual({ ...testFacts, goodsReceiptConfirmed: false });
    expect(x.app.store.get<Snapshot>('versions', x.version.id)).toEqual(x.version);
    x.store.close();
    const y = setup(new Store(), false);
    expect(y.a3.evaluate(owner, y.process.id, y.version.id, y.eventId).outcome).toBe('unknown');
    y.store.close();
  });
  it('neue belegte Bedingung wird als Korrektur im angenommenen Review-Draft ausgewiesen', () => {
    const x = setup(new Store(), false);
    x.a3.begin(owner, x.process.id, x.version.id);
    let s = x.app.session(x.sessionId, owner);
    const text = 'Zusätzlich ist ein bestätigter Wareneingang erforderlich.';
    x.app.observations(
      owner,
      s.id,
      [],
      [
        {
          id: 'new-expert',
          epoch: s.epoch,
          sequence: 2,
          atMs: 100,
          endMs: 200,
          caseId: 'demo',
          source: 'expert_statement',
          text,
          committed: true,
          audioId: null,
          timing: 'audio_unavailable',
          phase: 'debrief',
        },
      ],
    );
    s = x.app.session(s.id, owner);
    const claim = {
      ...s.draft.claims[0],
      id: 'cl-new',
      segmentId: 'new-expert',
      start: 0,
      end: text.length,
      quote: text,
      meaning: text,
      supersedesClaimId: s.draft.claims[0].id,
    };
    const rule = structuredClone(s.draft.rules[1]);
    (rule.when as { items: Predicate[] }).items.push({
      kind: 'compare',
      field: 'goodsReceiptConfirmed',
      op: 'eq',
      value: true,
    });
    rule.claimIds.push(claim.id);
    rule.evidenceIds.push('new-expert');
    const p = x.a3.propose(owner, x.process.id, {
      baseVersionId: x.version.id,
      baseDraftRevision: s.draft.revision,
      baseHash: x.app.contentHash(s),
      operations: [
        { kind: 'attach_claim', claim },
        { kind: 'revise_rule', rule },
      ],
    });
    x.a3.review(owner, x.process.id, p.id, 'accept');
    const result = x.a3.evaluate(owner, x.process.id, x.version.id, x.eventId, p.id);
    expect(result.outcome).toBe('evidenced_correction');
    expect(result.versionId).toBe(x.version.id);
    expect(result.candidateHash).toBeTruthy();
    expect(x.app.session(s.id, owner).draft.claims).toHaveLength(2);
    expect(x.store.get('segments', x.segmentId)).toBeTruthy();
    x.store.close();
  });
  it('unbekannte Fakten und fehlende/ widerrufene Quellen ergeben Unknown', () => {
    const x = setup();
    const event = x.store.get<{ id: string; facts: typeof testFacts }>('events', x.eventId)!;
    event.facts.poMatches = null;
    x.store.put('events', event, owner, x.sessionId);
    expect(x.a3.evaluate(owner, x.process.id, x.version.id, x.eventId).outcome).toBe('unknown');
    const original = structuredClone(x.version);
    x.app.removeSource(owner, x.segmentId);
    expect(x.a3.evaluate(owner, x.process.id, x.version.id, x.eventId).outcome).toBe('unknown');
    const revoked = x.store.get<Snapshot>('versions', original.id)!;
    expect(revoked.claims).toEqual(original.claims);
    expect(revoked.rules).toEqual(original.rules);
    expect(revoked.contentHash).toBe(original.contentHash);
    expect(revoked.revoked).toBe(true);
    x.store.close();
  });
  it('fehlende/fremde IDs und Quellen sperren Diff, Evidence und Veröffentlichung', () => {
    const x = setup(),
      input = change(x);
    input.operations[0].rule.evidenceIds.push('foreign');
    expect(() => x.a3.propose(owner, x.process.id, input)).toThrow();
    expect(() => x.a3.view('other-owner', x.process.id, x.version.id)).toThrow();
    const other = x.app.create(owner, 'Fremd', 'replay');
    expect(() => x.a3.view(owner, other.process.id, x.version.id)).toThrow();
    x.store.delete('assets', 'frame-' + x.sessionId);
    expect(() => x.a3.propose(owner, x.process.id, changeForCurrent(x))).toThrow();
    x.store.close();
  });
  it('stale Review-Diffs verlangen neuen Diff; Annahme invalidiert Hashbestätigungen', () => {
    const x = setup(),
      input = change(x),
      p = x.a3.propose(owner, x.process.id, input),
      second = x.a3.propose(owner, x.process.id, input);
    expect(x.app.session(x.sessionId, owner).draft.revision).toBe(input.baseDraftRevision);
    x.a3.review(owner, x.process.id, p.id, 'accept');
    expect(() => x.a3.review(owner, x.process.id, second.id, 'accept')).toThrow(/veraltet/);
    expect(x.a3.view(owner, x.process.id).confirmations).toEqual([]);
    expect(x.app.session(x.sessionId, owner).teachback).toBeNull();
    expect(() =>
      publish(x.app, x.app.session(x.sessionId, owner), x.version.confirmationIds),
    ).toThrow(/Bestätigung/);
    x.store.close();
  });
  it('Publikation verhindert stale Hash, fehlende Bestätigungen und unreviewte Änderungen', () => {
    const x = setup(),
      input = change(x),
      p = x.a3.propose(owner, x.process.id, input);
    x.a3.review(owner, x.process.id, p.id, 'accept');
    const s = x.app.session(x.sessionId, owner);
    expect(() =>
      x.app.publish(owner, x.process.id, {
        expectedDraftRevision: s.draft.revision,
        scopeId: 'scope-spike',
        contentHash: input.baseHash,
        confirmationIds: [],
      }),
    ).toThrow();
    expect(() => publish(x.app, s, [])).toThrow(/Bestätigung/);
    const current = x.app.session(s.id, owner);
    current.draft.rules[0].when = { kind: 'compare', field: 'varianceBps', op: 'gte', value: 50 };
    current.draft.revision++;
    x.app.saveSession(current);
    expect(() => publish(x.app, current)).toThrow(/Review-Diff/);
    x.store.close();
  });
  it('neue Version bleibt über SQLite-Reopen erhalten; Snapshot und laufende Übung bleiben unverändert', () => {
    const dir = mkdtempSync('/private/tmp/a3-'),
      file = dir + '/test.sqlite',
      x = setup(new Store(file));
    const c = x.app.newCase(owner, x.sessionId, testFacts),
      run = x.app.exercise(owner, x.version.id, c.id, 'coached');
    const input = change(x),
      proposal = x.a3.propose(owner, x.process.id, input);
    x.a3.review(owner, x.process.id, proposal.id, 'accept');
    const next = publish(x.app, x.app.session(x.sessionId, owner));
    expect(next.parentVersionId).toBe(x.version.id);
    expect(next.id).not.toBe(x.version.id);
    expect(next.contentHash).not.toBe(x.version.contentHash);
    x.store.close();
    const reopened = new Store(file);
    expect(reopened.get('versions', x.version.id)).toEqual(x.version);
    expect(reopened.get('runs', run.id)).toEqual(run);
    expect(reopened.get<Snapshot>('versions', next.id)?.reviewProposalId).toBe(proposal.id);
    expect(reopened.list('evaluations')).toEqual([]);
    reopened.close();
    rmSync(dir, { recursive: true });
  });
  it('Workflow-Änderungen erhalten Provenienz, Kanten und stabile IDs; falsche beobachtete Debrief-Schritte sperren', () => {
    const x = setup(),
      input = change(x),
      s = x.app.session(x.sessionId, owner),
      step = projectWorkflow(s.draft).steps[0];
    const proposal = x.a3.propose(owner, x.process.id, {
      ...input,
      operations: [
        { kind: 'revise_step', step: { ...step, title: 'Belegte Entscheidung' } },
        {
          kind: 'add_step',
          step: {
            ...step,
            id: 'open',
            title: 'Wiederaufnahme ungeklärt',
            provenance: 'open',
            claimIds: [],
            evidenceIds: [],
          },
        },
        {
          kind: 'add_edge',
          edge: {
            id: 'edge',
            from: step.id,
            to: 'open',
            kind: 'return',
            label: 'Wiederaufnahme offen',
            provenance: 'open',
            claimIds: [],
            evidenceIds: [],
          },
        },
      ],
    });
    x.a3.review(owner, x.process.id, proposal.id, 'accept');
    const next = publish(x.app, x.app.session(s.id, owner));
    const view = x.a3.view(owner, x.process.id, next.id);
    expect(view.timeline).toEqual(view.workflow.steps);
    expect(view.workflow.edges[0].kind).toBe('return');
    expect(view.workflow.steps[0].id).toBe(step.id);
    x.store.close();
  });
  it('Optimize ohne Grundlage bleibt leer; nur exakte Quelle, Annahmen und Grenzen; kein Regel-/Aktionswechsel', () => {
    const x = setup(
      new Store(),
      true,
      ' Der zusätzliche Ansichtswechsel für den Lieferantencheck kostet mich Zeit.',
    );
    expect(x.a3.view(owner, x.process.id, x.version.id).optimizations).toEqual([]);
    const input = {
      versionId: x.version.id,
      problemClaimId: 'cl-1',
      problem: x.version.claims[0].quote,
      hypothesis: 'Manuell zu prüfen',
      change: 'Nur ein Review-Vorschlag',
      assumptions: ['Expertenreview erforderlich'],
      limits: ['Keine Zeitmessung'],
      guardrailIds: ['r-1'],
    };
    expect(() =>
      x.a3.optimize(owner, x.process.id, { ...input, problem: 'Erfundene Reibung' }),
    ).toThrow();
    const o = x.a3.optimize(owner, x.process.id, input);
    expect(() =>
      x.a3.reviewOptimization(owner, x.process.id, o.id, 'approved_for_sandbox'),
    ).toThrow();
    x.a3.reviewOptimization(owner, x.process.id, o.id, 'expert_reviewed');
    x.a3.reviewOptimization(owner, x.process.id, o.id, 'approved_for_sandbox');
    expect(x.store.get('versions', x.version.id)).toEqual(x.version);
    expect(x.store.list('actions')).toEqual([]);
    x.store.close();
  });
  it('Evidence nutzt ausschließlich Expertenaudio und prüft fehlende Medien erneut', () => {
    const x = setup();
    x.store.put(
      'assets',
      { id: 'expert-audio', ownerId: owner, sessionId: x.sessionId, epoch: 2, kind: 'audio' },
      owner,
      x.sessionId,
    );
    const seg = x.store.get<import('../src/domain/contracts').Segment>('segments', x.segmentId)!;
    seg.audioId = 'expert-audio';
    x.store.put('segments', seg, owner, x.sessionId);
    expect(x.a3.evidence(owner, x.process.id, x.version.id, 'cl-1').audioMode).toBe(
      'original_expert_audio',
    );
    x.store.delete('assets', 'expert-audio');
    expect(x.a3.evaluate(owner, x.process.id, x.version.id, x.eventId).outcome).toBe('unknown');
    expect(() => x.a3.evidence(owner, x.process.id, x.version.id, 'cl-1')).toThrow();
    x.store.close();
  });
  it('Quellenwiderruf zwischen Annahme und Veröffentlichung sperrt den Commit', () => {
    const x = setup(),
      input = change(x),
      proposal = x.a3.propose(owner, x.process.id, input);
    x.a3.review(owner, x.process.id, proposal.id, 'accept');
    x.app.removeSource(owner, x.segmentId);
    expect(() => publish(x.app, x.app.session(x.sessionId, owner))).toThrow();
    expect(x.store.list('versions')).toHaveLength(1);
    x.store.close();
  });
  it('Initiales Modell ist revisionsgebunden; beobachtete Debrief-Inhalte und fremde Kanten werden zurückgewiesen', () => {
    const x = setup(),
      input = change(x),
      s = x.app.session(x.sessionId, owner),
      step = projectWorkflow(s.draft).steps[0];
    const seg = x.store.get<import('../src/domain/contracts').Segment>('segments', x.segmentId)!;
    seg.phase = 'debrief';
    x.store.put('segments', seg, owner, x.sessionId);
    expect(() =>
      x.a3.propose(owner, x.process.id, {
        ...input,
        operations: [{ kind: 'revise_step', step: { ...step, provenance: 'observed' } }],
      }),
    ).toThrow(/Debrief/);
    expect(() =>
      x.a3.propose(owner, x.process.id, {
        ...input,
        operations: [
          {
            kind: 'add_edge',
            edge: {
              id: 'bad',
              from: step.id,
              to: 'foreign',
              kind: 'sequence',
              label: 'missing',
              provenance: 'open',
              claimIds: [],
              evidenceIds: [],
            },
          },
        ],
      }),
    ).toThrow(/Kante/);
    expect(() =>
      x.a3.workflow(
        owner,
        x.process.id,
        s.draft.revision,
        x.app.contentHash(s),
        projectWorkflow(s.draft),
      ),
    ).toThrow();
    x.store.close();
  });
  it('Live-Prozess startet leer; Fixtures/Oracle und A3-Evaluationsdaten sind außerhalb der Provider-Payloads', () => {
    const x = setup(),
      empty = x.app.create(owner, 'Live leer');
    expect(empty.session.draft.rules).toEqual([]);
    const providers = readFileSync('src/adapters/providers.ts', 'utf8');
    expect(providers).not.toMatch(
      /tests\/|fixtures|evaluations|optimizations|expectedAction|oracle/i,
    );
    const context = x.app.context(
      owner,
      x.app.exercise(
        owner,
        x.version.id,
        x.app.newCase(owner, x.sessionId, testFacts).id,
        'coached',
      ).id,
    );
    expect(JSON.stringify(context)).not.toMatch(
      /confirming_test|evidenced_correction|expectedAction|oracle/,
    );
    x.store.close();
  });
});
function changeForCurrent(x: ReturnType<typeof setup>) {
  const s = x.app.session(x.sessionId, owner),
    rule = structuredClone(s.draft.rules[0]);
  rule.when = { kind: 'compare', field: 'varianceBps', op: 'gte', value: 100 };
  return {
    baseVersionId: x.version.id,
    baseDraftRevision: s.draft.revision,
    baseHash: x.app.contentHash(s),
    operations: [{ kind: 'revise_rule', rule }],
  };
}
