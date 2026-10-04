# A0/A1 — Implementierung und Abnahmestand

Stand: 4. Oktober 2026. **Code und automatisierte Prüfungen vorhanden; autonome Provider-Basisprüfung bestanden; A1-Live-Abnahme offen.** API-Zugänge sind lokal eingetragen; der ElevenLabs-Interviewer wurde angelegt und seine Konfiguration über die API geprüft. Die vollständige Browser-/Expertenaufnahme steht aus. Vorhandene Credits sind freigegeben; Nachkäufe nicht.

### Provider-Konfiguration geprüft

Die erste autonome Provider-Basisprüfung vom 4. Oktober 2026 ist bestanden: Interviewer, WebRTC-Tokenausgabe, TTS, Realtime-Scribe mit erzeugter Sprache, Vision auf synthetischem Bild, Extraktion mit Quellen-/Gateprüfung und A2-Fragenplanung. Dabei wurden das zu komplexe Claude-Extraktionsformat und unpräzise Transportanweisungen korrigiert. Siehe [Provider-Basisprüfung](provider-smoke.md). Eine tatsächliche Browser-Unterhaltung und die vollständige A1-Live-Schleife sind weiterhin ungeprüft.

- Die ursprünglich eingetragene Voice-ID war im Konto nicht verfügbar. Für das englische Produkt und die englische Demo ist jetzt „River – Relaxed, Neutral, Informative“ (amerikanisches Englisch) lokal konfiguriert. Der bestehende Interviewer wurde mit `pnpm provision:interviewer --sync` aktualisiert; die Providerantwort bestätigt `language: en`, die River-Voice-ID und den passenden Prompt. Fragenplanung, neue Tutor-Agenten und Scribe sind ebenfalls auf Englisch eingestellt. Bestehende gepinnte Tutorversionen werden dadurch nicht verändert; für die Probe eine neue Version/Übung anlegen. TypeScript und alle 42 aktuellen Vitest-Tests bestanden.
- `pnpm provision:interviewer` hat den Interviewer angelegt und seine ID in `.env.local` gespeichert. Ein erneuter Abruf bestätigt die Übereinstimmung mit dem lokalen Interviewer-Prompt und eine vorhandene Agentversion.
- Effektive TTS-Konfiguration: `eleven_v3_conversational`, `expressiveMode: true`. Effektive Privacy-Konfiguration: `recordVoice: false`, `retentionDays: 0`, `deleteTranscriptAndPii: true`, `deleteAudio: true`. `zeroRetentionMode` ist laut Providerantwort nicht aktiviert; die Konfiguration allein beweist keine vollständige Abwesenheit serverseitiger Verarbeitung oder Speicherung.
- `pnpm capabilities` bestätigt vorhandene lokale Konfiguration für Anthropic, ElevenLabs, Interviewer und Stimme. Dies ist kein Nachweis für Claude-Modellzugriff, Audioqualität, WebRTC, paralleles Scribe oder die vollständige Lernschleife.

## Funktionierende, geprüfte Fähigkeiten

- Leerer Prozess und lokale rollengetrennte Demo-Session, persistierte Quellen, exakte Zitate, KnowledgeDraft mit Revision, Gaps und korrigierbaren AnswerLinks.
- Explizite vierteilige Bestätigung, Inhalts-Hash, Teach-back-Wiedergabeprüfung und unveränderliche `technical_spike`-/`exercise_only`-Version.
- Typisierte Dreiwert-DSL: Unknown-Semantik, kein Default-Allow, Verbot vor Permit, Resume erteilt kein Permit, AST-/Feld-/Operatorgrenzen.
- Atomarer SQLite-Commit mit gepinnter Version, servergebundener Sandbox-Befugnis, beiden Fallrevisionen und Idempotenz. Direkte Requests umgehen das Gate nicht.
- Neue Testfälle: falsches Approve blockiert, Originalquelle erreichbar, positive Kontrolle tatsächlich gespeichert. Getrennte 2-%-/1-%-Testquellen verändern bei 150 bps das Ergebnis.
- Serverseitige Sourcescope-, Quote- und Referenzprüfungen. Quellenwiderruf sperrt abhängige Versionen/Übungen; Selbstverifikation wird abgewiesen.
- Client-/Servermaskierung des kontrollierten Sandbox-Layouts. Falsche Marker, fehlende Maske und falsche Framegröße werden zurückgewiesen.
- Lokaler PCM-/WAV-Pfad mit Wortzeitclip, begrenztem Buffer und Cleanup bei Mikrofon-/Workletfehlern. Getesteter Stop verhindert weitere Sends/Commits im simulierten Audiopfad.
- Persistierte Provideroperationen mit Lease/Status, explizitem Retry und Schutz gegen stale Draft/Epoch. Reload lädt Daten, startet aber keine Aufnahme.
- Export/Verwerfen der lokalen Quellen, permanente Kennzeichnung von Test-Replays, Erstentscheidung vor Feedback und getrennte Hilfeereignisse.

Automatisierte Nachweise: **21 Vitest-Tests bestanden** für Domain, API, SDK, Wissenbindung, Medien und Audio. **Zwei Playwright-Szenarien bestanden**: zwei Tabs, Quellen-/Review-/Commit-Kette, Reload und Off record. TypeScript-Prüfung und Produktionsbuild erfolgreich. Live-Abnahme wird daraus nicht abgeleitet.

## A0-Capability-Matrix

| Fähigkeit | Status | Was noch fehlt |
|---|---|---|
| Runtime, SQLite und Quellen-/Commit-Verträge | works | keine Live-Providerabhängigkeit für diese technischen Nachweise |
| WebRTC, geduldige Voice und Unterbrechbarkeit | ungeprüft | Interviewer provisioniert; tatsächliche englische Unterhaltung ausstehend |
| Expressive Mode | konfiguriert / live ungeprüft | API bestätigt aktivierte Konfiguration; hörbare Live-Probe ausstehend |
| Reale Vision und Kontextlatenz | blocked / ungeprüft | Key/Modellzugriff, reale maskierte Screenaufnahme und korrektes Event |
| Scribe parallel zum Agent über zehn Minuten | blocked / ungeprüft | tatsächlicher zweiter Mikrofonzugriff, Stabilität, Wortzeiten und Echoverhalten |
| Originalaudio im realen Gespräch | limited | WAV-/Clipmechanik getestet; tatsächliche Zeitabweichung und Quellenqualität ungeprüft |
| Off record in echten Providerverbindungen | limited | lokaler Stop-/Epochschutz geprüft; Netzwerk-/Providerprobe ausstehend |
| Tutor-KB/Procedure-Versionbindung | blocked / ungeprüft | echte Konto-Provisionierung und Nachweis, dass der Token die unveränderte Version nutzt |
| Vollständige A1-Live-Schleife | blocked / ungeprüft | reale Quelle und Provider-Ausgaben statt Testsubstituten |

## Abweichungen und Grenzen

1. Claude-Transport enthält flache Predicate-IDs, weil rekursive Structured-Output-Schemas nicht unterstützt werden. Die kanonische RFC-AST wird danach validierend aufgebaut.
2. Die Sandbox verwendet einen kontrollierten 960×640-Canvas mit Session-/Fallcodes. Damit sind Quellenprüfung und Maskierung prüfbar; es wird keine allgemeine Maskierung beliebiger ERP-Webseiten behauptet.
3. Scribe-Fehler pausieren die Erfassung. Agent-Transkript plus unabhängiges Originalaudio als alternativer Capture-Pfad ist noch nicht live validiert und wird nicht automatisch aktiviert. Ein eigener Voice-Orchestrator ist nicht implementiert.
4. KB-/Procedure-Fehler können zu einem dokumentierten festen Runtime-Prompt mit Server-Lookup führen. Fehlende feste Agentversion blockiert vollständig. Providerressourcen sind lokal protokolliert; deren spätere Löschung bleibt separat ungeprüft.
5. A1 speichert kanonische JSON-Aggregate mit relationalen Identitäten/Scopes. Die vollständigen Projektionstabellen, Multi-Expert-Zuordnung und Änderungen mehrerer Versionen aus Lieferung B sind noch nicht ausgebaut.
6. A2 ergänzt den persistenten Scheduler und verknüpft Agenttext mit clientseitigem Playback-/Interruption-Nachweis. Tatsächliche vollständige Aussprache und spontane Rückfragen benötigen weiterhin Conversation-/Audio-Prüfung. Es werden keine Live-Challenge-Fragenquoten als bestanden ausgewiesen; siehe `a2-status.md`.
7. Die Browserabnahme verwendet einen ausdrücklich markierten Test-Replay mit testseitigem Extraktions-/Teach-back-Ersatz. In der laufenden App gibt es dafür keinen automatischen Fixture- oder Seed-Pfad.
8. Schwellen für Fragenabstand, Capturezeit und Vision-Aufrufe sind begrenzt. Geldkosten, Gate-p95 über die gesamte API, Audioabweichung und reale Providerlatenz sind noch nicht gemessen. Erfolgreiche Claude-Operationen erfassen Dauer und Tokenusage; allgemeine Logs enthalten keine Rohquellen oder Keys.
9. Die Logik für drei Live-Fragen und drei neue Debrief-Themen ist in A2 ergänzt, ihre Live-Abnahme bleibt offen. Vollständiger Graph, Improve/Optimize und unabhängige fachliche Bewertung folgen ab A3–A5. Sie sind nicht durch diese Spike-Übung ersetzt.

## Konkrete Live-Abnahme nach Eintragen der Schlüssel

1. `pnpm provision:interviewer`, dann `pnpm capabilities`; Konto-Konfiguration und Modellzugriff kontrollieren. Keine unsichere oder ungebundene Voice-Konfiguration starten.
2. Leeren Prozess starten; synthetischen Sandbox-Fall mit vollständig erklärter Regel erfassen. Maskierten Originalframe, committed Expertensegment und lokalen Audiozeitbereich öffnen.
3. Zehn Minuten paralleles englisches Gespräch mit Kopfhörern prüfen: Start, Barge-in, Pausen, Wortzeiten, Expressive Mode, Originalclip und Resampling.
4. Falsche Screenquelle/Resize provozieren; Upload muss pausieren. Off record anhand Netzwerkaktivität und lokalen Dateien prüfen; verspätete Ergebnisse verwerfen; Resume benötigt neue Tokens/Conversations/Epoch.
5. Draft korrigieren, tatsächlich gesprochenes Teach-back anhören, vier Bestätigungen setzen und eine feste Spike-Version veröffentlichen. Eine Änderung invalidiert Teach-back/Bestätigungen.
6. Neuer Fall mit falschem Approve: kein gespeicherter Commit, Erklärung und Originalbeleg. Zweiter neuer erlaubter Fall: tatsächlicher Commit. Direkten Request und parallele Faktenänderung zusätzlich prüfen.
7. Tutor-Bindung und Provider-IDs dokumentieren; laufende Version bleibt fest. Quellenwiderruf muss Gate und Tutor stoppen.
8. Ergebnisse und reale Messwerte in Capability-Report/Matrix eintragen. Erst dann A1-Live-Abnahme ausweisen und den breiten UI-Ausbau beginnen.
