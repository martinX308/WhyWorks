import { randomUUID } from 'node:crypto';
import type { Blueprint } from './service';
import { A3 } from './a3';
import { requireThat } from './errors';
import { assess } from './learning-evaluator';
import { hash } from '../domain/hash';
import { gate } from '../domain/interpreter';
import type { Action, Case, Facts, Snapshot, Run } from '../domain/contracts';
import type { LearningCase, LearningRun } from '../domain/learning';
export class A4 {
  constructor(public app: Blueprint) {}
  run(owner: string, id: string) {
    return this.app.owned<LearningRun>('runs', id, owner);
  }
  version(owner: string, run: Run, usable = true) {
    const v = this.app.store.get<Snapshot>('versions', run.versionId);
    requireThat(
      v && v.contentHash === run.contentHash && v.scopeId === run.scopeId,
      422,
      'version',
      'Versionsbindung ungültig.',
    );
    this.app.session(v.sessionId, owner);
    requireThat(!usable || !v.revoked, 409, 'revoked', 'Version widerrufen.');
    return v;
  }
  save(run: LearningRun) {
    const v = this.version(run.ownerId, run, false);
    return this.app.store.put('runs', run, run.ownerId, v.sessionId);
  }
  start(owner: string, versionId: string, learningCase: Exclude<LearningCase, 'custom'>) {
    // Only field combinations, no answers or rules. Publication is always a prerequisite.
    const v = this.app.store.get<Snapshot>('versions', versionId);
    requireThat(v && !v.revoked, 422, 'version', 'Nutzbare veröffentlichte Version erforderlich.');
    this.app.session(v.sessionId, owner);
    const independentCount = this.app.store
      .list<LearningRun>('runs', v.sessionId)
      .filter((r) => r.ownerId === owner && r.learningCase === 'L-03' && r.firstAttempt).length;
    requireThat(
      learningCase !== 'L-03' || independentCount < 3,
      409,
      'new_case',
      'Weitere unabhängige Fälle müssen separat fachlich vorbereitet werden.',
    );
    const facts: Facts = {
      vendorKnown: true,
      poMatches: true,
      varianceBps:
        learningCase === 'L-02'
          ? 110
          : learningCase === 'L-03'
            ? [90, 80, 70][independentCount]
            : 90,
      goodsReceiptConfirmed: learningCase !== 'L-03',
      bankDetailsChanged: learningCase === 'L-01',
      verificationStatus: null,
    };
    const c = this.app.newCase(owner, v.sessionId, facts);
    const run: LearningRun = this.app.exercise(
      owner,
      v.id,
      c.id,
      learningCase === 'L-03' ? 'independent' : 'coached',
    );
    run.learningCase = learningCase;
    return this.save(run);
  }
  attempt(owner: string, id: string, action: Action, reason: string) {
    return this.app.store.tx(() => {
      const r = this.run(owner, id);
      this.version(owner, r);
      requireThat(
        !r.firstAttempt && reason.trim().length > 0,
        409,
        'attempt',
        'Erstentscheidung fehlt oder wurde bereits gespeichert.',
      );
      const c = this.app.owned<Case>('cases', r.caseId, owner);
      if (r.type === 'independent') {
        const seen = this.app.store
          .list<LearningRun>('runs')
          .some(
            (x) =>
              x.ownerId === owner &&
              x.id !== id &&
              x.firstAttempt &&
              (x.caseId === c.id || (x.firstRecord && hash(x.firstRecord.facts) === hash(c.facts))),
          );
        requireThat(
          !seen,
          409,
          'seen_case',
          'Für einen unabhängigen Versuch ist ein weiterer ungesehener Fall erforderlich.',
        );
      }
      r.firstAttempt = { action, reason };
      r.firstRecord = {
        at: Date.now(),
        facts: structuredClone(c.facts),
        factsRevision: c.factsRevision,
        recordRevision: c.recordRevision,
        assistance: [...r.assistance],
      };
      return this.save(r);
    });
  }
  help(owner: string, id: string, kind: string) {
    const r = this.run(owner, id);
    this.version(owner, r);
    requireThat(
      r.type !== 'independent' || r.firstAttempt,
      403,
      'independent',
      'Vor Erstentscheidung keine Hilfe.',
    );
    r.assistance.push(kind);
    return this.save(r);
  }
  action(
    owner: string,
    id: string,
    input: {
      action: Action;
      expectedRecordRevision: number;
      expectedFactsRevision: number;
      idempotencyKey: string;
    },
  ) {
    return this.app.store.tx(() => {
      const r = this.run(owner, id),
        v = this.version(owner, r);
      requireThat(
        r.firstAttempt && r.firstRecord,
        422,
        'attempt',
        'Erstentscheidung vor Feedback speichern.',
      );
      const actionId = hash({ ownerId: owner, caseId: r.caseId, key: input.idempotencyKey });
      const payloadHash = hash({ runId: id, ...input });
      const old = this.app.store.get<{ id: string; payloadHash: string; result: unknown }>(
        'actions',
        actionId,
      );
      if (old) {
        requireThat(
          old.payloadHash === payloadHash,
          409,
          'idempotency',
          'Schlüssel mit anderem Payload.',
        );
        return old.result;
      }
      const c = this.app.owned<Case>('cases', r.caseId, owner);
      requireThat(
        c.recordRevision === input.expectedRecordRevision &&
          c.factsRevision === input.expectedFactsRevision,
        409,
        'recheck',
        'Fall inzwischen geändert.',
      );
      if (!r.decisions?.length)
        requireThat(
          input.action === r.firstAttempt.action && c.factsRevision === r.firstRecord.factsRevision,
          409,
          'first_action',
          'Erster Gate-Request muss die gespeicherte Erstentscheidung auf unveränderten Fakten prüfen.',
        );
      const started = performance.now();
      const result = gate(v.rules, input.action, c.facts, r.capabilities),
        committed = result.outcome === 'allowed';
      this.app.store.put(
        'metrics',
        {
          id: randomUUID(),
          kind: 'gate_interpreter',
          durationMs: performance.now() - started,
          outcome: result.outcome,
          versionId: v.id,
        },
        owner,
        c.sessionId,
      );
      if (committed) {
        c.status =
          input.action === 'approve' ? 'approved' : input.action === 'hold' ? 'held' : 'escalated';
        c.recordRevision++;
        this.app.store.put('cases', c, owner, c.sessionId);
      } else r.assistance.push('gate_intervention');
      r.decisions ??= [];
      r.decisions.push({
        ...result,
        action: input.action,
        at: Date.now(),
        committed,
        facts: structuredClone(c.facts),
        factsRevision: c.factsRevision,
        recordRevision: c.recordRevision,
      });
      this.save(r);
      const response = {
        ...result,
        committed,
        recordRevision: c.recordRevision,
        factsRevision: c.factsRevision,
        versionId: v.id,
        contentHash: v.contentHash,
      };
      this.app.store.put(
        'actions',
        { id: actionId, payloadHash, result: response },
        owner,
        c.sessionId,
      );
      return response;
    });
  }
  archiveResults(owner: string, sessionId: string) {
    this.app.session(sessionId, owner);
    for (const r of this.app.store.list<LearningRun>('runs', sessionId)) {
      if (!r.firstAttempt || r.archivedAssessment) continue;
      const v = this.app.store.get<Snapshot>('versions', r.versionId);
      if (!v || v.revoked) continue;
      const result = assess(r, v);
      r.archivedAssessment = { ...result, reason: { status: result.reason.status, review: null } };
      this.save(r);
    }
  }
  results(owner: string, id: string) {
    const r = this.run(owner, id),
      v = this.version(owner, r, false);
    requireThat(r.firstAttempt, 403, 'independent', 'Erstentscheidung vor Results speichern.');
    return {
      run: r,
      version: {
        id: v.id,
        contentHash: v.contentHash,
        scopeId: v.scopeId,
        sourceMode: v.sourceMode,
        revoked: v.revoked,
      },
      assessment: v.revoked && r.archivedAssessment ? r.archivedAssessment : assess(r, v),
      claims: v.revoked
        ? []
        : v.claims.map((c) => ({ id: c.id, quote: c.quote, meaning: c.meaning })),
    };
  }
  evidence(owner: string, id: string, claimId: string) {
    const r = this.run(owner, id),
      v = this.version(owner, r);
    requireThat(
      r.type !== 'independent' || r.firstAttempt,
      403,
      'independent',
      'Vor Erstentscheidung keine Hilfe.',
    );
    const evidence = new A3(this.app).evidence(owner, v.processId, v.id, claimId);
    this.help(owner, id, 'original_replay');
    return evidence;
  }
  review(owner: string, id: string, supported: boolean, note: string) {
    const r = this.run(owner, id);
    this.version(owner, r);
    requireThat(
      r.firstAttempt && note.trim(),
      422,
      'review',
      'Erstbegründung und Reviewnotiz erforderlich.',
    );
    r.reasonReview = { actorId: owner, at: Date.now(), supported, note };
    this.save(r);
    return this.results(owner, id);
  }
}
