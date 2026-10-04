import { describe, it, expect } from 'vitest';
import { Store } from '../src/adapters/store';
import { Blueprint } from '../src/application/service';
import { evaluate, gate, validatePredicate } from '../src/domain/interpreter';
import { hash } from '../src/domain/hash';
import type { Facts, Patch, Rule } from '../src/domain/contracts';
const facts: Facts = {
  vendorKnown: true,
  poMatches: true,
  varianceBps: 150,
  goodsReceiptConfirmed: true,
  bankDetailsChanged: false,
  verificationStatus: null,
};
function setup(limit = 200) {
  const store = new Store(),
    app = new Blueprint(store),
    { session, process } = app.create('owner', 'Test');
  app.state(session.id, 'owner', 'capture', 1);
  const s = app.session(session.id, 'owner');
  store.put(
    'assets',
    {
      id: 'frame-1',
      ownerId: 'owner',
      sessionId: s.id,
      epoch: s.epoch,
      kind: 'frame',
      caseId: 'demo',
    },
    'owner',
    s.id,
  );
  const text = `Ab ${limit} Basispunkten stoppen. Darunter freigeben, wenn Lieferant bekannt, Bestellung passend, Wareneingang bestätigt und Bankdaten unverändert sind.`;
  app.observations(
    'owner',
    s.id,
    [
      {
        id: 'ev-1',
        sequence: 1,
        epoch: s.epoch,
        atMs: 0,
        caseId: 'demo',
        source: 'screen_observation',
        facts,
        frameId: 'frame-1',
      },
    ],
    [
      {
        id: 'ts-1',
        sequence: 1,
        epoch: s.epoch,
        atMs: 0,
        endMs: 1000,
        caseId: 'demo',
        source: 'expert_statement',
        text,
        committed: true,
        audioId: null,
        timing: 'audio_unavailable',
      },
    ],
  );
  const base = {
    stepId: 'decision-1',
    scopeId: 'scope-spike',
    requiredCapabilityIds: ['sandbox_decide'] as ['sandbox_decide'],
    claimIds: ['cl-1'],
    evidenceIds: ['ev-1', 'ts-1'],
    review: 'draft' as const,
    usage: 'exercise_only' as const,
  };
  const patch: Patch = {
    baseDraftRevision: 0,
    claims: [
      {
        id: 'cl-1',
        segmentId: 'ts-1',
        eventIds: ['ev-1'],
        start: 0,
        end: text.length,
        quote: text,
        meaning: text,
        origin: 'expert_statement',
        review: 'draft',
        supersedesClaimId: null,
      },
    ],
    rules: [
      {
        ...base,
        id: 'r-1',
        when: { kind: 'compare', field: 'varianceBps', op: 'gte', value: limit },
        effect: { kind: 'prohibit', action: 'approve' },
      },
      {
        ...base,
        id: 'r-2',
        when: {
          kind: 'all',
          items: [
            { kind: 'compare', field: 'varianceBps', op: 'lt', value: limit },
            ...['vendorKnown', 'poMatches', 'goodsReceiptConfirmed'].map((field) => ({
              kind: 'compare' as const,
              field,
              op: 'eq' as const,
              value: true,
            })),
            { kind: 'compare', field: 'bankDetailsChanged', op: 'eq', value: false },
          ],
        },
        effect: { kind: 'permit', action: 'approve' },
      },
    ],
    gaps: [],
    answerLinks: [],
  };
  return { store, app, session: s, process, patch };
}
function publish(x: ReturnType<typeof setup>) {
  const { app, session: s, process, patch } = x;
  app.applyPatch('owner', s.id, s.epoch, patch, 1);
  app.state(s.id, 'owner', 'drafting', s.epoch);
  app.state(s.id, 'owner', 'debrief', s.epoch);
  app.state(s.id, 'owner', 'teachback', s.epoch);
  const current = app.session(s.id, 'owner');
  current.teachback = {
    hash: app.contentHash(current),
    text: 'Test Teach-back',
    audioId: 'test-audio',
    spoken: true,
  };
  app.saveSession(current);
  app.state(s.id, 'owner', 'review', s.epoch);
  const cs = (['assignment', 'representation', 'domain_validity', 'version_release'] as const).map(
    (k) => app.confirm('owner', s.id, k, app.contentHash(current)),
  );
  return app.publish('owner', process.id, {
    expectedDraftRevision: 1,
    scopeId: 'scope-spike',
    contentHash: app.contentHash(current),
    confirmationIds: cs.map((c) => c.id),
  });
}
describe('Referenzpaket / gelernte Regelkette', () => {
  it('Quellenantwort 2% vs 1% verändert das Gate bei 150 bps', () => {
    for (const [limit, outcome] of [
      [200, 'allowed'],
      [100, 'blocked'],
    ] as const) {
      const x = setup(limit),
        v = publish(x),
        c = x.app.newCase('owner', x.session.id, facts),
        r = x.app.exercise('owner', v.id, c.id, 'coached');
      x.app.attempt('owner', r.id, 'approve', 'Unter der erklärten Grenze.');
      const input = {
        exerciseRunId: r.id,
        action: 'approve' as const,
        expectedRecordRevision: 1,
        expectedFactsRevision: 1,
        versionId: v.id,
        idempotencyKey: 'attempt-1',
      };
      const result = x.app.action('owner', c.id, input) as { outcome: string; committed: boolean };
      expect(result.outcome).toBe(outcome);
      expect(result.committed).toBe(outcome === 'allowed');
      expect(x.app.action('owner', c.id, input)).toEqual(result);
      expect(() => x.app.action('owner', c.id, { ...input, action: 'hold' })).toThrow(
        'anderem Payload',
      );
      x.store.close();
    }
  });
  it('falsche Zitate, fehlende/fremde Evidenz und Modellbestätigung ablehnen', () => {
    const x = setup();
    for (const mutate of [
      (p: Patch) => {
        p.claims[0].quote = 'erfunden';
      },
      (p: Patch) => {
        p.claims[0].eventIds = ['fremd'];
      },
      (p: Patch) => {
        p.rules[0].evidenceIds.push('fremd');
      },
      (p: Patch) => {
        p.claims[0].review = 'expert_confirmed';
      },
    ]) {
      const p = structuredClone(x.patch);
      mutate(p);
      expect(() => x.app.applyPatch('owner', x.session.id, x.session.epoch, p, 1)).toThrow();
    }
    expect(x.app.session(x.session.id, 'owner').draft.revision).toBe(0);
    x.store.close();
  });
  it('stale Patch und Off record weisen verspätete Ergebnisse zurück', () => {
    const x = setup();
    x.app.applyPatch('owner', x.session.id, x.session.epoch, x.patch, 1);
    expect(() => x.app.applyPatch('owner', x.session.id, x.session.epoch, x.patch, 1)).toThrow(
      'geändert',
    );
    x.app.state(x.session.id, 'owner', 'off_record', x.session.epoch);
    expect(() =>
      x.app.applyPatch(
        'owner',
        x.session.id,
        x.session.epoch,
        { ...x.patch, baseDraftRevision: 1 },
        1,
      ),
    ).toThrow('Epoche');
    x.store.close();
  });
  it('Faktenänderung und Quellenwiderruf verhindern direkten Commit', () => {
    const x = setup(),
      v = publish(x),
      c = x.app.newCase('owner', x.session.id, facts),
      r = x.app.exercise('owner', v.id, c.id, 'independent');
    expect(x.app.context('owner', r.id).rules).toEqual([]);
    x.app.attempt('owner', r.id, 'approve', 'Grund');
    const input = {
      exerciseRunId: r.id,
      action: 'approve' as const,
      expectedRecordRevision: 1,
      expectedFactsRevision: 1,
      versionId: v.id,
      idempotencyKey: 'a',
    };
    x.app.patchCase('owner', c.id, { ...facts, goodsReceiptConfirmed: false }, 1, 1);
    expect(() => x.app.action('owner', c.id, input)).toThrow('geändert');
    x.app.removeSource('owner', 'ts-1');
    expect(() =>
      x.app.action('owner', c.id, {
        ...input,
        expectedRecordRevision: 2,
        expectedFactsRevision: 2,
      }),
    ).toThrow('widerrufen');
    expect(x.store.get<{ status: string }>('cases', c.id)?.status).toBe('draft');
    x.store.close();
  });
});
it('Modell-Draft-IDs werden dauerhaft vergeben und bei weiteren Patches beibehalten', () => {
  const x = setup();
  const p = structuredClone(x.patch);
  p.claims[0].id = 'draft:claim';
  for (const r of p.rules) {
    r.id = 'draft:' + r.id;
    r.claimIds = ['draft:claim'];
    r.stepId = 'draft:step';
  }
  const first = x.app.applyPatch('owner', x.session.id, x.session.epoch, p, 1);
  const cid = first.draft.claims[0].id;
  expect(cid).toMatch(/^[0-9a-f]{8}-/);
  expect(first.draft.rules[0].claimIds).toEqual([cid]);
  const second = x.app.applyPatch(
    'owner',
    x.session.id,
    x.session.epoch,
    { ...p, baseDraftRevision: 1 },
    1,
  );
  expect(second.draft.claims[0].id).toBe(cid);
  expect(second.draft.rules).toHaveLength(2);
  x.store.close();
});

describe('strikte DSL', () => {
  it('Unknown AND/OR und fehlendes Permit', () => {
    const a = { kind: 'compare' as const, field: 'vendorKnown', op: 'eq' as const, value: true };
    expect(evaluate(a, { vendorKnown: null })).toBe('unknown');
    expect(
      evaluate(
        { kind: 'all', items: [a, { ...a, field: 'poMatches' }] },
        { vendorKnown: null, poMatches: false },
      ),
    ).toBe(false);
    expect(
      evaluate(
        { kind: 'any', items: [a, { ...a, field: 'poMatches' }] },
        { vendorKnown: null, poMatches: true },
      ),
    ).toBe(true);
    expect(gate([], 'approve', facts, ['sandbox_decide']).outcome).toBe('unknown');
    expect(() => validatePredicate({ ...a, value: 1 })).toThrow();
    expect(() => validatePredicate({ ...a, op: 'gt' })).toThrow();
  });
  it('Verbot vor Permit; Resume erteilt keine Freigabe', () => {
    const x = setup(100);
    const rules = x.patch.rules.map((r) => ({ ...r, review: 'expert_confirmed' as const }));
    const permit: Rule = {
      ...rules[1],
      when: { kind: 'presence', field: 'vendorKnown', op: 'is_known' },
    };
    expect(gate([...rules, permit], 'approve', facts, ['sandbox_decide']).outcome).toBe('blocked');
    const stop: Rule = {
      ...rules[0],
      effect: {
        kind: 'prohibit',
        action: 'approve',
        resumeWhen: { kind: 'compare', field: 'poMatches', op: 'eq', value: true },
      },
    };
    expect(gate([stop], 'approve', facts, ['sandbox_decide']).outcome).toBe('unknown');
    expect(gate([permit], 'approve', facts, []).outcome).toBe('unknown');
    x.store.close();
  });
  it('Hash unabhängig von Objektschlüsselreihenfolge', () =>
    expect(hash({ a: 1, b: 2 })).toBe(hash({ b: 2, a: 1 })));
});
