import type { Facts, Patch, Rule } from '../src/domain/contracts';
export const testFacts: Facts = {
  vendorKnown: true,
  poMatches: true,
  varianceBps: 150,
  goodsReceiptConfirmed: true,
  bankDetailsChanged: false,
  verificationStatus: null,
};
export function testWords(limit = 200) {
  return `Ab ${limit} Basispunkten stoppen. Darunter freigeben, wenn Lieferant bekannt, Bestellung passend, Wareneingang bestätigt und Bankdaten unverändert sind.`;
}
export function learnedPatch(
  text: string,
  eventId: string,
  segmentId: string,
  limit = 200,
  revision = 0,
): Patch {
  const source = {
    stepId: 'decision-spike',
    scopeId: 'scope-spike',
    requiredCapabilityIds: ['sandbox_decide'] as ['sandbox_decide'],
    claimIds: ['cl-1'],
    evidenceIds: [eventId, segmentId],
    review: 'draft' as const,
    usage: 'exercise_only' as const,
  };
  const rules: Rule[] = [
    {
      ...source,
      id: 'r-1',
      when: { kind: 'compare', field: 'varianceBps', op: 'gte', value: limit },
      effect: { kind: 'prohibit', action: 'approve' },
    },
    {
      ...source,
      id: 'r-2',
      when: {
        kind: 'all',
        items: [
          { kind: 'compare', field: 'varianceBps', op: 'lt', value: limit },
          ...['vendorKnown', 'poMatches', 'goodsReceiptConfirmed'].map((field) => ({
            kind: 'compare' as const,
            field,
            op: 'eq' as const,
            value: true,
          })),
          { kind: 'compare', field: 'bankDetailsChanged', op: 'eq', value: false },
        ],
      },
      effect: { kind: 'permit', action: 'approve' },
    },
  ];
  return {
    baseDraftRevision: revision,
    claims: [
      {
        id: 'cl-1',
        segmentId,
        eventIds: [eventId],
        start: 0,
        end: text.length,
        quote: text,
        meaning: text,
        origin: 'expert_statement',
        review: 'draft',
        supersedesClaimId: null,
      },
    ],
    rules,
    gaps: [],
    answerLinks: [],
  };
}
