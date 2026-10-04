import { z } from 'zod';
import {
  ClaimSchema,
  GapSchema,
  PatchSchema,
  Action,
  fields,
  type Predicate,
  type Patch,
} from '../domain/contracts';
const nullableText = z.string().nullable();
const NodeSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['compare', 'presence', 'all', 'any']),
    field: z
      .enum(Object.keys(fields) as [keyof typeof fields, ...(keyof typeof fields)[]])
      .nullable(),
    op: z.enum(['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'is_known', 'is_unknown']).nullable(),
    value: z.union([z.boolean(), z.number().int(), z.string(), z.null()]),
    children: z.array(z.string()),
  })
  .strict();
export const ExtractionWireSchema = z
  .object({
    baseDraftRevision: z.number().int(),
    claims: z.array(ClaimSchema),
    rules: z
      .array(
        z
          .object({
            id: z.string(),
            stepId: z.string(),
            scopeId: z.string(),
            requiredCapabilityIds: z.array(z.literal('sandbox_decide')),
            whenRoot: z.string(),
            predicates: z.array(NodeSchema).max(256),
            effect: z
              .object({
                kind: z.enum(['permit', 'prohibit']),
                action: Action,
                requiredAction: Action.nullable(),
                routeTo: nullableText,
                resumeRoot: nullableText,
              })
              .strict(),
            claimIds: z.array(z.string()),
            evidenceIds: z.array(z.string()),
            review: z.literal('draft'),
            usage: z.literal('exercise_only'),
          })
          .strict(),
      )
      .max(32),
    gaps: z.array(GapSchema),
    answerLinks: PatchSchema.shape.answerLinks,
  })
  .strict();

// Avoid the combinatorial nullable unions in Claude's compiled output grammar.
// The provider emits empty strings for unused references and a JSON-encoded value.
// Normalize and validate against the complete canonical wire schema before decoding.
const ProviderRuleSchema = ExtractionWireSchema.shape.rules.element.extend({
  evidenceIds: z
    .array(z.string())
    .describe(
      'For EVERY referenced claim include its segmentId AND ALL its eventIds. At least two IDs. Claim IDs are not evidence IDs.',
    ),
  predicates: z
    .array(
      NodeSchema.extend({
        field: z
          .enum(['', ...NodeSchema.shape.field.unwrap().options])
          .describe('Empty string for a compound node.'),
        op: z
          .enum(['', ...NodeSchema.shape.op.unwrap().options])
          .describe('Empty string for a compound node.'),
        value: z
          .string()
          .describe(
            'JSON-encoded literal: 200, true, false, null, or a quoted JSON string. Never an instruction.',
          ),
      }),
    )
    .max(256),
  effect: ExtractionWireSchema.shape.rules.element.shape.effect.extend({
    requiredAction: z
      .enum(['', ...Action.options])
      .describe(
        'Only for prohibit with an explicitly stated next action. ALWAYS empty string for permit.',
      ),
    routeTo: z
      .string()
      .describe(
        'Only for prohibit with an explicitly stated route. ALWAYS empty string for permit.',
      ),
    resumeRoot: z
      .string()
      .describe(
        'Only for prohibit with an explicitly stated lifting condition. ALWAYS empty string for permit.',
      ),
  }),
});
export const ExtractionProviderSchema = ExtractionWireSchema.extend({
  rules: z.array(ProviderRuleSchema).max(32),
});
export function normalizeExtraction(wire: z.infer<typeof ExtractionProviderSchema>) {
  return ExtractionWireSchema.parse({
    ...wire,
    rules: wire.rules.map((rule) => ({
      ...rule,
      predicates: rule.predicates.map((node) => ({
        ...node,
        field: node.field || null,
        op: node.op || null,
        value: JSON.parse(node.value),
      })),
      effect: {
        ...rule.effect,
        requiredAction: rule.effect.requiredAction || null,
        routeTo: rule.effect.routeTo || null,
        resumeRoot: rule.effect.resumeRoot || null,
      },
    })),
  });
}
export function decodeExtraction(wire: z.infer<typeof ExtractionWireSchema>): Patch {
  const rules = wire.rules.map((r) => {
    const nodes = new Map(r.predicates.map((p) => [p.id, p]));
    if (nodes.size !== r.predicates.length) throw new Error('Doppelte Predicate-ID');
    const used = new Set<string>();
    let count = 0;
    function build(id: string, ancestors = new Set<string>()): Predicate {
      if (ancestors.size > 8 || ++count > 256 || ancestors.has(id))
        throw new Error('AST-Tiefe, Zyklus oder Knotengrenze');
      const p = nodes.get(id);
      if (!p) throw new Error('Unbekannte Predicate-ID');
      used.add(id);
      const chain = new Set(ancestors);
      chain.add(id);
      if (p.kind === 'all' || p.kind === 'any') {
        if (p.field !== null || p.op !== null || p.value !== null || !p.children.length)
          throw new Error('Ungültiger Verbund');
        return { kind: p.kind, items: p.children.map((c) => build(c, chain)) };
      }
      if (!p.field || p.children.length) throw new Error('Ungültiges Blatt');
      if (p.kind === 'presence') {
        if (!['is_known', 'is_unknown'].includes(p.op || '') || p.value !== null)
          throw new Error('Ungültige presence');
        return { kind: 'presence', field: p.field, op: p.op as 'is_known' | 'is_unknown' };
      }
      if (!p.op || !['eq', 'neq', 'lt', 'lte', 'gt', 'gte'].includes(p.op) || p.value === null)
        throw new Error('Ungültiger Vergleich');
      return {
        kind: 'compare',
        field: p.field,
        op: p.op as 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte',
        value: p.value,
      };
    }
    const when = build(r.whenRoot),
      resumeWhen = r.effect.resumeRoot ? build(r.effect.resumeRoot) : undefined;
    if (used.size !== nodes.size) throw new Error('Unbenutzte Predicate-Knoten');
    if (
      r.effect.kind === 'permit' &&
      (r.effect.requiredAction || r.effect.routeTo || r.effect.resumeRoot)
    )
      throw new Error('Permit mit Verbotsmetadaten');
    return {
      id: r.id,
      stepId: r.stepId,
      scopeId: r.scopeId,
      requiredCapabilityIds: r.requiredCapabilityIds,
      when,
      effect:
        r.effect.kind === 'permit'
          ? { kind: 'permit' as const, action: r.effect.action }
          : {
              kind: 'prohibit' as const,
              action: r.effect.action,
              ...(r.effect.requiredAction ? { requiredAction: r.effect.requiredAction } : {}),
              ...(r.effect.routeTo ? { routeTo: r.effect.routeTo } : {}),
              ...(resumeWhen ? { resumeWhen } : {}),
            },
      claimIds: r.claimIds,
      evidenceIds: r.evidenceIds,
      review: r.review,
      usage: r.usage,
    };
  });
  return PatchSchema.parse({ ...wire, rules });
}
