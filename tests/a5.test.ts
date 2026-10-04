import { it, expect } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { setupA4 } from './a4-fixture';
import { Store, tables } from '../src/adapters/store';
import { Blueprint } from '../src/application/service';
import { A4 } from '../src/application/a4';
import { A3 } from '../src/application/a3';
import { enqueue, retry } from '../src/application/operations';
import { importReplay } from '../src/application/replay';
import type { Operation, Snapshot } from '../src/domain/contracts';
import { testFacts } from './fixtures';

it('Entfernung redaktiert alle lokalen Ableitungen, behält historische IDs/Hash und sperrt Gate nach SQLite-Reopen', () => {
  const dir = mkdtempSync('/private/tmp/a5-redaction-');
  const x = setupA4(200, true, dir + '/state.sqlite');
  const run = x.a4.start('owner', x.v.id, 'L-03');
  x.a4.attempt('owner', run.id, 'hold', x.text);
  const version = x.store.get<Snapshot>('versions', x.v.id)!;
  for (const table of ['proposals', 'evaluations', 'optimizations'] as const)
    x.store.put(table, { id: table, quote: x.text }, 'owner', version.sessionId);
  x.store.put(
    'bindings',
    { id: version.id, status: 'ready', deviations: [], agentId: 'retained-provider-id' },
    'owner',
    version.sessionId,
  );
  x.app.removeSource('owner', 'ts');
  expect(new A3(x.app).view('owner', version.processId, version.id).claims).toEqual([]);
  expect(x.store.get<Snapshot>('versions', version.id)).toMatchObject({
    id: version.id,
    contentHash: version.contentHash,
    revoked: true,
    claims: [],
    rules: [],
  });
  expect(x.store.get('bindings', version.id)).toMatchObject({
    status: 'failed',
    agentId: 'retained-provider-id',
  });
  for (const table of tables)
    for (const item of x.store.list(table))
      expect(JSON.stringify(item)).not.toContain('Bei Bankänderung Approve stoppen');
  x.store.close();
  const store = new Store(dir + '/state.sqlite');
  const app = new Blueprint(store);
  expect(() =>
    new A4(app).action('owner', run.id, {
      action: 'hold',
      expectedRecordRevision: 1,
      expectedFactsRevision: 1,
      idempotencyKey: 'late',
    }),
  ).toThrow('widerrufen');
  expect(app.session(version.sessionId, 'owner').providerCleanup).toBe('not_verified');
  store.close();
});
it('Reset beschränkt sich auf die gewählte Session; neue IDs, leere Livebasis und Widerruf auch bei zwei SQLite-Verbindungen', () => {
  const dir = mkdtempSync('/private/tmp/a5-reset-');
  const x = setupA4(200, true, dir + '/state.sqlite');
  const old = x.store.get<Snapshot>('versions', x.v.id)!;
  const unrelated = x.app.create('owner', 'Andere Arbeit');
  const second = new Store(dir + '/state.sqlite');
  const reset = x.app.reset('owner', old.processId);
  expect(reset.session.id).not.toBe(old.sessionId);
  expect(reset.process.id).not.toBe(old.processId);
  expect(reset.session).toMatchObject({
    sourceMode: 'live',
    state: 'ready',
    epoch: 1,
    draft: { claims: [], rules: [] },
  });
  expect(second.get('sessions', unrelated.session.id)).toEqual(unrelated.session);
  expect(second.get('versions', old.id)).toMatchObject({
    contentHash: old.contentHash,
    revoked: true,
    claims: [],
  });
  expect(second.list('segments', old.sessionId)).toEqual([]);
  expect(() => new Blueprint(second).owned('processes', old.processId, 'other')).toThrow();
  second.close();
  x.store.close();
});
it('Owner-Wissen ist vor unabhängiger Erstentscheidung gesperrt und danach Hilfe; abgeschlossene Runs bleiben unverändert', () => {
  const x = setupA4();
  const r = x.a4.start('owner', x.v.id, 'L-03');
  expect(() => x.app.knowledgeAccess('owner')).toThrow('Erstentscheidung');
  x.a4.attempt('owner', r.id, 'hold', 'Wareneingang fehlt');
  x.app.knowledgeAccess('owner');
  expect(x.a4.run('owner', r.id).assistance).toContain('owner_knowledge');
  x.a4.action('owner', r.id, {
    action: 'hold',
    expectedRecordRevision: 1,
    expectedFactsRevision: 1,
    idempotencyKey: 'one',
  });
  expect(x.a4.results('owner', r.id).assessment.action.status).toBe('mit Hilfe gelöst');
  const before = x.a4.results('owner', r.id);
  x.app.knowledgeAccess('owner');
  expect(x.a4.results('owner', r.id)).toEqual(before);
  x.app.removeSource('owner', 'ts');
  const archived = x.a4.results('owner', r.id);
  expect(archived.assessment.action).toEqual(before.assessment.action);
  expect(archived.claims).toEqual([]);
  expect(archived.version.revoked).toBe(true);
  x.store.close();
});
it('expliziter Retry ist einmalig, persistiert und akzeptiert weder neue Epoche noch veraltete Draftrevision', () => {
  const store = new Store(),
    app = new Blueprint(store);
  const { session } = app.create('owner', 'Retry');
  const s = app.state(session.id, 'owner', 'capture', 1);
  const op = enqueue(app, 'owner', s.id, 'vision', { frameId: 'frame' });
  op.status = 'failed';
  store.put('operations', op, 'owner', s.id);
  expect(retry(app, 'owner', op.id)).toMatchObject({ id: op.id, status: 'queued', retries: 1 });
  const failed = store.get<Operation>('operations', op.id)!;
  failed.status = 'failed';
  store.put('operations', failed, 'owner', s.id);
  expect(() => enqueue(app, 'owner', s.id, 'vision', { frameId: 'frame' })).toThrow('Retry');
  const next = enqueue(app, 'owner', s.id, 'vision', { frameId: 'other' });
  next.status = 'failed';
  store.put('operations', next, 'owner', s.id);
  const changed = app.session(s.id, 'owner');
  changed.draft.revision++;
  app.saveSession(changed);
  expect(() => retry(app, 'owner', next.id)).toThrow('veraltet');
  app.state(s.id, 'owner', 'off_record', s.epoch);
  expect(() => retry(app, 'owner', next.id)).toThrow('veraltet');
  store.close();
});
it('Debrief-Reconnect/Off record benötigen neue Epochen; späte Debrief-Segmente werden verworfen', () => {
  const store = new Store(),
    app = new Blueprint(store);
  const { session } = app.create('owner', 'Debrief');
  const capture = app.state(session.id, 'owner', 'capture', 1);
  app.state(session.id, 'owner', 'drafting', capture.epoch);
  const debrief = app.state(session.id, 'owner', 'debrief', capture.epoch);
  const connected = app.state(session.id, 'owner', 'debrief', debrief.epoch);
  expect(connected.epoch).toBeGreaterThan(debrief.epoch);
  const off = app.state(session.id, 'owner', 'off_record', connected.epoch);
  const resumed = app.state(session.id, 'owner', 'debrief', off.epoch);
  expect(resumed.epoch).toBeGreaterThan(off.epoch);
  expect(() =>
    app.observations(
      'owner',
      session.id,
      [],
      [
        {
          id: 'late',
          sequence: 1,
          epoch: connected.epoch,
          phase: 'debrief',
          atMs: 0,
          endMs: 1,
          caseId: 'c',
          source: 'expert_statement',
          text: 'Late',
          committed: true,
          audioId: null,
          timing: 'audio_unavailable',
        },
      ],
    ),
  ).toThrow();
  expect(store.list('segments')).toEqual([]);
  store.close();
});
async function replayBundle() {
  const marker = '0123456789abcdef0123456789abcdef';
  const caseId = 'fedcba98-7654-3210-fedc-ba9876543210';
  const pixels = Buffer.alloc(960 * 640 * 3);
  const dot = (x: number, y: number, color: number[]) =>
    color.forEach((n, i) => (pixels[(y * 960 + x) * 3 + i] = n));
  for (let y = 0; y < 640; y++) for (let x = 0; x < 960; x++) dot(x, y, [17, 28, 43]);
  for (const [x, y] of [
    [2, 2],
    [954, 2],
    [2, 634],
    [954, 634],
  ])
    dot(x, y, [250, 0, 170]);
  for (const [code, y] of [
    [marker, 16],
    [caseId.replaceAll('-', ''), 32],
  ] as const)
    [...code]
      .flatMap((c) => parseInt(c, 16).toString(2).padStart(4, '0').split(''))
      .forEach((bit, i) => dot(35 + i * 6, y + 4, bit === '1' ? [255, 255, 255] : [0, 0, 0]));
  const frame = (
    await sharp(pixels, { raw: { width: 960, height: 640, channels: 3 } })
      .png()
      .toBuffer()
  ).toString('base64');
  return {
    schemaVersion: 1,
    session: { marker, draft: { claims: [], rules: [] }, teachback: null },
    events: [
      {
        id: 'event',
        sequence: 1,
        epoch: 5,
        atMs: 0,
        caseId,
        source: 'screen_observation',
        facts: testFacts,
        frameId: 'frame',
      },
    ],
    segments: [
      {
        id: 'segment',
        sequence: 1,
        epoch: 5,
        atMs: 0,
        endMs: 100,
        caseId,
        source: 'expert_statement',
        text: 'Explizite Replay-Quelle',
        committed: true,
        audioId: null,
        timing: 'audio_unavailable',
      },
    ],
    assets: [{ id: 'frame', kind: 'frame', mime: 'image/png', base64: frame, atMs: 0 }],
  };
}
it('ausdrücklicher Replay-Import remaskiert Originalframes, erzeugt neue IDs und keinerlei Liveproofs/Freigaben', async () => {
  const dir = mkdtempSync('/private/tmp/a5-replay-');
  const store = new Store(),
    app = new Blueprint(store, dir);
  const b = await replayBundle();
  const replay = await importReplay(app, 'owner', 'Ausgewählter Replay', b);
  expect(replay.session).toMatchObject({
    sourceMode: 'replay',
    state: 'debrief',
    draft: { rules: [] },
    questions: [],
  });
  expect(store.list<{ id: string }>('segments')[0].id).not.toBe('segment');
  expect(store.list('confirmations')).toEqual([]);
  expect(store.list('versions')).toEqual([]);
  await expect(
    importReplay(app, 'owner', 'Invalid', {
      ...b,
      session: { ...b.session, marker: 'f'.repeat(32) },
    }),
  ).rejects.toThrow('anderen Session');
  expect(store.list('processes')).toHaveLength(1);
  const second = await importReplay(
    app,
    'owner',
    'Replay erneut',
    app.exportSession('owner', replay.session.id),
  );
  expect(second.session.sourceMode).toBe('replay');
  expect(second.session.id).not.toBe(replay.session.id);
  store.close();
});
it('Bewertungsoracle ist aus Client-/Tutor-Modulen ausgeschlossen', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
    );
  const imports = files('src').filter(
    (p) => /\.(tsx?|js)$/.test(p) && readFileSync(p, 'utf8').includes('learning-evaluator'),
  );
  expect(imports).toEqual(['src/application/a4.ts']);
  expect(readFileSync('src/adapters/providers.ts', 'utf8')).not.toContain('learningCase');
});
it('fehlgeschlagene lokale Löschung bleibt gesperrt, sichtbar und erneut ausführbar', () => {
  const x = setupA4();
  const v = x.store.get<Snapshot>('versions', x.v.id)!;
  const dir = mkdtempSync('/private/tmp/a5-cleanup-failure-');
  x.store.put(
    'assets',
    {
      id: 'cannot-unlink-directory',
      ownerId: 'owner',
      sessionId: v.sessionId,
      kind: 'teachback',
      file: dir,
    },
    'owner',
    v.sessionId,
  );
  expect(x.app.discardSession('owner', v.sessionId)).toMatchObject({
    discarded: true,
    localCleanup: 'failed',
  });
  const asset = x.app.owned<import('../src/application/service').Asset>(
    'assets',
    'cannot-unlink-directory',
    'owner',
  );
  expect(asset.retired).toBe(true);
  expect(() => x.app.bytes(asset)).toThrow('Dateibereinigung');
  expect(x.app.exportSession('owner', v.sessionId).assets).toEqual([]);
  asset.file = dir + '/already-removed.wav';
  x.store.put('assets', asset, 'owner', v.sessionId);
  expect(x.app.discardSession('owner', v.sessionId).localCleanup).toBe('complete');
  expect(x.store.list('assets', v.sessionId)).toEqual([]);
  x.store.close();
});
