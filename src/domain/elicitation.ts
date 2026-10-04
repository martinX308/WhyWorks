import { z } from 'zod';
import type { Draft, Facts, ScreenEvent, Session } from './contracts';

export type QuestionPhase = 'live' | 'debrief';
export const CandidateSchema = z
  .object({
    question: z.string().min(1).max(600),
    gapIds: z.array(z.string()).max(8),
    eventIds: z.array(z.string()).min(1).max(8),
    caseId: z.string().min(1),
    topicKey: z.string().min(1).max(160),
    kind: z.enum(['guardrail', 'branch', 'condition', 'exception', 'reason', 'counterfactual']),
  })
  .strict();
export type Candidate = z.infer<typeof CandidateSchema>;
export type Question = Candidate & {
  id: string;
  phase: QuestionPhase;
  epoch: number;
  draftRevision: number;
  createdAt: number;
  expiresAt: number;
  priority: number;
  status:
    | 'planned'
    | 'deferred'
    | 'released'
    | 'transcript_seen'
    | 'completed'
    | 'interrupted'
    | 'cancelled'
    | 'unanswered';
  releasedAt: number | null;
  spokenAtMs: number | null;
  transcript: string | null;
};
export type LearningEvent = {
  id: string;
  questionId: string;
  linkId: string;
  linkHash: string;
  gapId: string;
  topicKey: string;
  phase: QuestionPhase;
  draftRevision: number;
  atMs: number;
};
export type Counterfactual = {
  id: string;
  questionId: string;
  baseEventId: string;
  caseId: string;
  facts: Facts;
  changedField: 'goodsReceiptConfirmed';
  classification: 'confirming_test' | 'open_condition';
};
export type Elicitation = {
  debriefStartedAt: number | null;
  knownTopicsAtDebrief: string[];
  learningEvents: LearningEvent[];
  counterfactuals: Counterfactual[];
};
export const emptyElicitation = (): Elicitation => ({
  debriefStartedAt: null,
  knownTopicsAtDebrief: [],
  learningEvents: [],
  counterfactuals: [],
});
export const topicKey = (topic: string) =>
  topic.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
export const priorities: Record<Candidate['kind'], number> = {
  guardrail: 0,
  branch: 1,
  condition: 2,
  exception: 3,
  counterfactual: 4,
  reason: 5,
};

export const QuestionPlanSchema = z
  .object({ candidates: z.array(CandidateSchema).max(5) })
  .strict();
export function rankCandidates(input: Candidate[]) {
  return [...input].sort((a, b) => priorities[a.kind] - priorities[b.kind]);
}
export function openTopics(draft: Draft) {
  return draft.gaps.filter((g) => ['open', 'conflict_open'].includes(g.status));
}
export function selectDebriefTopics(draft: Draft, knownTopics: string[]) {
  const sorted = openTopics(draft)
    .filter((g) => !knownTopics.includes(topicKey(g.topic)))
    .sort(
      (a, b) =>
        Number(b.critical) - Number(a.critical) ||
        Number(b.status === 'conflict_open') - Number(a.status === 'conflict_open') ||
        a.id.localeCompare(b.id),
    );
  const seen = new Set<string>();
  return sorted
    .filter((g) => {
      const key = topicKey(g.topic);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}
export const ActivitySchema = z
  .object({
    recordedAt: z.number().nonnegative(),
    lastActivityAt: z.number().nonnegative(),
    screenStableSince: z.number().nonnegative(),
    expertSpeaking: z.boolean(),
    agentSpeaking: z.boolean(),
    boundary: z.enum(['none', 'completed_check', 'explicit_request']),
  })
  .strict();
export type Activity = z.infer<typeof ActivitySchema>;
export function releaseDecision(
  q: Question,
  s: Session,
  events: ScreenEvent[],
  a: Activity,
  now: number,
) {
  if (
    q.epoch !== s.epoch ||
    q.draftRevision !== s.draft.revision ||
    q.expiresAt <= now ||
    (q.phase === 'live' ? s.state !== 'capture' : s.state !== 'debrief')
  )
    return 'discard' as const;
  const latest = events
    .filter((e) => e.epoch === s.epoch)
    .sort((a, b) => a.sequence - b.sequence)
    .at(-1);
  if (
    q.phase === 'live' &&
    (!latest || latest.caseId !== q.caseId || now - s.startedAt - latest.atMs > 5000)
  )
    return 'discard' as const;
  if (
    !q.eventIds.every((id) => events.some((e) => e.id === id && e.caseId === q.caseId)) ||
    !q.gapIds.every((id) =>
      s.draft.gaps.some((g) => g.id === id && ['open', 'conflict_open'].includes(g.status)),
    )
  )
    return 'discard' as const;
  if (
    ![a.recordedAt, a.lastActivityAt, a.screenStableSince].every((t) => t <= now) ||
    now - a.recordedAt > 2000 ||
    a.expertSpeaking ||
    a.agentSpeaking ||
    now - a.lastActivityAt < 2000 ||
    (q.phase === 'live' && (now - a.screenStableSince < 1500 || a.boundary === 'none'))
  )
    return 'defer' as const;
  const released = s.questions.filter((x) => x.phase === q.phase && x.releasedAt !== null);
  if (
    s.questions.some(
      (x) =>
        ['released', 'transcript_seen'].includes(x.status) ||
        (x.status === 'completed' &&
          !s.draft.answerLinks.some((l) => l.questionId === x.id && l.confirmed)),
    )
  )
    return 'defer' as const;
  if (
    q.phase === 'live' &&
    (released.some((x) => now - x.releasedAt! < 30000) ||
      released.filter((x) => now - x.releasedAt! < 600000).length >= 5)
  )
    return 'defer' as const;
  return 'release' as const;
}
