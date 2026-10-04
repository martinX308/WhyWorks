'use client';
import { useState, useEffect } from 'react';
import { api } from '@/components/api';
import type { Process, Session } from '@/domain/contracts';
export default function Home() {
  const [ready, setReady] = useState(false),
    [title, setTitle] = useState('Lieferantenrechnung prüfen'),
    [processes, setProcesses] = useState<Process[]>([]),
    [error, setError] = useState(''),
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
  async function create() {
    try {
      const result = await api<{ process: Process; session: Session }>('processes', 'POST', {
        title,
      });
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
          <button disabled={!ready} onClick={create}>
            Leeren Spike-Prozess starten
          </button>
          <p className="muted">
            Keine Fachregeln oder Musterlösungen werden vorgeladen. Reset erfolgt durch einen neuen
            Prozess.
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
            </div>
          ))
        ) : (
          <p className="muted">Noch keine gespeicherte Lernschleife.</p>
        )}
      </section>
    </>
  );
}
