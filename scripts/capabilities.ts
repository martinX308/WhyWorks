import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
try {
  process.loadEnvFile('.env.local');
} catch {}
const require = createRequire(import.meta.url);
const packages = [
  'next',
  'react',
  '@elevenlabs/react',
  '@elevenlabs/client',
  '@elevenlabs/elevenlabs-js',
  '@anthropic-ai/sdk',
  'zod',
  'sharp',
];
const db = new DatabaseSync(':memory:');
db.exec(
  'CREATE TABLE probe(id INTEGER PRIMARY KEY); BEGIN IMMEDIATE; INSERT INTO probe VALUES(1); COMMIT;',
);
const sqlite = !!db.prepare('SELECT id FROM probe').get();
db.close();
const keys = {
  anthropic: !!process.env.ANTHROPIC_API_KEY,
  elevenlabs: !!process.env.ELEVENLABS_API_KEY,
  interviewer: !!process.env.ELEVENLABS_INTERVIEWER_AGENT_ID,
  voice: !!process.env.ELEVENLABS_VOICE_ID,
};
const report = {
  date: new Date().toISOString(),
  timezone: 'Europe/Berlin',
  node: process.version,
  packages: Object.fromEntries(
    packages.map((p) => [
      p,
      JSON.parse(readFileSync('node_modules/' + p + '/package.json', 'utf8')).version,
    ]),
  ),
  configuration: keys,
  sqlite: {
    status: sqlite ? 'works' : 'blocked',
    evidence: 'In-memory BEGIN IMMEDIATE/COMMIT/read',
  },
  liveCapabilities: Object.fromEntries(
    [
      'voice_webrtc',
      'barge_in',
      'expressive_mode',
      'vision_masking_latency',
      'scribe_parallel_10min',
      'original_audio_alignment',
      'off_record_network_stop',
      'tutor_kb_procedure_pinning',
    ].map((name) => [
      name,
      {
        status: 'blocked',
        verified: false,
        reason:
          keys.anthropic && keys.elevenlabs
            ? 'Manuelle Live-Probe noch erforderlich.'
            : 'API-Zugänge werden später eingetragen; noch kein Live-Nachweis.',
      },
    ]),
  ),
  limitations: [
    'Mock-/Vertragstests ersetzen keine Live-Probe.',
    'Keine Nachkäufe; vorhandene Credits freigegeben.',
    'A1-Live-Abnahme bleibt bis zur Provider-/Browserprobe offen.',
  ],
};
writeFileSync('docs/capability-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
