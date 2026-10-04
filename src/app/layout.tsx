import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Operational Blueprint · A3',
  description: 'Quellenbasierte Lernschleife in der lokalen Sandbox',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <header className="app-header">
          <a href="/" className="brand">
            ◈ Operational Blueprint
          </a>
          <span className="badge">A3 · Nur Übungen · Live-Abnahme offen</span>
        </header>
        <nav className="lifecycle" aria-label="Lifecycle">
          Capture <span>→</span> Blueprint <span>→</span> Evaluate <span>→</span> Teach{' '}
          <span>→</span> Improve <span>→</span> Control
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
