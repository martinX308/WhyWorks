import { fields, type Predicate, type Rule, type Action, type Facts } from './contracts';
export type Truth = true | false | 'unknown';
export function validatePredicate(p: Predicate, depth = 0, count = { value: 0 }): void {
  if (depth > 8 || ++count.value > 256) throw new Error('AST limit');
  if ('items' in p) {
    p.items.forEach((x) => validatePredicate(x, depth + 1, count));
    return;
  }
  if (!Object.hasOwn(fields, p.field)) throw new Error('Unknown field');
  const type = fields[p.field as keyof typeof fields];
  if (
    p.kind === 'compare' &&
    (typeof p.value !== type ||
      (!['eq', 'neq'].includes(p.op) && type !== 'number') ||
      (type === 'number' && (!Number.isSafeInteger(p.value) || Number(p.value) < 0)))
  )
    throw new Error('Operator/value type mismatch');
}
export function evaluate(p: Predicate, facts: Partial<Facts>): Truth {
  if ('items' in p) {
    const values = p.items.map((x) => evaluate(x, facts));
    if (p.kind === 'all')
      return values.includes(false) ? false : values.includes('unknown') ? 'unknown' : true;
    return values.includes(true) ? true : values.includes('unknown') ? 'unknown' : false;
  }
  const value = facts[p.field as keyof Facts];
  const known =
    value !== null &&
    value !== undefined &&
    typeof value === fields[p.field as keyof typeof fields] &&
    (typeof value !== 'number' || Number.isSafeInteger(value));
  if (p.kind === 'presence') return p.op === 'is_known' ? known : !known;
  if (!known) return 'unknown';
  switch (p.op) {
    case 'eq':
      return value === p.value;
    case 'neq':
      return value !== p.value;
    case 'lt':
      return Number(value) < Number(p.value);
    case 'lte':
      return Number(value) <= Number(p.value);
    case 'gt':
      return Number(value) > Number(p.value);
    case 'gte':
      return Number(value) >= Number(p.value);
  }
}
export function gate(rules: Rule[], action: Action, facts: Partial<Facts>, capabilities: string[]) {
  if (rules.some((r) => r.review !== 'expert_confirmed' || r.usage !== 'exercise_only'))
    return { outcome: 'unknown' as const, ruleIds: [], evidenceIds: [] };
  const active = rules.filter((r) => r.effect.action === action);
  const tested = active.map((rule) => {
    let truth = evaluate(rule.when, facts);
    if (rule.effect.kind === 'prohibit' && truth === true && rule.effect.resumeWhen) {
      const resume = evaluate(rule.effect.resumeWhen, facts);
      truth = resume === true ? false : resume === 'unknown' ? 'unknown' : true;
    }
    return { rule, truth };
  });
  const forbidden = tested.filter((x) => x.rule.effect.kind === 'prohibit' && x.truth === true);
  const uncertain = tested.filter(
    (x) => x.rule.effect.kind === 'prohibit' && x.truth === 'unknown',
  );
  const permitted = tested.filter((x) => x.rule.effect.kind === 'permit' && x.truth === true);
  const missing = tested.some(
    (x) =>
      x.truth !== false && x.rule.requiredCapabilityIds.some((id) => !capabilities.includes(id)),
  );
  const outcome = missing
    ? 'unknown'
    : forbidden.length
      ? 'blocked'
      : uncertain.length
        ? 'unknown'
        : permitted.length
          ? 'allowed'
          : 'unknown';
  const reasons =
    outcome === 'blocked'
      ? forbidden
      : outcome === 'allowed'
        ? permitted
        : tested.filter((x) => x.truth !== false);
  return {
    outcome: outcome as 'allowed' | 'blocked' | 'unknown',
    ruleIds: reasons.map((x) => x.rule.id),
    evidenceIds: [...new Set(reasons.flatMap((x) => x.rule.evidenceIds))],
  };
}
