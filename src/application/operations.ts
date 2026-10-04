import { randomUUID } from 'node:crypto';
import { hash } from '../domain/hash';
import type { Operation, ScreenEvent } from '../domain/contracts';
import { Blueprint } from './service';
import {
  extraction,
  structured,
  VisionSchema,
  speakTeachback,
  prompt,
  model,
} from '../adapters/providers';
import { requireThat } from './errors';
export function enqueue(
  app: Blueprint,
  ownerId: string,
  sessionId: string,
  kind: Operation['kind'],
  payload: unknown,
) {
  const s = app.session(sessionId, ownerId);
  requireThat(
    !['off_record', 'paused', 'published'].includes(s.state),
    409,
    'capture_closed',
    'Operation in diesem Zustand gesperrt.',
  );
  const inputHash = hash({ payload, revision: s.draft.revision, epoch: s.epoch });
  const existing = app.store
    .list<Operation>('operations', s.id)
    .find(
      (o) =>
        o.kind === kind &&
        o.inputHash === inputHash &&
        ['queued', 'running', 'succeeded'].includes(o.status),
    );
  if (existing) return existing;
  const failed = app.store
    .list<Operation>('operations', s.id)
    .find((o) => o.kind === kind && o.inputHash === inputHash && o.status === 'failed');
  if (failed) return retry(app, ownerId, failed.id);
  const op: Operation = {
    id: randomUUID(),
    ownerId,
    sessionId,
    kind,
    payload,
    inputRevision: s.draft.revision,
    inputHash,
    epoch: s.epoch,
    status: 'queued',
    leaseExpiresAt: 0,
    resultRef: null,
    error: null,
    promptHash: hash(
      prompt(kind === 'extract' ? 'extraction' : kind === 'teachback' ? 'tutor' : 'vision'),
    ),
    model: model(),
  };
  return app.store.put('operations', op, ownerId, s.id);
}
export function retry(app: Blueprint, ownerId: string, id: string) {
  return app.store.tx(() => {
    const op = app.owned<Operation & { retries?: number }>('operations', id, ownerId);
    const s = app.session(op.sessionId, ownerId);
    requireThat(
      op.status === 'failed' && (op.retries || 0) < 1,
      409,
      'retry_limit',
      'Nur ein expliziter Retry pro fehlgeschlagener Operation.',
    );
    requireThat(
      op.epoch === s.epoch &&
        op.payload !== null &&
        !['off_record', 'paused', 'published'].includes(s.state) &&
        op.inputRevision === s.draft.revision,
      409,
      'stale_operation',
      'Operation veraltet; aktuellen Kontext neu erfassen.',
    );
    op.retries = (op.retries || 0) + 1;
    op.status = 'queued';
    op.error = null;
    op.leaseExpiresAt = 0;
    return app.store.put('operations', op, ownerId, s.id);
  });
}
export async function drain(app: Blueprint) {
  for (const candidate of app.store.list<Operation>('operations')) {
    let op: Operation | undefined;
    app.store.tx(() => {
      const o = app.store.get<Operation>('operations', candidate.id)!;
      if (o.status === 'running' && o.leaseExpiresAt < Date.now()) {
        o.status = 'failed';
        o.error = 'Operation nach Neustart/Lease-Ablauf abgebrochen; explizit erneut starten.';
        app.store.put('operations', o, o.ownerId, o.sessionId);
      }
      if (o.status !== 'queued') return;
      const active = app.store
        .list<Operation>('operations', o.sessionId)
        .some((x) => x.id !== o.id && x.kind === o.kind && x.status === 'running');
      if (active) return;
      o.status = 'running';
      o.leaseExpiresAt = Date.now() + 90_000;
      app.store.put('operations', o, o.ownerId, o.sessionId);
      op = o;
    });
    if (!op) continue;
    const o: Operation = op;
    try {
      let s = app.session(o.sessionId, o.ownerId);
      requireThat(
        s.epoch === o.epoch && !['off_record', 'paused'].includes(s.state),
        409,
        'epoch',
        'Operation veraltet.',
      );
      if (o.kind === 'extract') {
        o.inputRevision = s.draft.revision;
        o.inputHash = hash({ payload: o.payload, revision: s.draft.revision, epoch: s.epoch });
        app.store.put('operations', o, o.ownerId, o.sessionId);
        const max = app.store
          .list<{ sequence: number }>('segments', s.id)
          .reduce((n, x) => Math.max(n, x.sequence), 0);
        const result = await extraction(app, s);
        s = app.session(s.id, s.ownerId);
        requireThat(
          s.draft.revision === o.inputRevision,
          409,
          'stale_draft',
          'Während Extraktion wurde der Draft geändert.',
        );
        app.applyPatch(o.ownerId, s.id, o.epoch, result.data, max);
        o.resultRef = s.id;
        app.store.put(
          'metrics',
          {
            id: randomUUID(),
            kind: 'anthropic_extraction',
            usage: result.usage,
            durationMs: Date.now() - (o.leaseExpiresAt - 90000),
          },
          o.ownerId,
          s.id,
        );
      } else if (o.kind === 'vision') {
        const p = o.payload as {
          frameId: string;
          previousFrameId: string | null;
          caseId: string;
          sequence: number;
          atMs: number;
        };
        const frame = app.owned<import('./service').Asset>('assets', p.frameId, o.ownerId);
        requireThat(
          frame.sessionId === s.id && frame.epoch === o.epoch && frame.caseId === p.caseId,
          422,
          'frame',
          'Fremder Frame.',
        );
        const images: string[] = [];
        if (p.previousFrameId) {
          const previous = app.owned<import('./service').Asset>(
            'assets',
            p.previousFrameId,
            o.ownerId,
          );
          requireThat(
            previous.sessionId === s.id &&
              previous.epoch === o.epoch &&
              previous.caseId === p.caseId,
            422,
            'frame',
            'Fremder Vergleichsframe.',
          );
          images.push(app.bytes(previous).toString('base64'));
        }
        images.push(app.bytes(frame).toString('base64'));
        const result = await structured(
          'vision',
          VisionSchema,
          { caseId: p.caseId, epoch: o.epoch, frameId: frame.id },
          images,
        );
        const event: ScreenEvent = {
          id: randomUUID(),
          sequence: p.sequence,
          epoch: o.epoch,
          atMs: p.atMs,
          caseId: p.caseId,
          source: 'screen_observation',
          facts: result.data.facts,
          frameId: frame.id,
        };
        app.observations(o.ownerId, s.id, [event], []);
        o.resultRef = event.id;
        app.store.put(
          'metrics',
          {
            id: randomUUID(),
            kind: 'anthropic_vision',
            usage: result.usage,
            durationMs: Date.now() - (o.leaseExpiresAt - 90000),
          },
          o.ownerId,
          s.id,
        );
      } else {
        requireThat(s.state === 'teachback', 409, 'state', 'Teach-back-Zustand verlassen.');
        const text =
          'Für diese Übung habe ich Folgendes verstanden. ' +
          s.draft.claims.map((c) => c.meaning).join(' ') +
          ' Bitte prüfe und bestätige diese Darstellung.';
        const contentHash = app.contentHash(s);
        const base64 = await speakTeachback(text);
        s = app.session(s.id, s.ownerId);
        requireThat(
          s.epoch === o.epoch && app.contentHash(s) === contentHash && s.state === 'teachback',
          409,
          'stale_draft',
          'Teach-back inzwischen geändert.',
        );
        const asset = app.asset(o.ownerId, s.id, {
          epoch: s.epoch,
          kind: 'teachback',
          mime: 'audio/wav',
          base64,
          atMs: Date.now() - s.startedAt,
        });
        s.teachback = { hash: contentHash, text, audioId: asset.id, spoken: false };
        app.saveSession(s);
        o.resultRef = asset.id;
      }
      const latest = app.store.get<Operation>('operations', o.id);
      if (latest?.status === 'cancelled') continue;
      o.status = 'succeeded';
    } catch (e) {
      const latest = app.store.get<Operation>('operations', o.id);
      if (latest?.status === 'cancelled') continue;
      o.status = 'failed';
      o.error =
        e instanceof Error && 'code' in e
          ? e.message
          : 'Provider/Schema fehlgeschlagen; Konfiguration und Quellen prüfen.';
    }
    app.store.put('operations', o, o.ownerId, o.sessionId);
  }
}
