import { writeFileSync } from 'node:fs';
import { learnedPatch, testFacts, testWords } from '../tests/fixtures';
import { hash } from '../src/domain/hash';
import { transitions } from '../src/domain/contracts';
const words = testWords(),
  patch = learnedPatch(words, 'ev-1', 'ts-1');
const content = {
  sourceMode: 'replay',
  scopeId: 'scope-spike',
  gaps: [],
  answerLinks: [],
  claims: patch.claims.map((c) => ({ ...c, review: 'expert_confirmed' })),
  rules: patch.rules.map((r) => ({ ...r, review: 'expert_confirmed' })),
};
const contentHash = hash(content);
const confirmations = ['assignment', 'representation', 'domain_validity', 'version_release'].map(
  (kind, i) => ({
    id: 'cf-' + (i + 1),
    sessionId: 'session-test',
    kind,
    subjectHash: contentHash,
    scopeId: 'scope-spike',
    actorId: kind === 'version_release' ? 'process-owner-test' : 'expert-test',
    at: 0,
  }),
);
const examples = {
  schemaVersion: 1,
  testData: true,
  warning: 'Nur Referenz-/Testdaten. Niemals in eine Live-Session laden.',
  screenEvent: {
    id: 'ev-1',
    sequence: 1,
    epoch: 1,
    atMs: 0,
    caseId: 'case-test',
    source: 'screen_observation',
    facts: testFacts,
    frameId: 'frame-test',
  },
  segment: {
    id: 'ts-1',
    sequence: 1,
    epoch: 1,
    atMs: 0,
    endMs: 1000,
    caseId: 'case-test',
    source: 'expert_statement',
    text: words,
    committed: true,
    audioId: null,
    timing: 'audio_unavailable',
  },
  patch,
  confirmations,
  snapshot: {
    id: 'v-1',
    processId: 'process-test',
    sessionId: 'session-test',
    contentHash,
    ...content,
    confirmationIds: confirmations.map((c) => c.id),
    usage: 'exercise_only',
    acceptanceProfile: 'technical_spike',
    revoked: false,
  },
  publish: {
    requestId: 'publish-test',
    expectedDraftRevision: 1,
    scopeId: 'scope-spike',
    contentHash,
    confirmationIds: confirmations.map((c) => c.id),
  },
  action: {
    requestId: 'action-test',
    exerciseRunId: 'run-test',
    action: 'approve',
    expectedRecordRevision: 7,
    expectedFactsRevision: 3,
    versionId: 'v-1',
    idempotencyKey: 'attempt-1',
  },
  blockedResponse: {
    requestId: 'action-test',
    data: {
      outcome: 'blocked',
      committed: false,
      recordRevision: 7,
      factsRevision: 3,
      versionId: 'v-1',
      ruleIds: ['r-1'],
      evidenceIds: ['ev-1', 'ts-1'],
    },
  },
  transitions,
};
writeFileSync(
  'contracts/examples/learning-chain.v1.json',
  JSON.stringify(examples, null, 2) + '\n',
);
