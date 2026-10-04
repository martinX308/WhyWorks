'use client';
import type { Facts } from '@/domain/contracts';
const labels: Record<keyof Facts, string> = {
  vendorKnown: 'Lieferant bekannt',
  poMatches: 'Bestellung passend',
  varianceBps: 'Abweichung (Basispunkte)',
  goodsReceiptConfirmed: 'Wareneingang bestätigt',
  bankDetailsChanged: 'Bankdaten geändert',
  verificationStatus: 'Verifikationsstatus',
};
export function FactForm({
  facts,
  onChange,
  highlighted,
}: {
  facts: Facts;
  onChange: (f: Facts) => void;
  highlighted?: string | null;
}) {
  return (
    <div className="facts">
      {Object.entries(labels)
        .filter(([k]) => k !== 'verificationStatus')
        .map(([key, label]) => (
          <label key={key} className={key === highlighted ? 'highlighted' : undefined}>
            {label}
            {key === 'varianceBps' ? (
              <input
                type="number"
                min="0"
                step="1"
                value={facts.varianceBps ?? ''}
                placeholder="Unbekannt"
                onChange={(e) =>
                  onChange({
                    ...facts,
                    varianceBps: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            ) : (
              <select
                value={
                  facts[key as keyof Facts] === null ? 'unknown' : String(facts[key as keyof Facts])
                }
                onChange={(e) =>
                  onChange({
                    ...facts,
                    [key]: e.target.value === 'unknown' ? null : e.target.value === 'true',
                  })
                }
              >
                <option value="unknown">Unbekannt</option>
                <option value="true">Ja</option>
                <option value="false">Nein</option>
              </select>
            )}
          </label>
        ))}
    </div>
  );
}
export const emptyFacts: Facts = {
  vendorKnown: null,
  poMatches: null,
  varianceBps: null,
  goodsReceiptConfirmed: null,
  bankDetailsChanged: null,
  verificationStatus: null,
};
