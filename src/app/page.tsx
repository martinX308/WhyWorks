'use client';
import { useState, useEffect } from 'react';
import { api } from '@/components/api';
import type { Process, Session } from '@/domain/contracts';
export default function Home() {
  const [ready, setReady] = useState(false),
    [title, setTitle] = useState('Lieferantenrechnung prüfen'),
    [processes, setProcesses] = useState<Process[]>([]),
    [error, setError] = useState(''),
    [sourceMode, setSourceMode] = useState<'live' | 'replay'>('live'),
    [caps, setCaps] = useState<{ credentials: Record<string, boolean> } | null>(null);
  useEffect(() => {
    void api('bootstrap', 'POST', {})
      .then(async () => {
        setProcesses(await api<Process[]>('processes'));
        setCaps(await api('capabilities'));
        setReady(true);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function create(profile: 'technical_spike' | 'challenge_initial' = 'technical_spike') {
    try {
      const result = await api<{ process: Process; session: Session }>(
        profile === 'challenge_initial' ? 'processes/challenge' : 'processes',
        'POST',
        profile === 'challenge_initial' ? { title } : { title, sourceMode },
      );
      location.href = '/capture/' + result.session.id;
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <p className="muted">Technischer Durchstich · lokale Einzelplatz-Demo</p>
      <h1>Vom Expertenmoment zur geprüften Handlung</h1>
      <p>Echtes Wissen erfassen, ausdrücklich bestätigen und in einem neuen Fall anwenden.</p>
      <div className="notice">
        Spike-Übung · keine vollständige Challenge-Abnahme · Produktionsfreigabe und AI-Ausführung
        deaktiviert
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <div className="grid">
        <section className="card">
          <h2>Neue Lernschleife</h2>
          <label>
            Prozessname
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            Quellmodus
            <select
              value={sourceMode}
              onChange={(e) => setSourceMode(e.target.value as 'live' | 'replay')}
            >
              <option value="live">Live · leere Regelbasis</option>
              <option value="replay">TEST-REPLAY · keine Live-Abnahme</option>
            </select>
          </label>
          <button disabled={!ready} onClick={() => create()}>
            Leeren Spike-Prozess starten
          </button>
          <button
            className="secondary"
            disabled={!ready || sourceMode !== 'live'}
            onClick={() => create('challenge_initial')}
          >
            Leere Live-Challenge starten
          </button>
          {sourceMode === 'replay' && (
            <label>
              Exportierte Session ausdrücklich als TEST-REPLAY laden (max. 7 MB)
              <input
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    if (file.size > 6_900_000) throw new Error('Replay-Export größer als 7 MB.');
                    const result = await api<{ process: Process }>('replay', 'POST', {
                      title,
                      bundle: JSON.parse(await file.text()),
                    });
                    location.href = '/processes/' + result.process.id;
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              />
            </label>
          )}
          <p className="muted">
            Keine Fachregeln oder Musterlösungen werden vorgeladen. Reset erfolgt durch einen neuen
            Prozess. Der Reset verwirft nur die gewählte Session; historische IDs bleiben widerrufen
            erhalten, Providerbereinigung bleibt offen.
          </p>
        </section>
        <section className="card">
          <h2>A0 · Konfiguration</h2>
          {caps &&
            Object.entries(caps.credentials).map(([key, value]) => (
              <div className="row" key={key}>
                <span>{key}</span>
                <span>{value ? 'Bereitgestellt' : 'Noch nicht eingetragen'}</span>
              </div>
            ))}
          <p className="muted">
            Kontozugang und Live-Nachweise sind getrennt. Die Anleitung und der Capability-Report
            liegen im Repository.
          </p>
        </section>
      </div>
      <section className="card">
        <h2>Lokale Prozesse</h2>
        {processes.length ? (
          processes.map((p) => (
            <div className="row" key={p.id}>
              <a href={'/processes/' + p.id}>{p.title}</a>
              <a href={'/capture/' + p.sessionId}>Capture öffnen</a>
              <button
                className="danger"
                onClick={async () => {
                  try {
                    const result = await api<{ session: Session; localCleanup: string }>(
                      'processes/' + p.id + '/reset',
                      'POST',
                      {},
                    );
                    if (result.localCleanup === 'failed') {
                      setError(
                        'Reset angelegt; Dateibereinigung der alten Session fehlgeschlagen. Dort erneut versuchen.',
                      );
                      setProcesses(await api<Process[]>('processes'));
                      return;
                    }
                    location.href = '/capture/' + result.session.id;
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Lokale Quellen verwerfen und leer neu starten
              </button>
            </div>
          ))
        ) : (
          <p className="muted">Noch keine gespeicherte Lernschleife.</p>
        )}
      </section>
    </>
  );
}
