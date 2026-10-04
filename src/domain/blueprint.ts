import { z } from 'zod';
import { ClaimSchema, RuleSchema, type Claim, type Rule, type Gap } from './contracts';
export const provenance = z.enum(['observed', 'described_not_observed', 'hypothetical', 'open']);
const ids = z.array(z.string().min(1)).max(100);
export const StepSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).max(300),
    kind: z.enum(['task', 'check', 'decision', 'handoff', 'wait', 'end']),
    role: z.string().min(1).max(200),
    provenance,
    claimIds: ids,
    evidenceIds: ids,
  })
  .strict();
export const EdgeSchema = z
  .object({
    id: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
    kind: z.enum(['sequence', 'conditional', 'exception', 'handoff', 'return']),
    label: z.string().min(1).max(300),
    provenance,
    claimIds: ids,
    evidenceIds: ids,
  })
  .strict();
export const WorkflowSchema = z
  .object({ steps: z.array(StepSchema).max(100), edges: z.array(EdgeSchema).max(200) })
  .strict();
export type Workflow = z.infer<typeof WorkflowSchema>;
export const OperationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('revise_rule'), rule: RuleSchema }).strict(),
  z.object({ kind: z.literal('attach_claim'), claim: ClaimSchema }).strict(),
  z.object({ kind: z.enum(['add_step', 'revise_step']), step: StepSchema }).strict(),
  z.object({ kind: z.enum(['add_edge', 'revise_edge']), edge: EdgeSchema }).strict(),
]);
export const ProposalInput = z
  .object({
    baseVersionId: z.string().min(1),
    baseDraftRevision: z.number().int().nonnegative(),
    baseHash: z.string().min(1),
    operations: z.array(OperationSchema).min(1).max(100),
  })
  .strict();
export type Proposal = z.infer<typeof ProposalInput> & {
  id: string;
  ownerId: string;
  sessionId: string;
  status: 'suggested' | 'accepted' | 'rejected' | 'request_clarification';
  diff: { kind: string; id: string; before: unknown; after: unknown }[];
  affectedRuleIds: string[];
  affectedRunIds: string[];
  affectedEvaluationIds: string[];
  regressionRequired: true;
  acceptedHash?: string;
  acceptedRevision?: number;
};
// Older captures contain decisions only. Do not invent an ordering or missing tasks.
export function projectWorkflow(model: {
  workflow?: Workflow;
  claims: Claim[];
  rules: Rule[];
  gaps?: Gap[];
}): Workflow {
  const workflow = structuredClone(model.workflow || { steps: [], edges: [] });
  for (const stepId of new Set(model.rules.map((r) => r.stepId))) {
    const rules = model.rules.filter((r) => r.stepId === stepId);
    const existing = workflow.steps.find((s) => s.id === stepId);
    if (existing) {
      existing.claimIds = [...new Set([...existing.claimIds, ...rules.flatMap((r) => r.claimIds)])];
      existing.evidenceIds = [
        ...new Set([...existing.evidenceIds, ...rules.flatMap((r) => r.evidenceIds)]),
      ];
      continue;
    }
    workflow.steps.push({
      id: stepId,
      title: 'Erklärte Entscheidung',
      kind: 'decision',
      role: 'Expert (Demo)',
      provenance: 'described_not_observed',
      claimIds: [...new Set(rules.flatMap((r) => r.claimIds))],
      evidenceIds: [...new Set(rules.flatMap((r) => r.evidenceIds))],
    });
  }
  return workflow;
}
export const OptimizeInput = z
  .object({
    versionId: z.string().min(1),
    problemClaimId: z.string().min(1),
    problem: z.string().min(1).max(1000),
    hypothesis: z.string().min(1).max(1000),
    change: z.string().min(1).max(1000),
    assumptions: z.array(z.string().min(1)).min(1).max(20),
    limits: z.array(z.string().min(1)).min(1).max(20),
    guardrailIds: ids,
  })
  .strict();
export type Optimization = z.infer<typeof OptimizeInput> & {
  id: string;
  ownerId: string;
  sessionId: string;
  evidenceIds: string[];
  status: 'suggested' | 'expert_reviewed' | 'approved_for_sandbox' | 'rejected';
};
