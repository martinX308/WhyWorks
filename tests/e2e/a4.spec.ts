import { test, expect } from '@playwright/test';
import { setupA4 } from '../a4-fixture';
const dataDir = process.env.BLUEPRINT_E2E_DATA_DIR!;
test('A4: L-01-Stopp, L-02-Allow, L-03 ohne Hilfe, Results und persistierte Erstentscheidung', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Leeren Spike-Prozess starten' }).click();
  await expect(page).toHaveURL(/capture/);
  const owner = (await context.cookies()).find((c) => c.name === 'blueprint_owner')!.value;
  // Explicit replay test substitute. No runtime fixture endpoint or live claim.
  const x = setupA4(200, true, dataDir + '/blueprint.sqlite', owner);
  const runs = ['L-01', 'L-02', 'L-03'].map((learningCase) =>
    x.a4.start(owner, x.v.id, learningCase as 'L-01' | 'L-02' | 'L-03'),
  );
  x.store.close();
  for (const [i, action, reason, outcome] of [
    [0, 'approve', 'Ich übersehe die Bankänderung.', 'blocked'],
    [1, 'approve', 'Alle Voraussetzungen erfüllt.', 'allowed'],
    [2, 'hold', 'Wareneingang fehlt.', 'allowed'],
  ] as const) {
    await page.goto('/teach/' + runs[i].id);
    await expect(page.getByText('TEST-REPLAY · keine Live-Abnahme', { exact: true })).toBeVisible();
    if (i === 2) {
      await expect(page.getByRole('button', { name: 'Tutor verbinden' })).toHaveCount(0);
      const hidden = await context.request.get('/api/a4/' + runs[i].id + '/results');
      expect(hidden.status()).toBe(403);
    }
    await page.getByLabel('Deine Entscheidung').selectOption(action);
    await page.getByLabel('Begründung vor Feedback').fill(reason);
    await page.getByRole('button', { name: 'Entscheidung prüfen und speichern' }).click();
    await expect(page.getByRole('status')).toContainText(outcome);
    await page.reload();
    await expect(page.getByRole('status')).toContainText(outcome);
    await page.getByRole('link', { name: 'Versionsgebundene Results öffnen' }).click();
    await expect(page.getByRole('heading', { name: /Results/ })).toBeVisible();
    await expect(page.getByText(action + ' · ' + reason, { exact: true })).toBeVisible();
    await expect(
      page.getByText('Version ' + runs[i].versionId + ' · Scope ' + runs[i].scopeId),
    ).toBeVisible();
    await expect(page.getByText('Hash ' + runs[i].contentHash)).toBeVisible();
    await expect(page.getByText('Prüfung offen', { exact: true })).toBeVisible();
    if (i === 2) {
      await expect(page.getByText('selbstständig gezeigt', { exact: true })).toBeVisible();
      await page
        .getByLabel('Reviewnotiz')
        .fill('Fehlenden Wareneingang anhand der Originalaussage erklärt.');
      await page.getByRole('button', { name: 'Begründung fachlich bestätigt' }).click();
      await expect(page.getByText('selbstständig gezeigt', { exact: true })).toHaveCount(2);
      await page.reload();
      await expect(page.getByText('selbstständig gezeigt', { exact: true })).toHaveCount(2);
    }
  }
});
