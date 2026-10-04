import { randomUUID } from 'node:crypto';
import type { Blueprint } from './service';
import type { Draft, Segment, ScreenEvent, Session } from '../domain/contracts';
import {
  ActivitySchema,
  CandidateSchema,
  emptyElicitation,
  priorities,
  releaseDecision,
  selectDebriefTopics,
  topicKey,
  type Counterfactual,
  type Question,
} from '../domain/elicitation';
import { hash } from '../domain/hash';
import { requireThat } from './errors';

export function validateAnswerLink(app: Blueprint, s: Session, link: Draft['answerLinks'][number]) {
  const q = s.questions.find((q) => q.id === link.questionId);
  requireThat(
    q && q.status === 'completed' && q.spokenAtMs !== null,
    422,
    'question_unspoken',
    'Frage nicht vollständig gesprochen.',
  );
  requireThat(
    link.segmentIds.length && link.claimIds.length && link.gapIds.length,
    422,
    'answer_link',
    'Antwort braucht Segment, Claim und Gap.',
  );
  const segments = app.store.list<Segment>('segments', s.id);
  for (const sid of link.segmentIds) {
    const segment = segments.find((x) => x.id === sid);
    requireThat(
      segment &&
        segment.caseId === q.caseId &&
        segment.epoch === q.epoch &&
        (segment.phase || 'live') === q.phase &&
        segment.atMs >= q.spokenAtMs &&
        segment.source === 'expert_statement',
      422,
      'answer_scope',
      'Antwort gehört nicht zu Phase/Fall/Frage.',
    );
  }
  for (const cid of link.claimIds) {
    const claim = s.draft.claims.find((c) => c.id === cid);
    requireThat(
      claim &&
        link.segmentIds.includes(claim.segmentId) &&
        claim.eventIds.some((e) => q.eventIds.includes(e)) &&
        !s.draft.claims.some((c) => c.supersedesClaimId === cid),
      422,
      'answer_claim',
      'Claim belegt diese Antwort nicht oder wurde korrigiert.',
    );
  }
  requireThat(
    link.segmentIds.every((id) =>
      link.claimIds.some((cid) => s.draft.claims.find((c) => c.id === cid)?.segmentId === id),
    ) &&
      link.gapIds.every(
        (id) =>
          q.gapIds.includes(id) &&
          s.draft.gaps.some(
            (g) =>
              g.id === id &&
              g.status !== 'conflict_open' &&
              g.claimIds.some((cid) => link.claimIds.includes(cid)),
          ),
      ),
    422,
    'answer_gap',
    'Antwort belegt die referenzierte Lücke nicht.',
  );
  return q;
}
export function answerLinkHash(s: Session, link: Draft['answerLinks'][number]) {
  return hash({
    link,
    claims: s.draft.claims.filter((c) => link.claimIds.includes(c.id)),
    gaps: s.draft.gaps
      .filter((g) => link.gapIds.includes(g.id))
      .map((g) => ({ id: g.id, topic: g.topic, claimIds: g.claimIds })),
  });
}
function usesReceipt(p: import('../domain/contracts').Predicate): boolean {
  return p.kind === 'compare' || p.kind === 'presence'
    ? p.field === 'goodsReceiptConfirmed'
    : p.items.some(usesReceipt);
}
export function acceptance(app: Blueprint, s: Session) {
  const e = s.elicitation || emptyElicitation();
  const links = s.draft.answerLinks
    .filter(
      (l) =>
        l.confirmed &&
        e.learningEvents.some(
          (event) => event.linkId === l.id && event.linkHash === answerLinkHash(s, l),
        ),
    )
    .filter((l) => {
      try {
        validateAnswerLink(app, s, l);
        return true;
      } catch {
        return false;
      }
    });
  const answered = s.questions.filter(
    (q) => q.status === 'completed' && links.some((l) => l.questionId === q.id),
  );
  const live = [
    ...new Map(answered.filter((q) => q.phase === 'live').map((q) => [q.topicKey, q])).values(),
  ];
  const learned = e.learningEvents.filter(
    (event) =>
      links.some((l) => l.id === event.linkId && answerLinkHash(s, l) === event.linkHash) &&
      s.draft.gaps.some(
        (g) => g.id === event.gapId && ['provisionally_answered', 'confirmed'].includes(g.status),
      ),
  );
  const debriefTopics = [
    ...new Set(
      learned
        .filter((l) => l.phase === 'debrief' && !e.knownTopicsAtDebrief.includes(l.topicKey))
        .map((l) => l.topicKey),
    ),
  ];
  const debriefAnswers = new Set(
    learned
      .filter((l) => l.phase === 'debrief' && !e.knownTopicsAtDebrief.includes(l.topicKey))
      .map((l) => l.questionId),
  ).size;
  const guardrail = live.some(
    (q) =>
      q.kind === 'guardrail' &&
      links
        .filter((l) => l.questionId === q.id)
        .some((l) =>
          s.draft.rules.some(
            (r) =>
              r.effect.kind === 'prohibit' && r.claimIds.some((cid) => l.claimIds.includes(cid)),
          ),
        ),
  );
  const counterfactual = e.counterfactuals.some(
    (c) =>
      answered.some((q) => q.id === c.questionId && q.phase === 'debrief') &&
      (c.classification === 'confirming_test' ||
        links
          .filter((l) => l.questionId === c.questionId)
          .some((l) =>
            s.draft.rules.some(
              (r) => usesReceipt(r.when) && r.claimIds.some((cid) => l.claimIds.includes(cid)),
            ),
          )),
  );
  const issues = [
    ...(s.sourceMode !== 'live' ? ['live_sources_required'] : []),
    ...(live.length < 3 ? ['three_live_answers_required'] : []),
    ...(debriefAnswers < 3 ? ['three_new_debrief_answers_required'] : []),
    ...(debriefTopics.length < 3 ? ['three_new_debrief_topics_required'] : []),
    ...(!guardrail ? ['guardrail_answer_required'] : []),
    ...(!counterfactual ? ['counterfactual_answer_required'] : []),
    ...(!s.teachback?.spoken || s.teachback.hash !== app.contentHash(s)
      ? ['current_spoken_teachback_required']
      : []),
    ...(s.draft.gaps.some(
      (g) => g.critical && !['provisionally_answered', 'confirmed'].includes(g.status),
    )
      ? ['critical_gaps_open']
      : []),
  ];
  return {
    liveAnswers: live.length,
    debriefAnswers,
    debriefTopics,
    guardrail,
    counterfactual,
    issues,
    eligible: issues.length === 0,
  };
}
export class ElicitationService {
  constructor(public app: Blueprint) {}
  status(ownerId: string, sessionId: string) {
    return acceptance(this.app, this.app.session(sessionId, ownerId));
  }
  planInput(ownerId: string, sessionId: string) {
    const s = this.app.session(sessionId, ownerId);
    requireThat(['capture', 'debrief'].includes(s.state), 409, 'state', 'Keine Interviewphase.');
    const events = this.app.store
      .list<ScreenEvent>('events', s.id)
      .filter((e) => s.state === 'debrief' || e.epoch === s.epoch)
      .sort((a, b) => a.sequence - b.sequence);
    const latest = events.at(-1);
    requireThat(latest, 422, 'event', 'Kein aktueller ScreenEvent.');
    const gaps =
      s.state === 'debrief'
        ? selectDebriefTopics(s.draft, s.elicitation.knownTopicsAtDebrief)
        : s.draft.gaps.filter((g) => ['open', 'conflict_open'].includes(g.status));
    return {
      epoch: s.epoch,
      draftRevision: s.draft.revision,
      phase: s.state === 'capture' ? 'live' : 'debrief',
      events: [latest],
      draft: s.draft,
      eligibleGaps: gaps,
      askedTopics: s.questions.filter((q) => q.status === 'completed').map((q) => q.topicKey),
    };
  }
  candidate(
    ownerId: string,
    sessionId: string,
    input: unknown,
    expectedEpoch: number,
    expectedRevision: number,
    now = Date.now(),
  ) {
    return this.app.store.tx(() => {
      const s = this.app.session(sessionId, ownerId),
        candidate = CandidateSchema.parse(input);
      requireThat(
        s.epoch === expectedEpoch && s.draft.revision === expectedRevision,
        409,
        'stale_candidate',
        'Fragenplanung veraltet.',
      );
      requireThat(['capture', 'debrief'].includes(s.state), 409, 'state', 'Interview beendet.');
      const phase = s.state === 'capture' ? 'live' : 'debrief';
      const events = this.app.store.list<ScreenEvent>('events', s.id);
      const latest = events
        .filter((e) => phase === 'debrief' || e.epoch === s.epoch)
        .sort((a, b) => a.sequence - b.sequence)
        .at(-1);
      requireThat(
        latest &&
          latest.caseId === candidate.caseId &&
          candidate.eventIds.includes(latest.id) &&
          candidate.eventIds.every((id) =>
            events.some(
              (e) =>
                e.id === id &&
                (phase === 'debrief' || e.epoch === s.epoch) &&
                e.caseId === candidate.caseId,
            ),
          ),
        422,
        'question',
        'Frage ohne aktuellen Fall/Event.',
      );
      requireThat(
        phase !== 'live' || now - s.startedAt - latest.atMs <= 5000,
        422,
        'stale_context',
        'Screenkontext veraltet.',
      );
      requireThat(
        candidate.gapIds.every((id) =>
          s.draft.gaps.some((g) => g.id === id && ['open', 'conflict_open'].includes(g.status)),
        ),
        422,
        'question',
        'Thema bereits beantwortet oder unbekannt.',
      );
      requireThat(
        phase !== 'debrief' || candidate.gapIds.length > 0,
        422,
        'debrief_gap',
        'Debrief braucht eine echte Lücke.',
      );
      requireThat(
        candidate.kind !== 'counterfactual' || phase === 'debrief',
        422,
        'counterfactual',
        'Gegenfall nur im Debrief.',
      );
      const key = candidate.gapIds.length
        ? topicKey(s.draft.gaps.find((g) => g.id === candidate.gapIds[0])!.topic)
        : topicKey(candidate.topicKey);
      requireThat(
        topicKey(candidate.topicKey) === key,
        422,
        'topic',
        'Topic-Key stimmt nicht mit Gap überein.',
      );
      requireThat(
        !s.draft.gaps.some(
          (g) =>
            topicKey(g.topic) === key && ['confirmed', 'provisionally_answered'].includes(g.status),
        ),
        422,
        'answered_topic',
        'Thema schon beantwortet.',
      );
      requireThat(
        !s.questions.some(
          (q) =>
            q.topicKey === key && ['released', 'transcript_seen', 'completed'].includes(q.status),
        ),
        409,
        'repeat_topic',
        'Thema schon gefragt; Zuordnung prüfen.',
      );
      if (phase === 'debrief')
        requireThat(
          !s.elicitation.knownTopicsAtDebrief.includes(key),
          422,
          'known_topic',
          'Kein neues Debrief-Thema.',
        );
      for (const q of s.questions.filter((q) => ['planned', 'deferred'].includes(q.status)))
        q.status = 'cancelled';
      const q: Question = {
        ...candidate,
        topicKey: key,
        id: randomUUID(),
        phase,
        epoch: s.epoch,
        draftRevision: s.draft.revision,
        createdAt: now,
        expiresAt: now + 30000,
        priority: priorities[candidate.kind],
        status: 'planned',
        releasedAt: null,
        spokenAtMs: null,
        transcript: null,
      };
      s.questions.push(q);
      this.app.saveSession(s);
      return q;
    });
  }
  release(
    ownerId: string,
    sessionId: string,
    questionId: string,
    activity: unknown,
    now = Date.now(),
  ) {
    return this.app.store.tx(() => {
      const s = this.app.session(sessionId, ownerId),
        q = s.questions.find((q) => q.id === questionId);
      requireThat(q, 422, 'question', 'Frage fehlt.');
      requireThat(
        ['planned', 'deferred'].includes(q.status),
        409,
        'question_status',
        'Frage bereits ausgelöst/geschlossen.',
      );
      const decision = releaseDecision(
        q,
        s,
        this.app.store.list('events', s.id),
        ActivitySchema.parse(activity),
        now,
      );
      q.status =
        decision === 'release' ? 'released' : decision === 'discard' ? 'cancelled' : 'deferred';
      if (decision === 'release') q.releasedAt = now;
      this.app.saveSession(s);
      return { decision, question: q };
    });
  }
  speech(
    ownerId: string,
    sessionId: string,
    questionId: string,
    epoch: number,
    outcome: 'transcript_seen' | 'completed' | 'interrupted',
    transcript: string,
    now = Date.now(),
  ) {
    return this.app.store.tx(() => {
      const s = this.app.session(sessionId, ownerId),
        q = s.questions.find((q) => q.id === questionId);
      requireThat(
        q &&
          q.epoch === epoch &&
          s.epoch === epoch &&
          (q.phase === 'live' ? s.state === 'capture' : s.state === 'debrief'),
        409,
        'epoch',
        'Frage gehört zu geschlossener Phase.',
      );
      requireThat(
        ['released', 'transcript_seen'].includes(q.status) ||
          (outcome === 'interrupted' && q.status === 'completed'),
        409,
        'question_status',
        'Frage nicht zum Sprechen freigegeben.',
      );
      const text = topicKey(transcript).replace(/[.,!?;:]/g, '');
      requireThat(
        text === topicKey(q.question).replace(/[.,!?;:]/g, ''),
        422,
        'speech_mismatch',
        'Agent-Ausgabe entspricht nicht der freigegebenen Frage.',
      );
      q.transcript = transcript;
      q.status = outcome;
      if (outcome === 'completed') q.spokenAtMs = now - s.startedAt;
      if (outcome === 'interrupted') {
        q.spokenAtMs = null;
        s.teachback = null;
      }
      this.app.saveSession(s);
      return q;
    });
  }
  cancel(ownerId: string, sessionId: string, questionId: string, epoch: number) {
    return this.app.store.tx(() => {
      const s = this.app.session(sessionId, ownerId),
        q = s.questions.find((q) => q.id === questionId);
      requireThat(
        q && q.epoch === epoch && s.epoch === epoch && ['capture', 'debrief'].includes(s.state),
        409,
        'epoch',
        'Alte Frage/Epoche.',
      );
      requireThat(
        q.status !== 'interrupted' &&
          !s.draft.answerLinks.some((l) => l.questionId === q.id && l.confirmed),
        409,
        'question_status',
        'Frage schon beantwortet/abgeschlossen.',
      );
      q.status = q.status === 'completed' ? 'unanswered' : 'cancelled';
      return this.app.saveSession(s);
    });
  }
  assign(
    ownerId: string,
    sessionId: string,
    linkId: string,
    expectedRevision: number,
    input: Pick<Draft['answerLinks'][number], 'segmentIds' | 'claimIds' | 'gapIds'>,
  ) {
    return this.app.store.tx(() => {
      const s = this.app.session(sessionId, ownerId);
      requireThat(
        ['capture', 'debrief', 'review'].includes(s.state),
        409,
        'state',
        'Antwortzuordnung nur im Interview/Review.',
      );
      requireThat(s.draft.revision === expectedRevision, 409, 'stale_draft', 'Draft geändert.');
      const link = s.draft.answerLinks.find((l) => l.id === linkId);
      requireThat(link, 422, 'link', 'Zuordnung fehlt.');
      const oldProof = answerLinkHash(s, link);
      Object.assign(link, {
        segmentIds: input.segmentIds,
        claimIds: input.claimIds,
        gapIds: input.gapIds,
        confirmed: true,
      });
      const q = validateAnswerLink(this.app, s, link);
      if (
        oldProof === answerLinkHash(s, link) &&
        s.elicitation.learningEvents.some((e) => e.linkId === link.id && e.linkHash === oldProof)
      )
        return s;
      s.elicitation ||= emptyElicitation();
      s.elicitation.learningEvents = s.elicitation.learningEvents.filter(
        (e) => e.linkId !== link.id,
      );
      for (const gid of link.gapIds) {
        const gap = s.draft.gaps.find((g) => g.id === gid)!;
        gap.status = 'provisionally_answered';
        s.elicitation.learningEvents.push({
          id: randomUUID(),
          questionId: q.id,
          linkId: link.id,
          linkHash: answerLinkHash(s, link),
          gapId: gid,
          topicKey: topicKey(gap.topic),
          phase: q.phase,
          draftRevision: s.draft.revision + 1,
          atMs: Date.now() - s.startedAt,
        });
      }
      s.draft.revision++;
      s.teachback = null;
      if (s.state === 'review') s.state = 'debrief';
      return this.app.saveSession(s);
    });
  }
  counterfactual(ownerId: string, sessionId: string, questionId: string, baseEventId: string) {
    return this.app.store.tx(() => {
      const s = this.app.session(sessionId, ownerId),
        q = s.questions.find((q) => q.id === questionId);
      requireThat(
        s.state === 'debrief' && q?.phase === 'debrief' && q.kind === 'counterfactual',
        422,
        'counterfactual',
        'Debrief-Gegenfrage erforderlich.',
      );
      const e = this.app.store.list<ScreenEvent>('events', s.id).find((e) => e.id === baseEventId);
      requireThat(
        e &&
          q.eventIds.includes(e.id) &&
          e.caseId === q.caseId &&
          e.facts.goodsReceiptConfirmed !== null,
        422,
        'counterfactual',
        'Belegter Ausgangsfall fehlt.',
      );
      const already = s.elicitation.counterfactuals.find((c) => c.questionId === questionId);
      if (already) return already;
      requireThat(
        ['planned', 'deferred'].includes(q.status),
        409,
        'counterfactual_late',
        'Gegenfall vor der Sprechfreigabe vorbereiten.',
      );
      const c: Counterfactual = {
        id: randomUUID(),
        questionId,
        baseEventId,
        caseId: e.caseId,
        changedField: 'goodsReceiptConfirmed',
        facts: { ...e.facts, goodsReceiptConfirmed: !e.facts.goodsReceiptConfirmed },
        classification: s.draft.rules.some((r) => usesReceipt(r.when))
          ? 'confirming_test'
          : 'open_condition',
      };
      s.elicitation.counterfactuals.push(c);
      this.app.saveSession(s);
      return c;
    });
  }
}
