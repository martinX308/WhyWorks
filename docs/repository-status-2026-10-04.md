# Repository-Prüfung — 4. Oktober 2026

**Empfehlung: den aktuellen Entwicklungsstand zuerst in einem privaten GitHub-Repository sichern, dann A5 mit den unten genannten Korrekturen beginnen.** A5 kann als Implementierung starten; die vollständige Live-/Pitch-Abnahme bleibt von A0–A4 und dem fehlenden gesprochenen Debrief abhängig. Keine Veröffentlichung und kein Git-Commit wurden in dieser Prüfung durchgeführt.

## Erneut ausgeführte Prüfungen

| Prüfung | Ergebnis |
|---|---|
| `npm run typecheck` | erfolgreich |
| `npm test` | 67 Tests in 11 Dateien erfolgreich |
| `BLUEPRINT_NEXT_DIST_DIR=.next-build npm run build` | erfolgreich, einschließlich konkreter A4-Adapterrouten und Results |
| `npm run test:e2e` | 3 Szenarien erfolgreich, echte temporäre SQLite-Dateien, markierte Testquellen |
| Quellen-/Oracle-Imports in Runtime/Client | kein Fixture-Import; Bewertungsoracle nur im serverseitigen A4-Modul |
| Git-Kandidaten gegen lokal konfigurierte API-Keys geprüft | keine exakten Schlüsselwerte gefunden |
| zusätzliche Anthropic-/GitHub-Key-/Private-Key-Muster | keine Treffer in Git-Kandidaten |
| `.env.local`, `data/`, Dependencies, Test- und Buildausgaben | ignoriert |

Die Negativproben unten verwendeten ausschließlich In-memory-Testdaten und einen simulierten SDK-HTTP-Response. Keine realen Provider-Aufrufe, neuen Ressourcen oder Credit-Ausgaben in dieser Prüfung. Sie sind ergänzende Auditproben; die bestehende grüne Testsuite deckt die festgestellten Fehler nicht ab. Ein Muster-/Wertecheck ist keine allgemeine Garantie, dass beliebige zukünftige Dateien keine Geheimnisse enthalten.

## Meilensteine

| Meilenstein | Aktueller Stand |
|---|---|
| A0 | Adapter und lokale Verträge geprüft; vorhandener Bericht über sieben erfolgreiche echte synthetische Provider-Smoke-Schritte. Browser-WebRTC, zehn Minuten paralleles Mikrofon/Scribe, Barge-in, Originalaudiozeit und echte Tutorbindung weiterhin offen. |
| A1 | Vertikale Quellen-/Freigabe-/Servergate-Kette implementiert und mit Testquellen geprüft; Live-Expertenkette nicht abgenommen. |
| A2 | Scheduler, Antwortproofs, Challenge-Gate und Tests vorhanden. Gesprochener Debrief-Client fehlt weiterhin; Live-Fragenquoten nicht abgenommen. |
| A3 | Timeline/Graph/Evidence, C-01, Review-Diff, Folgeversion und belegtes Optimize beziehungsweise Leerzustand vorhanden; Replay-Browserprüfung besteht. Quellenredaktion offen. |
| A4 | Versiongebundenes Teach/Results, Erstentscheidung, drei Lernfälle und Browserprüfung vorhanden. Zwei Hilfe-/Bypass-Lücken siehe unten; echte Live-Fälle offen. |
| A5 | Noch keine vollständige Hardening-/Probelauf-Abnahme. Konkrete nächste Arbeit unten. |

API-Zugänge, Interviewer-ID und Voice-ID sind lokal vorhanden; Schlüssel wurden nicht ausgegeben. Der gespeicherte Provider-Smoke-Bericht ist keine neu ausgeführte Live-Prüfung und kein Browser-/Expertennachweis. Aktuelle Prompts/Provisionierung verwenden Englisch; das ist gegenüber dem ursprünglichen deutschen RFC-Rahmen zu bestätigen oder zurückzustellen.

## Reproduzierte und überprüfte Lücken

### 1. Quellenlöschung lässt Zitatkopien zugänglich — A5-Priorität hoch

`Blueprint.removeSource()` entfernt das Segment und widerruft abhängige Versionen, erhält aber deren Claims mit Originalzitaten. `A3.view()` liefert `model.claims` auch für diese widerrufene Version zurück. In der Probe waren Segment gelöscht und Version widerrufen, während das alte Zitat in Snapshot und A3-Response unverändert vorhanden war. `discardSession()` widerruft ebenfalls nur die Snapshots. Vorschläge, Optimierungskarten und Reviewnotizen sind in die Redaktions-/Dependency-Prüfung einzubeziehen.

Das ist in A3 bereits als offene Abweichung dokumentiert, erfüllt aber Tech-RFC §7.2 noch nicht. A5 muss Inhalt redaktieren, historischen ursprünglichen Hash/IDs erhalten und aktive Nutzung weiterhin sperren. Providerbereinigung benötigt einen eigenen sichtbaren Status.

Quellen: [service.ts](../src/application/service.ts), `removeSource`, `discardSession`; [a3.ts](../src/application/a3.ts), `view`.

### 2. Tutorstart registriert keine Hilfe — A5-Priorität hoch

`tokens(..., runId)` prüft Erstentscheidung und Version, provisioniert/bindet den Tutor und gibt einen Token aus; es registriert keinen Hilfeakt. Die Teach-Komponente ruft diese Route direkt auf. Ein Tutor kann also bereits aus seinem festen Prompt erklären, ohne jemals ein Client Tool auszulösen, das heute Hilfe protokolliert.

Auditprobe: unabhängiger L-03-Run → Erstentscheidung Hold → Tutor-Token aus simuliertem HTTP-Aufruf → erlaubter Hold-Commit. `assistance=[]`; Bewertung weiterhin „selbstständig gezeigt“. Die Probe beweist fehlende Erfassung beim Token-/Startpfad, nicht eine real geführte Tutorunterhaltung. A5 sollte Tutorstart/Verbindungsaufnahme und tatsächliche Hilfe konsistent erfassen und dazu einen Regressionstest ergänzen.

Quellen: [providers.ts](../src/adapters/providers.ts), `tokens`; [teach.tsx](../src/components/teach.tsx), `startVoice`; [learning-evaluator.ts](../src/application/learning-evaluator.ts), Hilfeprüfung.

### 3. Generische Evidence-/Blueprint-Routen umgehen den runbezogenen Hilfeschutz

`A4.evidence()` sperrt unabhängige Runs vor Erstentscheidung und protokolliert Replay. Die generische `GET /api/evidence/:id`-Route hingegen prüft den lokalen Owner, aber keinen Learner-Run. Ebenso sind Owner-Blueprint-/A3-Ansichten verfügbar. Auditprobe: vor der L-03-Erstentscheidung war das tatsächliche Expertentranskript über den generischen Evidence-Service verfügbar; der Hilfeverlauf blieb leer.

Das ist kein fremder-Owner-Zugriff und kein Umgehen des Commit-Gates. Es begrenzt jedoch die Aussage „serverseitig unabhängig ohne vorgezogene Hilfe“, wenn Expert/Owner/Learner denselben lokalen Scope teilen. A5 muss den Zugriffs-/Hilfepfad beziehungsweise die Demo-Rollengrenze bewusst schließen oder die Nachweisgrenze offen ausweisen. Keine vollständige Lieferung-B-Organisationsrollenverwaltung dafür vorziehen.

Quellen: [route.ts](../src/app/api/[...path]/route.ts), generische Evidence-Route; [service.ts](../src/application/service.ts), `evidence`; [a4.ts](../src/application/a4.ts), `evidence`.

### 4. Gesprochener Debrief ist weiterhin nicht bedienbar

Der Capture-Client startet immer `state=capture` und ist auf Ready/Pause/Off record begrenzt. Die Review-Ansicht bietet im Debrief Teach-back, aber keinen gesprochenen Fragen-/Antwort-Capture. Serverseitige A2-Debrief-Verträge ersetzen diesen Client nicht. Vor dem vollständigen Probelauf müssen dessen Fragen, committed Segmente, AnswerLinks und Off record/Resume verdrahtet werden.

### 5. Dokumentation und Portabilität

README benennt A4 noch als außerhalb der Lieferung und beschreibt teilweise spätere Keybereitstellung, obwohl Keys vorhanden und Smoke-Proben dokumentiert sind. Meilensteinberichte sind historische Nachweise, keine einheitliche aktuelle Übersicht. Für GitHub außerdem: keine CI vorhanden; Browserprüfung benötigt installiertes Chrome. Build-Ausgaben bleiben über `BLUEPRINT_NEXT_DIST_DIR` getrennt. Die normale `next-env.d.ts`-Entwicklungsreferenz wurde nach dieser Prüfung wiederhergestellt.

## GitHub-Stand und empfohlene Reihenfolge

- Branch `master`, keine Commits, kein Remote. Der vollständige Implementierungsstand ist untracked; „A1/A2 unverändert“ lässt sich ohne Historie nicht unabhängig gegen einen früheren Commit belegen.
- Vor diesem Bericht: 95 Git-Kandidaten, ungefähr 744 KB; keine Runtime-Daten oder Keys darunter. Lockfile und Referenzlizenz sind vorhanden.
- Für einen Push fehlen das Zielrepository und dessen gewünschte Sichtbarkeit. Empfehlung: privater Entwicklungs-Checkpoint mit explizit offenen Live-Abnahmen. Ein Push ist Sicherung, keine fachliche Freigabe oder Deployment.
- Vor dem ersten Commit README an den realen A0–A4-Stand anpassen und alle verwendeten `.next-*`-Verzeichnisse robust ignorieren. Aktuell existierende `.next`, `.next-e2e`, `.next-build` sind geschützt; zukünftige Namen wie das früher verwendete `.next-a4-build` sind nicht allgemein erfasst.

Danach A5 in dieser Reihenfolge: Regressionstests für die drei Auditbefunde und deren Korrektur; Lösch-/Widerruf-/Providerstatus konsolidieren; gesprochenen Debrief vervollständigen; Reset mit neuen IDs/leerer Regelbasis und Reload-/Stale-/Concurrent-Requests prüfen; reale A0–A4-Abnahme einschließlich zwei Tabs, Mikrofon/Scribe/Originalbeleg und Wissenbindung durchführen; abschließend klar markierten Replay und vollständigen Demo-/Pitch-Probelauf dokumentieren. Grüne synthetische Tests dürfen offene Live-Nachweise nicht ersetzen.
