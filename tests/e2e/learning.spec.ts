import { test, expect } from '@playwright/test';
import { Store } from '../../src/adapters/store';
import { Blueprint } from '../../src/application/service';
import { learnedPatch, testWords, testFacts } from '../fixtures';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const testDataDir = process.env.BLUEPRINT_E2E_DATA_DIR!;
const origin = 'http://127.0.0.1:3100';
async function seed(owner: string, sessionId: string) {
  const store = new Store(testDataDir + '/blueprint.sqlite'),
    app = new Blueprint(store, testDataDir + '/media'),
    s = app.session(sessionId, owner);
  s.sourceMode = 'replay';
  app.saveSession(s);
  const seg = store.list<{ id: string; text: string }>('segments', s.id)[0],
    ev = store.list<{ id: string }>('events', s.id)[0];
  app.applyPatch(owner, s.id, s.epoch, learnedPatch(seg.text, ev.id, seg.id), 1);
  app.state(s.id, owner, 'drafting', s.epoch);
  app.state(s.id, owner, 'debrief', s.epoch);
  app.state(s.id, owner, 'teachback', s.epoch);
  // Test-only provider substitute. No endpoint or runtime fallback can seed this.
  const samples = new Int16Array(1600),
    buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16000, 24);
  buffer.writeUInt32LE(32000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  const current = app.session(s.id, owner),
    a = app.asset(owner, s.id, {
      kind: 'teachback',
      mime: 'audio/wav',
      epoch: s.epoch,
      base64: buffer.toString('base64'),
      atMs: 0,
    });
  current.teachback = {
    hash: app.contentHash(current),
    text: testWords(),
    audioId: a.id,
    spoken: false,
  };
  app.saveSession(current);
  store.close();
}
test('A1/A3: zwei Tabs, SQLite-Testquellen, Evidence, C-01, Review-Diff und unveränderliche Versionen', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Leeren Spike-Prozess starten' }).click();
  await expect(page).toHaveURL(/capture/);
  const sessionId = page.url().split('/').at(-1)!,
    owner = (await context.cookies()).find((c) => c.name === 'blueprint_owner')!.value;
  const seedStore = new Store(testDataDir + '/blueprint.sqlite'),
    seedApp = new Blueprint(seedStore);
  const testSession = seedApp.session(sessionId, owner);
  testSession.sourceMode = 'replay';
  seedApp.saveSession(testSession);
  seedStore.close();
  const request = context.request;
  const call = async (path: string, data: unknown) => {
    const res = await request.post('/api/' + path, {
      headers: { Origin: origin },
      data: { requestId: crypto.randomUUID(), ...(data as object) },
    });
    expect(res.status(), await res.text()).toBe(200);
    return (await res.json()).data;
  };
  const initial = await request.get('/api/sessions/' + sessionId + '/state');
  const state = (await initial.json()).data;
  expect(state.session.draft.rules).toEqual([]);
  const sandbox = await context.newPage();
  await sandbox.goto('/sandbox/' + sessionId);
  await sandbox.getByLabel('Lieferant bekannt').selectOption('true');
  await sandbox.getByLabel('Bestellung passend').selectOption('true');
  await sandbox.getByLabel('Abweichung (Basispunkte)').fill('150');
  await sandbox.getByLabel('Wareneingang bestätigt').selectOption('true');
  await sandbox.getByLabel('Bankdaten geändert').selectOption('false');
  await sandbox.getByRole('button', { name: 'Fakten speichern' }).click();
  await expect(sandbox.getByRole('button', { name: 'ERP im Vollbild zeigen' })).toBeEnabled();
  const canvas = sandbox.locator('canvas');
  const png = await canvas.screenshot();
  const screenScript =
    ts.transpileModule(readFileSync('src/components/screen.ts', 'utf8').replaceAll('export ', ''), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText + ';window.testMask=verifyAndMask;';
  await sandbox.addScriptTag({ content: screenScript });
  const maskResult = await sandbox.evaluate((marker) => {
    const fn = (
      window as unknown as {
        testMask: (
          c: HTMLCanvasElement,
          m: string,
        ) => { caseId: string; geometry: string; base64: string };
      }
    ).testMask;
    const c = document.querySelector('canvas')!;
    const valid = fn(c, marker);
    let rejected = false;
    try {
      fn(c, 'f'.repeat(32));
    } catch {
      rejected = true;
    }
    return { valid, rejected };
  }, state.session.marker);
  expect(maskResult.rejected).toBe(true);
  expect(maskResult.valid.caseId).not.toBe('00000000-0000-0000-0000-000000000000');
  const epoch = (
    await call('sessions/' + sessionId + '/capture-state', { state: 'capture', expectedEpoch: 1 })
  ).epoch;
  const asset = await call('sessions/' + sessionId + '/assets', {
    epoch,
    kind: 'frame',
    mime: 'image/png',
    base64: maskResult.valid.base64,
    atMs: 0,
  });
  await call('sessions/' + sessionId + '/observations', {
    events: [
      {
        id: 'ev-e2e',
        epoch,
        sequence: 1,
        atMs: 0,
        caseId: maskResult.valid.caseId,
        source: 'screen_observation',
        facts: testFacts,
        frameId: asset.id,
      },
    ],
    segments: [
      {
        id: 'ts-e2e',
        epoch,
        sequence: 1,
        atMs: 0,
        endMs: 1000,
        caseId: maskResult.valid.caseId,
        source: 'expert_statement',
        text: testWords(),
        committed: true,
        audioId: null,
        timing: 'audio_unavailable',
      },
    ],
  });
  await seed(owner, sessionId);
  const processId = state.session.processId;
  await page.goto('/processes/' + processId);
  await page.locator('audio').evaluate(async (audio) => {
    await (audio as HTMLAudioElement).play();
  });
  await expect(page.getByText('Vollständig abgespielt')).toBeVisible();
  await page.getByRole('button', { name: 'Inhalt prüfen und bestätigen' }).click();
  for (const name of [
    'Zuordnung der Quellen geprüft',
    'Wiedergabe des Expertenwissens geprüft',
    'Für diese Übung fachlich bestätigt',
    'Als Process Owner diese Übungsversion freigeben',
  ])
    await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Spike-Version veröffentlichen' }).click();
  await expect(page.getByRole('button', { name: 'Neue Übung starten' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Neue Übung starten' })).toBeVisible();
  const firstPublished = (await (await request.get('/api/processes/' + processId)).json()).data
    .version;
  await page.getByLabel('Prozessversion', { exact: true }).selectOption(firstPublished.id);
  const timeline = page.getByRole('list', { name: 'Timeline' });
  await timeline.getByRole('button').click();
  await expect(
    page.getByRole('group', { name: 'Workflow-Graph' }).getByRole('button').first(),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Evidence öffnen · cl-1', exact: true }).click();
  const evidence = page.getByRole('complementary', { name: 'Evidence-Ansicht' });
  await expect(evidence.getByText('TESTQUELLE · keine Live-Abnahme')).toBeVisible();
  await expect(evidence.getByText(/Transcript-Ersatzdarstellung/)).toBeVisible();
  await expect(evidence.getByRole('img')).toBeVisible();
  await evidence.getByRole('button', { name: 'Evidence schließen' }).click();
  await page.getByRole('tab', { name: 'Evaluate', exact: true }).click();
  await page.getByLabel('C-01 Basisfall').selectOption('ev-e2e');
  await page.getByRole('button', { name: 'C-01 gegen gewählte Version prüfen' }).click();
  await expect(page.getByText('Bestätigender Test', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Optimize', exact: true }).click();
  await expect(page.getByText('Noch kein belegter Vorschlag.', { exact: true })).toBeVisible();
  for (const [bps, outcome] of [
    ['240', 'blocked'],
    ['150', 'allowed'],
  ]) {
    await page.getByLabel('Lieferant bekannt').selectOption('true');
    await page.getByLabel('Bestellung passend').selectOption('true');
    await page.getByLabel('Abweichung (Basispunkte)').fill(bps);
    await page.getByLabel('Wareneingang bestätigt').selectOption('true');
    await page.getByLabel('Bankdaten geändert').selectOption('false');
    await page.getByRole('button', { name: 'Neue Übung starten' }).click();
    await expect(page).toHaveURL(/teach/);
    await expect(page.getByRole('button', { name: 'Tutor verbinden' })).toBeEnabled();
    const reason = page.getByLabel('Begründung vor Feedback');
    await reason.fill('Ich wende die bestätigte Grenze an.');
    await expect(reason).toHaveValue('Ich wende die bestätigte Grenze an.');
    const submit = page.getByRole('button', { name: 'Entscheidung prüfen und speichern' });
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByRole('status')).toContainText(outcome);
    if (outcome === 'blocked') {
      await expect(page.getByRole('status')).toContainText('Kein Commit');
      await page.getByRole('button', { name: /Originalbeleg öffnen · ts-e2e/ }).click();
      await expect(page.getByText(testWords(), { exact: true }).last()).toBeVisible();
      await page.screenshot({ path: 'test-results/a1-blocked.png', fullPage: true });
    } else await expect(page.getByText(/Status approved/)).toBeVisible();
    await page.goto('/processes/' + processId);
  }
  const beforeStore = new Store(testDataDir + '/blueprint.sqlite');
  const oldRuns = beforeStore.list<{ id: string; versionId: string }>('runs', sessionId);
  const oldSnapshot = beforeStore.get('versions', firstPublished.id);
  beforeStore.close();
  await page.getByLabel('Prozessversion', { exact: true }).selectOption(firstPublished.id);
  await page.getByRole('tab', { name: 'Improve', exact: true }).click();
  await page.getByRole('button', { name: 'Verbesserung der gewählten Version beginnen' }).click();
  await page.getByRole('button', { name: 'Review-Diff vorbereiten' }).click();
  const draftResponse = (await (await request.get('/api/processes/' + processId + '/a3')).json())
    .data;
  const step = draftResponse.workflow.steps[0];
  const proposalInput = {
    baseVersionId: firstPublished.id,
    baseDraftRevision: draftResponse.draftRevision,
    baseHash: draftResponse.contentHash,
    operations: [
      { kind: 'revise_step', step: { ...step, title: 'Freigabevoraussetzungen prüfen' } },
    ],
  };
  await page.getByLabel('Review-Diff', { exact: true }).fill(JSON.stringify(proposalInput));
  await page.getByRole('button', { name: 'Diff zur Prüfung vorlegen' }).click();
  await expect(page.getByText('Vorher', { exact: true })).toBeVisible();
  await expect(page.getByText('Nachher', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Diff ausdrücklich annehmen' }).click();
  await page.getByRole('button', { name: 'Teach-back vorbereiten', exact: true }).click();
  // Explicit test-only audio substitute; no live provider or runtime fixture path.
  const nextStore = new Store(testDataDir + '/blueprint.sqlite'),
    nextApp = new Blueprint(nextStore, testDataDir + '/media');
  const nextSession = nextApp.session(sessionId, owner);
  const priorAudio = nextStore
    .list<{ id: string; kind: string }>('assets', sessionId)
    .find((a) => a.kind === 'teachback')!;
  nextSession.teachback = {
    hash: nextApp.contentHash(nextSession),
    text: 'TEST-REPLAY: geprüftes neues Prozessmodell',
    audioId: priorAudio.id,
    spoken: false,
  };
  nextApp.saveSession(nextSession);
  nextStore.close();
  await page.reload();
  await page.locator('audio').evaluate(async (audio) => {
    await (audio as HTMLAudioElement).play();
  });
  await expect(page.getByText('Vollständig abgespielt')).toBeVisible();
  await page.getByRole('button', { name: 'Inhalt prüfen und bestätigen' }).click();
  // The old confirmations cannot publish the new hash.
  const beforeConfirm = (await (await request.get('/api/processes/' + processId)).json()).data;
  const denied = await request.post('/api/processes/' + processId + '/publish', {
    headers: { Origin: origin },
    data: {
      requestId: crypto.randomUUID(),
      expectedDraftRevision: beforeConfirm.session.draft.revision,
      scopeId: 'scope-spike',
      contentHash: beforeConfirm.contentHash,
      confirmationIds: firstPublished.confirmationIds,
    },
  });
  expect(denied.status()).toBe(422);
  for (const name of [
    'Zuordnung der Quellen geprüft',
    'Wiedergabe des Expertenwissens geprüft',
    'Für diese Übung fachlich bestätigt',
    'Als Process Owner diese Übungsversion freigeben',
  ])
    await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: 'Neue Version veröffentlichen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Neue Übung starten' })).toBeVisible();
  await page.reload();
  const afterStore = new Store(testDataDir + '/blueprint.sqlite');
  expect(afterStore.get('versions', firstPublished.id)).toEqual(oldSnapshot);
  expect(afterStore.list('runs', sessionId)).toEqual(oldRuns);
  const versions = afterStore.list<{ id: string; parentVersionId?: string }>('versions', sessionId);
  expect(versions).toHaveLength(2);
  expect(versions.find((v) => v.id !== firstPublished.id)?.parentVersionId).toBe(firstPublished.id);
  afterStore.close();
  await page.getByLabel('Prozessversion', { exact: true }).selectOption(firstPublished.id);
  await page.getByRole('tab', { name: 'Evaluate', exact: true }).click();
  await expect(page.getByText('Bestätigender Test', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Blueprint', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Timeline' }).getByRole('button')).toContainText(
    'Erklärte Entscheidung',
  );
  await page.screenshot({ path: 'test-results/a3-version-history.png', fullPage: true });
  await sandbox.close();
});
test('Off record weist alte Epoche zurück; Browsermaskierung stoppt falschen Marker', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Leeren Spike-Prozess starten' }).click();
  await expect(page).toHaveURL(/capture/);
  const sessionId = page.url().split('/').at(-1)!;
  const post = async (path: string, data: object) =>
    context.request.post('/api/' + path, {
      headers: { Origin: origin },
      data: { requestId: crypto.randomUUID(), ...data },
    });
  const started = (
    await (
      await post('sessions/' + sessionId + '/capture-state', { state: 'capture', expectedEpoch: 1 })
    ).json()
  ).data;
  await post('sessions/' + sessionId + '/capture-state', {
    state: 'off_record',
    expectedEpoch: started.epoch,
  });
  const stale = await post('sessions/' + sessionId + '/observations', {
    events: [],
    segments: [
      {
        id: 'late',
        sequence: 1,
        epoch: started.epoch,
        atMs: 0,
        endMs: 100,
        caseId: 'case',
        source: 'expert_statement',
        text: 'Darf nicht gespeichert werden',
        committed: true,
        audioId: null,
        timing: 'audio_unavailable',
      },
    ],
  });
  expect(stale.status()).toBe(409);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Capture · off_record' })).toBeVisible();
  await expect(page.getByText('Kein vorläufiges Transkript.')).toBeVisible();
});
