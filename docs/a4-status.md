# A4 — Teach / Results

Stand: 4. Oktober 2026. **Implementiert und automatisiert geprüft; Live-Abnahme offen.** Grundlage: Tech-RFC §5.3–5.4 und §9.3, Product-RFC §6.2. Replay ist sichtbar als Testquelle markiert und zählt nicht als Live-Nachweis.

## Verhalten

- Teach bleibt an `versionId`, `contentHash` und `scopeId` gebunden. Neue veröffentlichte Versionen ändern einen bestehenden Run nicht. Results zeigen diese Bindung vollständig, Quellmodus, Übungstyp, Originalbegründung, Hilfeereignisse und alle A4-Gateentscheidungen mit tatsächlichem Commitstatus. Reload und echtes SQLite-Schließen/Wiederöffnen erhalten diese Angaben.
- Vor dem ersten Gate/Feedback wird die Erstentscheidung separat in einer SQLite-Transaktion gespeichert: unveränderliche Aktion und Originalbegründung, Zeitpunkt, Geschäftsfakten, beide Fallrevisionen und bisherige Hilfe. Der erste Gate-Request muss dieselbe Aktion auf derselben Faktenrevision prüfen. Leere Gründe, erneute Erstentscheidungen, fehlende Erstaufzeichnung und ein Wechsel der Aktion/Fakten vor der ersten Auswertung werden abgewiesen.
- Gate, finale Handlung, Hilfe und tatsächliche Fallmutation werden gemeinsam in einer Transaktion gespeichert. Der Interpreter verwendet ausschließlich die bestätigten Regeln der gepinnten Version. Kein Default-Allow, keine automatisch erlaubte Hold-/Escalate-Aktion. Idempotenz verhindert doppelte Commits/Interventionen; anderer Payload mit gleichem Schlüssel, stale Revision, fremder Scope und Widerruf sperren den Request. Die vorhandene `gate_interpreter`-Messung bleibt erhalten.
- Teach und Results bieten ausdrücklich startbare Fälle: **L-01** mit 90 bps und geänderten Bankdaten, **L-02** mit 110 bps und erfüllten übrigen Voraussetzungen, **L-03** mit geringer Abweichung und fehlendem Wareneingang. Diese Vorbereitung erzeugt Fakten und neue IDs, keine Fachregeln. Die vorbereiteten Fallfakten sind in UI und API gegen Learner-Änderung geschützt. Die normale Capture-Sandbox und generische Übungsfälle bleiben bearbeitbar.
- L-01: ein Approve-Versuch wird bei der tatsächlich belegten Bankregel gestoppt und bleibt ohne ERP-Commit. Ein späteres erlaubtes Escalate wird als gecoachte Korrektur protokolliert. L-02: Approve wird bei einem belegten Permit tatsächlich gespeichert. L-03: vor der Erstentscheidung liefert der bestehende Tutor-Kontext keine Claims/Regeln; Voice-/Tool-Hinweise sowie A4-Originalmoment und Results sind gesperrt. Ein Gate-Stopp zählt als Hilfe; eine spätere Korrektur kann keinen unabhängigen Erfolg herstellen.
- Derselbe Fall oder identische Erstfakten eines bereits bearbeiteten Falls können nicht erneut als unabhängig bewertet werden, auch nicht unter einer neuen Fall-ID. Weitere L-03-Versuche verwenden neue Fall-IDs und 80 beziehungsweise 70 bps bei weiterhin fehlendem Wareneingang. Nach diesen drei vorbereiteten Varianten sind weitere Fälle separat fachlich vorzubereiten. Alle Varianten durchlaufen dieselbe Version und denselben Interpreter; eine anders gelernte Grenze kann ihre Nutzbarkeit ändern.
- Das separate **serverseitige Bewertungsoracle** kennt die fallbezogenen Aktionsziele L-01 Escalate, L-02 Approve, L-03 Hold. Es verlangt zusätzlich ein tatsächlich bestätigtes Permit; fehlendes Wissen wird nie als Erfolg ausgegeben. Das Oracle wird von keinem Tutor-/Provider-Payload-Builder und keinem Clientmodul importiert. Clientmodule importieren nur die Lernvertragstypen. Generische Fälle erhalten ausschließlich eine Bewertung der durch die Version belegten erlaubten Handlung.
- Aktion und Begründung sind getrennte Lernziele: `selbstständig gezeigt`, `mit Hilfe gelöst`, `noch üben`. Die Begründung steht zunächst auf **Prüfung offen**. Ein ausdrückliches fachliches Review der Originalbegründung mit Notiz und Demo-Owner-ID ist erforderlich; kein LLM und kein Worttreffer behauptet Mastery. Das Review ist auf den Fall begrenzt und keine universelle Kompetenz- oder Produktionsfreigabe. Original-Replay nach der Erstentscheidung zählt ebenfalls als Hilfe.
- Results öffnen den Originalmoment über die bestehende geprüfte A3-Evidence-Projektion: exaktes Zitat und Zeichenspanne, vollständiger Originaltext, Segmentzeit und Zeitqualität, maskierter Originalframe mit ursprünglichem Fall-/Zeitbezug und vorhandenes Expertenaudio. Fehlendes Audio heißt ausdrücklich **Transcript-Ersatzdarstellung · Originalaudio fehlt**. Ein Capture-Frame wird nicht als Aufnahme des neuen Learner-Falls dargestellt. Widerruf sperrt weitere Nutzung/Originalmoment; historische Results behalten den Versionsbezug und zeigen keine aktiven Claimkopien mehr.

## Integration ohne Änderungen an A1/A2-Dateien

Neu: `src/domain/learning.ts`, `src/application/a4.ts`, `src/application/learning-evaluator.ts`, A4-API, konkrete API-Adapterrouten, `src/components/results.tsx`, Results-Seite und separate A4-Tests. Die A4-eigene Teach-Komponente wurde erweitert.

`src/application/service.ts`, `src/domain/contracts.ts`, `src/adapters/store.ts`, `src/adapters/providers.ts`, die gemeinsame `src/app/api/[...path]/route.ts`, Capture, A2-Module, bestehende Tests und A1/A2-Statusdateien wurden nicht editiert. Die zunächst angefragten gemeinsamen Integrationsänderungen waren durch die konkreten Adapterrouten nicht erforderlich. Keine Providerressourcen provisioniert, keine Live-Aufrufe und keine Konfiguration/Schlüssel verändert.

Nexts konkrete Routen haben Vorrang vor der gemeinsamen Catch-all-Route:

| Route | Vertrag |
|---|---|
| `POST /api/exercises/:id/attempts` | bestehender Payload; speichert zusätzlich die A4-Erstaufzeichnung |
| `POST /api/sandbox/cases/:id/actions` | bestehender Payload; bindet Run/Fall/Version und delegiert an die A4-Transaktion |
| `GET/PATCH /api/sandbox/cases/:id` | bestehender Vertrag; PATCH sperrt nur vorbereitete A4-Lernfälle |
| `POST /api/a4/start` | veröffentlichte `versionId` und `learningCase` |
| `GET /api/a4/:runId/context` | gepinnter Kontext, Run und Fall; keine Oracleantwort |
| `POST /api/a4/:runId/attempts` | Aktion und Begründung vor Feedback |
| `POST /api/a4/:runId/actions` | Aktion, beide erwarteten Revisionen, Idempotenzschlüssel |
| `GET /api/a4/:runId/results` | historische Bindung, Entscheidungen, separate Bewertung |
| `POST /api/a4/:runId/evidence` | geprüftes Original einer Claim-ID der gepinnten Version |
| `POST /api/a4/:runId/review` | ausdrückliches Begründungsreview mit Notiz |

Alle neuen Routen verwenden Request-/Response-Umschläge, Owner- und Same-Origin-Prüfung sowie Schema-Validierung. A4-Erweiterungen liegen im vorhandenen Run-Payload; keine gemeinsame Tabellenmigration nötig. Die bestehenden Tutor-Token-/Tool-Verträge und deren Hilferegistrierung werden weiterverwendet.

## Automatisierte Nachweise

- `pnpm typecheck`: bestanden.
- `pnpm test`: **67 Tests in 11 Dateien bestanden**, darunter **11 neue A4-Tests**. Bankänderungs-Stopp, erlaubter Positivfall, unabhängiges Hold, Hilfesperre, Korrektur nach Gatehilfe, immutable Erstentscheidung, austauschbare Aktion/Fakten abgewiesen, Idempotenz/stale Request, neue IDs mit bekannten Fakten, neue ungesehene Variante, andere Expertengrenze, fehlendes Hold-Permit, Original-Evidence, fremder Owner, Source-Widerruf, neue Version und echtes SQLite-Reopen.
- `pnpm test:e2e`: **3 Szenarien bestanden**. Neues A4-Szenario prüft alle drei Fälle, keine Tutorverbindung vor L-03-Erstentscheidung, tatsächlichen Stopp/Commit, erhaltenes Gate nach Reload, Results mit vollständigem Hash, Originalbegründung und fachlichem Review. Beide vorhandenen A1/A3-/Off-record-Szenarien bleiben unverändert und bestehen.
- Produktionsbuild: **bestanden** mit `BLUEPRINT_NEXT_DIST_DIR=.next-a4-build`, getrennt vom laufenden Entwicklungsserver. Auch die konkreten Adapterrouten und `/results/[id]` wurden kompiliert. Nexts temporäre A4-Type-Includes wurden danach entfernt; `next-env.d.ts` verweist wieder auf die normale Entwicklungs-Typgenerierung.

Die Browserfälle laufen gegen echte temporäre SQLite-Dateien, jedoch mit ausdrücklich erzeugten Replay-Testquellen und Test-Teach-back. Der erste Browserlauf entdeckte einen Hostalias-Fehler in der neuen Same-Origin-Prüfung; die Prüfung verwendet jetzt wie die vorhandene API den Request-Host beziehungsweise `BLUEPRINT_ORIGIN`. Der vollständige zweite Browserlauf besteht. Die lokale Sandbox sperrte Testserver-/CSS-Hilfsports; die Browserprüfung lief nach Werkzeugfreigabe außerhalb der Sandbox.

## Offene Live-Nachweise und Grenzen

1. **Live-Wissenskette A1/A2:** reales Screen Sharing/Vision, drei passende Live-Fragen, drei neue gesprochene Debrief-Antworten, tatsächliches Teach-back und alle erforderlichen Experten-/Ownerbestätigungen. Die A1/A2-Statusdateien bleiben maßgeblich. A4 erzeugt keine fehlenden Regeln, Bankpolicy oder Resume-Permits.
2. **L-01 live:** auf einer aus echten Quellen veröffentlichten Version falsches Approve durchführen; ausbleibenden Commit und persistierte Intervention prüfen; tatsächlichen Originalframe/-clip öffnen und die versiongebundene Tutorerklärung anhören. Zuständigkeits-/Resume-Nachweis darf nicht durch den Learner selbst gesetzt werden.
3. **L-02 live:** auf derselben Version korrekten Positivfall tatsächlich speichern; Commit/recordRevision nach Reload prüfen. Ein geänderter Experten-Grenzwert muss das Ergebnis entsprechend ändern.
4. **L-03 live:** neuer ungesehener Fall; keine frühere Tutorerklärung/Replay, Originalentscheidung und Begründung zuerst speichern, danach Gate und fallbezogenes Review. Bei Intervention weiteren ungesehenen Fall verwenden und den früheren Versuch sichtbar als geholfen erhalten.
5. **Voice/Originalzeit:** reale parallele Agent-/Scribe-Audioqualität, Barge-in, Wort-/Clip-Zeitbezug, Expressive Mode, feste KB-/Procedure-/Agentversionsbindung und Widerruf einer laufenden Verbindung sind noch nicht durch A4-Live-Proben belegt. Fehlendes Originalaudio ist kein bestandener Originalclip-Nachweis.
6. **Rollen und Löschung:** Begründungsreview verwendet die bestehende lokale Demo-Owner-Rolle. Echte organisatorische Rollentrennung gehört zu Lieferung B. Vollständige Quote-Redaktion historischer Snapshots/Reviewnotizen und Providerbereinigung bleiben die bereits in A3/A5 dokumentierte offene Löschsemantik; historische Versionshashes werden nicht umgeschrieben.
7. **Interne Aufrufe/Altbestand:** der unveränderte Basisservice `Blueprint.attempt/action` erzeugt selbst keine A4-Metadaten. Neue produktive Learner-Aufrufe müssen A4 beziehungsweise die konkreten API-Routen verwenden. Frühere Versuche ohne `firstRecord` erhalten keinen nachträglichen unabhängigen Nachweis; für sie ist ein neuer Run erforderlich. Frühere Action-Idempotenzschlüssel werden nicht still in den neuen Payloadvertrag migriert.

**Keine Live-Abnahme, kein universelles Mastery-Urteil, keine Produktionsfreigabe.**
