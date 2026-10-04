import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Store } from '../src/adapters/store';
import { testFacts, testWords, learnedPatch } from './fixtures';
const state = vi.hoisted(() => ({
  store: null as unknown as Store,
  callbacks: [] as (() => unknown)[],
  plan: vi.fn(),
}));
vi.mock('../src/adapters/store', async () => {
  const actual =
    await vi.importActual<typeof import('../src/adapters/store')>('../src/adapters/store');
  return { ...actual, dataDir: '/private/tmp/blueprint-api-tests', getStore: () => state.store };
});
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, after: (callback: () => unknown) => state.callbacks.push(callback) };
});
vi.mock('../src/adapters/providers', async () => {
  const actual = await vi.importActual<typeof import('../src/adapters/providers')>(
    '../src/adapters/providers',
  );
  return {
    ...actual,
    structured: (...args: unknown[]) => state.plan(...args),
    extraction: async () => ({ data: learnedPatch(testWords(), 'ev-1', 'ts-1'), usage: {} }),
  };
});
import { POST, GET, PATCH } from '../src/app/api/[...path]/route';
import { Blueprint } from '../src/application/service';
const base = 'http://localhost:3000';
async function request(path: string, method = 'POST', data: unknown = {}, cookie = '') {
  const req = new NextRequest(base + '/api/' + path, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie },
    body:
      method === 'GET'
        ? undefined
        : JSON.stringify({ requestId: 'request-test', ...(data as object) }),
  });
  const res = await (method === 'GET' ? GET : method === 'PATCH' ? PATCH : POST)(req);
  return { res, json: await res.json() };
}
beforeEach(() => {
  state.store?.close();
  state.store = new Store();
  state.callbacks = [];
  state.plan.mockReset();
});
describe('API-Verträge und Persistenz', () => {
  it('Bootstrap, leere Livebasis, Quellen → Draft → Freigabe → serverseitiger Commit', async () => {
    const boot = await request('bootstrap'),
      cookie = boot.res.headers.get('set-cookie')!.split(';')[0],
      owner = cookie.split('=')[1];
    const created = await request(
      'processes',
      'POST',
      { title: 'API', sourceMode: 'replay' },
      cookie,
    );
    expect(created.res.status).toBe(200);
    const s = created.json.data.session,
      p = created.json.data.process;
    expect(s.draft.rules).toEqual([]);
    const started = await request(
      'sessions/' + s.id + '/capture-state',
      'POST',
      { state: 'capture', expectedEpoch: 1 },
      cookie,
    );
    const epoch = started.json.data.epoch;
    state.store.put(
      'assets',
      { id: 'frame-1', ownerId: owner, sessionId: s.id, epoch, kind: 'frame', caseId: 'demo' },
      owner,
      s.id,
    );
    const observed = await request(
      'sessions/' + s.id + '/observations',
      'POST',
      {
        events: [
          {
            id: 'ev-1',
            epoch,
            sequence: 1,
            atMs: 0,
            caseId: 'demo',
            source: 'screen_observation',
            facts: testFacts,
            frameId: 'frame-1',
          },
        ],
        segments: [
          {
            id: 'ts-1',
            epoch,
            sequence: 1,
            atMs: 0,
            endMs: 1000,
            caseId: 'demo',
            source: 'expert_statement',
            text: testWords(),
            committed: true,
            audioId: null,
            timing: 'audio_unavailable',
          },
        ],
      },
      cookie,
    );
    expect(observed.res.status).toBe(200);
    while (state.callbacks.length) await state.callbacks.shift()!();
    const app = new Blueprint(state.store),
      draft = app.session(s.id, owner);
    expect(draft.draft.rules).toHaveLength(2);
    for (const phase of ['drafting', 'debrief', 'teachback'])
      expect(
        (
          await request(
            'sessions/' + s.id + '/capture-state',
            'POST',
            { state: phase, expectedEpoch: epoch },
            cookie,
          )
        ).res.status,
      ).toBe(200);
    const ready = app.session(s.id, owner);
    ready.teachback = {
      hash: app.contentHash(ready),
      audioId: 'test-spoken-audio',
      text: 'Provider-Mock',
      spoken: true,
    };
    app.saveSession(ready);
    await request(
      'sessions/' + s.id + '/capture-state',
      'POST',
      { state: 'review', expectedEpoch: epoch },
      cookie,
    );
    const currentHash = app.contentHash(ready);
    const absent = await request(
      'processes/' + p.id + '/publish',
      'POST',
      {
        expectedDraftRevision: 1,
        scopeId: 'scope-spike',
        contentHash: currentHash,
        confirmationIds: [],
      },
      cookie,
    );
    expect(absent.res.status).toBe(422);
    expect(state.store.list('versions')).toHaveLength(0);
    const cs = [];
    for (const kind of ['assignment', 'representation', 'domain_validity', 'version_release'])
      cs.push(
        (
          await request(
            'confirmations',
            'POST',
            { sessionId: s.id, kind, subjectHash: currentHash },
            cookie,
          )
        ).json.data.id,
      );
    const published = await request(
      'processes/' + p.id + '/publish',
      'POST',
      {
        expectedDraftRevision: 1,
        scopeId: 'scope-spike',
        contentHash: currentHash,
        confirmationIds: cs,
      },
      cookie,
    );
    expect(published.res.status).toBe(200);
    const v = published.json.data;
    for (const [varianceBps, expected] of [
      [240, 'blocked'],
      [150, 'allowed'],
    ]) {
      const c = (
        await request(
          'sandbox/cases',
          'POST',
          { sessionId: s.id, facts: { ...testFacts, varianceBps } },
          cookie,
        )
      ).json.data;
      const r = (
        await request(
          'exercises',
          'POST',
          { caseId: c.id, versionId: v.versionId, type: 'coached' },
          cookie,
        )
      ).json.data;
      const input = {
        exerciseRunId: r.id,
        action: 'approve',
        expectedRecordRevision: 1,
        expectedFactsRevision: 1,
        versionId: v.versionId,
        idempotencyKey: 'a',
      };
      expect(
        (await request('sandbox/cases/' + c.id + '/actions', 'POST', input, cookie)).res.status,
      ).toBe(422);
      await request(
        'exercises/' + r.id + '/attempts',
        'POST',
        { action: 'approve', reason: 'Eigene Erstentscheidung.' },
        cookie,
      );
      const gated = await request('sandbox/cases/' + c.id + '/actions', 'POST', input, cookie);
      expect(gated.res.status).toBe(200);
      expect(gated.json.data.outcome).toBe(expected);
      expect(gated.json.data.committed).toBe(expected === 'allowed');
    }
  });
  it('CSRF, fremde Session und Selbstverifikation sperren', async () => {
    const res = await POST(
      new NextRequest(base + '/api/bootstrap', {
        method: 'POST',
        headers: { Origin: 'https://other.example' },
        body: '{}',
      }),
    );
    expect(res.status).toBe(403);
    expect((await request('sessions/foreign/state', 'GET')).res.status).toBe(403);
    const boot = await request('bootstrap'),
      cookie = boot.res.headers.get('set-cookie')!.split(';')[0];
    const { session } = (await request('processes', 'POST', { title: 'Case' }, cookie)).json.data;
    const c = await request(
      'sandbox/cases',
      'POST',
      { sessionId: session.id, facts: { ...testFacts, verificationStatus: 'verified' } },
      cookie,
    );
    expect(c.res.status).toBe(403);
  });
  it('A2-API: Serverprofil, Scheduler-Sprechfreigabe und Reload-Nachweise ohne Provider', async () => {
    const boot = await request('bootstrap'),
      cookie = boot.res.headers.get('set-cookie')!.split(';')[0],
      owner = cookie.split('=')[1];
    expect(
      (
        await request(
          'processes',
          'POST',
          { title: 'Manipulation', acceptanceProfile: 'challenge_initial' },
          cookie,
        )
      ).res.status,
    ).toBe(400);
    expect(
      (
        await request(
          'processes/challenge',
          'POST',
          { title: 'Replay', sourceMode: 'replay' },
          cookie,
        )
      ).res.status,
    ).toBe(400);
    const created = await request(
        'processes/challenge',
        'POST',
        { title: 'Leere Challenge' },
        cookie,
      ),
      s = created.json.data.session;
    expect(created.json.data.process.acceptanceProfile).toBe('challenge_initial');
    expect(s.draft.rules).toEqual([]);
    const app = new Blueprint(state.store);
    app.state(s.id, owner, 'capture', s.epoch);
    const current = app.session(s.id, owner);
    current.draft.gaps = [
      { id: 'gap', topic: 'begründung', critical: true, status: 'open', claimIds: [] },
    ];
    app.saveSession(current);
    state.store.put(
      'assets',
      {
        id: 'frame',
        ownerId: owner,
        sessionId: s.id,
        epoch: current.epoch,
        kind: 'frame',
        caseId: 'demo',
      },
      owner,
      s.id,
    );
    app.observations(
      owner,
      s.id,
      [
        {
          id: 'ev',
          frameId: 'frame',
          sequence: 1,
          epoch: current.epoch,
          atMs: Date.now() - s.startedAt,
          caseId: 'demo',
          source: 'screen_observation',
          facts: testFacts,
        },
      ],
      [],
    );
    state.plan.mockResolvedValue({
      data: {
        candidates: [
          {
            question: 'Warum?',
            gapIds: ['gap'],
            eventIds: ['ev'],
            caseId: 'demo',
            topicKey: 'begründung',
            kind: 'reason',
          },
        ],
      },
      usage: {},
    });
    const planned = await request('sessions/' + s.id + '/questions/plan', 'POST', {}, cookie),
      q = planned.json.data;
    expect(planned.res.status).toBe(200);
    expect(q.expiresAt - q.createdAt).toBe(30000);
    expect(
      (
        await request(
          'sessions/' + s.id + '/questions/spoken',
          'POST',
          { id: q.id, epoch: current.epoch, outcome: 'completed', transcript: 'Warum?' },
          cookie,
        )
      ).res.status,
    ).toBe(409);
    const now = Date.now(),
      activity = {
        recordedAt: now,
        lastActivityAt: now - 3000,
        screenStableSince: now - 2000,
        expertSpeaking: false,
        agentSpeaking: false,
        boundary: 'explicit_request',
      };
    expect(
      (
        await request(
          'sessions/' + s.id + '/questions/release',
          'POST',
          { id: q.id, activity: { ...activity, expertSpeaking: true } },
          cookie,
        )
      ).json.data.decision,
    ).toBe('defer');
    expect(
      (
        await request(
          'sessions/' + s.id + '/questions/release',
          'POST',
          { id: q.id, activity },
          cookie,
        )
      ).json.data.decision,
    ).toBe('release');
    expect(
      (
        await request(
          'sessions/' + s.id + '/questions/spoken',
          'POST',
          { id: q.id, epoch: current.epoch, outcome: 'transcript_seen', transcript: 'Warum?' },
          cookie,
        )
      ).res.status,
    ).toBe(200);
    const reloaded = (await request('sessions/' + s.id + '/state', 'GET', {}, cookie)).json.data
      .session;
    expect(reloaded.questions[0].status).toBe('transcript_seen');
    const status = (await request('sessions/' + s.id + '/a2-status', 'GET', {}, cookie)).json.data;
    expect(status.liveAnswers).toBe(0);
    expect(status.eligible).toBe(false);
    expect(
      (
        await request(
          'sessions/' + s.id + '/questions/cancel',
          'POST',
          { id: q.id, epoch: current.epoch },
          cookie,
        )
      ).res.status,
    ).toBe(200);
  });
  it('A2-Planung verwirft ein verspätetes Providerergebnis nach Off record', async () => {
    const boot = await request('bootstrap'),
      cookie = boot.res.headers.get('set-cookie')!.split(';')[0],
      owner = cookie.split('=')[1];
    const s = (await request('processes/challenge', 'POST', { title: 'Race' }, cookie)).json.data
        .session,
      app = new Blueprint(state.store);
    app.state(s.id, owner, 'capture', s.epoch);
    const current = app.session(s.id, owner);
    current.draft.gaps = [
      { id: 'gap', topic: 'grund', critical: false, status: 'open', claimIds: [] },
    ];
    app.saveSession(current);
    state.store.put(
      'assets',
      {
        id: 'frame',
        ownerId: owner,
        sessionId: s.id,
        epoch: current.epoch,
        kind: 'frame',
        caseId: 'demo',
      },
      owner,
      s.id,
    );
    app.observations(
      owner,
      s.id,
      [
        {
          id: 'ev',
          frameId: 'frame',
          sequence: 1,
          epoch: current.epoch,
          atMs: 0,
          caseId: 'demo',
          source: 'screen_observation',
          facts: testFacts,
        },
      ],
      [],
    );
    let resolve!: (value: unknown) => void;
    state.plan.mockImplementation(() => new Promise((r) => (resolve = r)));
    const pending = request('sessions/' + s.id + '/questions/plan', 'POST', {}, cookie);
    await vi.waitFor(() => expect(state.plan).toHaveBeenCalledTimes(1));
    app.state(s.id, owner, 'off_record', current.epoch);
    resolve({
      data: {
        candidates: [
          {
            question: 'Warum?',
            gapIds: ['gap'],
            eventIds: ['ev'],
            caseId: 'demo',
            topicKey: 'grund',
            kind: 'reason',
          },
        ],
      },
      usage: {},
    });
    expect((await pending).res.status).toBe(409);
    expect(app.session(s.id, owner).questions).toHaveLength(0);
  });
});
