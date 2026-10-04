import type { Workflow } from './blueprint';
import type { Elicitation, Question } from './elicitation';
import { z } from 'zod';
export const Action = z.enum(['approve', 'hold', 'escalate']);
export type Action = z.infer<typeof Action>;
export const fields = {
  vendorKnown: 'boolean',
  poMatches: 'boolean',
  varianceBps: 'number',
  goodsReceiptConfirmed: 'boolean',
  bankDetailsChanged: 'boolean',
  verificationStatus: 'string',
} as const;
export const Facts = z
  .object({
    vendorKnown: z.boolean().nullable(),
    poMatches: z.boolean().nullable(),
    varianceBps: z.number().int().min(0).nullable(),
    goodsReceiptConfirmed: z.boolean().nullable(),
    bankDetailsChanged: z.boolean().nullable(),
    verificationStatus: z.string().nullable(),
  })
  .strict();
export type Facts = z.infer<typeof Facts>;
export type Predicate =
  | {
      kind: 'compare';
      field: string;
      op: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte';
      value: boolean | number | string;
    }
  | { kind: 'presence'; field: string; op: 'is_known' | 'is_unknown' }
  | { kind: 'all' | 'any'; items: Predicate[] };
export const PredicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('compare'),
        field: z.enum(Object.keys(fields) as [keyof typeof fields, ...(keyof typeof fields)[]]),
        op: z.enum(['eq', 'neq', 'lt', 'lte', 'gt', 'gte']),
        value: z.union([z.boolean(), z.number().int(), z.string()]),
      })
      .strict(),
    z
      .object({
        kind: z.literal('presence'),
        field: z.enum(Object.keys(fields) as [keyof typeof fields, ...(keyof typeof fields)[]]),
        op: z.enum(['is_known', 'is_unknown']),
      })
      .strict(),
    z
      .object({ kind: z.enum(['all', 'any']), items: z.array(PredicateSchema).min(1).max(32) })
      .strict(),
  ]),
);
export const RuleSchema = z
  .object({
    id: z.string(),
    stepId: z.string(),
    scopeId: z.string(),
    requiredCapabilityIds: z.array(z.literal('sandbox_decide')).min(1),
    when: PredicateSchema,
    effect: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('permit'), action: Action }).strict(),
      z
        .object({
          kind: z.literal('prohibit'),
          action: Action,
          requiredAction: Action.optional(),
          routeTo: z.string().optional(),
          resumeWhen: PredicateSchema.optional(),
        })
        .strict(),
    ]),
    claimIds: z.array(z.string()).min(1),
    evidenceIds: z.array(z.string()).min(2),
    review: z.enum(['draft', 'expert_confirmed']),
    usage: z.literal('exercise_only'),
  })
  .strict();
export type Rule = z.infer<typeof RuleSchema>;
export const EventSchema = z
  .object({
    id: z.string(),
    sequence: z.number().int().positive(),
    epoch: z.number().int().positive(),
    atMs: z.number().nonnegative(),
    caseId: z.string(),
    source: z.literal('screen_observation'),
    facts: Facts,
    frameId: z.string(),
  })
  .strict();
export type ScreenEvent = z.infer<typeof EventSchema>;
export const SegmentSchema = z
  .object({
    id: z.string(),
    sequence: z.number().int().positive(),
    epoch: z.number().int().positive(),
    atMs: z.number().nonnegative(),
    endMs: z.number().nonnegative(),
    caseId: z.string(),
    source: z.enum(['expert_statement', 'agent_transcript_fallback']),
    text: z.string().min(1).max(12000),
    committed: z.literal(true),
    audioId: z.string().nullable(),
    timing: z.enum(['word_aligned', 'approximate', 'audio_unavailable']),
    phase: z.enum(['live', 'debrief']).optional(),
  })
  .strict()
  .refine((x) => x.endMs >= x.atMs);
export type Segment = z.infer<typeof SegmentSchema>;
export const ClaimSchema = z
  .object({
    id: z.string(),
    segmentId: z.string(),
    eventIds: z.array(z.string()).min(1),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    quote: z.string().min(1),
    meaning: z.string().min(1),
    origin: z.literal('expert_statement'),
    review: z.enum(['draft', 'expert_confirmed']),
    supersedesClaimId: z.string().nullable(),
  })
  .strict();
export type Claim = z.infer<typeof ClaimSchema>;
export const GapSchema = z
  .object({
    id: z.string(),
    topic: z.string(),
    critical: z.boolean(),
    status: z.enum([
      'open',
      'answer_received',
      'provisionally_answered',
      'confirmed',
      'conflict_open',
    ]),
    claimIds: z.array(z.string()),
  })
  .strict();
export type Gap = z.infer<typeof GapSchema>;
export const PatchSchema = z
  .object({
    baseDraftRevision: z.number().int(),
    claims: z.array(ClaimSchema),
    rules: z.array(RuleSchema).max(32),
    gaps: z.array(GapSchema),
    answerLinks: z.array(
      z
        .object({
          questionId: z.string(),
          segmentIds: z.array(z.string()),
          claimIds: z.array(z.string()),
          gapIds: z.array(z.string()),
          confirmed: z.literal(false),
        })
        .strict(),
    ),
  })
  .strict();
export type Patch = z.infer<typeof PatchSchema>;
export type Draft = {
  workflow?: Workflow;
  revision: number;
  lastProcessedSegmentSequence: number;
  claims: Claim[];
  rules: Rule[];
  gaps: Gap[];
  answerLinks: {
    id: string;
    questionId: string;
    segmentIds: string[];
    claimIds: string[];
    gapIds: string[];
    confirmed: boolean;
  }[];
};
export type CaptureState =
  | 'ready'
  | 'capture'
  | 'paused'
  | 'off_record'
  | 'drafting'
  | 'debrief'
  | 'teachback'
  | 'review'
  | 'published';
export const transitions: Record<CaptureState, CaptureState[]> = {
  ready: ['capture'],
  capture: ['paused', 'off_record', 'drafting'],
  paused: ['capture', 'debrief', 'off_record', 'drafting'],
  off_record: ['capture', 'debrief'],
  drafting: ['debrief'],
  debrief: ['teachback', 'off_record', 'paused'],
  teachback: ['review', 'debrief'],
  review: ['published', 'debrief'],
  published: [],
};
export type Session = {
  improvement?: { baseVersionId: string; proposalId?: string };
  id: string;
  ownerId: string;
  processId: string;
  state: CaptureState;
  epoch: number;
  stateRevision: number;
  resumeState?: 'capture' | 'debrief';
  startedAt: number;
  epochStartedAt: number;
  captureMs: number;
  marker: string;
  sourceMode: 'live' | 'replay';
  draft: Draft;
  draftIds: Record<string, string>;
  teachback: null | { hash: string; text: string; audioId: string; spoken: boolean };
  questions: Question[];
  elicitation: Elicitation;
};
export type Process = {
  id: string;
  ownerId: string;
  title: string;
  sessionId: string;
  publishedVersionId: string | null;
  acceptanceProfile: 'technical_spike' | 'challenge_initial';
};
export type Confirmation = {
  id: string;
  ownerId: string;
  sessionId: string;
  kind: 'assignment' | 'representation' | 'domain_validity' | 'version_release';
  subjectHash: string;
  scopeId: string;
  actorId: string;
  at: number;
};
export type Snapshot = {
  workflow?: Workflow;
  gaps?: Gap[];
  parentVersionId?: string;
  reviewProposalId?: string;
  elicitation?: Elicitation;
  questions?: Question[];
  sourceMode: 'live' | 'replay';
  id: string;
  processId: string;
  sessionId: string;
  contentHash: string;
  scopeId: string;
  claims: Claim[];
  rules: Rule[];
  usage: 'exercise_only';
  acceptanceProfile: 'technical_spike' | 'challenge_initial';
  confirmationIds: string[];
  revoked: boolean;
};
export type Case = {
  id: string;
  sessionId: string;
  ownerId: string;
  facts: Facts;
  recordRevision: number;
  factsRevision: number;
  status: 'draft' | 'approved' | 'held' | 'escalated';
};
export type Run = {
  id: string;
  ownerId: string;
  versionId: string;
  contentHash: string;
  scopeId: string;
  caseId: string;
  type: 'coached' | 'independent';
  capabilities: ['sandbox_decide'];
  firstAttempt: null | { action: Action; reason: string };
  assistance: string[];
};
export type Operation = {
  id: string;
  ownerId: string;
  sessionId: string;
  kind: 'extract' | 'vision' | 'teachback';
  inputRevision: number;
  inputHash: string;
  epoch: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  leaseExpiresAt: number;
  resultRef: string | null;
  error: string | null;
  payload: unknown;
  promptHash: string;
  model: string;
};
