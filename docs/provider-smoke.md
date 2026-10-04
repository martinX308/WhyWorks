# A1/A2 — erste Provider-Basisprüfung

Stand: 4. Oktober 2026. **Sieben Prüfschritte mit echten Provider-Aufrufen bestanden.** Die vollständige Browser-/Expertenabnahme von A1/A2 bleibt offen. Maschinenlesbare Ergebnisse, Dauer und verfügbare Usage: [provider-smoke-report.json](provider-smoke-report.json).

| Prüfschritt | Ergebnis |
|---|---|
| Interviewer | Passender Prompt, Englisch, feste Version, richtige Voice, Provider-Audio-Saving deaktiviert |
| WebRTC | Token für feste Interviewerversion tatsächlich ausgegeben; keine Browser-Unterhaltung gestartet |
| Teach-back-TTS | Echte WAV-Ausgabe für den synthetischen Regeltext |
| Realtime-Scribe | Erzeugte Sprache über echte WebSocket-Verbindung transkribiert; committed Text mit Wortzeiten, Grenze und Voraussetzungen erhalten |
| Claude-Vision | Alle sichtbaren Fakten des synthetischen Testbilds korrekt gelesen |
| Extraktion und Gate | Echtes Scribe-Transkript extrahiert; kanonische Schema-, Zitat- und Quellenprüfung bestanden; vollständiger Fall erlaubt, 240 bps blockiert, unbekannter Wareneingang nicht erlaubt |
| A2-Fragenplanung | Englische Guardrail-Frage an den vorgegebenen Fall, Event und Gap gebunden |

## Gefundene Fehler und Korrekturen

- Der Provider wies das ursprüngliche Extraktionsschema mit HTTP 400 ab: „compiled grammar is too large“. Im Providerformat sind unbenutzte Referenzen jetzt leere Strings und Predicate-Werte JSON-kodierte Literale. Der Server normalisiert die Ausgabe und prüft weiterhin das vollständige kanonische Schema sowie die AST. Die [offizielle Dokumentation zu strukturierten Ausgaben](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) beschreibt diese Grenzen der Grammatikkompilierung.
- Weitere echte Extraktionsversuche wurden wegen unzulässiger Permit-Metadaten bzw. unvollständiger Evidence-IDs zurückgewiesen. Prompt und Transportbeschreibungen verlangen jetzt ausdrücklich leere Verbotsmetadaten für Permits sowie Segment-ID und alle ScreenEvent-IDs jedes verwendeten Claims. Die Serverprüfung blieb bestehen. Der anschließende Extraktionsversuch bestand Quellenprüfung und Gate-Szenarien.
- Das Testskript wartet vor der Audioübertragung auf Scribes `session_started`; `Scribe.connect()` allein bestätigt noch keine geöffnete Verbindung.

## Wiederholen und Grenzen

`pnpm test:live-smoke` verwendet `.env.local`, echte Provider und vorhandene Credits. `pnpm test:live-smoke --retry-extraction` verwendet das zuvor erhaltene synthetische Scribe-Transkript und wiederholt nur die Extraktion. Das Skript ist getrennt von den kostenfreien Vertragstests und veröffentlicht keine Version. Seine Datenbank ist ausschließlich im Speicher; Audio wird unter `data/live-smoke/` abgelegt. Schlüssel und Verbindungstokens erscheinen nicht im Report.

Die Probe verwendet ein generiertes Bild und erzeugte Sprache. Sie belegt Providerzugriff und eine kleine Audio-/Wissenskette, aber keine Shopify-Aufnahme, Browser-Mikrofonerfassung, zehnminütige Parallelaufnahme, hörbare Unterbrechbarkeit, Off-record-Netzwerksperre, Tutor-Provisionierung oder vollständigen Challenge-Publish. Die A2-Live-/Debrief-Quoten werden nicht gezählt. Usage im Report betrifft die erhaltenen erfolgreichen Antworten; frühere Diagnoseversuche und Geldkosten sind nicht vollständig erfasst.
