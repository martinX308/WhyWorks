import { randomUUID } from 'node:crypto';
import type { Blueprint, Asset } from './service';
import { requireThat } from './errors';
import { hash } from '../domain/hash';
import { gate, evaluate } from '../domain/interpreter';
import {
  projectWorkflow,
  WorkflowSchema,
  ProposalInput,
  OptimizeInput,
  type Workflow,
  type Proposal,
  type Optimization,
} from '../domain/blueprint';
import type {
  Snapshot,
  Session,
  Process,
  ScreenEvent,
  Segment,
  Rule,
  Run,
} from '../domain/contracts';
export type Evaluation = {
  id: string;
  ownerId: string;
  sessionId: string;
  versionId: string;
  contentHash: string;
  baseEventId: string;
  provenance: 'hypothetical';
  sourceMode: 'live' | 'replay';
  facts: ScreenEvent['facts'];
  outcome: 'confirming_test' | 'evidenced_correction' | 'unknown';
  baseline: ReturnType<typeof gate> | null;
  counterfactual: ReturnType<typeof gate> | null;
  issues: string[];
  proposalId?: string;
  candidateHash?: string;
  ruleIds: string[];
  evidenceIds: string[];
};
const kinds = ['assignment', 'representation', 'domain_validity', 'version_release'] as const;
export class A3 {
  constructor(public app: Blueprint) {}
  version(owner: string, processId: string, versionId: string) {
    this.app.owned<Process>('processes', processId, owner);
    const v = this.app.store.get<Snapshot>('versions', versionId);
    requireThat(
      v && v.processId === processId,
      403,
      'version_scope',
      'Version fehlt oder ist prozessfremd.',
    );
    return v;
  }
  validate(s: Session, workflow: Workflow, claims = s.draft.claims, rules = s.draft.rules) {
    this.app.validatePatch(
      { ...s, draft: { ...s.draft, rules: [] } },
      {
        baseDraftRevision: s.draft.revision,
        claims: claims.map((c) => ({ ...c, review: 'draft' })),
        rules: rules.map((r) => ({ ...r, review: 'draft' })),
        gaps: [],
        answerLinks: [],
      },
    );
    const events = this.app.store.list<ScreenEvent>('events', s.id);
    for (const c of claims) {
      const seg = this.app.store.get<Segment>('segments', c.segmentId)!;
      if (seg.audioId) {
        const audio = this.app.store.get<Asset>('assets', seg.audioId);
        requireThat(
          audio && audio.sessionId === s.id && audio.kind === 'audio',
          422,
          'audio',
          'Originalaudio fehlt.',
        );
      }
      for (const eid of c.eventIds) {
        const event = events.find((e) => e.id === eid)!;
        const frame = this.app.store.get<Asset>('assets', event.frameId);
        requireThat(
          frame && frame.sessionId === s.id && frame.kind === 'frame',
          422,
          'frame',
          'Originalframe fehlt oder ist fremd.',
        );
      }
    }
    WorkflowSchema.parse(workflow);
    requireThat(
      new Set(workflow.steps.map((s) => s.id)).size === workflow.steps.length &&
        new Set(workflow.edges.map((e) => e.id)).size === workflow.edges.length,
      422,
      'duplicate',
      'Doppelte Workflow-ID.',
    );
    for (const item of [...workflow.steps, ...workflow.edges]) {
      if ('from' in item)
        requireThat(
          workflow.steps.some((s) => s.id === item.from) &&
            workflow.steps.some((s) => s.id === item.to),
          422,
          'edge',
          'Kante ohne gültigen Schritt.',
        );
      if (item.provenance !== 'open')
        requireThat(item.claimIds.length > 0, 422, 'claim', 'Schritt/Kante ohne Expertenbeleg.');
      for (const cid of item.claimIds) {
        const claim = claims.find((c) => c.id === cid);
        requireThat(
          claim &&
            item.evidenceIds.includes(claim.segmentId) &&
            claim.eventIds.every((e) => item.evidenceIds.includes(e)),
          422,
          'support',
          'Workflow-Beleg passt nicht zum Claim.',
        );
      }
      requireThat(
        item.evidenceIds.every((e) =>
          claims.some(
            (c) => item.claimIds.includes(c.id) && (c.segmentId === e || c.eventIds.includes(e)),
          ),
        ),
        422,
        'evidence',
        'Fehlende/fremde Workflow-Evidenz.',
      );
      if (item.provenance === 'observed') {
        // The model must explicitly identify the observed moment; the base frame alone is not a hypothetical observation.
        requireThat(
          item.evidenceIds.some((e) => events.some((x) => x.id === e)),
          422,
          'observation',
          'Beobachteter Schritt ohne Screenmoment.',
        );
        requireThat(
          item.claimIds.every(
            (cid) =>
              this.app.store.get<Segment>('segments', claims.find((c) => c.id === cid)!.segmentId)
                ?.phase !== 'debrief',
          ),
          422,
          'observation',
          'Debrief ist keine beobachtete Handlung.',
        );
      }
    }
    requireThat(
      rules.every((r) => workflow.steps.some((s) => s.id === r.stepId && s.provenance !== 'open')),
      422,
      'step',
      'Regel ohne belegten Prozessschritt.',
    );
  }
  sourceIssues(owner: string, v: Snapshot) {
    try {
      requireThat(!v.revoked, 422, 'revoked', 'Quellen/Version widerrufen.');
      const s = this.app.session(v.sessionId, owner);
      this.validate(s, projectWorkflow(v), v.claims, v.rules);
      return [];
    } catch (e) {
      return [(e as Error).message];
    }
  }
  view(owner: string, processId: string, versionId?: string) {
    const p = this.app.owned<Process>('processes', processId, owner),
      s = this.app.session(p.sessionId, owner);
    const versions = this.app.store
      .list<Snapshot>('versions', s.id)
      .filter((v) => v.processId === p.id);
    const v = versionId ? this.version(owner, processId, versionId) : null;
    const model = v || s.draft;
    const workflow = projectWorkflow(model);
    const issues = v ? this.sourceIssues(owner, v) : [];
    return {
      versionId: v?.id || null,
      contentHash: v?.contentHash || this.app.contentHash(s),
      sourceMode: s.sourceMode,
      workflow,
      timeline: workflow.steps,
      claims: model.claims,
      rules: model.rules,
      gaps: model.gaps || [],
      versions: versions.map((x) => ({
        id: x.id,
        contentHash: x.contentHash,
        parentVersionId: x.parentVersionId,
        revoked: x.revoked,
      })),
      issues,
      proposals: this.app.store.list<Proposal>('proposals', s.id),
      evaluations: this.app.store
        .list<Evaluation>('evaluations', s.id)
        .filter((x) => !v || x.versionId === v.id),
      optimizations: this.app.store
        .list<Optimization>('optimizations', s.id)
        .filter((x) => !v || x.versionId === v.id),
      improvement: s.improvement,
      draftRevision: s.draft.revision,
      confirmations: this.app.store
        .list<import('../domain/contracts').Confirmation>('confirmations', s.id)
        .filter((c) => c.subjectHash === (v?.contentHash || this.app.contentHash(s))),
    };
  }
  workflow(
    owner: string,
    processId: string,
    expectedDraftRevision: number,
    contentHash: string,
    raw: unknown,
  ) {
    return this.app.store.tx(() => {
      const p = this.app.owned<Process>('processes', processId, owner),
        s = this.app.session(p.sessionId, owner);
      requireThat(
        !p.publishedVersionId &&
          s.state === 'debrief' &&
          s.draft.revision === expectedDraftRevision &&
          this.app.contentHash(s) === contentHash,
        409,
        'stale_draft',
        'Initiales Modell nur im aktuellen Debrief; veröffentlichte Modelle benötigen einen Review-Diff.',
      );
      const workflow = WorkflowSchema.parse(raw);
      this.validate(s, workflow);
      s.draft.workflow = workflow;
      s.draft.revision++;
      s.teachback = null;
      return this.app.saveSession(s);
    });
  }
  begin(owner: string, processId: string, versionId: string) {
    return this.app.store.tx(() => {
      const p = this.app.owned<Process>('processes', processId, owner),
        v = this.version(owner, processId, versionId),
        s = this.app.session(p.sessionId, owner);
      requireThat(
        s.state === 'published' && p.publishedVersionId === v.id && !v.revoked,
        409,
        'base_version',
        'Nur die aktuelle freigegebene Version kann verbessert werden.',
      );
      s.improvement = { baseVersionId: v.id };
      s.state = 'debrief';
      s.epoch++;
      s.epochStartedAt = Date.now();
      s.teachback = null;
      // No capture starts automatically. Existing sources and A2 learning records are preserved.
      s.draft.claims = v.claims.map((c) => ({ ...c, review: 'draft' }));
      s.draft.rules = v.rules.map((r) => ({ ...r, review: 'draft' }));
      s.draft.workflow = projectWorkflow(v);
      s.draft.revision++;
      return this.app.saveSession(s);
    });
  }
  propose(owner: string, processId: string, raw: unknown) {
    return this.app.store.tx(() => {
      const input = ProposalInput.parse(raw),
        p = this.app.owned<Process>('processes', processId, owner),
        s = this.app.session(p.sessionId, owner);
      this.version(owner, processId, input.baseVersionId);
      this.current(s, p, input);
      const candidate = structuredClone(s),
        workflow = projectWorkflow(candidate.draft);
      const claims = [],
        rules = [];
      const diff: Proposal['diff'] = [];
      for (const op of input.operations) {
        if (op.kind === 'attach_claim') {
          requireThat(
            op.claim.review === 'draft',
            422,
            'confirmation',
            'Claim benötigt erneute Bestätigung.',
          );
          claims.push(op.claim);
          diff.push({
            kind: op.kind,
            id: op.claim.id,
            before: s.draft.claims.find((c) => c.id === op.claim.id) || null,
            after: op.claim,
          });
        } else if (op.kind === 'revise_rule') {
          requireThat(
            op.rule.review === 'draft',
            422,
            'confirmation',
            'Regel benötigt erneute Bestätigung.',
          );
          rules.push(op.rule);
          diff.push({
            kind: op.kind,
            id: op.rule.id,
            before: s.draft.rules.find((r) => r.id === op.rule.id) || null,
            after: op.rule,
          });
        } else {
          const isStep = 'step' in op,
            item = isStep ? op.step : op.edge;
          const collection = isStep ? workflow.steps : workflow.edges;
          const old = collection.find((x) => x.id === item.id);
          requireThat(
            op.kind.startsWith('add_') ? !old : !!old,
            422,
            'identity',
            'Add/Revise passt nicht zur stabilen ID.',
          );
          diff.push({ kind: op.kind, id: item.id, before: old || null, after: item });
          if (isStep) workflow.steps = [...workflow.steps.filter((x) => x.id !== item.id), op.step];
          else workflow.edges = [...workflow.edges.filter((x) => x.id !== item.id), op.edge];
        }
      }
      requireThat(
        new Set(diff.map((x) => x.kind + ':' + x.id)).size === diff.length,
        422,
        'duplicate',
        'Doppelte Operation.',
      );
      const merged = this.app.validatePatch(candidate, {
        baseDraftRevision: s.draft.revision,
        claims,
        rules,
        gaps: [],
        answerLinks: [],
      });
      candidate.draft = { ...candidate.draft, ...merged, workflow };
      const complete = projectWorkflow(candidate.draft);
      this.validate(candidate, complete);
      requireThat(
        diff.some((d) => hash(d.before) !== hash(d.after)),
        422,
        'empty_diff',
        'Keine inhaltliche Änderung.',
      );
      const affectedRuleIds = [
        ...new Set(
          diff.flatMap((d) =>
            d.kind === 'revise_rule'
              ? [d.id]
              : [...s.draft.rules, ...merged.rules]
                  .filter((r) => r.stepId === d.id || r.claimIds.includes(d.id))
                  .map((r) => r.id),
          ),
        ),
      ];
      const proposal: Proposal = {
        ...input,
        id: randomUUID(),
        ownerId: owner,
        sessionId: s.id,
        status: 'suggested',
        diff,
        affectedRuleIds,
        affectedEvaluationIds: this.app.store
          .list<Evaluation>('evaluations', s.id)
          .filter((t) => t.versionId === input.baseVersionId)
          .map((t) => t.id),
        regressionRequired: true,
        affectedRunIds: this.app.store
          .list<Run>('runs', s.id)
          .filter((r) => r.versionId === input.baseVersionId)
          .map((r) => r.id),
      };
      return this.app.store.put('proposals', proposal, owner, s.id);
    });
  }
  current(
    s: Session,
    p: Process,
    input: { baseVersionId: string; baseDraftRevision: number; baseHash: string },
  ) {
    requireThat(
      s.improvement?.baseVersionId === input.baseVersionId &&
        p.publishedVersionId === input.baseVersionId &&
        s.draft.revision === input.baseDraftRevision &&
        this.app.contentHash(s) === input.baseHash &&
        s.state === 'debrief',
      409,
      'stale_diff',
      'Review-Diff veraltet; neu gegen den aktuellen Draft erstellen und prüfen.',
    );
  }
  review(
    owner: string,
    processId: string,
    proposalId: string,
    decision: 'accept' | 'reject' | 'request_clarification',
  ) {
    // Validate and persist the reviewed draft in one transaction, using the existing source/AST checks.
    return this.app.store.tx(() => {
      const p = this.app.owned<Process>('processes', processId, owner),
        s = this.app.session(p.sessionId, owner),
        proposal = this.app.owned<Proposal>('proposals', proposalId, owner);
      requireThat(
        proposal.sessionId === s.id && proposal.status === 'suggested',
        409,
        'review',
        'Review bereits abgeschlossen oder fremd.',
      );
      this.current(s, p, proposal);
      if (decision === 'accept') {
        const claims = proposal.operations.flatMap((o) =>
          o.kind === 'attach_claim' ? [o.claim] : [],
        );
        const rules = proposal.operations.flatMap((o) =>
          o.kind === 'revise_rule' ? [o.rule] : [],
        );
        const merged = this.app.validatePatch(s, {
          baseDraftRevision: s.draft.revision,
          claims,
          rules,
          gaps: [],
          answerLinks: [],
        });
        const workflow = projectWorkflow(s.draft);
        for (const o of proposal.operations) {
          if ('step' in o)
            workflow.steps = [...workflow.steps.filter((x) => x.id !== o.step.id), o.step];
          if ('edge' in o)
            workflow.edges = [...workflow.edges.filter((x) => x.id !== o.edge.id), o.edge];
        }
        s.draft = { ...s.draft, ...merged, workflow, revision: s.draft.revision + 1 };
        s.draft.workflow = projectWorkflow(s.draft);
        this.validate(s, s.draft.workflow);
        s.teachback = null;
        s.improvement!.proposalId = proposal.id;
        proposal.acceptedHash = this.app.contentHash(s);
        proposal.acceptedRevision = s.draft.revision;
        this.app.saveSession(s);
        proposal.status = 'accepted';
      } else proposal.status = decision === 'reject' ? 'rejected' : 'request_clarification';
      return this.app.store.put('proposals', proposal, owner, s.id);
    });
  }
  evidence(owner: string, processId: string, versionId: string | undefined, claimId: string) {
    const p = this.app.owned<Process>('processes', processId, owner),
      s = this.app.session(p.sessionId, owner);
    const model = versionId ? this.version(owner, processId, versionId) : s.draft;
    const c = model.claims.find((c) => c.id === claimId);
    requireThat(c, 403, 'claim_scope', 'Claim fehlt in der gewählten Version.');
    const segment = this.app.evidence(owner, c.segmentId) as Segment;
    requireThat(
      segment.text.slice(c.start, c.end) === c.quote,
      422,
      'quote',
      'Zitat stimmt nicht mehr.',
    );
    const frames = c.eventIds.map((id) => {
      const e = this.app.store.list<ScreenEvent>('events', s.id).find((e) => e.id === id);
      requireThat(e, 422, 'evidence', 'Originalmoment fehlt.');
      this.app.evidence(owner, e.frameId);
      return { eventId: e.id, frameId: e.frameId, atMs: e.atMs, caseId: e.caseId };
    });
    if (segment.audioId) {
      const a = this.app.evidence(owner, segment.audioId) as Asset;
      requireThat(a.kind === 'audio', 422, 'audio', 'Keine Expertenaufnahme.');
    }
    const h = versionId ? (model as Snapshot).contentHash : this.app.contentHash(s);
    return {
      claim: c,
      segment,
      frames,
      rules: model.rules.filter((r) => r.claimIds.includes(c.id)),
      sourceMode: s.sourceMode,
      audioMode: segment.audioId ? 'original_expert_audio' : 'transcript_substitute',
      confirmations: this.app.store
        .list<import('../domain/contracts').Confirmation>('confirmations', s.id)
        .filter((x) => x.subjectHash === h),
      requiredConfirmations: kinds,
      revoked: versionId ? (model as Snapshot).revoked : false,
    };
  }
  evaluate(
    owner: string,
    processId: string,
    versionId: string,
    baseEventId: string,
    proposalId?: string,
  ) {
    return this.app.store.tx(() => {
      const v = this.version(owner, processId, versionId),
        events = this.app.store.list<ScreenEvent>('events', v.sessionId),
        event = events.find((e) => e.id === baseEventId);
      requireThat(!v.revoked, 409, 'revoked', 'Version widerrufen; keine neue Bewertung.');
      requireThat(
        event && v.claims.some((c) => c.eventIds.includes(event.id)),
        422,
        'evidence',
        'Basisfall ist nicht durch die gewählte Version belegt.',
      );
      const facts = { ...event.facts, goodsReceiptConfirmed: false };
      const issues = this.sourceIssues(owner, v);
      let rules = v.rules,
        candidateHash: string | undefined;
      if (proposalId) {
        const proposal = this.app.owned<Proposal>('proposals', proposalId, owner),
          s = this.app.session(v.sessionId, owner);
        requireThat(
          proposal.baseVersionId === v.id &&
            proposal.status === 'accepted' &&
            proposal.acceptedRevision === s.draft.revision &&
            proposal.acceptedHash === this.app.contentHash(s),
          409,
          'stale_diff',
          'Korrektur-Diff nicht aktuell angenommen.',
        );
        try {
          this.validate(s, projectWorkflow(s.draft));
        } catch (e) {
          issues.push((e as Error).message);
        }
        rules = s.draft.rules.map((r) => ({ ...r, review: 'expert_confirmed' }));
        candidateHash = proposal.acceptedHash;
      }
      const baseline = issues.length
        ? null
        : gate(v.rules, 'approve', event.facts, ['sandbox_decide']);
      const counterfactual = issues.length
        ? null
        : gate(rules, 'approve', facts, ['sandbox_decide']);
      const receiptRules = rules.filter(
        (r) =>
          JSON.stringify(r.when).includes('"goodsReceiptConfirmed"') ||
          (r.effect.kind === 'prohibit' &&
            JSON.stringify(r.effect.resumeWhen)?.includes('"goodsReceiptConfirmed"')),
      );
      const uncertain = rules.some(
        (r) =>
          evaluate(r.when, facts) === 'unknown' ||
          (r.effect.kind === 'prohibit' &&
            r.effect.resumeWhen &&
            evaluate(r.effect.resumeWhen, facts) === 'unknown'),
      );
      const supported =
        event.facts.goodsReceiptConfirmed === true &&
        receiptRules.length > 0 &&
        !uncertain &&
        baseline?.outcome === 'allowed' &&
        counterfactual?.outcome !== 'allowed';
      let outcome: Evaluation['outcome'] = 'unknown';
      if (supported && !issues.length) {
        const original = gate(v.rules, 'approve', facts, ['sandbox_decide']);
        outcome =
          proposalId && original.outcome === 'allowed' ? 'evidenced_correction' : 'confirming_test';
      }
      if (outcome === 'unknown' && !issues.length)
        issues.push(
          'Keine eindeutig belegte Wareneingangsbedingung für diesen Basisfall; Klärung/Änderungsvorschlag erforderlich.',
        );
      const result: Evaluation = {
        id: randomUUID(),
        ownerId: owner,
        sessionId: v.sessionId,
        versionId: v.id,
        contentHash: v.contentHash,
        baseEventId,
        provenance: 'hypothetical',
        sourceMode: v.sourceMode,
        facts,
        outcome,
        baseline,
        counterfactual,
        issues,
        ...(proposalId ? { proposalId, candidateHash } : {}),
        ruleIds: receiptRules.map((r) => r.id),
        evidenceIds: [...new Set(receiptRules.flatMap((r) => r.evidenceIds))],
      };
      return this.app.store.put('evaluations', result, owner, v.sessionId);
    });
  }
  optimize(owner: string, processId: string, raw: unknown) {
    const input = OptimizeInput.parse(raw),
      v = this.version(owner, processId, input.versionId);
    requireThat(
      this.sourceIssues(owner, v).length === 0,
      422,
      'evidence',
      'Gültige Quellen fehlen.',
    );
    const claim = v.claims.find((c) => c.id === input.problemClaimId);
    // A manually reviewed friction claim, quoted exactly, is the only allowed problem input.
    requireThat(
      claim && input.problem === claim.quote,
      422,
      'friction',
      'Problem muss eine exakte vorhandene Expertenaussage sein.',
    );
    requireThat(
      input.guardrailIds.every((id) =>
        v.rules.some((r) => r.id === id && r.effect.kind === 'prohibit'),
      ),
      422,
      'guardrail',
      'Fremdes Guardrail.',
    );
    const proposal: Optimization = {
      ...input,
      id: randomUUID(),
      ownerId: owner,
      sessionId: v.sessionId,
      evidenceIds: [claim.segmentId, ...claim.eventIds],
      status: 'suggested',
    };
    return this.app.store.put('optimizations', proposal, owner, v.sessionId);
  }
  reviewOptimization(owner: string, processId: string, id: string, status: Optimization['status']) {
    const p = this.app.owned<Process>('processes', processId, owner),
      o = this.app.owned<Optimization>('optimizations', id, owner);
    requireThat(
      o.sessionId === p.sessionId &&
        this.sourceIssues(owner, this.version(owner, processId, o.versionId)).length === 0,
      422,
      'evidence',
      'Quellen fehlen oder sind widerrufen.',
    );
    const transitions: Record<Optimization['status'], readonly Optimization['status'][]> = {
      suggested: ['expert_reviewed', 'rejected'],
      expert_reviewed: ['approved_for_sandbox', 'rejected'],
      approved_for_sandbox: ['rejected'],
      rejected: [],
    };
    requireThat(transitions[o.status].includes(status), 409, 'review', 'Ungültiger Reviewwechsel.');
    o.status = status;
    return this.app.store.put('optimizations', o, owner, o.sessionId);
  }
}
