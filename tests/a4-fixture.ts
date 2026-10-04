import { Store } from '../src/adapters/store';
import { Blueprint } from '../src/application/service';
import { A4 } from '../src/application/a4';
import { learnedPatch, testFacts, testWords } from './fixtures';
export function setupA4(limit = 200, full = true, file = ':memory:', owner = 'owner') {
  const store = new Store(file);
  const app = new Blueprint(store),
    a4 = new A4(app);
  const { session: s, process: p } = app.create(owner, 'A4', 'replay');
  app.state(s.id, owner, 'capture', s.epoch);
  const epoch = app.session(s.id, owner).epoch;
  store.put(
    'assets',
    { id: 'frame', ownerId: owner, sessionId: s.id, epoch, kind: 'frame', caseId: 'demo' },
    owner,
    s.id,
  );
  const text =
    testWords(limit) +
    ' Bei Bankänderung Approve stoppen und eskalieren. Ohne Wareneingang Approve stoppen und Hold wählen.';
  app.observations(
    owner,
    s.id,
    [
      {
        id: 'ev',
        sequence: 1,
        epoch,
        atMs: 0,
        caseId: 'demo',
        source: 'screen_observation',
        facts: testFacts,
        frameId: 'frame',
      },
    ],
    [
      {
        id: 'ts',
        epoch,
        sequence: 1,
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
  const patch = learnedPatch(text, 'ev', 'ts', limit);
  if (full) {
    for (const [field, value, action, kind] of [
      ['bankDetailsChanged', true, 'approve', 'prohibit'],
      ['bankDetailsChanged', true, 'escalate', 'permit'],
      ['goodsReceiptConfirmed', false, 'approve', 'prohibit'],
      ['goodsReceiptConfirmed', false, 'hold', 'permit'],
    ] as const)
      patch.rules.push({
        ...patch.rules[0],
        id: field + action,
        when: { kind: 'compare', field, op: 'eq', value },
        effect: { kind, action },
      });
  }
  app.applyPatch(owner, s.id, epoch, patch, 1);
  for (const phase of ['drafting', 'debrief', 'teachback'] as const)
    app.state(s.id, owner, phase, epoch);
  const current = app.session(s.id, owner);
  current.teachback = {
    hash: app.contentHash(current),
    text: 'Testsubstitut',
    audioId: 'test-audio',
    spoken: true,
  };
  app.saveSession(current);
  app.state(s.id, owner, 'review', epoch);
  const confirmations = (
    ['assignment', 'representation', 'domain_validity', 'version_release'] as const
  ).map((kind) => app.confirm(owner, s.id, kind, app.contentHash(current)));
  const v = app.publish(owner, p.id, {
    expectedDraftRevision: 1,
    scopeId: 'scope-spike',
    contentHash: app.contentHash(current),
    confirmationIds: confirmations.map((c) => c.id),
  });
  return { store, app, a4, v, text };
}
