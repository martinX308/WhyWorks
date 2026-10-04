# Demo-Runbook — Lieferung A / A5

Stand: 4. Oktober 2026. Lokale Übungsdemo, keine Produktionsfreigabe. **Automatisierter Replay-Probelauf bestanden; vollständiger menschlicher Live-Probelauf offen.** Aktueller Nachweisstand: [a5-status.md](a5-status.md).

## Start und Vorbereitung

1. Node ≥24 und Dependencies: `npm install`, anschließend `npm run dev`. Auf diesem Rechner läuft bereits ein Entwicklungsserver auf `http://127.0.0.1:3000`; keine zweite Instanz auf demselben Port starten. SQLite und Medien in `data/`; eigener `BLUEPRINT_DATA_DIR` isoliert einen Probelauf. `BLUEPRINT_NEXT_DIST_DIR` trennt Build/Test/Dev.
2. Schlüssel ausschließlich in `.env.local`, vorhandene Interviewer-/Voice-ID verwenden. `npm run capabilities` bestätigt Konfiguration, keine Live-Abnahme. Nicht blind neue Agenten anlegen, keine Credits nachkaufen. Prompts/Voice/Scribe derzeit Englisch.
3. Chrome Desktop, Kopfhörer, funktionierendes Mikrofon. Nur synthetische Fallfakten in der kontrollierten 960×640-Sandbox. Beide Tabs auf exakt demselben Origin. Im Startdialog Übertragung maskierter Frames und Audio sowie lokale Originalaufnahme bewusst bestätigen. Retention der drei Providerpfade ist separat zu prüfen.
4. Eine Person liefert echte fachliche Aussagen; Expertprüfung und Ownerfreigabe bleiben getrennte Akte, auch bei derselben Demoperson. Keine Musterregel vor dem Gespräch laden. Für Challenge-Nachweise „Leere Live-Challenge starten“ wählen; „Leeren Spike-Prozess starten“ prüft den technischen Durchstich mit geringerem Profil. Profil kann nicht im Browser heruntergesetzt werden.

## Begrenzter Demo-Reset

Auf der Startseite beim **gewählten** Prozess „Lokale Quellen verwerfen und leer neu starten“ verwenden. Die Beschriftung beschreibt die irreversible lokale Quellenentfernung; einen benötigten lokalen Export vorher bewusst speichern.

Erwartung: neue Prozess-/Session-IDs, Zustand `ready`, Modus `live`, leere Regeln/Claims/Fragen/Bestätigungen, keine Runs und kein automatischer Mikrofonstart. Das Profil des Ausgangsprozesses bleibt erhalten. Alte Versionen und Gates sind widerrufen; historische IDs/Hash und Ergebnisse bleiben redaktiert erhalten. Andere Prozesse, Schlüssel, bereits gespeicherte externe Exporte und Providerressourcen sind außerhalb des Umfangs. Ein früherer Replay wird nicht automatisch wieder geladen.

`localCleanup=failed` bedeutet: neue leere Session existiert, aber Dateibereinigung der alten Session ist fehlgeschlagen. Die Startseite zeigt den Fehler; alte Capture-Session öffnen und „Lokale Dateibereinigung erneut versuchen“ verwenden. Zugriff auf diese Assets bleibt gesperrt. `providerCleanup=not_verified` ist immer ein eigener offener Nachweis.

## Vollständiger Live-Pfad — mit offenen Abnahmeschritten

| Station | Bedienung und erwartetes Ergebnis | Nachweis sichern |
|---|---|---|
| Capture | Leeren Live-Prozess starten; Sandbox in zweitem Tab; Fakten setzen/speichern. Nur diesen Sandbox-Tab teilen. Voice explizit starten. Fachregel, Voraussetzungen, Ausnahmen, Begründungen tatsächlich sprechen. | Session-ID, Epoch, gespeicherte Events/Segmente; maskierter Frame und echter Clip, Zeitqualität. Keine erfundene Policy. |
| Live-Fragen | „Nächste Frage planen“, Ruhe und frischen Screenbezug abwarten, „Frag jetzt“. Antwort vollständig sprechen; committed Quelle/Claim prüfen und AnswerLink ausdrücklich zuordnen. | Drei verschiedene beantwortete Live-Themen inkl. Guardrail für Challenge. Geplant/unterbrochen/unbeantwortet zählt nicht. |
| Privacy-Probe | Off record während Gespräch/Vision. In Browsernetzwerk prüfen, dass kein weiterer Frame/Scribe-Audio/Agentinput gesendet wird; verspätete Resultate nicht gespeichert. Fremde Screenquelle/Resize separat provozieren. | Zeit/Epoch, redigierte Netzwerkbeobachtung, beide Verbindungsstopps. Bereits versendete Daten werden nicht zurückgerufen. |
| Resume/Recovery | „Screen und Voice starten / Resume“ explizit; neue Quelle/Verbindungen/Tokens/Epoch. Reload: Quellen/Fehler erhalten, kein Mikrofonstart. Providerfehler bleibt sichtbar; höchstens ein expliziter Operation-Retry. | Vorher-/Nachher-Epoch und Conversationbezug; fehlender Kontext bleibt stale statt Fixture. |
| Blueprint/Debrief | Capture abschließen → Debrief öffnen → „Gesprochenen Debrief öffnen“ → „Debrief Voice starten / Resume“. Historische Screenquelle wird genutzt, keine neuen Frameuploads. Neue Lücken beantworten, Gegenfall ausdrücklich hypothetisch; Links/Claims in Review korrigieren. | Drei neue Debrief-Themen aus mindestens drei tatsächlich beantworteten Fragen; Gegenfall berücksichtigt. Status unter `GET /api/sessions/:id/a2-status`. |
| Teach-back/Review | Debrief abschließen; ggf. Audio erzeugen, vollständig hören. Korrekturen verlangen neues Teach-back. Inhalt prüfen; Zuordnung, Wiedergabe, Fachgültigkeit und Ownerfreigabe getrennt bestätigen; publizieren. | Vier aktuelle Subject-Hashes, gesprochener aktueller Inhalt, Snapshot-ID/Hash/Profil. Challenge verweigert Publish bei fehlenden Live-Nachweisen. |
| Blueprint-Belege | Veröffentlichten Snapshot ausdrücklich wählen; Timeline/Graph auswählen, Schritt/Claim anklicken; exaktes Zitat, Originaltext, Originalframe/-zeit/-fall und Audio öffnen. | Audio wirklich vorhanden? Sonst „Transcript-Ersatzdarstellung · Originalaudio fehlt“, kein Clipnachweis. Graph erfindet keine Schritte/Kanten. |
| Evaluate | C-01-Basisfall wählen und prüfen: ausschließlich Wareneingang hypothetisch false. | Bestätigender Test/belegte Korrektur/Unknown mit Version/Hash/Quellen. Kein automatisches Lernen einer Regel. |
| Teach L-01 | In Teach/Results den vorbereiteten L-01 starten. Bewusst falsches Approve mit eigener Begründung zuerst speichern/prüfen. | Bei tatsächlich gelernter Bankregel `blocked`, kein Commit, Originalmoment; spätere erlaubte Korrektur bleibt geholfen. Fehlende Regel bedeutet keine behauptete bestandene L-01-Abnahme. |
| Teach L-02 | Auf derselben Version vorbereiteten L-02 starten, Approve begründen/prüfen. | Bei belegtem Permit `allowed`, echter gespeicherter Status/recordRevision; Reload und Results erhalten Version/Hash. |
| Teach L-03 | Ungesehenen L-03 starten. Keine Tutor-/Owner-/Evidenceansicht vorher. Originalentscheidung und eigene Begründung zuerst speichern, dann Gate/Feedback. | Run/Faktenrevision und Hilfestand vor Feedback; Oracle/Musterlösung fehlen im Client-/Tutor-Kontext. Fachliches Begründungsreview mit Notiz; „Prüfung offen“ bis dahin. Nach Hilfe neuen ungesehenen Fall verwenden. |
| Improve | An veröffentlichter Version Verbesserung beginnen, belegten typed Review-Diff vorbereiten, Vorher/Nachher prüfen und ausdrücklich annehmen. C-01/erforderliche Regression wiederholen. | Neue Revision/Hash, neue vier Bestätigungen und Teach-back, neue Version mit Parent-ID; laufende Runs bleiben an alte Version gebunden. |
| Control | Neuen Übungsfall gegen die ausdrücklich freigegebene Version prüfen. Direkten stale Request, parallele Faktenänderung, gleichen Idempotenzschlüssel und Quellenwiderruf prüfen. | Server-Gate/Commitstatus, revisionsgebundene Results. Widerruf sperrt auch alten Tab/Tutor; keine Produktions-/AI-Ausführung. |
| Abschluss | Session bewusst exportieren oder lokale Quellen verwerfen; Providerstatus separat festhalten. | Manifest/Version/Run/Quellmodus und redigierter Session-Audit. Keine Keys, Tokens oder echten Geschäftsdaten in Pitchnachweise. |

Eine Demo kann nicht L-01/L-02/L-03 garantieren, bevor die entsprechende Fachregel und die nötigen Permits aus echten Aussagen bestätigt sind. Eine anders gelernte Grenze ändert das Gate. Bei `unknown` fehlende Information zeigen und klären; nicht still die erwartete Musterregel einspielen.

## Ausdrücklich markierter Replay-Pfad — keine Live-Abnahme

1. Startseite → Quellmodus **TEST-REPLAY**. Einen bewusst exportierten lokalen JSON-Sessionbestand unter 7 MB über „Exportierte Session ausdrücklich … laden“ auswählen. Fehlerhafte Marker, Layouts, Zitate oder Referenzen sind Fehler; es gibt keinen Fixture-Fallback. Der Import ist lokal, kein Dateiupload zu einem Hostingdienst.
2. Replay erhält neue IDs und dauerhaft `sourceMode=replay`/`technical_spike`. Regeln werden Draft, Freigaben/Fragenquoten/Commits werden nicht übernommen. Frame/Audioprovenienz bleibt Originalmoment des aufgezeichneten Falls, nicht neuer Learner-Fall. Fehlendes Originalaudio ausdrücklich benennen.
3. Vorhandenes Replay-Teach-back-Audio vollständig abspielen; falls nicht vorhanden, Teach-back bewusst erzeugen (Providercredits), dann hören. Vier neue Bestätigungen setzen und nur die Spike-Übungsversion veröffentlichen. Zusätzliche belegte Workflow-Schritte bei Bedarf ausdrücklich modellieren; nicht aus Zielzahlen erfinden.
4. Blueprint → Evaluate → Teach → Improve → Control wie oben bedienen. Alle Ergebnisse als Replay präsentieren. L-Fälle benötigen passende tatsächlich enthaltene bestätigte Regeln; ein allgemeiner Export enthält sie möglicherweise nicht.
5. Erneuter Export/Reimport bleibt Replay. Reset erzeugt einen leeren Live-Prozess; Replay muss erneut ausdrücklich gewählt werden.

Ohne verfügbaren Export `npm run test:e2e` verwenden: Tests erzeugen ausdrücklich isolierte Replayquellen und Providerersatz, prüfen den Gesamtpfad gegen frische echte SQLite-Dateien. Diese Testsubstitute werden ausschließlich vom Testprozess erzeugt; die normale App besitzt keinen Seed-Endpunkt. Das ist ein automatisierter Nachweis, keine live geführte Präsentation.

## Reproduzierbare technische Probe

```sh
npm run typecheck
npm test
npm run test:e2e
BLUEPRINT_NEXT_DIST_DIR=.next-a5-build npm run build
BLUEPRINT_SMOKE_REPORT=docs/a5-provider-smoke-report.json npm run test:live-smoke
```

Die letzte Zeile ist eine bewusst gestartete, kostenpflichtige Provider-Basisprobe mit vorhandenen Credits, synthetischem Bild und erzeugter Sprache. Sie verändert keine Live-Abnahme. Browser-/CSS-Worker benötigen lokale Ports; die eingeschränkte Werkzeug-Sandbox kann diese blockieren. Auf einem normalen lokalen Terminal starten. Chrome muss installiert sein.

Nach Build/Test generiert Next temporäre Type-Includes; den normalen Devbezug in `next-env.d.ts` und `tsconfig.json` wiederherstellen, ohne laufende Dev-/Datendateien zu löschen. Für Pitchnachweise die konkreten Testläufe und den Providerreport zitieren. Keine bloße Konfiguration als Live-Fähigkeit ausgeben.

## Belegbare Pitch-Aussagen

| Aussage | Konkreter Nachweis | Zulässige Grenze |
|---|---|---|
| „Die lokale Demo startet ohne vorinstallierte Fachregel.“ | `tests/api.test.ts` leere Livebasis, `tests/a5.test.ts` Reset; echter Chrome-Start Session `f0c6c7ba-fdef-4e10-a44f-a2798d4b57fc` mit 0 Events/ohne Aufnahme | Keine vollständig bestandene Live-Expertenschleife behaupten. |
| „Bestätigte Quellen binden Regeln, Versionen und Handlungen.“ | A1/A3-Playwright Quellen → Hashbestätigungen → C-01 → Diff → zweite Version; Session-Exportmanifest mit Version/Hash/Run | Browserabläufe verwenden ausgewiesene Test-Replays. |
| „Direkte API-Requests umgehen das Gate nicht.“ | `tests/a4-api.test.ts`, `tests/api.test.ts`, A4-Stale/Idempotenztests; L-01/L-02-Playwright | Atomare lokale Sandbox, keine Produktions-ERP-Freigabe. |
| „Die erste Transferentscheidung wird vor Hilfe festgehalten.“ | A4-L-03-Tests/Playwright; neue A5-Ownerzugriff-/Tutor-Token-/Race-Tests | Keine universelle Mastery oder organisatorische Rollentrennung; Vorwissen bleibt außerhalb des Nachweises. |
| „Off record und Quellenwiderruf schützen weitere Nutzung.“ | Audio-Stop/Abort-Test, late Epoch/Planner/API-Prüfung, Redaktion und SQLite-Reopen, Widerruf/Reset in A5-Playwright | Echter Provider-Netzwerkstopp und tatsächliche Providerlöschung sind offen. |
| „Reset und bewusster Replay sind reproduzierbar getrennt.“ | A5-Export-Import-Freigabe-Commit-Reset-Playwright sowie Replay-Reimport-Test; Test-Exportmanifest | Replay erfüllt keine Live-/Challenge-Abnahme. |
| „Die Providerbasis wurde tatsächlich angesprochen.“ | `a5-provider-smoke-report.json`, sieben bestandene reale API-Proben vom 4. Oktober | Synthetische Sprache/Bilder; Tokenausgabe beweist keine Browserconversation. |
| „Wir zeigen Grenzen und fehlende Nachweise sichtbar.“ | Replay-/Audiofehl-/Unknown-/Retry-/Cleanup-/Live-offen-Zustände, A5-Status | Keine erfundenen sieben Schritte/drei Calls/vier Guardrails, Agenttests oder ROI-Werte. |

Pitch-Probe: leere Basis zeigen → ausdrücklich markierten Replay-Probelauf oder belegten Live-Prozess zeigen → Originalbeleg und Versionshash öffnen → L-01-Stopp/L-02-Commit/L-03-Erstentscheidung → Review-Diff und neue Freigabe → Reset → offene Live-/Konto-/Formalnachweise klar nennen. Reale zeitliche Pitch-/Video-Vorgaben erst aus aktuellem Veranstalterbriefing übernehmen.

Formales Briefing/Formular, Repo-/Video-/Deploymentpflichten, Team-/Vorarbeits-/IP-Bedingungen, Submission Owner und konkrete Moonshot-Folie bleiben **offen**. Es wurden keine Einreichung, Veröffentlichung, externen Nachrichten oder Nachkäufe durchgeführt.
