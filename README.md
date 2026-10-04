# WhyWorks · Operational Blueprint A0–A5

Lokale, quellenbasierte Lernschleife gemäß `docs/technical-rfc-001-operational-blueprint.md`, insbesondere §10.2. Die App enthält einen leeren Live-Prozess, Capture, Quellenreview, gesprochenes Teach-back, explizite Freigabe und versiongebundene Übungen mit einem atomaren SQLite-Gate. A2-Logik, A3 Blueprint/Evaluate/Improve und A4 Teach/Results sind implementiert; die vollständige Challenge-Live-Abnahme bleibt offen.

**Stand:** Implementierung und automatisierte Prüfung vorhanden; echte Provider-/Browser-Capture-Abnahme offen. API-Zugänge werden ausschließlich lokal über `.env.local` bereitgestellt und nicht eingecheckt. Der vorhandene Provider-Smoke-Bericht dokumentiert synthetische Basisproben, keine Live-Abnahme. Keine Nachkäufe und keine Bereitstellung der App auf einem Server vorgenommen.

## Starten

```sh
pnpm install
pnpm dev
```

Öffne `http://127.0.0.1:3000`. Node 24 oder neuer ist erforderlich. Die Skripte verwenden vorhandenes Node 24 aus PATH oder den auf diesem Rechner vorhandenen gebündelten Codex-Runtime-Pfad. Auf anderen Rechnern Node 24 installieren oder `NODE24_BIN` setzen. Betrieb ist ein einzelner lokaler Node-Prozess; `data/` muss persistent und beschreibbar sein.

Für einen neuen Checkout `.env.example` nach `.env.local` kopieren. Die lokale Datei ist von Git ausgeschlossen. Trage ein:

- `ANTHROPIC_API_KEY` und `ELEVENLABS_API_KEY`.
- `ELEVENLABS_VOICE_ID`: eine im Konto verfügbare Voice.
- `ANTHROPIC_MODEL`: konfigurierbar; Modellzugriff vor Live-Probe prüfen.

Danach `pnpm provision:interviewer` ausführen. Das erstellt den privaten Interviewer mit dem versionierten App-Prompt, geduldigem Turntaking, Skip-Turn, deaktiviertem Audio Saving und angefragtem Expressive Mode. Die Agent-ID wird unmittelbar lokal gespeichert. Ist Expressive Mode im Konto nicht verfügbar, bleibt der Fehler sichtbar; nicht blind weitere Agenten anlegen. Eine vorhandene `ELEVENLABS_INTERVIEWER_AGENT_ID` wird nur gelesen und geprüft. Die App verlangt den passenden Prompt sowie deaktiviertes Provider-Audio-Saving.

Tutor-Agent, KB, Client Tools und freie Procedure werden separat pro bestätigtem Blueprint provisioniert und an eine feste Agentversion gebunden. Die optionalen Tutor-ID-Felder der ursprünglichen Vorlage werden hierfür nicht verwendet. Ressourcen werden nicht während laufender Übungen überschrieben. Fehlende KB/Procedure wird als Abweichung mit festem Prompt und Server-Lookup protokolliert; ohne feste Agentversion kein Tutor.

## A1 bedienen

1. Leeren Spike-Prozess starten; die Sandbox in einem zweiten Tab öffnen.
2. Synthetische Fakten setzen und speichern. Für die Demonstration einen vollständigen Fall erklären; die App kennt keine Freigabegrenze oder Fachpolicy vorab.
3. Im Companion der lokalen Originalaudio-Aufnahme zustimmen, den Sandbox-Tab teilen und Voice starten. Beide Tabs gehören demselben Origin an. Chrome Desktop und Kopfhörer verwenden.
4. Reale Bilder werden lokal anhand des Session-Markers und Layouts geprüft, beschnitten und maskiert. Der Server prüft Marker, Fall, Layout und Maske nochmals und maskiert vor Speicherung und Vision erneut. Fremde Quelle, Resize oder fehlende Maske pausiert Capture.
5. Committed Scribe-Segmente erzeugen persistierte, quellengebundene Änderungsvorschläge. Partials erzeugen keine Claims. Eine aktuelle, geplante Frage wird erst über „Frag jetzt“ und nach Aktivitäts-/Timingprüfung an den Interviewer übergeben.
6. Capture abschließen, Draft/Zuordnungen im Debrief prüfen und gegebenenfalls korrigieren. Kritische offene Gaps verhindern Freigabe. Teach-back erzeugen und vollständig anhören.
7. Zuordnung, Wiedergabe, fachliche Gültigkeit und Version getrennt ausdrücklich bestätigen. Die Spike-Version veröffentlichen.
8. Neuen Fall anlegen, Erstentscheidung und Begründung abgeben. Der Server prüft die gepinnte Version, beide Fallrevisionen, Befugnis und gelernte Regeln atomar. `blocked`/`unknown` speichern keine Handlung. Originalbelege sind erreichbar; ein belegtes Permit kann tatsächlich committen.
9. Session bewusst exportieren oder lokale Quellen verwerfen. Verwerfen sperrt abhängige Übungen sofort. Providerbereinigung bleibt separat ungeprüft.

Off record beendet zuerst Sampler, Requests, beide Audiopfade und flüchtige Buffer. Der Server schließt die Epoche und verwirft verspätete Ergebnisse. Resume startet neue Verbindungen und eine neue Epoche; Reload startet Screen/Mikrofon niemals automatisch. Bereits übertragenes Material wird dadurch nicht zurückgerufen.

## Prüfen

```sh
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm capabilities
```

Playwright verwendet das installierte Chrome, zwei Tabs und eine frische temporäre SQLite-Datenbank. Extraktions-/Teach-back-Testquellen werden ausschließlich durch den Testprozess eingespielt und dauerhaft als **TEST-REPLAY** markiert. Es gibt keinen Fixture-Fallback oder Seed-Endpunkt in der App. Diese Tests ersetzen keine Live-Abnahme.

`pnpm test:live-smoke` prüft echte Anthropic-/ElevenLabs-Aufrufe mit synthetischem Bild und erzeugter Sprache: Interviewerkonfiguration, WebRTC-Token, TTS, Realtime-Scribe samt Wortzeiten, Vision, Extraktion samt Quellen-/Gateprüfung und A2-Fragenplanung. Der separate Befehl verbraucht vorhandene Provider-Credits. Ergebnisse stehen in `docs/provider-smoke-report.json`; erzeugtes Audio liegt unter `data/live-smoke/`. `pnpm test:live-smoke --retry-extraction` wiederholt ausschließlich die Extraktion mit dem zuvor aufgezeichneten synthetischen Scribe-Transkript. Die Probe veröffentlicht keine Version, verändert keine vorhandenen Sessions und zählt nicht als vollständige A1/A2-Live-Abnahme.

`pnpm reference-package` regeneriert die ausdrücklich isolierten Referenzdaten aus §10.2. `pnpm format` formatiert die neuen Implementierungsdateien, nicht die beiden RFCs.

- `docs/a5-status.md`: aktueller Hardening- und Abnahmestand.
- `docs/demo-runbook.md`: Start, begrenzter Reset, Live-/Replay-Pfad und belegbare Pitch-Aussagen.
- `docs/repository-status-2026-10-04.md`: erneute Gesamtprüfung, reproduzierte Hardening-Lücken und empfohlene nächste Schritte.
- `docs/a4-status.md`: Teach/Results, Erstentscheidung, versiongebundene Ergebnisse und offene Live-Nachweise.
- `docs/a3-status.md`: Blueprint/Evaluate/Improve, automatisierte Nachweise, Abweichungen und offene Live-Proben.
- `docs/a2-status.md`: implementierte A2-Logik/API, Prüfungen und offene Live-Abnahme.
- `docs/a0-a1-status.md`: funktionierende Fähigkeiten, Abweichungen und konkrete Live-Abnahme.
- `docs/capability-report.json`: Runtime/Paketstand und derzeit fehlende Live-Nachweise.
- `docs/integration-ledger.md`: offizielle Referenzen, Revision, Lizenz und unmittelbare Prüfungen.
- `contracts/examples/learning-chain.v1.json`: maschinenlesbare Quellen-/Bestätigungs-/Regelkette.

A5-Hardening ist implementiert: Quellenredaktion/Widerruf, unabhängiger Hilfeschutz, gesprochener Debrief, begrenzter Reset und expliziter Export-Replay. Der aktuelle Nachweisstand und die vollständige Bedienfolge stehen in [docs/a5-status.md](docs/a5-status.md) und [docs/demo-runbook.md](docs/demo-runbook.md). Die Startseite bietet sowohl den leeren technischen Spike als auch eine leere Live-Challenge; deren Freigabe verlangt weiterhin echte A2-Nachweise. Replay erfüllt keine Live-Abnahme. Lieferung B bleibt außerhalb des Umfangs.
