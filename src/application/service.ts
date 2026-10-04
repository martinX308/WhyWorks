import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Store, dataDir } from '../adapters/store';
import { hash } from '../domain/hash';
import { gate, validatePredicate } from '../domain/interpreter';
import {
  EventSchema,
  SegmentSchema,
  PatchSchema,
  transitions,
  type Session,
  type Process,
  type ScreenEvent,
  type Segment,
  type Patch,
  type Confirmation,
  type Snapshot,
  type Case,
  type Run,
  type Facts,
  type CaptureState,
  type Action,
  type Operation,
} from '../domain/contracts';
import { requireThat } from './errors';
import { emptyElicitation, topicKey } from '../domain/elicitation';
import { acceptance } from './elicitation';
import { A3 } from './a3';
import { A4 } from './a4';
import { projectWorkflow, type Proposal } from '../domain/blueprint';
export type Asset = {
  retired?: boolean;
  originalMarker?: string;
  originalCaseId?: string;
  id: string;
  sessionId: string;
  ownerId: string;
  epoch: number;
  kind: 'frame' | 'audio' | 'teachback';
  mime: string;
  file: string;
  atMs: number;
  caseId?: string;
};
const id = () => randomUUID();
export class Blueprint {
  constructor(
    public store: Store,
    public mediaDir = join(dataDir, 'media'),
  ) {}
  owned<T extends { ownerId: string }>(
    table: Parameters<Store['get']>[0],
    key: string,
    ownerId: string,
  ): T {
    const item = this.store.get<T>(table, key);
    requireThat(item && item.ownerId === ownerId, 403, 'scope', 'Kein Zugriff auf dieses Objekt.');
    return item;
  }
  session(key: string, ownerId: string) {
    const s = this.owned<Session>('sessions', key, ownerId);
    if (!s.elicitation || s.questions.some((q) => !q.status)) {
      s.elicitation ||= emptyElicitation();
      s.questions = s.questions.map((q) =>
        q.status
          ? q
          : {
              ...q,
              topicKey: 'legacy:' + q.id,
              kind: 'reason',
              phase: 'live',
              draftRevision: s.draft.revision,
              createdAt: s.startedAt,
              expiresAt: 0,
              priority: 5,
              status: 'cancelled',
              releasedAt: null,
              transcript: null,
            },
      );
      this.store.put('sessions', s, s.ownerId, s.id);
    }
    return s;
  }
  saveSession(s: Session) {
    s.stateRevision++;
    this.store.put('sessions', s, s.ownerId, s.id);
    return s;
  }
  create(
    ownerId: string,
    title: string,
    sourceMode: 'live' | 'replay' = 'live',
    profile: Process['acceptanceProfile'] = 'technical_spike',
  ) {
    const processId = id(),
      sessionId = id();
    const session: Session = {
      id: sessionId,
      ownerId,
      processId,
      state: 'ready',
      epoch: 1,
      stateRevision: 1,
      startedAt: Date.now(),
      epochStartedAt: Date.now(),
      captureMs: 0,
      marker: randomUUID().replaceAll('-', ''),
      sourceMode,
      draftIds: {},
      draft: {
        revision: 0,
        lastProcessedSegmentSequence: 0,
        claims: [],
        rules: [],
        gaps: [],
        answerLinks: [],
      },
      teachback: null,
      questions: [],
      elicitation: emptyElicitation(),
    };
    const process: Process = {
      id: processId,
      ownerId,
      title,
      sessionId,
      publishedVersionId: null,
      acceptanceProfile: profile,
    };
    this.store.tx(() => {
      if (!this.store.get('owners', ownerId)) this.store.put('owners', { id: ownerId }, ownerId);
      this.store.put('processes', process, ownerId, sessionId);
      this.store.put('sessions', session, ownerId, sessionId);
    });
    return { process, session };
  }
  state(sessionId: string, ownerId: string, next: CaptureState, expectedEpoch: number) {
    return this.store.tx(() => {
      const s = this.session(sessionId, ownerId);
      requireThat(s.epoch === expectedEpoch, 409, 'epoch', 'Veraltete Capture-Epoche.');
      requireThat(
        transitions[s.state].includes(next) && next !== 'published',
        409,
        'transition',
        'Ungültiger Zustandswechsel.',
      );
      if (['paused', 'off_record'].includes(s.state) && ['capture', 'debrief'].includes(next))
        requireThat(
          next === (s.resumeState || 'capture'),
          409,
          'resume_phase',
          'Resume muss die ursprüngliche Interviewphase fortsetzen.',
        );
      if (s.state === 'capture') s.captureMs += Date.now() - s.epochStartedAt;
      if (next === 'capture') {
        requireThat(
          s.captureMs < 600000,
          422,
          'capture_budget',
          'Capture-Budget von zehn Minuten verbraucht.',
        );
        s.epoch++;
        s.epochStartedAt = Date.now();
      }
      if (next === 'debrief' && ['off_record', 'paused', 'debrief'].includes(s.state)) {
        s.epoch++;
        s.epochStartedAt = Date.now();
      }
      if (next === 'off_record' || next === 'paused') {
        if (s.state === 'capture' || s.state === 'debrief') s.resumeState = s.state;
        s.epoch++;
        for (const op of this.store
          .list<Operation>('operations', s.id)
          .filter((x) => ['queued', 'running'].includes(x.status))) {
          op.status = 'cancelled';
          this.store.put('operations', op, ownerId, s.id);
        }
      }
      if (next === 'teachback')
        requireThat(
          s.draft.claims.length && s.draft.rules.length,
          422,
          'empty',
          'Noch kein belegter Draft.',
        );
      if (next === 'review')
        requireThat(
          s.teachback?.spoken && s.teachback.hash === this.contentHash(s),
          422,
          'teachback',
          'Das aktuelle Teach-back wurde noch nicht gesprochen.',
        );
      s.elicitation ||= emptyElicitation();
      if (next === 'debrief' && s.elicitation.debriefStartedAt === null) {
        s.elicitation.knownTopicsAtDebrief = [
          ...new Set(
            s.draft.gaps
              .filter((g) => ['provisionally_answered', 'confirmed'].includes(g.status))
              .map((g) => topicKey(g.topic)),
          ),
        ];
      }
      if (next === 'debrief' && s.elicitation.debriefStartedAt === null)
        s.elicitation.debriefStartedAt = Date.now();
      if (['drafting', 'paused', 'off_record'].includes(next))
        for (const q of s.questions)
          if (!['completed', 'interrupted', 'cancelled'].includes(q.status)) q.status = 'cancelled';
      s.state = next;
      return this.saveSession(s);
    });
  }
  content(s: Session) {
    return {
      sourceMode: s.sourceMode,
      workflow: projectWorkflow(s.draft),
      scopeId: 'scope-spike',
      gaps: s.draft.gaps,
      answerLinks: s.draft.answerLinks,
      ...(this.store.get<Process>('processes', s.processId)?.acceptanceProfile ===
      'challenge_initial'
        ? { elicitation: s.elicitation, questions: s.questions }
        : {}),
      claims: s.draft.claims.map((c) => ({ ...c, review: 'expert_confirmed' as const })),
      rules: s.draft.rules.map((r) => ({ ...r, review: 'expert_confirmed' as const })),
    };
  }
  contentHash(s: Session) {
    return hash(this.content(s));
  }
  acceptCapture(s: Session, epoch: number) {
    requireThat(
      (s.captureMs || 0) + Date.now() - s.epochStartedAt < 600000,
      422,
      'capture_budget',
      'Capture-Budget von zehn Minuten verbraucht.',
    );
    requireThat(
      s.state === 'capture' && s.epoch === epoch,
      409,
      'capture_closed',
      'Capture geschlossen oder alte Epoche.',
    );
  }
  asset(
    ownerId: string,
    sessionId: string,
    input: {
      epoch: number;
      kind: Asset['kind'];
      mime: string;
      base64: string;
      atMs: number;
      caseId?: string;
    },
  ) {
    const s = this.session(sessionId, ownerId);
    if (input.kind === 'audio' && s.state === 'debrief')
      requireThat(input.epoch === s.epoch, 409, 'epoch', 'Alte Epoche.');
    else if (input.kind !== 'teachback') this.acceptCapture(s, input.epoch);
    requireThat(
      input.kind === 'teachback' ? s.state === 'teachback' : true,
      409,
      'state',
      'Kein Teach-back-Zustand.',
    );
    requireThat(input.base64.length < 6_000_000, 400, 'media_limit', 'Medium zu groß.');
    requireThat(
      (input.kind === 'frame' && input.mime === 'image/png') ||
        (input.kind !== 'frame' && input.mime === 'audio/wav'),
      400,
      'mime',
      'Nicht unterstütztes Medium.',
    );
    const bytes = Buffer.from(input.base64, 'base64');
    requireThat(
      input.mime === 'image/png'
        ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.subarray(0, 4).toString() === 'RIFF',
      400,
      'media_format',
      'Ungültige Mediendaten.',
    );
    mkdirSync(this.mediaDir, { recursive: true });
    const asset: Asset = {
      id: id(),
      ownerId,
      sessionId,
      epoch: input.epoch,
      kind: input.kind,
      mime: input.mime,
      file: '',
      atMs: input.atMs,
      ...(input.caseId ? { caseId: input.caseId } : {}),
    };
    asset.file = join(this.mediaDir, asset.id + (input.mime === 'image/png' ? '.png' : '.wav'));
    writeFileSync(asset.file, bytes);
    this.store.put('assets', asset, ownerId, sessionId);
    return asset;
  }
  bytes(asset: Asset) {
    requireThat(
      !asset.retired,
      410,
      'removed',
      'Quelle entfernt; lokale Dateibereinigung ausstehend.',
    );
    return readFileSync(asset.file);
  }
  observations(ownerId: string, sessionId: string, events: unknown[], segments: unknown[]) {
    return this.store.tx(() => {
      const s = this.session(sessionId, ownerId);
      for (const raw of events) {
        const e = EventSchema.parse(raw);
        this.acceptCapture(s, e.epoch);
        const asset = this.owned<Asset>('assets', e.frameId, ownerId);
        requireThat(
          asset.sessionId === s.id &&
            asset.kind === 'frame' &&
            asset.epoch === e.epoch &&
            asset.caseId === e.caseId,
          422,
          'frame',
          'Ungültiger Framebezug.',
        );
        const old = this.store.get<ScreenEvent>('events', e.id);
        requireThat(
          !old || this.store.list<ScreenEvent>('events', s.id).some((x) => x.id === e.id),
          403,
          'scope',
          'Fremde Event-ID.',
        );
        requireThat(
          !old || hash(old) === hash(e),
          409,
          'duplicate',
          'Event-ID mit anderem Inhalt.',
        );
        requireThat(
          old ||
            !this.store
              .list<ScreenEvent>('events', s.id)
              .some((x) => x.epoch === e.epoch && x.sequence >= e.sequence),
          409,
          'sequence',
          'Veraltete Eventsequenz.',
        );
        this.store.put('events', e, ownerId, s.id);
      }
      for (const raw of segments) {
        const seg = SegmentSchema.parse(raw);
        if (s.state === 'debrief')
          requireThat(
            seg.epoch === s.epoch && seg.phase === 'debrief',
            409,
            'epoch',
            'Nur explizite Debrief-Segmente.',
          );
        else {
          this.acceptCapture(s, seg.epoch);
          requireThat(
            !seg.phase || seg.phase === 'live',
            422,
            'phase',
            'Keine Debrief-Quelle im Capture.',
          );
        }
        if (seg.audioId) {
          const asset = this.owned<Asset>('assets', seg.audioId, ownerId);
          requireThat(
            asset.sessionId === s.id && asset.epoch === seg.epoch && asset.kind === 'audio',
            422,
            'audio',
            'Ungültiger Audiobezug.',
          );
        }
        const old = this.store.get<Segment>('segments', seg.id);
        requireThat(
          !old || this.store.list<Segment>('segments', s.id).some((x) => x.id === seg.id),
          403,
          'scope',
          'Fremde Segment-ID.',
        );
        requireThat(
          !old || hash(old) === hash(seg),
          409,
          'duplicate',
          'Segment-ID mit anderem Inhalt.',
        );
        requireThat(
          old ||
            !this.store.list<Segment>('segments', s.id).some((x) => x.sequence === seg.sequence),
          409,
          'sequence',
          'Doppelte Segmentsequenz.',
        );
        this.store.put('segments', seg, ownerId, s.id);
      }
      return this.saveSession(s);
    });
  }
  validatePatch(s: Session, patch: Patch) {
    requireThat(
      patch.baseDraftRevision === s.draft.revision,
      409,
      'stale_draft',
      'Draft hat sich geändert.',
    );
    const claims = [
      ...s.draft.claims.filter((c) => !patch.claims.some((n) => n.id === c.id)),
      ...patch.claims,
    ];
    for (const c of patch.claims) {
      requireThat(c.review === 'draft', 422, 'model_confirmation', 'Modell darf nicht bestätigen.');
      const seg = this.store.get<Segment>('segments', c.segmentId);
      requireThat(
        seg && this.store.list<Segment>('segments', s.id).some((x) => x.id === seg.id),
        422,
        'segment',
        'Fremdes oder fehlendes Segment.',
      );
      requireThat(
        c.end <= seg.text.length && seg.text.slice(c.start, c.end) === c.quote,
        422,
        'quote',
        'Zitatspanne stimmt nicht mit Original überein.',
      );
      for (const eid of c.eventIds) {
        const e = this.store.get<ScreenEvent>('events', eid);
        requireThat(
          e &&
            this.store.list<ScreenEvent>('events', s.id).some((x) => x.id === eid) &&
            e.caseId === seg.caseId,
          422,
          'evidence',
          'Screenbezug fehlt oder gehört zu einem anderen Fall.',
        );
      }
      if (c.supersedesClaimId)
        requireThat(
          s.draft.claims.some((x) => x.id === c.supersedesClaimId),
          422,
          'correction',
          'Korrektur referenziert unbekannten Claim.',
        );
    }
    const rules = [
      ...s.draft.rules.filter((r) => !patch.rules.some((n) => n.id === r.id)),
      ...patch.rules,
    ];
    requireThat(rules.length <= 32, 422, 'rule_limit', 'Zu viele Regeln.');
    const count = { value: 0 };
    for (const r of rules) {
      try {
        validatePredicate(r.when, 0, count);
        if (r.effect.kind === 'prohibit' && r.effect.resumeWhen)
          validatePredicate(r.effect.resumeWhen, 0, count);
      } catch {
        requireThat(false, 422, 'ast', 'Ungültige Bedingung/Typen.');
      }
      requireThat(r.scopeId === 'scope-spike', 422, 'scope', 'Fremder Regelscope.');
      for (const cid of r.claimIds) {
        const c = claims.find((x) => x.id === cid);
        requireThat(c, 422, 'claim', 'Regel referenziert unbekannten Claim.');
        requireThat(
          r.evidenceIds.includes(c.segmentId) && c.eventIds.every((e) => r.evidenceIds.includes(e)),
          422,
          'support',
          'Regel enthält nicht die Belege ihrer Claims.',
        );
      }
      for (const eid of r.evidenceIds)
        requireThat(
          claims.some(
            (c) => r.claimIds.includes(c.id) && (c.segmentId === eid || c.eventIds.includes(eid)),
          ),
          422,
          'evidence',
          'Regel referenziert fremde Evidenz.',
        );
    }
    for (const gap of patch.gaps) {
      requireThat(
        gap.status !== 'confirmed',
        422,
        'model_confirmation',
        'Modell darf Gaps nicht bestätigen.',
      );
      requireThat(
        gap.claimIds.every((cid) => claims.some((c) => c.id === cid)),
        422,
        'gap',
        'Unbekannte Gap-Claims.',
      );
    }
    for (const link of patch.answerLinks) {
      requireThat(
        s.questions.some((q) => q.id === link.questionId),
        422,
        'question',
        'Unbekannte Frage.',
      );
      requireThat(
        link.segmentIds.every((sid) =>
          this.store.list<Segment>('segments', s.id).some((x) => x.id === sid),
        ) &&
          link.claimIds.every((cid) => claims.some((c) => c.id === cid)) &&
          link.gapIds.every((gid) => [...s.draft.gaps, ...patch.gaps].some((g) => g.id === gid)),
        422,
        'answer_link',
        'Ungültige Antwortzuordnung.',
      );
    }
    return { claims, rules };
  }
  applyPatch(
    ownerId: string,
    sessionId: string,
    epoch: number,
    input: unknown,
    processedSequence: number,
  ) {
    return this.store.tx(() => {
      const s = this.session(sessionId, ownerId);
      requireThat(
        s.epoch === epoch && !['off_record', 'paused', 'published'].includes(s.state),
        409,
        'epoch',
        'Ergebnis gehört zu geschlossener Epoche.',
      );
      const patch = PatchSchema.parse(input);
      s.draftIds ||= {};
      const durable = (value: string) =>
        value.startsWith('draft:') ? (s.draftIds[value] ||= id()) : value;
      patch.claims = patch.claims.map((c) => ({
        ...c,
        id: durable(c.id),
        supersedesClaimId: c.supersedesClaimId ? durable(c.supersedesClaimId) : null,
      }));
      patch.rules = patch.rules.map((r) => ({
        ...r,
        id: durable(r.id),
        stepId: durable(r.stepId),
        claimIds: r.claimIds.map(durable),
      }));
      patch.gaps = patch.gaps.map((g) => ({
        ...g,
        id: durable(g.id),
        claimIds: g.claimIds.map(durable),
      }));
      patch.answerLinks = patch.answerLinks.map((l) => ({
        ...l,
        claimIds: l.claimIds.map(durable),
        gapIds: l.gapIds.map(durable),
      }));

      for (const r of patch.rules)
        requireThat(
          r.review === 'draft',
          422,
          'model_confirmation',
          'Modell darf nicht bestätigen.',
        );
      const merged = this.validatePatch(s, patch);
      s.draft = {
        ...s.draft,
        ...merged,
        revision: s.draft.revision + 1,
        lastProcessedSegmentSequence: Math.max(
          processedSequence,
          s.draft.lastProcessedSegmentSequence,
        ),
        gaps: [
          ...s.draft.gaps.filter((g) => !patch.gaps.some((x) => x.id === g.id)),
          ...patch.gaps,
        ],
        answerLinks: [
          ...s.draft.answerLinks,
          ...patch.answerLinks.map((l) => ({ ...l, id: id() })),
        ],
      };
      s.teachback = null;
      return this.saveSession(s);
    });
  }
  confirm(ownerId: string, sessionId: string, kind: Confirmation['kind'], subjectHash: string) {
    return this.store.tx(() => {
      const s = this.session(sessionId, ownerId);
      requireThat(s.state === 'review', 409, 'state', 'Bestätigung nur im Review.');
      requireThat(
        this.contentHash(s) === subjectHash &&
          s.teachback?.hash === subjectHash &&
          s.teachback.spoken,
        409,
        'subject_hash',
        'Inhalt/Teach-back hat sich geändert.',
      );
      const c: Confirmation = {
        id: id(),
        ownerId,
        sessionId,
        kind,
        subjectHash,
        scopeId: 'scope-spike',
        actorId: ownerId + (kind === 'version_release' ? ':process-owner' : ':expert'),
        at: Date.now(),
      };
      this.store.put('confirmations', c, ownerId, sessionId);
      return c;
    });
  }
  publish(
    ownerId: string,
    processId: string,
    input: {
      expectedDraftRevision: number;
      scopeId: string;
      contentHash: string;
      confirmationIds: string[];
    },
  ) {
    return this.store.tx(() => {
      const p = this.owned<Process>('processes', processId, ownerId),
        s = this.session(p.sessionId, ownerId);
      requireThat(
        s.state === 'review' && s.draft.revision === input.expectedDraftRevision,
        409,
        'stale_draft',
        'Review/Draft veraltet.',
      );
      requireThat(
        input.scopeId === 'scope-spike' && input.contentHash === this.contentHash(s),
        409,
        'subject_hash',
        'Scope/Hash veraltet.',
      );
      requireThat(
        s.teachback?.spoken && s.teachback.hash === input.contentHash,
        422,
        'teachback',
        'Teach-back fehlt.',
      );
      requireThat(
        s.draft.rules.length > 0 && s.draft.claims.length > 0,
        422,
        'empty',
        'Keine belegte Regel.',
      );
      requireThat(
        !s.draft.gaps.some(
          (g) => g.critical && !['confirmed', 'provisionally_answered'].includes(g.status),
        ),
        422,
        'gap',
        'Kritische Lücke/Konflikt offen.',
      );
      // Revalidate every source on publication, independently of earlier extraction.
      this.validatePatch(
        { ...s, draft: { ...s.draft, rules: [] } },
        {
          ...s.draft,
          baseDraftRevision: s.draft.revision,
          answerLinks: [],
          claims: s.draft.claims.map((c) => ({ ...c, review: 'draft' })),
          rules: s.draft.rules.map((r) => ({ ...r, review: 'draft' })),
        },
      );
      new A3(this).validate(s, projectWorkflow(s.draft));
      if (p.publishedVersionId) {
        const proposal = s.improvement?.proposalId
          ? this.store.get<Proposal>('proposals', s.improvement.proposalId)
          : null;
        requireThat(
          s.improvement?.baseVersionId === p.publishedVersionId &&
            proposal?.status === 'accepted' &&
            proposal.acceptedHash === input.contentHash &&
            proposal.acceptedRevision === s.draft.revision,
          409,
          'stale_diff',
          'Aktueller angenommener Review-Diff erforderlich.',
        );
        const parent = this.store.get<Snapshot>('versions', p.publishedVersionId);
        requireThat(parent && !parent.revoked, 422, 'revoked', 'Basisversion widerrufen.');
      }
      const cs = input.confirmationIds.map((cid) => {
        const c = this.store.get<Confirmation>('confirmations', cid);
        requireThat(c, 422, 'confirmation', 'Bestätigung fehlt.');
        requireThat(c.ownerId === ownerId, 403, 'scope', 'Fremde Bestätigung.');
        return c;
      });
      for (const kind of ['assignment', 'representation', 'domain_validity', 'version_release'])
        requireThat(
          cs.some(
            (c) =>
              c.kind === kind &&
              c.sessionId === s.id &&
              c.subjectHash === input.contentHash &&
              c.scopeId === input.scopeId,
          ),
          422,
          'confirmation',
          'Bestätigung fehlt: ' + kind,
        );
      if (p.acceptanceProfile === 'challenge_initial') {
        const status = acceptance(this, s);
        requireThat(
          status.eligible,
          422,
          'challenge_incomplete',
          'Challenge-Nachweise fehlen: ' + status.issues.join(', '),
        );
      }
      const version: Snapshot = {
        id: id(),
        ...(p.publishedVersionId
          ? { parentVersionId: p.publishedVersionId, reviewProposalId: s.improvement?.proposalId }
          : {}),
        processId,
        sessionId: s.id,
        contentHash: input.contentHash,
        ...this.content(s),
        confirmationIds: input.confirmationIds,
        usage: 'exercise_only',
        acceptanceProfile: p.acceptanceProfile,
        revoked: false,
      };
      this.store.put('versions', version, ownerId, s.id);
      p.publishedVersionId = version.id;
      this.store.put('processes', p, ownerId, s.id);
      s.state = 'published';
      this.saveSession(s);
      return version;
    });
  }
  newCase(ownerId: string, sessionId: string, facts: Facts) {
    const s = this.session(sessionId, ownerId);
    requireThat(
      facts.verificationStatus === null,
      403,
      'verification',
      'Verifikation darf nicht selbst gesetzt werden.',
    );
    const c: Case = {
      id: id(),
      sessionId: s.id,
      ownerId,
      facts,
      recordRevision: 1,
      factsRevision: 1,
      status: 'draft',
    };
    return this.store.put('cases', c, ownerId, s.id);
  }
  patchCase(
    ownerId: string,
    caseId: string,
    facts: Facts,
    recordRevision: number,
    factsRevision: number,
  ) {
    return this.store.tx(() => {
      const c = this.owned<Case>('cases', caseId, ownerId);
      requireThat(
        c.recordRevision === recordRevision && c.factsRevision === factsRevision,
        409,
        'recheck',
        'Fall inzwischen geändert.',
      );
      requireThat(
        facts.verificationStatus === c.facts.verificationStatus,
        403,
        'verification',
        'Learner darf keine Verifikation setzen.',
      );
      if (hash(c.facts) !== hash(facts)) {
        c.facts = { ...facts, verificationStatus: null };
        c.factsRevision++;
      }
      c.recordRevision++;
      return this.store.put('cases', c, ownerId, c.sessionId);
    });
  }
  exercise(ownerId: string, versionId: string, caseId: string, type: Run['type']) {
    const v = this.store.get<Snapshot>('versions', versionId);
    requireThat(v && !v.revoked, 422, 'version', 'Version fehlt oder widerrufen.');
    this.session(v.sessionId, ownerId);
    const c = this.owned<Case>('cases', caseId, ownerId);
    requireThat(c.sessionId === v.sessionId, 403, 'scope', 'Fall gehört nicht zum Prozess.');
    const r: Run = {
      id: id(),
      ownerId,
      versionId,
      contentHash: v.contentHash,
      scopeId: v.scopeId,
      caseId,
      type,
      capabilities: ['sandbox_decide'],
      firstAttempt: null,
      assistance: [],
    };
    return this.store.put('runs', r, ownerId, v.sessionId);
  }
  context(ownerId: string, runId: string) {
    const r = this.owned<Run>('runs', runId, ownerId),
      v = this.store.get<Snapshot>('versions', r.versionId);
    requireThat(
      v && !v.revoked && v.contentHash === r.contentHash,
      422,
      'revoked',
      'Version nicht nutzbar.',
    );
    const c = this.owned<Case>('cases', r.caseId, ownerId);
    return {
      runId: r.id,
      versionId: v.id,
      contentHash: v.contentHash,
      scopeId: v.scopeId,
      sourceMode: v.sourceMode,
      facts: c.facts,
      claims: r.type === 'independent' && !r.firstAttempt ? [] : v.claims,
      rules: r.type === 'independent' && !r.firstAttempt ? [] : v.rules,
    };
  }
  attempt(ownerId: string, runId: string, action: Action, reason: string) {
    return this.store.tx(() => {
      const r = this.owned<Run>('runs', runId, ownerId);
      requireThat(!r.firstAttempt, 409, 'attempt', 'Erstentscheidung bereits erfasst.');
      r.firstAttempt = { action, reason };
      this.store.put('runs', r, ownerId);
      return r;
    });
  }
  action(
    ownerId: string,
    caseId: string,
    input: {
      exerciseRunId: string;
      action: Action;
      expectedRecordRevision: number;
      expectedFactsRevision: number;
      versionId: string;
      idempotencyKey: string;
    },
  ) {
    return this.store.tx(() => {
      const actionId = hash({ ownerId, caseId, key: input.idempotencyKey });
      const old = this.store.get<{ id: string; payloadHash: string; result: unknown }>(
        'actions',
        actionId,
      );
      if (old) {
        requireThat(
          old.payloadHash === hash(input),
          409,
          'idempotency',
          'Schlüssel mit anderem Payload.',
        );
        return old.result;
      }
      const r = this.owned<Run>('runs', input.exerciseRunId, ownerId);
      requireThat(
        r.caseId === caseId && r.versionId === input.versionId,
        403,
        'scope',
        'Run/Fall/Version passen nicht.',
      );
      requireThat(r.firstAttempt, 422, 'attempt', 'Erstentscheidung und Begründung fehlen.');
      const c = this.owned<Case>('cases', caseId, ownerId);
      requireThat(
        c.recordRevision === input.expectedRecordRevision &&
          c.factsRevision === input.expectedFactsRevision,
        409,
        'recheck',
        'Fall inzwischen geändert.',
      );
      const v = this.store.get<Snapshot>('versions', r.versionId);
      requireThat(
        v && !v.revoked && v.contentHash === r.contentHash,
        409,
        'revoked',
        'Version widerrufen.',
      );
      const started = performance.now();
      const result = gate(v.rules, input.action, c.facts, r.capabilities);
      this.store.put(
        'metrics',
        {
          id: id(),
          kind: 'gate_interpreter',
          durationMs: performance.now() - started,
          outcome: result.outcome,
          versionId: v.id,
        },
        ownerId,
        c.sessionId,
      );
      const committed = result.outcome === 'allowed';
      if (committed) {
        c.status =
          input.action === 'approve' ? 'approved' : input.action === 'hold' ? 'held' : 'escalated';
        c.recordRevision++;
        this.store.put('cases', c, ownerId, c.sessionId);
      } else {
        r.assistance.push('gate_intervention');
        this.store.put('runs', r, ownerId, c.sessionId);
      }
      const response = {
        ...result,
        committed,
        recordRevision: c.recordRevision,
        factsRevision: c.factsRevision,
        versionId: v.id,
      };
      this.store.put(
        'actions',
        { id: actionId, payloadHash: hash(input), result: response },
        ownerId,
        c.sessionId,
      );
      return response;
    });
  }
  evidence(ownerId: string, evidenceId: string) {
    const seg = this.store.get<Segment>('segments', evidenceId);
    if (seg) {
      this.session(
        this.store.db.prepare('SELECT session_id FROM segments WHERE id=?').get(evidenceId)
          ?.session_id as string,
        ownerId,
      );
      return { kind: 'transcript', ...seg };
    }
    const e = this.store.get<ScreenEvent>('events', evidenceId);
    if (e) {
      const a = this.owned<Asset>('assets', e.frameId, ownerId);
      return { kind: 'screen', ...e, assetId: a.id };
    }
    return this.owned<Asset>('assets', evidenceId, ownerId);
  }
  // A local owner can also play the learner. Reading owner knowledge is help,
  // and cannot precede an independent first decision in that browser scope.
  knowledgeAccess(ownerId: string) {
    this.store.tx(() => {
      const runs = this.store
        .list<Run & { decisions?: { committed: boolean }[] }>('runs')
        .filter(
          (r) =>
            r.ownerId === ownerId &&
            r.type === 'independent' &&
            !r.decisions?.at(-1)?.committed &&
            !this.store.get<Snapshot>('versions', r.versionId)?.revoked,
        );
      requireThat(
        runs.every((r) => r.firstAttempt),
        409,
        'independent',
        'Zuerst unabhängige Erstentscheidung speichern; Owner-Wissen ist Hilfe.',
      );
      for (const r of runs) {
        if (!r.assistance.includes('owner_knowledge')) {
          r.assistance.push('owner_knowledge');
          const v = this.store.get<Snapshot>('versions', r.versionId)!;
          this.store.put('runs', r, ownerId, v.sessionId);
        }
      }
    });
  }
  private deleteAsset(s: Session, a: Asset) {
    try {
      if (a.file) unlinkSync(a.file);
      this.store.delete('assets', a.id);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') this.store.delete('assets', a.id);
      else {
        a.retired = true;
        s.localCleanup = 'failed';
        this.store.put('assets', a, s.ownerId, s.id);
      }
    }
  }
  // Conservative session dependency closure: reviewed derivatives require new
  // review after removal. Keep historical identities/hashes, never quote copies.
  redactDerived(s: Session) {
    new A4(this).archiveResults(s.ownerId, s.id);
    for (const v of this.store.list<Snapshot>('versions', s.id)) {
      v.revoked = true;
      v.claims = [];
      v.rules = [];
      v.workflow = { steps: [], edges: [] };
      v.gaps = [];
      v.questions = [];
      v.elicitation = emptyElicitation();
      this.store.put('versions', v, s.ownerId, s.id);
      const binding = this.store.get<{ id: string; status: string; deviations: string[] }>(
        'bindings',
        v.id,
      );
      if (binding) {
        binding.status = 'failed';
        binding.deviations = ['Source revoked; provider cleanup not verified'];
        this.store.put('bindings', binding, s.ownerId, s.id);
      }
    }
    for (const table of ['proposals', 'evaluations', 'optimizations', 'confirmations'] as const)
      for (const item of this.store.list<{ id: string }>(table, s.id))
        this.store.delete(table, item.id);
    for (const r of this.store.list<Run & { reasonReview?: { note: string } }>('runs', s.id)) {
      if (r.firstAttempt) r.firstAttempt.reason = '[Quellen entfernt · Text redaktiert]';
      if (r.reasonReview) r.reasonReview.note = '[Quellen entfernt · Text redaktiert]';
      this.store.put('runs', r, s.ownerId, s.id);
    }
    for (const op of this.store.list<Operation>('operations', s.id)) {
      op.status = 'cancelled';
      op.payload = null;
      op.error = null;
      this.store.put('operations', op, s.ownerId, s.id);
    }
    // Synthesized teach-back also contains source-derived speech.
    for (const asset of this.store
      .list<Asset>('assets', s.id)
      .filter((a) => a.kind === 'teachback')) {
      this.deleteAsset(s, asset);
    }
    s.providerCleanup = 'not_verified';
    s.epoch++;
    if (s.state === 'capture' || s.state === 'debrief') s.resumeState = s.state;
    s.state = 'off_record';
    s.draft = {
      revision: s.draft.revision + 1,
      lastProcessedSegmentSequence: 0,
      claims: [],
      rules: [],
      gaps: [],
      answerLinks: [],
    };
    s.questions = [];
    s.elicitation = emptyElicitation();
    s.teachback = null;
    s.improvement = undefined;
  }
  reset(ownerId: string, processId: string) {
    const p = this.owned<Process>('processes', processId, ownerId);
    return this.store.tx(() => {
      const cleanup = this.discardSession(ownerId, p.sessionId);
      return {
        ...cleanup,
        ...this.create(ownerId, p.title, 'live', p.acceptanceProfile),
        previousProcessId: p.id,
        providerCleanup: 'not_verified',
      };
    });
  }
  removeSource(ownerId: string, segmentId: string) {
    return this.store.tx(() => {
      const seg = this.store.get<Segment>('segments', segmentId);
      requireThat(seg, 403, 'scope', 'Quelle fehlt.');
      const row = this.store.db
        .prepare('SELECT session_id FROM segments WHERE id=?')
        .get(segmentId);
      const s = this.session(row?.session_id as string, ownerId);
      if (seg.audioId) {
        const a = this.owned<Asset>('assets', seg.audioId, ownerId);
        this.deleteAsset(s, a);
      }
      this.store.delete('segments', segmentId);
      this.redactDerived(s);
      this.saveSession(s);
      return {
        revoked: true,
        localCleanup: s.localCleanup || 'complete',
        providerCleanup: 'not_verified',
      };
    });
  }
  exportSession(ownerId: string, sessionId: string) {
    const s = this.session(sessionId, ownerId);
    return {
      schemaVersion: 1,
      manifest: {
        sessionId: s.id,
        processId: s.processId,
        sourceMode: s.sourceMode,
        usage: 'exercise_only',
      },
      session: s,
      events: this.store.list('events', s.id),
      segments: this.store.list('segments', s.id),
      versions: this.store.list('versions', s.id),
      results: this.store.list('actions', s.id),
      assets: this.store
        .list<Asset>('assets', s.id)
        .filter((a) => !a.retired)
        .map((a) => ({
          id: a.id,
          kind: a.kind,
          mime: a.mime,
          atMs: a.atMs,
          originalMarker: a.originalMarker,
          originalCaseId: a.originalCaseId,
          base64: this.bytes(a).toString('base64'),
        })),
    };
  }
  discardSession(ownerId: string, sessionId: string) {
    return this.store.tx(() => {
      const s = this.session(sessionId, ownerId);
      s.localCleanup = 'complete';
      this.redactDerived(s);
      for (const table of ['segments', 'events'] as const)
        for (const item of this.store.list<{ id: string }>(table, s.id))
          this.store.delete(table, item.id);
      for (const asset of this.store.list<Asset>('assets', s.id)) this.deleteAsset(s, asset);
      this.saveSession(s);
      return { discarded: true, localCleanup: s.localCleanup, providerCleanup: 'not_verified' };
    });
  }
}
