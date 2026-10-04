import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { Store } from '../src/adapters/store';
import { setupA4 } from './a4-fixture';
const state = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock('../src/adapters/store', async () => ({
  ...(await vi.importActual<typeof import('../src/adapters/store')>('../src/adapters/store')),
  getStore: () => state.store!,
}));
import { GET, POST, PATCH } from '../src/app/api/a4/[...path]/route';
import { POST as attempt } from '../src/app/api/exercises/[id]/attempts/route';
import { POST as action } from '../src/app/api/sandbox/cases/[id]/actions/route';
let x: ReturnType<typeof setupA4>;
beforeEach(() => {
  x = setupA4();
  state.store = x.store;
});
afterEach(() => x.store.close());
async function call(
  path: string,
  handler = POST,
  data: object = {},
  owner = 'owner',
  origin = 'http://localhost:3000',
  method = 'POST',
) {
  const req = new NextRequest('http://localhost:3000/api/' + path, {
    method,
    headers: {
      Cookie: 'blueprint_owner=' + owner,
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: method === 'GET' ? undefined : JSON.stringify({ requestId: 'a4-test', ...data }),
  });
  const res = await handler(req);
  return { status: res.status, body: await res.json() };
}
it('konkrete Direct-Request-Routen erzwingen Erstentscheidung, Version und Gate; Results nach Reload', async () => {
  const r = x.a4.start('owner', x.v.id, 'L-01');
  const path = 'sandbox/cases/' + r.caseId + '/actions';
  const input = {
    exerciseRunId: r.id,
    versionId: r.versionId,
    action: 'approve',
    expectedRecordRevision: 1,
    expectedFactsRevision: 1,
    idempotencyKey: 'direct',
  };
  expect((await call(path, action, input)).status).toBe(422);
  expect(
    (
      await call('exercises/' + r.id + '/attempts', attempt, {
        action: 'approve',
        reason: 'Original vor Feedback',
      })
    ).status,
  ).toBe(200);
  const blocked = await call(path, action, input);
  expect(
    (
      await call(
        'sandbox/cases/' + r.caseId,
        PATCH,
        {
          facts: {
            vendorKnown: true,
            poMatches: true,
            varianceBps: 90,
            goodsReceiptConfirmed: true,
            bankDetailsChanged: false,
            verificationStatus: null,
          },
          expectedRecordRevision: 1,
          expectedFactsRevision: 1,
        },
        'owner',
        undefined,
        'PATCH',
      )
    ).status,
  ).toBe(409);
  expect(blocked.body.data).toMatchObject({
    outcome: 'blocked',
    committed: false,
    versionId: r.versionId,
  });
  expect((await call(path, action, { ...input, versionId: 'foreign' })).status).toBe(403);
  expect(
    (await call('a4/' + r.id + '/results', GET, {}, 'owner', undefined, 'GET')).body.data.run
      .firstAttempt.reason,
  ).toBe('Original vor Feedback');
  expect((await call('a4/' + r.id + '/results', GET, {}, 'foreign', undefined, 'GET')).status).toBe(
    403,
  );
  expect((await call(path, action, input, 'owner', 'http://other.test')).status).toBe(403);
});
it('independent Results/Replay vor Erstentscheidung gesperrt; ungültige Payloads werden abgewiesen', async () => {
  const r = x.a4.start('owner', x.v.id, 'L-03');
  expect(
    (await call('a4/' + r.id + '/context', GET, {}, 'owner', undefined, 'GET')).body.data.context
      .rules,
  ).toEqual([]);
  expect((await call('a4/' + r.id + '/results', GET, {}, 'owner', undefined, 'GET')).status).toBe(
    403,
  );
  expect((await call('a4/' + r.id + '/evidence', POST, { claimId: 'cl-1' })).status).toBe(403);
  expect(
    (
      await call('exercises/' + r.id + '/attempts', attempt, {
        action: 'hold',
        reason: ' ',
        expectedAnswer: 'hold',
      })
    ).status,
  ).toBe(400);
});
