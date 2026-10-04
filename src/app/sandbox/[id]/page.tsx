'use client';
import { use, useState, useRef, useEffect } from 'react';
import { useResource } from '@/components/resources';
import { api } from '@/components/api';
import { FactForm, emptyFacts } from '@/components/facts';
import { drawCode, drawAnchors } from '@/components/screen';
import type { Session, Case, Facts } from '@/domain/contracts';
export default function Sandbox({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params),
    { data, error, refresh } = useResource<{ session: Session; cases: Case[] }>(
      'sessions/' + id + '/state',
    ),
    [facts, setFacts] = useState<Facts>(emptyFacts),
    [selected, setSelected] = useState<Case | null>(null),
    [localError, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current,
      ctx = c?.getContext('2d');
    if (!c || !ctx || !data?.session) return;
    ctx.fillStyle = '#111c2b';
    ctx.fillRect(0, 0, 960, 640);
    drawAnchors(ctx);
    drawCode(ctx, data.session.marker, 16);
    drawCode(ctx, selected?.id || '00000000000000000000000000000000', 32);
    ctx.fillStyle = '#c8f66a';
    ctx.font = 'bold 30px Arial';
    ctx.fillText('SYNTHETISCHES SANDBOX-ERP', 32, 100);
    ctx.fillStyle = '#fff';
    ctx.font = '21px Arial';
    ctx.fillText(
      'Layout 1 · Fall ' + (selected?.id.slice(0, 8) || 'noch nicht gespeichert'),
      32,
      145,
    );
    const entries = Object.entries(facts);
    entries.forEach(([k, v], i) => {
      ctx.fillStyle = '#a4b6ce';
      ctx.fillText(k, 32, 205 + i * 45);
      ctx.fillStyle = '#fff';
      ctx.fillText(v === null ? 'UNBEKANNT' : String(v), 480, 205 + i * 45);
    });
    ctx.fillStyle = '#26364c';
    ctx.fillRect(24, 520, 912, 80);
    ctx.fillStyle = '#fff';
    ctx.fillText('Bankkonto: •••••••••••• (synthetisch, verdeckt)', 48, 560);
    ctx.fillStyle = '#c8f66a';
    ctx.fillText(
      'Status: ' + (selected?.status || 'draft') + ' · keine validierte Expertenfreigabe',
      32,
      615,
    );
  }, [data, facts, selected]);
  useEffect(() => {
    const channel = new BroadcastChannel('blueprint-activity-' + id);
    const send = () => channel.postMessage({ kind: 'activity' });
    window.addEventListener('keydown', send);
    window.addEventListener('pointerdown', send);
    window.addEventListener('scroll', send);
    return () => {
      channel.close();
      window.removeEventListener('keydown', send);
      window.removeEventListener('pointerdown', send);
      window.removeEventListener('scroll', send);
    };
  }, [id]);
  async function save() {
    try {
      const c = selected
        ? await api<Case>('sandbox/cases/' + selected.id, 'PATCH', {
            facts,
            expectedRecordRevision: selected.recordRevision,
            expectedFactsRevision: selected.factsRevision,
          })
        : await api<Case>('sandbox/cases', 'POST', { sessionId: id, facts });
      setSelected(c);
      setFacts(c.facts);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <h1>Sandbox · Experten-Demonstration</h1>
      <p>
        Nur synthetische Daten. Im Companion diesen Tab teilen. Vor der Aufnahme einen Fall
        speichern.
      </p>
      {(error || localError) && (
        <div className="error" role="alert">
          {error || localError}
        </div>
      )}
      <section className="card">
        <select
          aria-label="Fall auswählen"
          value={selected?.id || ''}
          onChange={(e) => {
            const c = data?.cases.find((x) => x.id === e.target.value) || null;
            setSelected(c);
            setFacts(c?.facts || emptyFacts);
          }}
        >
          <option value="">Neuer Fall</option>
          {data?.cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id.slice(0, 8)} · {c.status}
            </option>
          ))}
        </select>
        <FactForm facts={facts} onChange={setFacts} />
        <div className="actions">
          <button onClick={save}>Fakten speichern</button>
          <button
            className="secondary"
            disabled={!selected}
            onClick={() => canvas.current?.requestFullscreen()}
          >
            ERP im Vollbild zeigen
          </button>
        </div>
      </section>
      <div style={{ overflow: 'auto' }}>
        <canvas
          className="sandbox"
          width="960"
          height="640"
          ref={canvas}
          aria-label="Kontrolliertes synthetisches ERP mit maskiertem Bankkonto"
        />
      </div>
    </>
  );
}
