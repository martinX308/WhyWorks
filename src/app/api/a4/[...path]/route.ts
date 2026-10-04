import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getStore } from '@/adapters/store';
import { Blueprint } from '@/application/service';
import { A4 } from '@/application/a4';
import { AppError, requireThat } from '@/application/errors';
import { Action, Facts, type Case } from '@/domain/contracts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function route(req: NextRequest) {
  let requestId: string = randomUUID();
  try {
    const store = getStore(),
      app = new Blueprint(store),
      a4 = new A4(app);
    const owner = req.cookies.get('blueprint_owner')?.value;
    requireThat(
      owner && store.get('owners', owner),
      403,
      'session',
      'Lokale Demo bitte zuerst starten.',
    );
    const host = req.headers.get('host') || req.nextUrl.host;
    const ownOrigin =
      process.env.BLUEPRINT_ORIGIN ||
      (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
        ? req.nextUrl.protocol + '//' + host
        : req.nextUrl.origin);
    if (req.method !== 'GET')
      requireThat(
        req.headers.get('origin') === ownOrigin,
        403,
        'origin',
        'Same-Origin-Anfrage erforderlich.',
      );
    const parts = req.nextUrl.pathname.replace('/api/a4/', '').split('/');
    const legacyCase = req.nextUrl.pathname.match(/^\/api\/sandbox\/cases\/([^/]+)$/);
    const legacyAttempt = req.nextUrl.pathname.match(/^\/api\/exercises\/([^/]+)\/attempts$/);
    const legacyAction = req.nextUrl.pathname.match(/^\/api\/sandbox\/cases\/([^/]+)\/actions$/);
    let raw: Record<string, unknown> = {};
    if (req.method !== 'GET') {
      raw = await req.json();
      requestId = z.string().min(1).max(100).parse(raw.requestId);
      delete raw.requestId;
    }
    let data: unknown;
    if (legacyCase && req.method === 'GET') {
      data = app.owned<Case>('cases', legacyCase[1], owner);
    } else if (legacyCase && req.method === 'PATCH') {
      const b = z
        .object({
          facts: Facts,
          expectedRecordRevision: z.number().int().nonnegative(),
          expectedFactsRevision: z.number().int().nonnegative(),
        })
        .strict()
        .parse(raw);
      const c = app.owned<Case>('cases', legacyCase[1], owner);
      const fixed = store
        .list<import('@/domain/learning').LearningRun>('runs', c.sessionId)
        .some((r) => r.caseId === c.id && r.learningCase && r.learningCase !== 'custom');
      requireThat(
        !fixed,
        409,
        'exercise_facts',
        'Vorbereitete Lernfälle behalten ihre Geschäftsfakten. Starte einen weiteren Fall.',
      );
      data = app.patchCase(owner, c.id, b.facts, b.expectedRecordRevision, b.expectedFactsRevision);
    } else if (legacyAttempt && req.method === 'POST') {
      const b = z
        .object({ action: Action, reason: z.string().trim().min(1).max(4000) })
        .strict()
        .parse(raw);
      data = a4.attempt(owner, legacyAttempt[1], b.action, b.reason);
    } else if (legacyAction && req.method === 'POST') {
      const b = z
        .object({
          exerciseRunId: z.string().min(1),
          versionId: z.string().min(1),
          action: Action,
          expectedRecordRevision: z.number().int().nonnegative(),
          expectedFactsRevision: z.number().int().nonnegative(),
          idempotencyKey: z.string().min(1).max(200),
        })
        .strict()
        .parse(raw);
      const run = a4.run(owner, b.exerciseRunId);
      requireThat(
        run.caseId === legacyAction[1] && run.versionId === b.versionId,
        403,
        'scope',
        'Run/Fall/Version passen nicht.',
      );
      const { exerciseRunId, versionId, ...input } = b;
      data = a4.action(owner, exerciseRunId, input);
    } else if (parts[0] === 'start' && req.method === 'POST') {
      const b = z
        .object({ versionId: z.string().min(1), learningCase: z.enum(['L-01', 'L-02', 'L-03']) })
        .strict()
        .parse(raw);
      data = a4.start(owner, b.versionId, b.learningCase);
    } else if (parts[1] === 'context' && req.method === 'GET') {
      const run = a4.run(owner, parts[0]);
      a4.version(owner, run);
      data = {
        run,
        context: app.context(owner, run.id),
        case: app.owned<Case>('cases', run.caseId, owner),
      };
    } else if (parts[1] === 'results' && req.method === 'GET') data = a4.results(owner, parts[0]);
    else if (parts[1] === 'attempts' && req.method === 'POST') {
      const b = z
        .object({ action: Action, reason: z.string().trim().min(1).max(4000) })
        .strict()
        .parse(raw);
      data = a4.attempt(owner, parts[0], b.action, b.reason);
    } else if (parts[1] === 'actions' && req.method === 'POST') {
      const b = z
        .object({
          action: Action,
          expectedRecordRevision: z.number().int().nonnegative(),
          expectedFactsRevision: z.number().int().nonnegative(),
          idempotencyKey: z.string().min(1).max(200),
        })
        .strict()
        .parse(raw);
      data = a4.action(owner, parts[0], b);
    } else if (parts[1] === 'evidence' && req.method === 'POST') {
      const b = z
        .object({ claimId: z.string().min(1) })
        .strict()
        .parse(raw);
      data = a4.evidence(owner, parts[0], b.claimId);
    } else if (parts[1] === 'review' && req.method === 'POST') {
      const b = z
        .object({ supported: z.boolean(), note: z.string().trim().min(1).max(4000) })
        .strict()
        .parse(raw);
      data = a4.review(owner, parts[0], b.supported, b.note);
    } else throw new AppError(400, 'route', 'Unbekannte A4-Route.');
    return NextResponse.json({ requestId, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const error =
      e instanceof AppError
        ? e
        : e instanceof z.ZodError
          ? new AppError(400, 'schema', 'Ungültige Anfrage.')
          : new AppError(503, 'storage', 'A4-Anfrage fehlgeschlagen.');
    return NextResponse.json(
      {
        requestId,
        error: { code: error.code, message: error.message, retryable: error.retryable },
      },
      { status: error.status },
    );
  }
}
export const GET = route;
export const POST = route;

export const PATCH = route;
