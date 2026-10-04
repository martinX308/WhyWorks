import { unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { EventSchema, SegmentSchema, PatchSchema } from '../domain/contracts';
import { validateFrame } from '../adapters/frame';
import { Blueprint } from './service';
import { requireThat } from './errors';
// Explicit, local exported-source replay. Never restore confirmations, live
// quotas, commits or provider bindings. Re-validate every source-derived rule.
const Bundle = z.object({
  schemaVersion: z.literal(1),
  session: z.object({
    marker: z.string().regex(/^[a-f0-9]{32}$/),
    draft: z.object({
      claims: PatchSchema.shape.claims,
      rules: PatchSchema.shape.rules,
    }),
    teachback: z.object({ text: z.string(), audioId: z.string() }).nullable(),
  }),
  segments: z.array(SegmentSchema).min(1).max(100),
  events: z.array(EventSchema).min(1).max(300),
  assets: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(['frame', 'audio', 'teachback']),
        mime: z.string(),
        atMs: z.number().nonnegative(),
        originalMarker: z
          .string()
          .regex(/^[a-f0-9]{32}$/)
          .optional(),
        originalCaseId: z.string().optional(),
        base64: z.string().max(6_000_000),
      }),
    )
    .max(400),
});
export async function importReplay(app: Blueprint, owner: string, title: string, raw: unknown) {
  const b = Bundle.parse(raw);
  const safe = new Map<string, { base64: string; caseId: string }>();
  requireThat(
    new Set(b.assets.map((a) => a.id)).size === b.assets.length,
    422,
    'duplicate',
    'Doppelte Asset-ID.',
  );
  for (const a of b.assets.filter((a) => a.kind === 'frame'))
    safe.set(a.id, await validateFrame(a.base64, a.originalMarker || b.session.marker));
  const files: string[] = [];
  try {
    return app.store.tx(() => {
      const created = app.create(owner, title, 'replay');
      const s = app.state(created.session.id, owner, 'capture', 1);
      const ids = new Map<string, string>();
      const mapped = (id: string) => {
        if (!ids.has(id)) ids.set(id, randomUUID());
        return ids.get(id)!;
      };
      const assets = new Map<string, string>();
      for (const a of b.assets.filter((a) => a.kind !== 'teachback')) {
        const checked = safe.get(a.id);
        const asset = app.asset(owner, s.id, {
          ...a,
          epoch: s.epoch,
          ...(checked
            ? {
                base64: checked.base64,
                caseId: mapped(b.events.find((e) => e.frameId === a.id)?.caseId || checked.caseId),
              }
            : {}),
        });
        if (checked) {
          asset.originalMarker = a.originalMarker || b.session.marker;
          asset.originalCaseId = checked.caseId;
          app.store.put('assets', asset, owner, s.id);
        }
        files.push(asset.file);
        assets.set(a.id, asset.id);
      }
      const events = b.events.map((e, i) => {
        requireThat(
          safe.get(e.frameId)?.caseId ===
            (b.assets.find((a) => a.id === e.frameId)?.originalCaseId || e.caseId),
          422,
          'frame',
          'Replay-Frame passt nicht zum Originalfall.',
        );
        return {
          ...e,
          id: mapped(e.id),
          epoch: s.epoch,
          sequence: i + 1,
          caseId: mapped(e.caseId),
          frameId: assets.get(e.frameId)!,
        };
      });
      const segments = b.segments.map((seg, i) => ({
        ...seg,
        id: mapped(seg.id),
        epoch: s.epoch,
        sequence: i + 1,
        phase: 'live' as const,
        caseId: mapped(seg.caseId),
        audioId: seg.audioId ? assets.get(seg.audioId)! : null,
      }));
      app.observations(owner, s.id, events, segments);
      if (b.session.draft.claims.length)
        app.applyPatch(
          owner,
          s.id,
          s.epoch,
          {
            baseDraftRevision: 0,
            claims: b.session.draft.claims.map((c) => ({
              ...c,
              id: mapped(c.id),
              segmentId: mapped(c.segmentId),
              eventIds: c.eventIds.map(mapped),
              review: 'draft',
              supersedesClaimId: c.supersedesClaimId ? mapped(c.supersedesClaimId) : null,
            })),
            rules: b.session.draft.rules.map((r) => ({
              ...r,
              id: mapped(r.id),
              stepId: mapped(r.stepId),
              review: 'draft',
              claimIds: r.claimIds.map(mapped),
              evidenceIds: r.evidenceIds.map(mapped),
            })),
            gaps: [],
            answerLinks: [],
          },
          segments.length,
        );
      app.state(s.id, owner, 'drafting', s.epoch);
      app.state(s.id, owner, 'debrief', s.epoch);
      const original = b.assets.find(
        (a) => a.id === b.session.teachback?.audioId && a.kind === 'teachback',
      );
      if (original && b.session.draft.rules.length) {
        const review = app.state(s.id, owner, 'teachback', s.epoch);
        const audio = app.asset(owner, s.id, { ...original, epoch: s.epoch });
        files.push(audio.file);
        review.teachback = {
          hash: app.contentHash(review),
          text: b.session.teachback!.text,
          audioId: audio.id,
          spoken: false,
        };
        app.saveSession(review);
      }
      return { process: created.process, session: app.session(s.id, owner) };
    });
  } catch (e) {
    for (const file of files) {
      try {
        unlinkSync(file);
      } catch {}
    }
    throw e;
  }
}
