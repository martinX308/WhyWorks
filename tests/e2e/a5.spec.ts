import { test, expect } from '@playwright/test';
import { Store } from '../../src/adapters/store';
import { Blueprint } from '../../src/application/service';
import { A4 } from '../../src/application/a4';
import { learnedPatch, testWords, testFacts } from '../fixtures';
import { wav } from '../../src/components/audio';
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
const dir = process.env.BLUEPRINT_E2E_DATA_DIR!;
const origin = 'http://127.0.0.1:3100';
test('A5: expliziter Export-Replay, zwei Tabs, schmale Tastaturansicht, Hilfeschutz, Widerruf und begrenzter Reset', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Leeren Spike-Prozess starten' }).click();
  await expect(page).toHaveURL(/capture/);
  const sessionId = page.url().split('/').at(-1)!;
  const owner = (await context.cookies()).find((c) => c.name === 'blueprint_owner')!.value;
  const post = async (path: string, body: object) => {
    const res = await context.request.post('/api/' + path, {
      headers: { Origin: origin },
      data: { requestId: crypto.randomUUID(), ...body },
    });
    expect(res.status(), await res.text()).toBe(200);
    return (await res.json()).data;
  };
  const state = (await (await context.request.get('/api/sessions/' + sessionId + '/state')).json())
    .data;
  const sandbox = await context.newPage();
  await sandbox.goto('/sandbox/' + sessionId);
  for (const label of ['Lieferant bekannt', 'Bestellung passend', 'Wareneingang bestätigt'])
    await sandbox.getByLabel(label).selectOption('true');
  await sandbox.getByLabel('Bankdaten geändert').selectOption('false');
  await sandbox.getByLabel('Abweichung (Basispunkte)').fill('150');
  await sandbox.getByRole('button', { name: 'Fakten speichern' }).click();
  await expect(sandbox.getByRole('button', { name: 'ERP im Vollbild zeigen' })).toBeEnabled();
  const screen = ts.transpileModule(
    readFileSync('src/components/screen.ts', 'utf8').replaceAll('export ', ''),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
  await sandbox.addScriptTag({ content: screen + ';window.testMask=verifyAndMask;' });
  const masked = await sandbox.evaluate(
    (marker) =>
      (
        window as unknown as {
          testMask: (c: HTMLCanvasElement, m: string) => { base64: string; caseId: string };
        }
      ).testMask(document.querySelector('canvas')!, marker),
    state.session.marker,
  );
  const started = await post('sessions/' + sessionId + '/capture-state', {
    state: 'capture',
    expectedEpoch: 1,
  });
  const frame = await post('sessions/' + sessionId + '/assets', {
    epoch: started.epoch,
    kind: 'frame',
    mime: 'image/png',
    base64: masked.base64,
    atMs: 0,
  });
  await post('sessions/' + sessionId + '/observations', {
    events: [],
    segments: [
      {
        id: 'a5-ts',
        epoch: started.epoch,
        sequence: 1,
        atMs: 0,
        endMs: 100,
        caseId: masked.caseId,
        source: 'expert_statement',
        text: testWords(),
        committed: true,
        audioId: null,
        timing: 'audio_unavailable',
      },
    ],
  });
  // Explicit test-side replay substitute, never an app fallback.
  const store = new Store(dir + '/blueprint.sqlite'),
    app = new Blueprint(store, dir + '/media');
  const s = app.session(sessionId, owner);
  s.sourceMode = 'replay';
  app.saveSession(s);
  app.observations(
    owner,
    s.id,
    [
      {
        id: 'a5-ev',
        epoch: s.epoch,
        sequence: 1,
        atMs: 0,
        caseId: masked.caseId,
        source: 'screen_observation',
        facts: testFacts,
        frameId: frame.id,
      },
    ],
    [],
  );
  app.applyPatch(owner, s.id, s.epoch, learnedPatch(testWords(), 'a5-ev', 'a5-ts'), 1);
  for (const phase of ['drafting', 'debrief', 'teachback'] as const)
    app.state(s.id, owner, phase, s.epoch);
  const current = app.session(s.id, owner);
  const audio = app.asset(owner, s.id, {
    epoch: s.epoch,
    kind: 'teachback',
    mime: 'audio/wav',
    base64: Buffer.from(wav(new Int16Array(1600))).toString('base64'),
    atMs: 0,
  });
  current.teachback = {
    hash: app.contentHash(current),
    text: 'TEST-REPLAY · gehörte Testdarstellung',
    audioId: audio.id,
    spoken: false,
  };
  app.saveSession(current);
  store.close();
  const bundle = await post('sessions/' + sessionId + '/export', {});
  await page.goto('/');
  await page.getByLabel('Quellmodus').selectOption('replay');
  await page.getByLabel(/Exportierte Session ausdrücklich/).setInputFiles({
    name: 'replay.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bundle)),
  });
  await expect(page).toHaveURL(/processes/);
  const replayProcessId = page.url().split('/').at(-1)!;
  await expect(
    page.getByText('TEST-REPLAY · keine Live-Abnahme', { exact: true }).first(),
  ).toBeVisible();
  await page.locator('audio').evaluate(async (el) => {
    await (el as HTMLAudioElement).play();
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
  const model = (await (await context.request.get('/api/processes/' + replayProcessId)).json())
    .data;
  expect(model.version.sourceMode).toBe('replay');
  expect(model.session.elicitation.learningEvents).toEqual([]);
  await page.getByRole('button', { name: 'Nur Graph', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Timeline' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Workflow-Graph' })).toBeVisible();
  await page.getByRole('button', { name: 'Nur Timeline', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Timeline' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Evaluate', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('C-01 Basisfall')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await sandbox.goto('/processes/' + replayProcessId);
  await expect(sandbox.getByText(testWords(), { exact: true }).first()).toBeVisible();
  const a = new Store(dir + '/blueprint.sqlite'),
    service = new Blueprint(a, dir + '/media');
  const c = service.newCase(owner, model.session.id, testFacts);
  const run = service.exercise(owner, model.version.id, c.id, 'independent');
  a.close();
  const blocked = await context.request.get('/api/evidence/' + model.version.claims[0].segmentId);
  expect(blocked.status()).toBe(409);
  await sandbox.goto('/processes/' + replayProcessId);
  await expect(sandbox.getByRole('alert').first()).toContainText('Erstentscheidung');
  await expect(sandbox.getByText(testWords(), { exact: true })).toHaveCount(0);
  await page.goto('/teach/' + run.id);
  await page
    .getByLabel('Begründung vor Feedback')
    .fill('Alle bestätigten Voraussetzungen erfüllt.');
  await page.getByRole('button', { name: 'Entscheidung prüfen und speichern' }).click();
  await expect(page.getByRole('status')).toContainText('Commit gespeichert');
  await page.goto('/results/' + run.id);
  await page
    .getByRole('button', { name: 'Originalmoment öffnen · ' + model.version.claims[0].id })
    .click();
  await expect(page.getByRole('complementary', { name: 'Originalmoment' })).toBeVisible();
  await sandbox.goto('/');
  await sandbox
    .locator('.row')
    .filter({ has: sandbox.locator('a[href="/processes/' + replayProcessId + '"]') })
    .getByRole('button', { name: 'Lokale Quellen verwerfen und leer neu starten' })
    .click();
  await expect(sandbox).toHaveURL(/capture/);
  const freshId = sandbox.url().split('/').at(-1)!;
  await expect(
    page.getByText('Historisches Ergebnis · Version widerrufen · keine weitere Nutzung'),
  ).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Originalmoment' })).toHaveCount(0);
  await expect(page.getByText(testWords(), { exact: true })).toHaveCount(0);
  await page.goto('/capture/' + freshId);
  expect(freshId).not.toBe(model.session.id);
  const fresh = (await (await context.request.get('/api/sessions/' + freshId + '/state')).json())
    .data;
  expect(fresh.session).toMatchObject({
    sourceMode: 'live',
    state: 'ready',
    draft: { rules: [], claims: [] },
  });
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Screen und Voice starten / Resume' }),
  ).toBeEnabled();
  const reopened = new Store(dir + '/blueprint.sqlite');
  expect(reopened.get('versions', model.version.id)).toMatchObject({
    revoked: true,
    contentHash: model.version.contentHash,
    claims: [],
  });
  expect(() =>
    new A4(new Blueprint(reopened)).action(owner, run.id, {
      action: 'approve',
      expectedRecordRevision: 2,
      expectedFactsRevision: 1,
      idempotencyKey: 'after-reset',
    }),
  ).toThrow('widerrufen');
  const durations = reopened
    .list<{ kind: string; durationMs: number }>('metrics')
    .filter((m) => m.kind === 'gate_api')
    .map((m) => m.durationMs)
    .sort((a, b) => a - b);
  writeFileSync(
    'test-results/a5-session-evidence.json',
    JSON.stringify(
      {
        date: new Date().toISOString(),
        evidenceClass: 'automated_test_replay',
        countsAsLiveAcceptance: false,
        initialSessionId: sessionId,
        replaySessionId: model.session.id,
        replayProcessId,
        versionId: model.version.id,
        contentHash: model.version.contentHash,
        exerciseRunId: run.id,
        resetSessionId: freshId,
        liveLearningEvents: 0,
        checks: [
          'explicit_export_import',
          'fresh_confirmation_publish',
          'two_tab_independent_guard',
          'keyboard_graph_timeline',
          'mobile_390px',
          'sqlite_commit',
          'scoped_reset',
          'revoked_gate',
          'reload_ready',
          'cached_views_clear_on_revocation',
        ],
        gateHandlerTimings: {
          sampleCount: durations.length,
          p95Ms: durations.length ? durations[Math.ceil(durations.length * 0.95) - 1] : null,
          limitation:
            'Small replay sample in local Next development handler; excludes browser/network and Next compilation.',
        },
      },
      null,
      2,
    ) + '\n',
  );
  reopened.close();
  await page.screenshot({ path: 'test-results/a5-empty-reset-mobile.png', fullPage: true });
  await sandbox.close();
});
