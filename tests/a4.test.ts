import { mkdtempSync } from 'node:fs';
import { setupA4 } from './a4-fixture';
import { describe, it, expect, afterEach } from 'vitest';
import { Store } from '../src/adapters/store';
import { Blueprint } from '../src/application/service';
import { A4 } from '../src/application/a4';
import type { Case } from '../src/domain/contracts';
import type { LearningRun } from '../src/domain/learning';
const stores: Store[] = [];
afterEach(() => {
  stores.splice(0).forEach((s) => s.close());
});
function setup(limit = 200, full = true) {
  const x = setupA4(limit, full);
  stores.push(x.store);
  return x;
}
function decide(
  x: ReturnType<typeof setup>,
  run: LearningRun,
  action: 'approve' | 'hold' | 'escalate',
  key = 'one',
) {
  const c = x.app.owned<Case>('cases', run.caseId, 'owner');
  return x.a4.action('owner', run.id, {
    action,
    expectedRecordRevision: c.recordRevision,
    expectedFactsRevision: c.factsRevision,
    idempotencyKey: key,
  }) as { outcome: string; committed: boolean };
}
describe('A4 Teach / Results', () => {
  it('L-01 stoppt Bankänderung vor Commit; korrigiertes Escalate bleibt gecoacht', () => {
    const x = setup(),
      r = x.a4.start('owner', x.v.id, 'L-01');
    expect(() => decide(x, r, 'approve')).toThrow('Erstentscheidung');
    x.a4.attempt('owner', r.id, 'approve', 'Ich wollte trotz Bankänderung freigeben.');
    expect(decide(x, r, 'approve')).toMatchObject({ outcome: 'blocked', committed: false });
    expect(x.app.owned<Case>('cases', r.caseId, 'owner').status).toBe('draft');
    expect(decide(x, r, 'escalate', 'two').committed).toBe(true);
    expect(x.a4.results('owner', r.id)).toMatchObject({
      run: { firstAttempt: { action: 'approve' }, assistance: ['gate_intervention'] },
      assessment: { action: { status: 'mit Hilfe gelöst' }, reason: { status: 'Prüfung offen' } },
    });
  });
  it('L-02 erlaubt Approve und speichert Gate, Hash und Originalquellen', () => {
    const x = setup(),
      r = x.a4.start('owner', x.v.id, 'L-02');
    x.a4.attempt('owner', r.id, 'approve', 'Alle bestätigten Voraussetzungen sind erfüllt.');
    expect(decide(x, r, 'approve')).toMatchObject({ outcome: 'allowed', committed: true });
    const result = x.a4.results('owner', r.id);
    expect(result.version.contentHash).toBe(x.v.contentHash);
    expect(result.claims[0].quote).toBe(x.text);
    const evidence = x.a4.evidence('owner', r.id, 'cl-1');
    expect(evidence.segment.text).toBe(x.text);
    expect(evidence.audioMode).toBe('transcript_substitute');
    expect(evidence.frames[0].caseId).toBe('demo');
  });
  it('L-03 gibt vor Erstentscheidung keine Regeln, Hilfe, Evidence oder Results preis', () => {
    const x = setup(),
      r = x.a4.start('owner', x.v.id, 'L-03');
    expect(x.app.context('owner', r.id)).toMatchObject({ rules: [], claims: [] });
    expect(() => x.a4.help('owner', r.id, 'voice_tutor')).toThrow('keine Hilfe');
    expect(() => x.a4.evidence('owner', r.id, 'cl-1')).toThrow('keine Hilfe');
    expect(() => x.a4.results('owner', r.id)).toThrow('Erstentscheidung');
    x.a4.attempt('owner', r.id, 'hold', 'Wareneingang fehlt.');
    expect(decide(x, r, 'hold').committed).toBe(true);
    expect(x.a4.results('owner', r.id).assessment.action.status).toBe('selbstständig gezeigt');
    expect(
      x.a4.review('owner', r.id, true, 'Fehlende Voraussetzung im Originaltext korrekt genannt.')
        .assessment.reason.status,
    ).toBe('selbstständig gezeigt');
  });
  it('L-03 Gatehilfe beendet Unabhängigkeit; derselbe Fall und gleiche Fakten sind kein neuer Transfer', () => {
    const x = setup(),
      r = x.a4.start('owner', x.v.id, 'L-03');
    x.a4.attempt('owner', r.id, 'approve', 'Falsche Erstentscheidung');
    decide(x, r, 'approve');
    decide(x, r, 'hold', 'correction');
    expect(x.a4.results('owner', r.id).assessment.action.status).toBe('mit Hilfe gelöst');
    const repeat = x.app.exercise('owner', x.v.id, r.caseId, 'independent');
    expect(() => x.a4.attempt('owner', repeat.id, 'hold', 'Gleicher Fall')).toThrow('ungesehener');
    const copy = x.app.newCase(
      'owner',
      x.v.sessionId,
      x.app.owned<Case>('cases', r.caseId, 'owner').facts,
    );
    const duplicate = x.app.exercise('owner', x.v.id, copy.id, 'independent');
    expect(() => x.a4.attempt('owner', duplicate.id, 'hold', 'Gleiche Fakten')).toThrow(
      'ungesehener',
    );
    const freshId = x.a4.start('owner', x.v.id, 'L-03');
    expect(x.a4.attempt('owner', freshId.id, 'hold', 'Neuer Fall').firstAttempt?.action).toBe(
      'hold',
    );
  });
  it('immutable Erstentscheidung; erster Gate-Request kann Aktion oder Fakten nicht austauschen', () => {
    const x = setup(),
      r = x.a4.start('owner', x.v.id, 'L-03');
    expect(() => x.a4.attempt('owner', r.id, 'hold', '  ')).toThrow();
    x.a4.attempt('owner', r.id, 'hold', 'Original');
    expect(() => x.a4.attempt('owner', r.id, 'approve', 'Neu')).toThrow('bereits');
    expect(() => decide(x, r, 'approve')).toThrow('Erster Gate');
    const c = x.app.owned<Case>('cases', r.caseId, 'owner');
    x.app.patchCase('owner', c.id, { ...c.facts, goodsReceiptConfirmed: true }, 1, 1);
    expect(() => decide(x, r, 'hold')).toThrow('Erster Gate');
    expect(x.store.list('actions')).toHaveLength(0);
  });
  it('Idempotenz wiederholt weder Commit noch Hilfe; stale Request speichert nichts', () => {
    const x = setup(),
      r = x.a4.start('owner', x.v.id, 'L-01');
    x.a4.attempt('owner', r.id, 'approve', 'Erstentscheidung');
    const input = {
      action: 'approve' as const,
      expectedRecordRevision: 1,
      expectedFactsRevision: 1,
      idempotencyKey: 'same',
    };
    const first = x.a4.action('owner', r.id, input);
    expect(x.a4.action('owner', r.id, input)).toEqual(first);
    expect(x.a4.run('owner', r.id).decisions).toHaveLength(1);
    expect(x.a4.run('owner', r.id).assistance).toHaveLength(1);
    expect(() => x.a4.action('owner', r.id, { ...input, action: 'escalate' })).toThrow(
      'anderem Payload',
    );
    expect(() =>
      x.a4.action('owner', r.id, { ...input, idempotencyKey: 'stale', expectedFactsRevision: 0 }),
    ).toThrow('geändert');
  });
  it('fehlendes Hold-Permit und geänderte Expertengrenze erzeugen keinen fingierten Erfolg', () => {
    const x = setup(100, false),
      r = x.a4.start('owner', x.v.id, 'L-03');
    x.a4.attempt('owner', r.id, 'hold', 'Wareneingang fehlt.');
    expect(decide(x, r, 'hold').committed).toBe(false);
    expect(x.a4.results('owner', r.id).assessment.action.status).toBe('noch üben');
    const positive = x.a4.start('owner', x.v.id, 'L-02');
    x.a4.attempt('owner', positive.id, 'approve', 'Neue Expertengrenze');
    expect(decide(x, positive, 'approve').committed).toBe(false);
  });
  it('neue Version verändert Run nicht; Widerruf sperrt Nutzung und erhält historischen Bezug', () => {
    const x = setup(),
      r = x.a4.start('owner', x.v.id, 'L-02');
    x.a4.attempt('owner', r.id, 'approve', 'Original');
    decide(x, r, 'approve');
    x.store.put(
      'versions',
      { ...x.v, id: 'new-version', contentHash: 'new-hash' },
      'owner',
      x.v.sessionId,
    );
    expect(new A4(new Blueprint(x.store)).results('owner', r.id).version.id).toBe(x.v.id);
    x.app.removeSource('owner', 'ts');
    expect(x.a4.results('owner', r.id)).toMatchObject({
      version: { id: x.v.id, revoked: true },
      claims: [],
    });
    expect(() => decide(x, r, 'approve', 'after-revoke')).toThrow('widerrufen');
    expect(() => x.a4.evidence('owner', r.id, 'cl-1')).toThrow('widerrufen');
    expect(() => x.a4.results('foreign', r.id)).toThrow('Kein Zugriff');
  });
});

it('A4-Results überstehen echtes SQLite-Schließen und Wiederöffnen', () => {
  const dir = mkdtempSync('/private/tmp/a4-reopen-');
  const x = setupA4(200, true, dir + '/state.sqlite');
  const r = x.a4.start('owner', x.v.id, 'L-02');
  x.a4.attempt('owner', r.id, 'approve', 'Originalbegründung');
  decide(x, r, 'approve');
  const original = x.a4.results('owner', r.id);
  x.store.close();
  const reopened = new Store(dir + '/state.sqlite');
  stores.push(reopened);
  expect(new A4(new Blueprint(reopened)).results('owner', r.id)).toEqual(original);
});
