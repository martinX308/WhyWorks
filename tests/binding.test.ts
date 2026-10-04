import { it, expect, vi, beforeEach } from 'vitest';
import { Store } from '../src/adapters/store';
import { Blueprint } from '../src/application/service';
import type { Snapshot } from '../src/domain/contracts';
const fake = vi.hoisted(() => ({
  agentCreate: vi.fn(),
  agentGet: vi.fn(),
  kb: vi.fn(),
  tool: vi.fn(),
  procedure: vi.fn(),
  compile: vi.fn(),
  token: vi.fn(),
}));
vi.mock('@elevenlabs/elevenlabs-js', () => ({
  ElevenLabsClient: class {
    conversationalAi = {
      conversations: { getWebrtcToken: fake.token },
      agents: {
        create: fake.agentCreate,
        get: fake.agentGet,
        procedures: { create: fake.procedure, compile: fake.compile },
      },
      knowledgeBase: { documents: { createFromText: fake.kb } },
      tools: { create: fake.tool },
    };
  },
}));
import { tutorBinding, tokens } from '../src/adapters/providers';
beforeEach(() => {
  vi.stubEnv('ELEVENLABS_API_KEY', 'test');
  vi.stubEnv('ELEVENLABS_VOICE_ID', 'voice');
  fake.agentCreate.mockReset().mockResolvedValue({ agentId: 'agent' });
  fake.agentGet
    .mockReset()
    .mockResolvedValue({ agentId: 'agent', versionId: 'agent-version', branchId: 'main' });
  fake.kb.mockReset().mockResolvedValue({ id: 'kb' });
  fake.tool.mockReset().mockResolvedValue({ id: 'tool' });
  fake.procedure.mockReset().mockResolvedValue({ procedureId: 'proc' });
  fake.compile.mockReset().mockResolvedValue({});
  fake.token.mockReset().mockResolvedValue({ token: 'simulated-token' });
});
function setup() {
  const store = new Store(),
    app = new Blueprint(store),
    { session, process } = app.create('owner', 'Tutor');
  const v: Snapshot = {
    id: 'snapshot',
    sessionId: session.id,
    processId: process.id,
    contentHash: 'hash-v1',
    scopeId: 'scope-spike',
    claims: [],
    rules: [],
    confirmationIds: [],
    usage: 'exercise_only',
    acceptanceProfile: 'technical_spike',
    sourceMode: 'live',
    revoked: false,
  };
  return { store, app, v };
}
it('dedizierte Agent-/KB-/Procedure-Version, vier Client Tools und idempotente Ressourcenbindung', async () => {
  const x = setup();
  const b = await tutorBinding(x.app, x.v, 'owner');
  expect(b).toMatchObject({
    status: 'ready',
    versionId: 'agent-version',
    kbId: 'kb',
    procedureId: 'proc',
    mode: 'kb_procedure',
  });
  expect(fake.tool).toHaveBeenCalledTimes(4);
  const config = fake.agentCreate.mock.calls[0][0];
  expect(config.conversationConfig.agent.prompt.prompt).toContain('hash-v1');
  expect(config.platformSettings.privacy.recordVoice).toBe(false);
  await tutorBinding(x.app, x.v, 'owner');
  expect(fake.agentCreate).toHaveBeenCalledTimes(1);
  await expect(tutorBinding(x.app, { ...x.v, contentHash: 'different' }, 'owner')).rejects.toThrow(
    'Wissenbindung',
  );
  x.store.close();
  vi.unstubAllEnvs();
});
it('fehlende KB/Procedure ist dokumentierter Runtime-Ersatz; fehlende Version blockiert', async () => {
  const x = setup();
  fake.kb.mockRejectedValue(new Error('unsupported'));
  fake.procedure.mockRejectedValue(new Error('unsupported'));
  const b = await tutorBinding(x.app, x.v, 'owner');
  expect(b.mode).toBe('runtime_lookup');
  expect(b.deviations).toHaveLength(2);
  const y = setup();
  fake.agentGet.mockResolvedValue({ agentId: 'agent', branchId: 'main' });
  await expect(tutorBinding(y.app, y.v, 'owner')).rejects.toThrow('feste Agentversion');
  expect(y.store.get<{ status: string }>('bindings', y.v.id)?.status).toBe('failed');
  x.store.close();
  y.store.close();
  vi.unstubAllEnvs();
});

it('Tutor-Token selbst erfasst Hilfe, auch ohne Client Tool; Widerruf während Tokenrequest blockiert', async () => {
  const { setupA4 } = await import('./a4-fixture');
  const x = setupA4();
  const r = x.a4.start('owner', x.v.id, 'L-03');
  const v = x.store.get<Snapshot>('versions', x.v.id)!;
  const s = x.app.session(v.sessionId, 'owner');
  await expect(tokens(x.app, s, 'owner', r.id)).rejects.toThrow('Erstentscheidung');
  x.a4.attempt('owner', r.id, 'hold', 'Wareneingang fehlt.');
  await tokens(x.app, s, 'owner', r.id);
  expect(x.a4.run('owner', r.id).assistance).toEqual(['voice_tutor']);
  x.a4.action('owner', r.id, {
    action: 'hold',
    expectedRecordRevision: 1,
    expectedFactsRevision: 1,
    idempotencyKey: 'with-voice',
  });
  expect(x.a4.results('owner', r.id).assessment.action.status).toBe('mit Hilfe gelöst');
  fake.token.mockImplementation(async () => {
    x.app.removeSource('owner', 'ts');
    return { token: 'late-token' };
  });
  await expect(tokens(x.app, s, 'owner', r.id)).rejects.toThrow('nicht nutzbar');
  x.store.close();
  vi.unstubAllEnvs();
});
