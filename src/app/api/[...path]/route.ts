import { A3 } from '@/application/a3';
import { ProposalInput, OptimizeInput, WorkflowSchema } from '@/domain/blueprint';
import { NextRequest, NextResponse, after } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { validateFrame } from '@/adapters/frame';
import { getStore } from '@/adapters/store';
import { Blueprint, type Asset } from '@/application/service';
import { AppError, requireThat } from '@/application/errors';
import { enqueue, drain } from '@/application/operations';
import { ElicitationService } from '@/application/elicitation';
import { QuestionPlanSchema, rankCandidates } from '@/domain/elicitation';
import { tokens, structured } from '@/adapters/providers';
import {
  Facts,
  Action,
  type Session,
  type Case,
  type Process,
  type Run,
  type Operation,
  type Snapshot,
  type ScreenEvent,
} from '@/domain/contracts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const base = z.object({ requestId: z.string().min(1).max(100) });
const str = z.string().min(1).max(200),
  revision = z.number().int().nonnegative();
async function route(req: NextRequest) {
  let requestId = randomUUID() as string;
  try {
    const store = getStore(),
      app = new Blueprint(store),
      path = req.nextUrl.pathname.replace('/api/', '').split('/'),
      method = req.method;
    const origin = req.headers.get('origin');
    const host = req.headers.get('host') || req.nextUrl.host;
    const localHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
    const ownOrigin =
      process.env.BLUEPRINT_ORIGIN ||
      (localHost ? req.nextUrl.protocol + '//' + host : req.nextUrl.origin);
    if (method !== 'GET')
      requireThat(origin === ownOrigin, 403, 'origin', 'Same-Origin-Anfrage erforderlich.');
    const ownerId = req.cookies.get('blueprint_owner')?.value;
    if (path[0] === 'bootstrap' && method === 'POST') {
      const owner = ownerId ? store.get<{ id: string }>('owners', ownerId) : undefined;
      const id = owner?.id || randomUUID();
      store.put('owners', { id }, id);
      const response = NextResponse.json({ requestId, data: { ready: true } });
      response.cookies.set('blueprint_owner', id, {
        httpOnly: true,
        sameSite: 'strict',
        secure: req.nextUrl.protocol === 'https:',
        path: '/',
      });
      return response;
    }
    requireThat(
      ownerId && store.get('owners', ownerId),
      403,
      'session',
      'Lokale Demo bitte zuerst starten.',
    );
    let raw: Record<string, unknown> = {};
    if (!['GET', 'DELETE'].includes(method)) {
      requireThat(
        Number(req.headers.get('content-length') || 0) < 7_000_000,
        400,
        'limit',
        'Anfrage zu groß.',
      );
      raw = await req.json();
      requestId = base.parse(raw).requestId;
      delete raw.requestId;
    }
    const body = <T>(schema: z.ZodType<T>) => schema.parse(raw);
    let data: unknown;
    if (path[0] === 'capabilities' && method === 'GET')
      data = {
        credentials: {
          anthropic: !!process.env.ANTHROPIC_API_KEY,
          elevenlabs: !!process.env.ELEVENLABS_API_KEY,
          interviewer: !!process.env.ELEVENLABS_INTERVIEWER_AGENT_ID,
          voice: !!process.env.ELEVENLABS_VOICE_ID,
        },
        usage: 'exercise_only',
        liveVerified: false,
      };
    else if (path[0] === 'processes' && path.length === 1) {
      if (method === 'GET')
        data = store.list<Process>('processes').filter((p) => p.ownerId === ownerId);
      else if (method === 'POST') {
        const b = body(
          z
            .object({
              title: z.string().min(1).max(200),
              sourceMode: z.enum(['live', 'replay']).optional(),
            })
            .strict(),
        );
        data = app.create(ownerId, b.title, b.sourceMode || 'live');
      } else throw new AppError(400, 'method', 'Ungültige Methode.');
    } else if (
      path[0] === 'processes' &&
      path[1] === 'challenge' &&
      path.length === 2 &&
      method === 'POST'
    ) {
      const b = body(z.object({ title: z.string().min(1).max(200) }).strict());
      data = app.create(ownerId, b.title, 'live', 'challenge_initial');
    } else if (path[0] === 'processes' && path[2] === 'a3') {
      const a3 = new A3(app),
        processId = path[1];
      if (method === 'GET' && path.length === 3)
        data = a3.view(ownerId, processId, req.nextUrl.searchParams.get('versionId') || undefined);
      else if (method === 'GET' && path[3] === 'evidence')
        data = a3.evidence(
          ownerId,
          processId,
          req.nextUrl.searchParams.get('versionId') || undefined,
          path[4],
        );
      else if (method === 'POST' && path[3] === 'workflow') {
        const b = body(
          z
            .object({ expectedDraftRevision: revision, contentHash: str, workflow: WorkflowSchema })
            .strict(),
        );
        data = a3.workflow(ownerId, processId, b.expectedDraftRevision, b.contentHash, b.workflow);
      } else if (method === 'POST' && path[3] === 'begin') {
        const b = body(z.object({ versionId: str }).strict());
        data = a3.begin(ownerId, processId, b.versionId);
      } else if (method === 'POST' && path[3] === 'proposals' && path.length === 4)
        data = a3.propose(ownerId, processId, body(ProposalInput));
      else if (method === 'POST' && path[3] === 'proposals' && path[5] === 'review') {
        const b = body(
          z.object({ decision: z.enum(['accept', 'reject', 'request_clarification']) }).strict(),
        );
        data = a3.review(ownerId, processId, path[4], b.decision);
      } else if (method === 'POST' && path[3] === 'evaluate') {
        const b = body(
          z.object({ versionId: str, baseEventId: str, proposalId: str.optional() }).strict(),
        );
        data = a3.evaluate(ownerId, processId, b.versionId, b.baseEventId, b.proposalId);
      } else if (method === 'POST' && path[3] === 'optimizations' && path.length === 4)
        data = a3.optimize(ownerId, processId, body(OptimizeInput));
      else if (method === 'POST' && path[3] === 'optimizations' && path[5] === 'review') {
        const b = body(
          z
            .object({ status: z.enum(['expert_reviewed', 'approved_for_sandbox', 'rejected']) })
            .strict(),
        );
        data = a3.reviewOptimization(ownerId, processId, path[4], b.status);
      } else throw new AppError(400, 'route', 'Unbekannte A3-Route.');
    } else if (path[0] === 'processes' && path.length === 2 && method === 'GET') {
      const p = app.owned<Process>('processes', path[1], ownerId),
        s = app.session(p.sessionId, ownerId);
      data = {
        process: p,
        session: s,
        contentHash: app.contentHash(s),
        confirmations: store.list('confirmations', s.id),
        version: p.publishedVersionId ? store.get('versions', p.publishedVersionId) : null,
      };
    } else if (path[0] === 'processes' && path[2] === 'publish' && method === 'POST') {
      const b = body(
        z
          .object({
            expectedDraftRevision: revision,
            scopeId: str,
            contentHash: str,
            confirmationIds: z.array(str),
          })
          .strict(),
      );
      const version = app.publish(ownerId, path[1], b);
      data = {
        versionId: version.id,
        contentHash: version.contentHash,
        acceptanceProfile: version.acceptanceProfile,
        usage: version.usage,
      };
    } else if (path[0] === 'sessions' && path.length === 1 && method === 'POST') {
      const b = body(z.object({ processId: str }).strict());
      const p = app.owned<Process>('processes', b.processId, ownerId);
      data = app.session(p.sessionId, ownerId);
    } else if (path[0] === 'sessions' && path[1]) {
      const s = app.session(path[1], ownerId);
      if (method === 'DELETE' && path.length === 2) data = app.discardSession(ownerId, s.id);
      else if (method === 'POST' && path[2] === 'export') {
        body(z.object({}).strict());
        data = app.exportSession(ownerId, s.id);
      } else if (method === 'GET' && ['state', 'knowledge'].includes(path[2])) {
        const changed = String(s.stateRevision) !== req.nextUrl.searchParams.get('afterRevision');
        data = {
          changed,
          stateRevision: s.stateRevision,
          ...(changed
            ? {
                session: s,
                contentHash: app.contentHash(s),
                events: store.list('events', s.id),
                segments: store.list('segments', s.id),
                operations: store.list<Operation>('operations', s.id).map(({ payload, ...o }) => o),
                cases: store.list('cases', s.id),
              }
            : {}),
        };
        after(() => drain(app));
      } else if (method === 'POST' && path[2] === 'capture-state') {
        const b = body(
          z
            .object({
              state: z.enum([
                'capture',
                'paused',
                'off_record',
                'drafting',
                'debrief',
                'teachback',
                'review',
              ]),
              expectedEpoch: revision,
            })
            .strict(),
        );
        data = app.state(s.id, ownerId, b.state, b.expectedEpoch);
      } else if (method === 'POST' && path[2] === 'provider-tokens') {
        const b = body(z.object({ exerciseRunId: str.optional() }).strict());
        data = await tokens(app, s, ownerId, b.exerciseRunId);
        if (b.exerciseRunId) {
          const run = app.owned<Run>('runs', b.exerciseRunId, ownerId);
          run.assistance.push('voice_tutor');
          store.put('runs', run, ownerId, s.id);
        }
      } else if (method === 'POST' && path[2] === 'assets') {
        const b = body(
          z
            .object({
              epoch: revision,
              kind: z.enum(['frame', 'audio']),
              mime: z.enum(['image/png', 'audio/wav']),
              base64: z.string().max(6_000_000),
              atMs: z.number().nonnegative(),
            })
            .strict(),
        );
        const checked = b.kind === 'frame' ? await validateFrame(b.base64, s.marker) : null;
        if (checked) {
          const c = app.owned<Case>('cases', checked.caseId, ownerId);
          requireThat(
            c.sessionId === s.id,
            403,
            'scope',
            'Frame zeigt einen Fall außerhalb der Session.',
          );
        }
        data = app.asset(ownerId, s.id, { ...b, ...(checked || {}) });
      } else if (method === 'POST' && path[2] === 'observations') {
        const b = body(
          z
            .object({
              events: z.array(z.unknown()).max(10),
              segments: z.array(z.unknown()).max(10),
            })
            .strict(),
        );
        requireThat(
          s.sourceMode === 'replay' || b.events.length === 0,
          422,
          'screen_origin',
          'Live-ScreenEvents werden ausschließlich durch die serverseitige Vision-Operation erzeugt.',
        );
        data = app.observations(ownerId, s.id, b.events, b.segments);
        if (b.segments.length) {
          enqueue(app, ownerId, s.id, 'extract', {
            lastSequence: app.store
              .list<{ sequence: number }>('segments', s.id)
              .reduce((n, x) => Math.max(n, x.sequence), 0),
          });
          after(() => drain(app));
        }
      } else if (method === 'POST' && path[2] === 'vision') {
        const b = body(
          z
            .object({
              epoch: revision,
              marker: str,
              layoutVersion: z.literal(1),
              frameId: str,
              previousFrameId: str.nullable(),
              caseId: str,
              sequence: revision,
              atMs: z.number().nonnegative(),
            })
            .strict(),
        );
        app.acceptCapture(s, b.epoch);
        requireThat(b.marker === s.marker, 422, 'mask', 'Sandbox-Marker ungültig.');
        requireThat(
          store.list<Operation>('operations', s.id).filter((op) => op.kind === 'vision').length <
            300,
          422,
          'vision_budget',
          'Vision-Budget verbraucht.',
        );
        data = enqueue(app, ownerId, s.id, 'vision', b);
        after(() => drain(app));
      } else if (method === 'POST' && path[2] === 'review-patch') {
        const b = body(z.object({ patch: z.unknown() }).strict());
        requireThat(
          s.state === 'debrief' && !s.improvement,
          409,
          'state',
          'Nach Veröffentlichung ist ein A3-Review-Diff erforderlich.',
        );
        data = app.applyPatch(
          ownerId,
          s.id,
          s.epoch,
          b.patch,
          s.draft.lastProcessedSegmentSequence,
        );
      } else if (method === 'POST' && path[2] === 'extract') {
        body(z.object({}).strict());
        data = enqueue(app, ownerId, s.id, 'extract', {
          lastSequence: app.store
            .list<{ sequence: number }>('segments', s.id)
            .reduce((n, x) => Math.max(n, x.sequence), 0),
        });
        after(() => drain(app));
      } else if (method === 'POST' && path[2] === 'teachback') {
        body(z.object({}).strict());
        data = enqueue(app, ownerId, s.id, 'teachback', {});
        after(() => drain(app));
      } else if (method === 'POST' && path[2] === 'teachback-played') {
        const b = body(z.object({ contentHash: str, audioId: str }).strict());
        requireThat(
          s.state === 'teachback' &&
            s.teachback?.hash === b.contentHash &&
            s.teachback.audioId === b.audioId &&
            b.contentHash === app.contentHash(s),
          409,
          'hash',
          'Veraltetes Teach-back.',
        );
        s.teachback.spoken = true;
        data = app.saveSession(s);
      } else if (method === 'POST' && path[2] === 'answer-links') {
        const b = body(
          z
            .object({
              id: str,
              expectedDraftRevision: revision,
              segmentIds: z.array(str),
              claimIds: z.array(str),
              gapIds: z.array(str),
            })
            .strict(),
        );
        data = new ElicitationService(app).assign(ownerId, s.id, b.id, b.expectedDraftRevision, b);
      } else if (method === 'GET' && path[2] === 'a2-status') {
        data = new ElicitationService(app).status(ownerId, s.id);
      } else if (method === 'POST' && path[2] === 'counterfactuals') {
        const b = body(z.object({ questionId: str, baseEventId: str }).strict());
        data = new ElicitationService(app).counterfactual(
          ownerId,
          s.id,
          b.questionId,
          b.baseEventId,
        );
      } else if (method === 'POST' && path[2] === 'questions' && path[3] === 'plan') {
        body(z.object({}).strict());
        const elicitation = new ElicitationService(app),
          input = elicitation.planInput(ownerId, s.id);
        const plan = await structured('question-planner', QuestionPlanSchema, input);
        const candidate = rankCandidates(QuestionPlanSchema.parse(plan.data).candidates)[0];
        requireThat(candidate, 422, 'no_question', 'Keine passende Frage; keine Quote erzwingen.');
        data = elicitation.candidate(ownerId, s.id, candidate, input.epoch, input.draftRevision);
      } else if (method === 'POST' && path[2] === 'questions' && path[3] === 'release') {
        const b = body(z.object({ id: str, activity: z.unknown() }).strict());
        data = new ElicitationService(app).release(ownerId, s.id, b.id, b.activity);
      } else if (method === 'POST' && path[2] === 'questions' && path[3] === 'cancel') {
        const b = body(z.object({ id: str, epoch: revision }).strict());
        data = new ElicitationService(app).cancel(ownerId, s.id, b.id, b.epoch);
      } else if (method === 'POST' && path[2] === 'questions' && path[3] === 'spoken') {
        const b = body(
          z
            .object({
              id: str,
              epoch: revision,
              outcome: z.enum(['transcript_seen', 'completed', 'interrupted']),
              transcript: z.string().min(1).max(600),
            })
            .strict(),
        );
        data = new ElicitationService(app).speech(
          ownerId,
          s.id,
          b.id,
          b.epoch,
          b.outcome,
          b.transcript,
        );
      } else throw new AppError(400, 'route', 'Unbekannte Session-Route.');
    } else if (path[0] === 'confirmations' && method === 'POST') {
      const b = body(
        z
          .object({
            sessionId: str,
            kind: z.enum(['assignment', 'representation', 'domain_validity', 'version_release']),
            subjectHash: str,
          })
          .strict(),
      );
      data = app.confirm(ownerId, b.sessionId, b.kind, b.subjectHash);
    } else if (path[0] === 'sandbox' && path[1] === 'cases') {
      if (path.length === 2 && method === 'POST') {
        const b = body(z.object({ sessionId: str, facts: Facts }).strict());
        data = app.newCase(ownerId, b.sessionId, b.facts);
      } else if (path.length === 3 && method === 'GET')
        data = app.owned<Case>('cases', path[2], ownerId);
      else if (path.length === 3 && method === 'PATCH') {
        const b = body(
          z
            .object({
              facts: Facts,
              expectedRecordRevision: revision,
              expectedFactsRevision: revision,
            })
            .strict(),
        );
        data = app.patchCase(
          ownerId,
          path[2],
          b.facts,
          b.expectedRecordRevision,
          b.expectedFactsRevision,
        );
      } else if (path[3] === 'actions' && method === 'POST') {
        const b = body(
          z
            .object({
              exerciseRunId: str,
              action: Action,
              expectedRecordRevision: revision,
              expectedFactsRevision: revision,
              versionId: str,
              idempotencyKey: str,
            })
            .strict(),
        );
        data = app.action(ownerId, path[2], b);
      } else throw new AppError(400, 'route', 'Unbekannte Fall-Route.');
    } else if (path[0] === 'exercises') {
      if (path.length === 1 && method === 'POST') {
        const b = body(
          z
            .object({ versionId: str, caseId: str, type: z.enum(['coached', 'independent']) })
            .strict(),
        );
        data = app.exercise(ownerId, b.versionId, b.caseId, b.type);
      } else if (path[2] === 'context' && method === 'GET') {
        const r = app.owned<Run>('runs', path[1], ownerId);
        data = {
          run: r,
          context: app.context(ownerId, r.id),
          case: app.owned<Case>('cases', r.caseId, ownerId),
        };
      } else if (path[2] === 'attempts' && method === 'POST') {
        const b = body(z.object({ action: Action, reason: z.string().min(1).max(4000) }).strict());
        data = app.attempt(ownerId, path[1], b.action, b.reason);
      } else if (path[2] === 'tools' && method === 'POST') {
        const b = body(
          z
            .object({
              name: z.enum([
                'get_current_facts',
                'get_confirmed_rule',
                'show_evidence',
                'highlight_field',
              ]),
              id: str.optional(),
            })
            .strict(),
        );
        const ctx = app.context(ownerId, path[1]);
        const r = app.owned<Run>('runs', path[1], ownerId);
        requireThat(
          r.type !== 'independent' || r.firstAttempt,
          403,
          'independent',
          'Noch keine Hinweise.',
        );
        if (b.name === 'get_current_facts') data = ctx.facts;
        else if (b.name === 'get_confirmed_rule')
          data = ctx.rules.filter((x) => !b.id || x.id === b.id);
        else if (b.name === 'show_evidence') {
          const v = store.get<Snapshot>('versions', ctx.versionId)!;
          requireThat(
            b.id && v.rules.some((r) => r.evidenceIds.includes(b.id!)),
            403,
            'scope',
            'Beleg außerhalb Run-Scope.',
          );
          data = app.evidence(ownerId, b.id);
        } else {
          requireThat(
            b.id && Object.keys(ctx.facts).includes(b.id),
            400,
            'field',
            'Unbekanntes Feld.',
          );
          data = { field: b.id };
        }
        r.assistance.push(b.name);
        store.put('runs', r, ownerId);
      } else throw new AppError(400, 'route', 'Unbekannte Übungsroute.');
    } else if (path[0] === 'evidence' && method === 'GET') {
      const evidence = app.evidence(ownerId, path[1]);
      if ('file' in evidence && evidence.file) {
        const asset = evidence as Asset;
        return new NextResponse(app.bytes(asset), {
          headers: {
            'Content-Type': asset.mime,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      data = evidence;
    } else if (path[0] === 'source-segments' && method === 'DELETE')
      data = app.removeSource(ownerId, path[1]);
    else if (path[0] === 'operations' && method === 'GET') {
      const { payload, ...operation } = app.owned<Operation>('operations', path[1], ownerId);
      data = operation;
      after(() => drain(app));
    } else throw new AppError(400, 'route', 'Unbekannte API-Route.');
    return NextResponse.json({ requestId, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const error =
      e instanceof AppError
        ? e
        : e instanceof z.ZodError
          ? new AppError(
              400,
              'schema',
              'Ungültige Anfrage: ' +
                e.issues.map((x) => x.path.join('.') + ': ' + x.message).join(';'),
            )
          : new AppError(503, 'unavailable', 'Provider oder Storage nicht verfügbar.', true);
    return NextResponse.json(
      {
        requestId,
        error: { code: error.code, message: error.message, retryable: error.retryable },
      },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
export const GET = route,
  POST = route,
  PATCH = route,
  DELETE = route;
