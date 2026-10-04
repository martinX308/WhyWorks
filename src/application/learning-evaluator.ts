// Server-only evaluator: never included in Tutor context or provider payloads.
import type { Facts, Snapshot, Action } from '../domain/contracts';
import type { LearningCase, LearningRun } from '../domain/learning';
import { gate } from '../domain/interpreter';
const expected: Record<Exclude<LearningCase, 'custom'>, Action> = {
  'L-01': 'escalate',
  'L-02': 'approve',
  'L-03': 'hold',
};
export function assess(run: LearningRun, version: Snapshot) {
  const first = run.firstAttempt,
    record = run.firstRecord;
  const target =
    run.learningCase && run.learningCase !== 'custom' ? expected[run.learningCase] : null;
  const supported = (action: Action, facts: Facts) =>
    gate(version.rules, action, facts, run.capabilities).outcome === 'allowed';
  const firstCorrect =
    !!first &&
    !!record &&
    (target ? first.action === target : true) &&
    supported(first.action, record.facts);
  const final = run.decisions?.at(-1);
  const finalCorrect =
    !!final?.committed &&
    (target ? final.action === target : true) &&
    supported(final.action, final.facts);
  const independent =
    run.type === 'independent' &&
    firstCorrect &&
    !record?.assistance.length &&
    !run.assistance.length;
  const actionStatus = independent
    ? 'selbstständig gezeigt'
    : finalCorrect
      ? 'mit Hilfe gelöst'
      : 'noch üben';
  return {
    action: { status: actionStatus, firstCorrect, finalCorrect },
    reason: {
      status: !run.reasonReview
        ? 'Prüfung offen'
        : run.reasonReview.supported && finalCorrect
          ? independent
            ? 'selbstständig gezeigt'
            : 'mit Hilfe gelöst'
          : 'noch üben',
      review: run.reasonReview ?? null,
    },
    limitation:
      'Fallbezogener Nachweis; Begründung verlangt ausdrückliches fachliches Review. Fehlende bestätigte Regeln erzeugen keinen Erfolg.',
  };
}
