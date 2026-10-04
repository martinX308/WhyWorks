import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../src/adapters/store';
import { Blueprint } from '../src/application/service';
import { ElicitationService, acceptance } from '../src/application/elicitation';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { rankCandidates, selectDebriefTopics } from '../src/domain/elicitation';
import { hash } from '../src/domain/hash';
import { testFacts, learnedPatch, testWords } from './fixtures';
import type { Candidate, Activity, Question } from '../src/domain/elicitation';
import type { Patch } from '../src/domain/contracts';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());
function setup(
  profile: 'challenge_initial' | 'technical_spike' = 'challenge_initial',
  file?: string,
) {
  const store = new Store(file),
    app = new Blueprint(store),
    elicitation = new ElicitationService(app);
  const { session, process } = app.create('owner', 'A2 ohne Provider', 'live', profile);
  app.state(session.id, 'owner', 'capture', session.epoch);
  const get = () => app.session(session.id, 'owner');
  let sequence = 0,
    segmentSequence = 0;
  function event(caseId = 'demo') {
    const s = get();
    if (s.state === 'debrief') return 'ev-' + sequence;
    const id = 'ev-' + ++sequence,
      frameId = 'frame-' + sequence;
    store.put(
      'assets',
      { id: frameId, ownerId: 'owner', sessionId: s.id, epoch: s.epoch, kind: 'frame', caseId },
      'owner',
      s.id,
    );
    app.observations(
      'owner',
      s.id,
      [
        {
          id,
          frameId,
          sequence,
          epoch: s.epoch,
          atMs: Date.now() - s.startedAt,
          caseId,
          source: 'screen_observation',
          facts: testFacts,
        },
      ],
      [],
    );
    return id;
  }
  function segment(text: string, phase: 'live' | 'debrief' = 'live', caseId = 'demo') {
    const s = get(),
      id = 'seg-' + ++segmentSequence;
    app.observations(
      'owner',
      s.id,
      [],
      [
        {
          id,
          sequence: segmentSequence,
          epoch: s.epoch,
          atMs: Date.now() - s.startedAt,
          endMs: Date.now() - s.startedAt + 10,
          caseId,
          phase,
          source: 'expert_statement',
          text,
          committed: true,
          audioId: null,
          timing: 'audio_unavailable',
        },
      ],
    );
    return id;
  }
  const eid = event(),
    words = testWords(),
    sid = segment(words);
  app.applyPatch('owner', session.id, get().epoch, learnedPatch(words, eid, sid), segmentSequence);
  const topics = [
    'toleranz',
    'stopgrund',
    'freigabe',
    'ausnahme',
    'wareneingang-gegenfall',
    'eskalation',
  ];
  app.applyPatch(
    'owner',
    session.id,
    get().epoch,
    {
      baseDraftRevision: get().draft.revision,
      claims: [],
      rules: [],
      answerLinks: [],
      gaps: topics.map((topic, i) => ({
        id: 'gap-' + i,
        topic,
        critical: false,
        status: 'open',
        claimIds: [],
      })),
    },
    segmentSequence,
  );
  const activity = (): Activity => ({
    recordedAt: Date.now(),
    lastActivityAt: Date.now() - 3000,
    screenStableSince: Date.now() - 2000,
    expertSpeaking: false,
    agentSpeaking: false,
    boundary: 'explicit_request',
  });
  function candidate(index: number, kind: Candidate['kind'] = 'reason', eventId = event()) {
    const s = get();
    return elicitation.candidate(
      'owner',
      s.id,
      {
        question: 'Warum ' + topics[index] + '?',
        gapIds: ['gap-' + index],
        eventIds: [eventId],
        caseId: 'demo',
        topicKey: topics[index],
        kind,
      },
      s.epoch,
      s.draft.revision,
    );
  }
  function answer(q: Question, index: number, eventId = q.eventIds[0]) {
    vi.advanceTimersByTime(1000);
    const text = 'Erklärung ' + topics[index],
      sid = segment(text, q.phase),
      s = get();
    const patch: Patch = {
      baseDraftRevision: s.draft.revision,
      claims: [
        {
          id: 'claim-' + index,
          segmentId: sid,
          eventIds: [eventId],
          start: 0,
          end: text.length,
          quote: text,
          meaning: text,
          origin: 'expert_statement',
          review: 'draft',
          supersedesClaimId: null,
        },
      ],
      rules:
        index === 1
          ? [
              {
                ...s.draft.rules[0],
                claimIds: [...s.draft.rules[0].claimIds, 'claim-' + index],
                evidenceIds: [...s.draft.rules[0].evidenceIds, sid, eventId],
              },
            ]
          : [],
      gaps: [
        {
          id: 'gap-' + index,
          topic: topics[index],
          critical: false,
          status: 'provisionally_answered',
          claimIds: ['claim-' + index],
        },
      ],
      answerLinks: [
        {
          questionId: q.id,
          segmentIds: [sid],
          claimIds: ['claim-' + index],
          gapIds: ['gap-' + index],
          confirmed: false,
        },
      ],
    };
    app.applyPatch('owner', s.id, s.epoch, patch, segmentSequence);
    const next = get(),
      link = next.draft.answerLinks.at(-1)!;
    elicitation.assign('owner', s.id, link.id, next.draft.revision, link);
    return get().draft.answerLinks.at(-1)!;
  }
  function complete(index: number, kind: Candidate['kind'] = 'reason') {
    vi.advanceTimersByTime(31000);
    const q = candidate(index, kind);
    if (kind === 'counterfactual')
      elicitation.counterfactual('owner', session.id, q.id, q.eventIds[0]);
    expect(elicitation.release('owner', session.id, q.id, activity()).decision).toBe('release');
    elicitation.speech('owner', session.id, q.id, get().epoch, 'transcript_seen', q.question);
    elicitation.speech('owner', session.id, q.id, get().epoch, 'completed', q.question);
    return q;
  }
  function fullInterview() {
    for (let i = 0; i < 3; i++) answer(complete(i, i === 1 ? 'guardrail' : 'condition'), i);
    app.state(session.id, 'owner', 'drafting', get().epoch);
    app.state(session.id, 'owner', 'debrief', get().epoch);
    for (let i = 3; i < 6; i++) {
      const q = complete(i, i === 4 ? 'counterfactual' : 'exception');
      answer(q, i);
    }
  }
  function review() {
    app.state(session.id, 'owner', 'teachback', get().epoch);
    const s = get();
    s.teachback = {
      hash: app.contentHash(s),
      text: 'Test-Teach-back',
      audioId: 'test-audio',
      spoken: true,
    };
    app.saveSession(s);
    app.state(session.id, 'owner', 'review', get().epoch);
  }
  function publish() {
    const s = get(),
      contentHash = app.contentHash(s);
    const confirmationIds = (
      ['assignment', 'representation', 'domain_validity', 'version_release'] as const
    ).map((kind) => app.confirm('owner', s.id, kind, contentHash).id);
    return app.publish('owner', process.id, {
      expectedDraftRevision: s.draft.revision,
      scopeId: 'scope-spike',
      contentHash,
      confirmationIds,
    });
  }
  return {
    store,
    app,
    elicitation,
    get,
    session,
    process,
    event,
    segment,
    candidate,
    activity,
    answer,
    complete,
    fullInterview,
    review,
    publish,
  };
}

describe('A2: Scheduler, neue Lernereignisse und Challenge-Publish', () => {
  it('schließt drei Live- und drei neue Debrief-Themen mit Gegenfall, vier Bestätigungen und festem Snapshot', () => {
    const x = setup();
    x.fullInterview();
    x.review();
    expect(x.elicitation.status('owner', x.session.id)).toMatchObject({
      eligible: true,
      liveAnswers: 3,
      guardrail: true,
      counterfactual: true,
    });
    expect(x.get().elicitation.learningEvents).toHaveLength(6);
    expect(x.get().elicitation.counterfactuals[0]).toMatchObject({
      facts: { goodsReceiptConfirmed: false },
      classification: 'confirming_test',
    });
    const version = x.publish();
    expect(version.acceptanceProfile).toBe('challenge_initial');
    expect(x.store.list('versions')).toHaveLength(1);
    expect(version.contentHash).toBe(hash(x.app.content(x.get())));
  });
  it('blockiert fehlende Quoten trotz bestätigtem Teach-back; Spike behält eigenes Profil', () => {
    const x = setup();
    x.app.state(x.session.id, 'owner', 'drafting', x.get().epoch);
    x.app.state(x.session.id, 'owner', 'debrief', x.get().epoch);
    x.review();
    expect(() => x.publish()).toThrow('Challenge-Nachweise fehlen');
    expect(x.store.list('versions')).toHaveLength(0);
    const spike = setup('technical_spike');
    spike.app.state(spike.session.id, 'owner', 'drafting', spike.get().epoch);
    spike.app.state(spike.session.id, 'owner', 'debrief', spike.get().epoch);
    spike.review();
    expect(spike.publish().acceptanceProfile).toBe('technical_spike');
  });
  it('verschiebt bei Sprache, Aktivität, stillem Lesen und fehlendem/frischem Heartbeat; verwirft stale Kandidaten', () => {
    const x = setup(),
      q = x.candidate(0);
    for (const override of [
      { expertSpeaking: true },
      { agentSpeaking: true },
      { lastActivityAt: Date.now() },
      { screenStableSince: Date.now() },
      { boundary: 'none' },
      { recordedAt: Date.now() - 2001 },
      { recordedAt: Date.now() + 1 },
    ])
      expect(
        x.elicitation.release('owner', x.session.id, q.id, { ...x.activity(), ...override })
          .decision,
      ).toBe('defer');
    vi.advanceTimersByTime(30000);
    expect(x.elicitation.release('owner', x.session.id, q.id, x.activity()).decision).toBe(
      'discard',
    );
  });
  it('prüft Revision, Fall, Epoch und TTL erneut; alte Providerplanung überschreibt keinen aktuellen Draft', () => {
    const x = setup(),
      q = x.candidate(0),
      s = x.get();
    s.draft.revision++;
    x.app.saveSession(s);
    expect(x.elicitation.release('owner', s.id, q.id, x.activity()).decision).toBe('discard');
    expect(() =>
      x.elicitation.candidate('owner', s.id, q, s.epoch, s.draft.revision - 1),
    ).toThrow();
    const q2 = x.candidate(0);
    x.event('anderer-fall');
    expect(x.elicitation.release('owner', s.id, q2.id, x.activity()).decision).toBe('discard');
    const q3 = x.candidate(0);
    x.app.state(s.id, 'owner', 'off_record', s.epoch);
    expect(() =>
      x.elicitation.speech('owner', s.id, q3.id, s.epoch, 'completed', q3.question),
    ).toThrow('geschlossener Phase');
  });
  it('zählt Transkript, unterbrochene, unbeantwortete und spontane Agentfragen nicht als Live-Antwort', () => {
    const x = setup(),
      q = x.candidate(0);
    x.elicitation.release('owner', x.session.id, q.id, x.activity());
    expect(() =>
      x.elicitation.speech(
        'owner',
        x.session.id,
        q.id,
        x.get().epoch,
        'completed',
        'Andere Frage?',
      ),
    ).toThrow('entspricht nicht');
    x.elicitation.speech('owner', x.session.id, q.id, x.get().epoch, 'transcript_seen', q.question);
    expect(x.elicitation.status('owner', x.session.id).liveAnswers).toBe(0);
    x.elicitation.speech('owner', x.session.id, q.id, x.get().epoch, 'interrupted', q.question);
    expect(x.get().questions[0].spokenAtMs).toBeNull();
    expect(x.elicitation.status('owner', x.session.id).liveAnswers).toBe(0);
    expect(() => x.answer(q, 0)).toThrow('nicht vollständig gesprochen');
  });
  it('erzwingt 30 Sekunden Abstand und fünf Releases pro rollierenden zehn Minuten auch nach Reload', () => {
    const x = setup();
    const q = x.complete(0);
    x.answer(q, 0);
    const q2 = x.candidate(1);
    expect(
      new ElicitationService(new Blueprint(x.store)).release(
        'owner',
        x.session.id,
        q2.id,
        x.activity(),
      ).decision,
    ).toBe('defer');
    const s = x.get();
    s.questions = s.questions.filter((q) => q.id !== q2.id);
    for (let i = 0; i < 4; i++)
      s.questions.push({
        ...s.questions[0],
        id: 'count-' + i,
        topicKey: 'count-' + i,
        status: 'interrupted',
        releasedAt: Date.now() - 40000,
      });
    x.app.saveSession(s);
    vi.advanceTimersByTime(31000);
    const q3 = x.candidate(1);
    expect(x.elicitation.release('owner', s.id, q3.id, x.activity()).decision).toBe('defer');
    x.app.state(s.id, 'owner', 'off_record', x.get().epoch);
    vi.advanceTimersByTime(600000);
    x.app.state(s.id, 'owner', 'capture', x.get().epoch);
    const q4 = x.candidate(1);
    expect(x.elicitation.release('owner', s.id, q4.id, x.activity()).decision).toBe('release');
  });
  it('zählt bestätigte Zuordnung einmal; Mehrdeutigkeit und korrigierte Quellen bleiben offen', () => {
    const x = setup(),
      q = x.complete(0);
    const link = x.answer(q, 0);
    const s = x.get();
    x.elicitation.assign('owner', s.id, link.id, s.draft.revision, link);
    expect(x.get().elicitation.learningEvents).toHaveLength(1);
    const current = x.get();
    current.draft.claims.push({
      ...current.draft.claims.at(-1)!,
      id: 'correction',
      supersedesClaimId: 'claim-0',
    });
    x.app.saveSession(current);
    expect(x.elicitation.status('owner', s.id).liveAnswers).toBe(0);
    expect(() =>
      x.elicitation.assign('owner', s.id, link.id, x.get().draft.revision, link),
    ).toThrow('korrigiert');
  });
  it('Debrief nimmt nur offene neue Themen; Konflikte priorisiert; Thema-Aliase mit gleichem Key zählen nicht mehrfach', () => {
    const x = setup();
    x.answer(x.complete(0), 0);
    x.app.state(x.session.id, 'owner', 'drafting', x.get().epoch);
    x.app.state(x.session.id, 'owner', 'debrief', x.get().epoch);
    expect(x.get().elicitation.knownTopicsAtDebrief).toContain('toleranz');
    expect(() => x.candidate(0)).toThrow();
    const s = x.get();
    s.draft.gaps.push({
      id: 'alias',
      topic: ' TOLERANZ ',
      critical: true,
      status: 'open',
      claimIds: [],
    });
    const selected = selectDebriefTopics(s.draft, s.elicitation.knownTopicsAtDebrief);
    expect(selected.some((g) => g.id === 'alias')).toBe(false);
  });
  it('Replay kann niemals Challenge-Live-Nachweise erfüllen; fehlender Gegenfall und Guardrail bleiben separat sichtbar', () => {
    const x = setup();
    x.fullInterview();
    x.review();
    const s = x.get();
    s.sourceMode = 'replay';
    s.elicitation.counterfactuals = [];
    s.questions.filter((q) => q.kind === 'guardrail').forEach((q) => (q.kind = 'reason'));
    x.app.saveSession(s);
    expect(acceptance(x.app, s).issues).toEqual(
      expect.arrayContaining([
        'live_sources_required',
        'guardrail_answer_required',
        'counterfactual_answer_required',
      ]),
    );
  });
  it('Off record schließt Debrief-Audio und Fragen; Resume behält Phase, neue Epoche und historische Belege', () => {
    const x = setup();
    x.answer(x.complete(0), 0);
    x.app.state(x.session.id, 'owner', 'drafting', x.get().epoch);
    x.app.state(x.session.id, 'owner', 'debrief', x.get().epoch);
    const old = x.get().epoch,
      q = x.candidate(3);
    x.app.state(x.session.id, 'owner', 'off_record', old);
    expect(() => x.segment('verspätet', 'debrief')).toThrow('Capture geschlossen');
    expect(() => x.app.state(x.session.id, 'owner', 'capture', x.get().epoch)).toThrow(
      'ursprüngliche Interviewphase',
    );
    x.app.state(x.session.id, 'owner', 'debrief', x.get().epoch);
    expect(x.get().epoch).toBeGreaterThan(old);
    expect(() =>
      x.elicitation.speech('owner', x.session.id, q.id, old, 'completed', q.question),
    ).toThrow();
    const next = x.candidate(3);
    expect(x.elicitation.release('owner', x.session.id, next.id, x.activity()).decision).toBe(
      'release',
    );
    x.elicitation.speech('owner', x.session.id, next.id, x.get().epoch, 'completed', next.question);
    x.answer(next, 3);
    expect(x.get().elicitation.learningEvents.at(-1)?.phase).toBe('debrief');
  });
  it('Korrektur desselben Claims invalidiert den bestätigten Lernnachweis; Mehrdeutigkeit wird nicht automatisch bestätigt', () => {
    const x = setup(),
      q = x.complete(0),
      link = x.answer(q, 0),
      s = x.get();
    expect(s.draft.answerLinks.find((l) => l.id === link.id)?.confirmed).toBe(true);
    const claim = s.draft.claims.find((c) => c.id === 'claim-0')!;
    x.app.applyPatch(
      'owner',
      s.id,
      s.epoch,
      {
        baseDraftRevision: s.draft.revision,
        claims: [{ ...claim, meaning: 'Andere Interpretation' }],
        rules: [],
        gaps: [],
        answerLinks: [],
      },
      s.draft.lastProcessedSegmentSequence,
    );
    expect(x.elicitation.status('owner', s.id).liveAnswers).toBe(0);
    const updated = x.get();
    x.elicitation.assign('owner', s.id, link.id, updated.draft.revision, link);
    expect(x.elicitation.status('owner', s.id).liveAnswers).toBe(1);
  });
  it('ein hypothetischer neuer Trigger muss in der belegten Regel berücksichtigt werden; Gegenfall lässt andere Fakten unangetastet', () => {
    const x = setup(),
      s = x.get();
    s.draft.rules = s.draft.rules.filter((r) => r.effect.kind === 'prohibit');
    x.app.saveSession(s);
    for (let i = 0; i < 3; i++) x.answer(x.complete(i, i === 1 ? 'guardrail' : 'condition'), i);
    x.app.state(s.id, 'owner', 'drafting', x.get().epoch);
    x.app.state(s.id, 'owner', 'debrief', x.get().epoch);
    const q = x.complete(4, 'counterfactual');
    x.answer(q, 4);
    const c = x.get().elicitation.counterfactuals[0];
    expect(c.classification).toBe('open_condition');
    expect(c.facts).toEqual({ ...testFacts, goodsReceiptConfirmed: false });
    expect(x.elicitation.status('owner', s.id).counterfactual).toBe(false);
    const current = x.get(),
      r = current.draft.rules[0];
    x.app.applyPatch(
      'owner',
      s.id,
      current.epoch,
      {
        baseDraftRevision: current.draft.revision,
        claims: [],
        gaps: [],
        answerLinks: [],
        rules: [
          {
            ...r,
            when: { kind: 'compare', field: 'goodsReceiptConfirmed', op: 'eq', value: false },
            claimIds: [...r.claimIds, 'claim-4'],
            evidenceIds: [
              ...r.evidenceIds,
              current.draft.claims.find((c) => c.id === 'claim-4')!.segmentId,
              ...q.eventIds,
            ],
          },
        ],
      },
      current.draft.lastProcessedSegmentSequence,
    );
    expect(x.elicitation.status('owner', s.id).counterfactual).toBe(true);
  });
  it('wartet auf tatsächliche Zuordnung oder ausdrücklich übersprungene Antwort statt die nächste Frage zu erzwingen', () => {
    const x = setup(),
      q = x.complete(0);
    vi.advanceTimersByTime(31000);
    const next = x.candidate(1);
    expect(x.elicitation.release('owner', x.session.id, next.id, x.activity()).decision).toBe(
      'defer',
    );
    x.elicitation.cancel('owner', x.session.id, q.id, x.get().epoch);
    expect(x.elicitation.release('owner', x.session.id, next.id, x.activity()).decision).toBe(
      'release',
    );
    expect(x.get().questions[0].status).toBe('unanswered');
    expect(x.elicitation.status('owner', x.session.id).liveAnswers).toBe(0);
  });
  it('priorisiert Guardrail vor Branch, Bedingungen und Gründen ohne den Eingang zu mutieren', () => {
    const candidate = {
      question: 'Warum?',
      topicKey: 'thema',
      gapIds: [],
      eventIds: ['event'],
      caseId: 'demo',
    };
    const input: Candidate[] = [
      { ...candidate, kind: 'reason' },
      { ...candidate, kind: 'condition' },
      { ...candidate, kind: 'guardrail' },
      { ...candidate, kind: 'branch' },
    ];
    expect(rankCandidates(input).map((q) => q.kind)).toEqual([
      'guardrail',
      'branch',
      'condition',
      'reason',
    ]);
    expect(input[0].kind).toBe('reason');
  });
  it('erhält Antwortproof, Fragen und feste Challenge-Version nach Schließen und Neuöffnen einer SQLite-Datei', () => {
    const dir = mkdtempSync('/private/tmp/blueprint-a2-'),
      file = join(dir, 'state.sqlite');
    let reopened: Store | undefined;
    try {
      const x = setup('challenge_initial', file);
      x.fullInterview();
      x.review();
      const version = x.publish(),
        sessionId = x.session.id;
      x.store.close();
      reopened = new Store(file);
      const app = new Blueprint(reopened),
        s = app.session(sessionId, 'owner');
      expect(new ElicitationService(app).status('owner', sessionId)).toMatchObject({
        eligible: true,
        liveAnswers: 3,
        debriefAnswers: 3,
      });
      expect(reopened.get('versions', version.id)).toEqual(version);
      expect(s.elicitation.learningEvents).toHaveLength(6);
    } finally {
      reopened?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('ein verspätetes Interruption-Signal entzieht auch einer bereits zugeordneten Antwort den Live-Nachweis', () => {
    const x = setup(),
      q = x.complete(0);
    x.answer(q, 0);
    expect(x.elicitation.status('owner', x.session.id).liveAnswers).toBe(1);
    x.elicitation.speech('owner', x.session.id, q.id, x.get().epoch, 'interrupted', q.question);
    expect(x.elicitation.status('owner', x.session.id).liveAnswers).toBe(0);
    expect(x.get().questions[0].spokenAtMs).toBeNull();
  });
});
