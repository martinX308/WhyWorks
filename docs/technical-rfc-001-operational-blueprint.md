# Technical RFC 001 — Operational Blueprint

**Stand:** 3. Oktober 2026 · **Version:** 1.1 · **Status:** Vertragsentscheidungen eingearbeitet; Capability-Spike und Demo-Abnahme ausstehend  
**Produktgrundlage:** [Product RFC 001 v1.3](./product-rfc-001-operational-blueprint.md)  
**Lieferungen:** A — Challenge-Kern und Best-Case-P0; B — erweitertes Produkt-MVP aus mehreren Teilinterviews.  
**Implementierungsstand:** Spezifikation, kein implementierter Prototyp. Anbieterfunktionen wurden anhand von Primärquellen geprüft; Kontooptionen, SDK-Zusammenspiel und Latenz sind noch nicht durch einen Live-Spike bestätigt.

**Zeitfenster:** 3. Oktober 2026, 18:00 Uhr bis 4. Oktober 2026, 15:00 Uhr, Europe/Berlin: 21 Stunden zwischen globalem Kickoff und Abgabe. Das ist das gesamte Veranstaltungsfenster, keine Zusage über ab jetzt verbleibende Arbeitszeit. Quelle: [offizielle Agenda](https://luma.com/z3za7zow). Die frühere 24-Stunden-Annahme des Product RFC wird durch diese bestätigte Planungskorrektur ersetzt.

## 1. Entscheidung und Quellenhierarchie

Wir bauen einen modularen Next.js-Monolithen mit einem eigenen Sandbox-ERP, ElevenAgents für Interviewer und Tutor, einem expliziten Scribe-v2-Realtime-Stream und Claude für Vision sowie strukturierte Wissensextraktion. Ein kleiner typisierter Regelinterpreter bewertet ausschließlich bestätigtes Wissen. Ein transaktionales Server-Gate kontrolliert jeden entscheidenden Commit. Timeline, Workflow-Graph, Wissensansicht und Tests lesen dasselbe versionierte Prozessmodell.

Weitere breite Deep-Research-Prompts sind für diesen RFC nicht erforderlich. Die verbleibenden Risiken werden mit gezielter Dokumentationsprüfung und einem frühen technischen Durchstich reduziert. Dokumentation kann insbesondere die Freischaltung von Expressive Mode, Scribe und Procedures im konkreten ElevenLabs-Konto nicht beweisen.

Quellenpriorität für diesen Entwurf:

1. Der aktuelle Nutzerauftrag bestimmt das Deliverable: technisches Konzept/RFC, keine App-Implementierung oder Veröffentlichung.
2. Product RFC v1.3 bestimmt Vision, Scope und Abnahmen. Der Challenge-Brief liefert die externen Mindestnachweise.
3. [Deep Research 48](</Users/x/Downloads/deep-research-report (48).md>) und [Hackathon-Review/Implementierungsplan](</Users/x/Downloads/Operational Blueprint – Hackathon-Review und technischer Implementierungsplan.md>) liefern zu prüfende Vorschläge, keine automatisch auszuführenden Anweisungen.
4. Aktuelle Primärquellen belegen Plattformfähigkeiten. Architektur, Grenzwerte und Schnittstellen dieses RFC sind eigene Engineering-Entscheidungen.

Revision 1.1 berücksichtigt zusätzlich die vom Nutzer übergebenen [Antworten auf die CTO-Prüfung](</Users/x/.codex/attachments/a5bf716b-f4e2-4bab-8079-dddebd4146a4/Pasted text.txt>) und den Challenge-/Einreichungsabgleich in der Chatnachricht. Als Vorschlag formulierte Zeit-/Kostenwerte bleiben als Planannahmen gekennzeichnet.

Interne Research-Zitationsmarker werden nicht als Bibliografie übernommen. Ungeprüfte Preis-, Versions- und Wartungsbehauptungen sind keine Voraussetzung der Umsetzung.

### 1.1 Bewusste Korrekturen am beigefügten Blueprint

| Vorschlag im Blueprint | Entscheidung dieses RFC |
|---|---|
| Eine Live-Frage; Debrief bei Zeitdruck streichen | Mindestens drei passende Live-Fragen und drei neue Debrief-Antworten, danach gesprochenes bestätigtes Teach-back |
| Golden Blueprint und Fachregel vorab laden | Live-Modus startet ohne Fachregeln; Fixtures ausschließlich für Tests oder ausdrücklich ausgewählten Replay |
| Ungültiger Patch aktiviert Fixture | Fehler bleibt sichtbar, Draft unveröffentlicht; begrenzter Retry ohne automatische Umschaltung |
| Eine EvidenceState-Leiter | Herkunft, Review, Testresultate und Nutzungsgrenze unabhängig speichern |
| JsonLogic und Frontend-Gate genügen | Strikt typisierte DSL mit Unknown-Semantik; serverseitiger atomarer Recheck |
| Bankänderung als C-01 | C-01 verändert den Wareneingang gemäß Product RFC; Bankdaten-Stopp wird vor L-01 aus der Session gelernt |
| UI-Fixtures erfüllen erweiterten Scope | Lieferung B benötigt echte Zuordnung, Review, Folgeinterview und inkrementelle Veröffentlichung |

## 2. Scope, Stack und Betriebsmodell

### 2.1 Liefergrenzen

**Lieferung A:** ein Prozess, ein Expert, deutsche Capture-/Teach-Sprache, E-01 bis E-03, C-01, gecoachter L-01, Positivkontrolle L-02 und unabhängiger L-03. Reales Screen Sharing und Vision, vollständige Voice-/Debrief-Schleife, Timeline und kompakter Graph, Originalbelege, Improve-Diff, Optimize-Review, Off record, Reset und alle sechs Lifecycle-Stationen. Sieben Schritte, drei Judgment Calls und vier Guardrails sind Best-Case-Zielwerte aus tatsächlich belegtem Wissen, keine Generierungsquoten.

**Lieferung B:** drei bis vier Experten mit teilweise überlappenden Aufgabenbereichen; neue Live-Interviews und importierte Aufnahmen; manuelle/AI-unterstützte Segmentzuordnung; Review-Inbox, Beiträge-/Abdeckungsmatrix, Konflikte und Handoffs, Folgeinterview gegen bestehende Version, Teilpfadfreigabe und Regressionstests. Datenmodell und stabile IDs werden in A angelegt; funktionale Abnahme erfolgt separat nach Product RFC §17.8. B wird nicht durch einen illustrativen Compare-Screen ersetzt.

**Später:** fremde ERP-Adapter, Multi-Tenancy, Unternehmenspolicy-Abgleich, produktive Autorisierung, Agent-Evals und autonome Ausführung. In A/B bleibt `usage=exercise_only`; Control zeigt Produktionsfreigabe ausstehend und AI-Ausführung deaktiviert.

### 2.2 Festgelegter Stack

| Bereich | Entscheidung |
|---|---|
| App/Server | Next.js App Router, React, TypeScript; Node-Runtime für alle datenführenden API-Routen |
| UI | Tailwind und shadcn/ui; passende ElevenLabs-UI-Komponenten gezielt übernehmen |
| Map | `@xyflow/react`; eigener kompakter Read-/Select-Graph, kein freier Workflow-Editor |
| Client-State | Zustand für UI-Auswahl, Capture-Queue und Conversation-Zustand; kein autoritativer Regel-/Commit-Store |
| Verträge | Zod; dieselben Schema-/Typmodule in Server, Interpreter und Client |
| AI | offizielles Anthropic-SDK, JSON-Schema-Structured-Outputs; keine zweite AI-Abstraktionsschicht im MVP |
| Voice | `@elevenlabs/react` und serverseitig `@elevenlabs/elevenlabs-js`; zwei rollengetrennte Agent-Konfigurationen |
| Transkript | explizites Scribe v2 Realtime; nur committed Expert-Segmente als Claim-Quelle |
| Regeln | eigene kleine, reine AST-Auswertung; kein `eval`, generierter Code oder freies JsonLogic |
| Persistenz | SQLite über `node:sqlite`, lokale Media-Dateien; SQLite ist autoritative Datenbasis |
| Tests | Vitest für Verträge/Interpreter; API-Integration gegen temporäre SQLite; Playwright für browserübergreifenden Ablauf innerhalb des Demo-Browsers |
| MVP-Betrieb | ein Node-Prozess auf einem lokalen Rechner, zwei Tabs desselben Origins; Chrome Desktop mit Kopfhörern; localhost, alternativ ein einzelner HTTPS-Host mit persistentem Volume |

Die hier verfügbare Node-Runtime ist **24.19.0**; ein read-only In-Memory-Aufruf von `node:sqlite` wurde erfolgreich geprüft. Das belegt die lokale API-Verfügbarkeit, keine Last-/Produktionsprüfung. Native SQLite vermeidet einen separaten Datenbankdienst und unterstützt atomare Gate-Transaktionen. Der synchrone Treiber bleibt bei kleinen Demo-Transaktionen vertretbar; Netzwerk-/LLM-Aufrufe dürfen niemals innerhalb einer DB-Transaktion laufen. [Node SQLite][S13]

Serverless Hosting mit flüchtigem Dateisystem wird für A/B nicht gewählt. Eine spätere Vercel-/Mehrinstanz-Installation benötigt Postgres und Object Storage hinter denselben Repository-Interfaces. Persistenz und Provider-Provisioning werden nicht in einem Zustandsobjekt im Browser versteckt.

Versionen von App-/SDK-Paketen werden beim initialen Build nach dem offiziellen Voice-Quickstart gewählt und im Lockfile festgehalten. Keine ungeprüfte Versionskombination aus einem Research-Export kopieren. Modell-Default ist `claude-sonnet-5-5`, über `ANTHROPIC_MODEL` konfigurierbar; verfügbarer API-Zugriff wird vor dem Build geprüft. Die aktuelle offizielle Modellübersicht nennt dieses Modell. [Claude Modelle][S7]

### 2.3 Modulgrenzen

```text
Sandbox-Tab                         Companion-/Blueprint-Tab
  Faktenänderung → Server                 Screen Share → Maskierung → Vision
  Aktivität → BroadcastChannel           Mikrofon → Agents + Scribe + lokale Clips
  Pending Action → Server-Gate           Events/Transkript → Question Scheduler
               │                                    │
               └─────────── API / SQLite ────────────┘
                                  │
                      Claims → Draft → Review → Snapshot
                                  │
                 Timeline / Graph / Wissen / Tests / Tutor
```

`domain` enthält Verträge, Versions-/Review-Logik und Interpreter ohne UI-/Providerabhängigkeit. `application` orchestriert Capture, Publish, Gate und Übungen. `adapters` kapselt Anthropic, ElevenLabs, SQLite, Medien und Sandbox. Der AP-Kontext beschreibt Felder und Aktionen, keine Freigabegrenze oder Bankdatenpolicy.

BroadcastChannel dient nur Aktivität, Synchronisation und Anzeige zwischen Tabs desselben Origins. Nachrichten sind nicht autoritativ und werden auf Schema, Session und monoton steigende Sequenz geprüft. Nach Verbindungsunterbrechung werden Fakten vom Server neu geladen. [BroadcastChannel][S12]

## 3. Datenmodell und Integrität

### 3.1 Gemeinsame Identität und Zeitbasis

Serververgaben verwenden UUIDs; Step-/Decision-IDs bleiben bei Umbenennung und neuen Versionen stabil. Jede mutierende Anfrage besitzt `requestId`; Events zusätzlich `sessionId`, `captureEpoch`, `sequence`, `atMs`, `source` und optional `caseId/factsRevision`. `atMs` ist relative Sessionzeit, `receivedAt` Server-Eingangszeit. Neue Capture-Epochen nach Pause/Resume erhalten einen eigenen Clock-Anker.

Provider-Audio-/Wortzeiten werden mit dem Epoch-Anker in Sessionzeit übertragen; Empfangszeit allein ist keine exakte Sprechzeit. Screen-Kontext, spätere Erklärung und hypothetischer Gegenfall bleiben getrennte Quellentypen. UI zeigt ungenaue Zeitzuordnung, statt eine exakte Synchronisation zu behaupten.

### 3.2 Persistente Aggregate

SQLite verwendet Foreign Keys, explizite Transaktionen, Unique-Constraints für Idempotenz und eine Schema-Migrationsnummer. Kleine strukturierte Payloads sind schema-validierte JSON-Spalten; Identitäten, Zuordnungen, Status und Versionsbezüge bleiben relational. Ein Repository pro Aggregat isoliert den Treiber.

| Aggregate/Tabellen | Inhalt und Integrität |
|---|---|
| `processes`, `blueprint_versions` | Prozessgrenzen, Owner, aktueller Published-Pointer, Draft-Revision; unveränderliche fachliche Snapshots mit `parentVersionId`, `contentHash`, freigegebenem Scope |
| `sessions`, `source_assets`, `source_segments` | Expert/Learner/Clarification, Rolle, Sprache, Live/Import/Replay, Capture-Epochen; Aufnahme/Frame/Transcript; Segmentgrenzen und Verarbeitungstatus |
| `screen_events`, `transcript_segments`, `questions` | Beobachtete Fakten versus Adapterdaten; Sprecher und Originaltext; Frage, Gap, Event-Bezug, Zeitpunkt, Antwortbezug und Ergebnis |
| `session_knowledge_drafts`, `knowledge_gaps`, `answer_links`, `operations` | persistierter inkrementeller Wissensstand und Revision; Frage-/Antwort-/Gap-Zuordnung; wiederaufnehmbare Extraktion und Provider-Provisionierung |
| `expert_claims`, `claim_evidence` | Behauptung, Originalzitat mit Textspanne, normalisierte Paraphrase, Expert, Kontext, Gültigkeit und Originalquellen |
| `workflow_steps`, `workflow_edges` | stabile logische IDs; versionierte Inhalte; `task/check/decision/handoff/wait/end` und `sequence/conditional/exception/handoff/return` |
| `judgment_rules`, `knowledge_relations` | typisierte Bedingungen und Aktionen, unterstützende Claims, Ausnahmen, Rollen/Handoffs; Beziehungen `supports/contradicts/exception_to/applies_in/requires/tested_by` |
| `contribution_assignments`, `responsibility_assignments` | M:N Segment↔Schritt/Entscheidung, Beitragsart, Scope; Verantwortung, Expertise und Freigabebefugnis getrennt |
| `confirmations`, `change_proposals`, `issues` | bestätigter Subject-Hash, Bestätigungsart, Person, Zeitpunkt; Diff/Basisrevision; Abdeckungs-, Handoff-, Konflikt- und Klärungsissues |
| `exercise_runs`, `test_cases`, `test_results` | feste Version und Scope; Erstentscheidung/Begründung, Hilfeereignisse, Gate, finale Aktion, Testart und Ergebnis |
| `sandbox_cases`, `pending_actions`, `gate_results` | typisierte Fakten, Revision, vorgeschlagene Aktion, Gate-Ergebnis, gültige Version, Idempotenz und tatsächlicher Commit |
| `optimization_proposals`, `audit_events`, `provider_bindings` | belegtes Problem und Hypothese, Reviewstatus; technische Aktionen ohne sensible Rohpayloads; Agent-/KB-/Procedure-Bindung pro Version |

Die Snapshot-Payload ist die kanonische fachliche Version. Die relationalen Step-/Rule-Zeilen sind aus demselben Publish-Vorgang erzeugte Projektionen; sie dürfen nicht unabhängig geändert werden. Quellen sind referenziert, nicht pro Schritt kopiert. Modelle erstellen Draft-IDs mit Präfix `draft:`; der Server vergibt/zuordnet dauerhafte IDs nach Review.

### 3.3 Vier unabhängige Bestätigungen

`Confirmation.kind = assignment | representation | domain_validity | version_release`. Jede Bestätigung bindet an `subjectId + subjectHash + scope + actorId`. Inhaltliche Änderungen invalidieren passende Bestätigungen; eine Zuordnungskorrektur bestätigt nicht automatisch den Claim. In A kann dieselbe explizit benannte Demo-Person Expert und Process Owner spielen; die Akte bleiben getrennt. In B prüfen zuständige Rollen fachliche Gültigkeit und der Owner veröffentlicht den Prozessscope.

Zusätzlich getrennt: `origin=model_prior|screen_observation|expert_statement|owner_decision|company_policy`, `review=draft|expert_confirmed|conflicted|stale`, konkrete Testresultate und `usage=exercise_only`. Owner-Entscheidungen sind keine fingierte Policy. Kein globaler Confidence-Score; technische Vision-Unsicherheit ist kein fachlicher Vertrauenswert.

### 3.4 Publikationsinvarianten

- Jeder veröffentlichte Live-Schritt und Guardrail besitzt gültigen Screen-Kontext sowie tatsächliche Expertenworte. Rein erklärte Varianten tragen `described_not_observed`. Im Import-/Klärungsfall sind schriftliche oder reine Audioquellen als solche erkennbar; sie zählen nicht als beobachteter Challenge-Schritt.
- Wörtliche Zitate werden aus vorhandenen Transcript-Textspannen ausgeschnitten, nicht vom Modell neu formuliert. Eine Korrektur der Transkription wird mit Änderungsvermerk und Originalaudio gespeichert; ohne Prüfung kein stilles Ersetzen.
- Jede ausführbare Bedingung, Grenze und Aktion hat Unterstützung durch bestätigte Claims; ein Modellprior allein reicht nie. Fremde oder gelöschte Evidence-IDs verhindern Veröffentlichung.
- Kritische offene Lücken/Konflikte sperren den betroffenen Scope. Teilpfade brauchen explizite Step-/Rule-Mengen; der Scope enthält ihre notwendigen Fakten, Handoffs und Wiederaufnahmebedingungen.
- Snapshots werden fachlich nicht überschrieben. Veröffentlichung aktualisiert den Process-Pointer atomar. Evidenzentfernung kann ihre Nutzung widerrufen, ohne ihre historische Versionsnummer zu ändern.

## 4. Capture, Voice und Wissensextraktion

### 4.1 Screen-Auswahl und Privacy-Maskierung

Companion und Sandbox laufen in zwei Tabs. Der Nutzer startet `getDisplayMedia()` per Button; Browseroptionen sind Auswahlhinweise, keine Garantie für einen bestimmten Tab. Die App darf nicht behaupten, fremde Tabs sicher ausschließen zu können. [Screen Capture][S10]

Der unterstützte Sandbox-Tab zeigt einen zufälligen Session-Marker und ein klar definiertes synthetisches Layout. Vor jedem Cloud-Upload muss der lokale Prüfer Marker, Layoutanker, aktuelle Geometrie und Layoutversion erkennen. Bei Unsicherheit, Quellenwechsel oder Resize ohne gültige Neuzuordnung: Upload stoppen, Auswahl erneut bestätigen. Auch ein Marker ist kein allgemeiner Sicherheitsbeweis für beliebige Webseiten; unterstützt wird ausschließlich der kontrollierte Demo-Tab.

Sensible synthetische Felder werden bereits im Sandbox-Capture-Modus verdeckt; zusätzlich maskiert die lokale Canvas-Pipeline bekannte Regionen vor Upload und Speicherung. Die semantische Information `bankDetailsChanged` bleibt sichtbar, die Kontonummer nicht. Der Delta-Vergleich läuft auf maskierten Bildern. Nicht erkennbare Maske bedeutet Pause, nicht unmaskierten Fallback. Es werden keine unmaskierten Rohframes persistiert.

Startwerte: Snapshot alle 1.500 ms, maximal ein Vision-Request gleichzeitig, eine ersetzbare Wartestelle für das neueste Bild. Kontext zuerst ausreichend lesbar, längste Kante initial 1.280 px; bei nachgewiesenem Lesefehler mehr Auflösung innerhalb konfigurierter Limits. Pixel-/Delta-Heuristik wird am tatsächlichen ERP getestet. Ein erzwungener periodischer Snapshot verhindert, dass kleine relevante Feldänderungen dauerhaft weggefiltert werden. Bilder aus verschiedenen Fällen werden nie als Vergleichspaar gesendet.

Vision-Ausgabe enthält nur sichtbare Fakten/Änderungen, keine Motivation, Policy oder Freigabeempfehlung. Server validiert Schema und Referenzen. Ergebnisse einer alten Capture-Epoche, einer älteren Sequenz als der aktuelle Zustand oder eines inzwischen gewechselten Falls verändern keinen aktuellen Kontext. Historische, noch zulässige Events bleiben historisch verortet; ein erfolgreicher aktueller Vision-Pfad ist für die Live-Abnahme erforderlich. [Claude Vision][S6]

### 4.2 Voice-Konfiguration und Capability-Spike

Private Sessions erhalten serverseitig einen frischen WebRTC-Conversation-Token; Scribe einen separaten kurzlebigen Token. API-Keys bleiben serverseitig. `ConversationProvider` umschließt die Voice-Hooks. Native Agent-LLMs nutzen ElevenLabs-Abrechnung; unser Anthropic-Key bedient direkt Vision/Extraktion, kein Custom-LLM-Adapter. [React SDK][S1], [Custom LLM][S4]

Der Interviewer startet geduldig, stellt jeweils nur eine Frage und verwendet Skip-Turn bei fehlender Gesprächsfreigabe. Der Tutor erklärt bestätigte Regeln, fragt nach Entscheidungen und verfügt über keine Musterlösungen. Beide verwenden Expressive Mode, soweit für die gewählte Kontokonfiguration verfügbar. Speech-Konfiguration und genaue Modelle werden im Capability-Report protokolliert. [Expressive Mode][S2]

Explizites Scribe v2 Realtime transkribiert Expert-Sprache parallel zum Agenten. Das Agent-SDK verwaltet seinen eigenen Mikrofonzugriff; es wird kein undokumentiertes `inputStream`-Argument verwendet. Eine zweite lokale `getUserMedia`-Aufnahme desselben Devices liefert PCM über einen AudioWorklet an Scribe im manuellen Audio-Modus und an den lokalen Evidence-Buffer. Scribe-Konfiguration: `scribe_v2_realtime`, Wortzeiten aktiviert, VAD-basierte Segmentbestätigung. Partials dienen Anzeige/Aktivität, committed Segmente der Evidenz. Agententext und Expertsprache bleiben unterschiedliche Quellen. [Scribe SDK][S14], [öffentliche Input-Typen][S15]

Der erste Spike prüft zwei parallele Mikrofonaufnahmen desselben Devices über zehn Minuten im Demo-Chrome mit Kopfhörern, deutscher Sprache, Unterbrechbarkeit, Wort-/Segmentzeiten, Off record und Resume. Nach maximal zwei Engineering-Stunden wird je Fähigkeit `works | limited | blocked` dokumentiert. Instabilität führt zunächst zu Agent-Transkript plus lokaler Originalaudioaufnahme, sofern dieser Ersatz funktioniert; Scribe bleibt ein offener Best-Case-Nachweis. Ein eigener Audioadapter erhält separate Aufwandsschätzung und Scopeentscheidung. Keine privaten SDK-Felder als Brücke verwenden.

### 4.2a Inkrementeller SessionKnowledgeDraft

Ein persistierter Draft besitzt `sessionId, revision, lastProcessedSegmentSequence, claims, gapIds, correctionLinks`. Nach jedem committed Expert-Segment startet die serverseitige Extraktion; schnell folgende Segmente können in einem maximal zwei Sekunden wartenden Batch gebündelt werden. Pro Session läuft eine Extraktionsoperation; ein persistierter Folgebatch nimmt neue Segmente auf. Partials erzeugen keine Claims.

Extraktion erzeugt nur typed Änderungsvorschläge mit `baseDraftRevision`, Segment-/Event-IDs und Zitatspannen. Nach Referenz-, Zitat- und Typprüfung werden Patch und verarbeitete Segmentsequenz atomar gespeichert. Ändert sich der Draft währenddessen, wird der Vorschlag gegen die aktuelle Revision neu geprüft; keine stale Überschreibung. Gleiches Eingangssegment wird dank Unique-Key nicht doppelt verarbeitet. Nach Off record werden Ergebnisse der alten Epoch nicht übernommen.

Eine Frage besitzt `questionId, gapIds, eventIds, caseId, spokenAtMs`. AnswerLinks ordnen tatsächliche Transcript-Segmente und daraus extrahierte Claims explizit diesen Referenzen zu. Zeitliche Nähe schlägt Links vor, bestätigt sie aber nicht allein. Bei mehreren möglichen Fragen bleibt die Zuordnung offen; die UI erlaubt Korrektur. Eine Antwort kann mehrere Gaps adressieren; ein Gap kann mehrere Quellen haben.

Gapzustände: `open → answer_received → provisionally_answered → confirmed`; eine widersprechende Aussage ergibt `conflict_open`. `answer_received` bedeutet relevantes Segment, `provisionally_answered` eine belegte Interpretation, `confirmed` ausdrückliche Expertenbestätigung. Korrekturen referenzieren den früheren Claim über `supersedesClaimId`, erhalten Originalquellen und setzen betroffene Bestätigungen zurück. Der Planner stellt vorläufig beantwortete Themen zurück und priorisiert offene echte Lücken/Konflikte. Er darf Unknown nicht durch allgemeines Modellwissen schließen.

Ein Gapwechsel zum vorläufig beantworteten Zustand erzeugt ein eindeutiges Lernereignis. Debrief zählt neue beantwortete Themen, nicht Segmente, Claims oder wiederholte Fragen. Der finale Publish-Check verlangt die bestätigte Interpretation. Der SessionKnowledgeDraft ist keine veröffentlichte BlueprintVersion; der Übergang bleibt ein eigener Review-/Publish-Vorgang.

### 4.3 Question Scheduler

Der Server erzeugt Kandidaten aus aktuellen Events und dem SessionKnowledgeDraft; der Client entscheidet unmittelbar vor dem Sprechen anhand seiner neuesten Aktivität. Kandidat: `id, gapIds, topicKey, eventIds, caseId, epoch, draftRevision, question, priority, expiresAt`. TTL beträgt initial 30 Sekunden; vor Trigger werden Gapzustand, Revision und Fall erneut geprüft. `topicKey` verhindert bloße Wiederholungen; semantische Ähnlichkeit ist ein Hinweis für Review, keine automatische Wahrheit.

Startpolicy gemäß Product RFC: keine Expert-/Agent-Sprache, zwei Sekunden ohne Keyboard/Pointer/Scroll, 1,5 Sekunden stabiler Screen, mindestens 30 Sekunden Frageabstand, maximal fünf Live-Fragen in einem rollierenden Zehn-Minuten-Fenster. Ein abgeschlossener Check/Navigationsabschnitt oder „Frag jetzt“ muss zusätzlich vorliegen. Stilles Lesen allein öffnet das Gate nicht. Bei erneuter Aktivität wird der Kandidat zurückgestellt; bei Fall-/Epoch-Wechsel verworfen. Eine Frage wird nie zur Erfüllung eines Zählers erzwungen.

`sendContextualUpdate` überträgt kompakte Beobachtungen ohne unmittelbaren Turn. `sendUserActivity` unterstützt die vorübergehende Unterdrückung bei Aktivität. Ein freigegebener Fragenkandidat wird ausdrücklich als App-Steuerung per `sendUserMessage` übergeben; diese Nachricht ist keine Expertenaussage und wird von Evidence ausgeschlossen. Nur der Scheduler darf diesen Trigger erzeugen. SDK-Aufrufe ersetzen die Policy nicht. [React SDK][S1]

Gezählt wird eine tatsächlich gesprochene, an einen gültigen Event gebundene Frage. Unterbrochene oder nicht beantwortete Fragen bleiben sichtbar und erfüllen nicht automatisch den jeweiligen Lern-/Gap-Nachweis. Spontane Nutzeräußerungen werden verarbeitet; der Agent darf keine neuen unbeankerten Live-Fragen hinzufügen. Diese Grenze wird durch Conversation-Logs geprüft und ist ohne eigenen Voice-Orchestrator keine harte Plattformgarantie.

### 4.4 Debrief und Teach-back

`capture → drafting → debrief → teachback → review → published`, daneben `paused`, `off_record` und `failed` mit Resume-Ziel. Nach Capture wird die Queue abgeschlossen; keine verspätete Live-Frage wandert unbemerkt in den Debrief-Zähler.

Claude extrahiert Claims, Schritte, Kandidatenregeln und offene Lücken mit Structured Outputs über `output_config.format`. Zod, Referenzprüfung, Zitatprüfung und fachliche AST-Typprüfung folgen serverseitig. Refusal, `max_tokens`, ungültige Referenzen und Schemakompilierungsfehler erzeugen keinen gültigen Draft. Native Claude-Citations werden nicht mit JSON-Ausgabe kombiniert; unsere validierten Evidence-IDs bilden die Herkunft ab. Ein validiertes JSON ist noch kein bestätigtes Wissen. Der Draft wird dem Nutzer zur Prüfung angeboten; keine Modellantwort setzt eine Bestätigung. [Structured Outputs][S8]

Der Debrief wählt drei tatsächlich neue Themen und einen Gegenfall. C-01 verändert `goodsReceiptConfirmed`; es wird keine zuvor verschwiegene Bankdatenregel als vorbereitete Live-Erkenntnis eingespielt. Ist die Wareneingangsbedingung bereits bekannt, wird der Gegenfall als bestätigender Test erfasst, nicht als erfundene Korrektur. Fehlende kritische Grundlagen werden als Issues geführt. Fünf Minuten sind ein Ziel; Ablauf der Zeit erteilt keine Freigabe.

Das Teach-back wird aus dem reviewed Draft formuliert und gesprochen. Seine Originalausgabe, die Expert-Bestätigung und der Inhalts-Hash werden verknüpft. Jede anschließende fachliche Änderung verlangt erneute Bestätigung der geänderten Fassung. Der Button bleibt „Für diese Übung bestätigen“.

`acceptanceProfile=challenge_initial` verlangt zusätzlich zu Quellen-/Scope-Integrität die mindestens drei Live- und drei neuen Debrief-Antworten, Guardrail-Frage, Counterfactual und ausdrücklich bestätigtes gesprochenes Teach-back. `incremental_partial` für Lieferung B prüft Zuordnung, Aussagewiedergabe, fachliche Gültigkeit, Versionsfreigabe und kritische Gaps in der Scope-Closure; nicht jedes Teil-/Import-/Klärungsinterview muss die Challenge-Quoten wiederholen. Importpublikation zählt niemals als Live-Challenge-Nachweis. Der Server wählt das Profil anhand des Prozess-/Lieferkontexts, nicht anhand eines ungeprüften Clientflags.

Der isolierte erste Durchstich verwendet `technical_spike`: eine tatsächlich belegte, ausdrücklich bestätigte Regel darf in eine separat gekennzeichnete Spike-Übung überführt werden, ohne die vollständigen Fragenquoten zu behaupten. Quellen-/Rollen-/Gate-Integrität bleibt Pflicht. Dieser Prozess, Snapshot und seine Ergebnisse zählen weder als Challenge-Abnahme noch als vollständiger Best Case. Der Challenge-Prozess beginnt anschließend mit leerer Live-Regelbasis; keine still vorinitialisierten Regeln aus dem Spike.

### 4.5 Tutor-Wissensbindung

Ein Run pinnt `processId, versionId, contentHash, scopeId`. Eine kompakte Darstellung der bestätigten Version und eine freie Coaching-Procedure werden an eine versionspezifische Tutor-Konfiguration gebunden; KB-Ressourcen werden ebenfalls pro Version angelegt und im Prompt-Modus genutzt. Es wird kein gemeinsamer Agent mit wechselnder KB während aktiver Runs überschrieben. `provider_bindings` speichert Agent-, veröffentlichte Agentversion-, KB- und Procedure-IDs, Hash und Provisioningstatus; der Tokenaufruf bindet die passende `version_id`. Für die kleine Map ist keine zusätzliche RAG-Schicht vorgesehen. [Procedures][S5], [Knowledge Base][S16], [WebRTC Token][S17]

Client Tools: `get_current_facts`, `get_confirmed_rule`, `show_evidence`, `highlight_field`. Sie liefern nur erlaubte Felder/Quellen des Run-Scopes, nie Drafts, Bewertungsoracle oder eine Commit-Funktion. Argumente/Version werden serverseitig geprüft. Ein Agent-Tool-Call bestätigt keinen Claim und darf keine Action freigeben.

Kann die konkrete KB-/Procedure-Konfiguration keine verlässliche Versionbindung herstellen, bleibt deren Status `unsupported/failed`. Ein ausdrücklich gekennzeichneter Ersatz mit kompaktem Runtime-Kontext und serverseitigem Lookup kann den Challenge-Kern tragen, erfüllt aber nicht automatisch die zusätzliche technische Best-Case-Zusage im Product RFC. Direkte Kontoprüfung ist hierfür noch offen.

## 5. Regeln, Pending Actions und Transfernachweis

### 5.1 Regelvertrag

Der AP-Kontext kennt typisierte Fakten wie `vendorKnown`, `poMatches`, `varianceBps`, `goodsReceiptConfirmed`, `bankDetailsChanged`, optional Rollen-/Verifikationsfakten. Geldbeträge werden in Minor Units, Abweichungen in ganzzahligen Basispunkten repräsentiert. Die Umrechnung einer Expertenaussage wird sichtbar reviewt; kein stilles Runden einer Grenze.

```ts
type Predicate =
  | { kind: 'compare'; field: string; op: 'eq'|'neq'|'lt'|'lte'|'gt'|'gte'; value: boolean|number|string }
  | { kind: 'presence'; field: string; op: 'is_known'|'is_unknown' }
  | { kind: 'all'|'any'; items: Predicate[] };

type RuleEffect =
  | { kind: 'permit'; action: 'approve'|'hold'|'escalate' }
  | { kind: 'prohibit'; action: 'approve'|'hold'|'escalate'; requiredAction?: string; routeTo?: string; resumeWhen?: Predicate };

type JudgmentRule = {
  id: string; stepId: string; scopeId: string;
  requiredCapabilityIds: string[];
  when: Predicate; effect: RuleEffect;
  claimIds: string[]; evidenceIds: string[];
  review: 'expert_confirmed'; usage: 'exercise_only';
};
```

Zusätzlicher serverseitiger Typecheck verknüpft Feldtypen und Operatoren; maximal 32 Regeln pro Übung, AST-Tiefe 8, insgesamt 256 Predicate-Nodes als Startlimits. Kein Property-Traversal außerhalb des Feldkatalogs, kein dynamischer Operator und keine Seiteneffekte. Unpassende Sprache bleibt als nicht ausführbarer Claim/Review-Issue erhalten. Ein `permit` benötigt sämtliche vom Experten bestätigten Voraussetzungen; ein einzelner positiver Fakt ist keine pauschale Freigabe.

### 5.2 Dreiwertige Auswertung

Jeder Vergleich liefert `true | false | unknown`; fehlend, `null`, falscher Datentyp oder unzuverlässige Herkunft ergibt `unknown`. Keine JavaScript-/JsonLogic-Coercion. `all`: irgendein `false` ergibt `false`, sonst bei Unknown `unknown`; `any`: irgendein `true` ergibt `true`, sonst bei Unknown `unknown`. `presence` prüft ausschließlich typisierte bekannte Feld-IDs: `is_known` ist wahr bei aktuellem, typkorrektem, verlässlich belegtem Wert; sonst ist `is_unknown` wahr. So kann eine ausdrücklich bestätigte Regel fehlende Nachweise in Hold/Klärung überführen, ohne Unknown als Freigabe zu interpretieren.

Technische Befugnisse stammen ausschließlich vom servergebundenen Actor. `requiredCapabilityIds` referenzieren einen Katalog simulierter Sandbox-Befugnisse. Eine Fachregel beschreibt eine benötigte Befugnis; sie erteilt sie niemandem. Rollenbezeichnungen allein sind keine technische Capability. Pflichtbefugnisse werden nach Quellenreview als Teil des Snapshots gebunden.

Für eine zutreffende Prohibit-Regel gilt: `resumeWhen=false` lässt das Verbot aktiv, `unknown` verlangt Klärung und `true` löst nur genau dieses Verbot auf. Eine fehlende `resumeWhen` bedeutet keine modellierte Auflösung. Ein Resume erzeugt kein Permit; anschließend wird die gesamte Aktion samt Rolle und weiteren Regeln erneut ausgewertet.

Gate-Aggregation für die vorgeschlagene Aktion, nach dieser lokalen Resume-Auswertung:

1. Fehlende/widerrufene Version, falsche Rolle/Scope oder kritischer Konflikt: `unknown`, kein Commit.
2. Ein zutreffendes bestätigtes Verbot: `blocked`, auch bei allgemeinem Permit. Gründe und erforderlicher nächster Schritt werden aus dem Snapshot abgeleitet.
3. Ein möglicherweise zutreffendes Verbot mit Unknown-Fakten: `unknown`.
4. Ein zutreffendes Permit und kein entgegenstehender Befund: `allowed`.
5. Kein passendes Permit oder unvollständige Voraussetzungen: `unknown`.

Es gibt kein Default-Allow. Die Interpretersemantik ist generisch; 2 %, Bankdaten-Override und AP-Lead-Zuständigkeit werden nicht im Interpreter, Prompt oder App-Adapter vorgegeben. JsonLogic bleibt eine mögliche spätere Exportform, nicht die kanonische Semantik dieses MVP.

Jeder Fall besitzt `recordRevision` für jede gespeicherte Änderung und `factsRevision` für entscheidungsrelevante Geschäftsfakten. Verifikation bindet an `factsRevision`, Nachweis, berechtigten Actor und `verificationRequirementHash`. Ihre Speicherung erhöht `recordRevision`, nicht `factsRevision`; eine relevante Faktenänderung invalidiert sie. Neue fachliche Verifikationsanforderungen erfordern erneute Prüfung. Status-/Metadatenänderungen dürfen keine gültige Verifikation allein durch einen Revisionswechsel zerstören.

Für erklärte Wiederaufnahme kennt der Kontextkatalog `verificationStatus`, `verificationEvidenceId`, `verifiedByRole`, `verifiedFactsRevision`, `verificationRequirementHash` und `verifiedAt`; zulässige Nachweistypen sind generische Sandbox-Daten. Die Session bestimmt erst, welcher Nachweis, welche Rolle und welche erneuten Prüfungen erforderlich sind. Der Server bindet Verifikationsfakten an existierenden Nachweis und servergebundene Demo-Rolle; ein Learner-PATCH darf sie nicht selbst setzen. Bleibt `bankDetailsChanged=true`, kann eine bestätigte Ausnahme den Stopp nur nach belegter zuständiger Verifikation und erneuter Fallprüfung auflösen. Ohne solchen ausdrücklich gelernten Resume-Pfad bleibt die Wiederaufnahme Review erforderlich.

| Situation beim Approve-Versuch | Ergebnis |
|---|---|
| Bankänderung, nachweislich keine gültige Verifikation | `blocked` durch gelernte Stop-Regel |
| Verifikationsgrundlage unbekannt | `unknown` |
| Gültige Verifikation, Wareneingang fehlt | kein Approve; weiteres Verbot beziehungsweise fehlendes Permit |
| Gültige Verifikation, falsche Befugnis | kein Approve |
| Alle Voraussetzungen erfüllt und zutreffendes Permit | `allowed` |
| Weitere aktive Stop-Regel | weiterhin `blocked` |

### 5.3 Transaktionales Commit-Gate

Expert-Demonstration und Learner-Übung sind getrennte Modi. Der Expert darf synthetische Fälle ohne gelernte Regeln bearbeiten; der Server prüft nur technische Integrität und protokolliert `expert_demonstration`. Dies ist keine validierte Freigabe. Ein Learner-Run benötigt dagegen eine gültige veröffentlichte Version; Requests dürfen ihren Modus nicht selbst auf Expert umstellen.

Im Learner-Modus speichert ein Fakten-PATCH zunächst den Entwurf mit Revision, keine Freigabe. Jede entscheidende Action erstellt eine Pending Action. Clientprüfung dient schnellem Feedback; das Serverergebnis entscheidet.

```text
BEGIN IMMEDIATE
  gültigen Run, Scope und nicht widerrufene Version laden
  aktuellen serverseitigen Fall lesen
  expectedRecordRevision + expectedFactsRevision + Idempotenzschlüssel prüfen
  Regeln auf diese Fakten auswerten
  Pending Action, Gate Result und Assistance Event protokollieren
  nur bei allowed: Status ändern, recordRevision erhöhen, Commit protokollieren
COMMIT
```

Keine LLM-/Voice-Abhängigkeit im Gate. Die Antwort enthält `allowed|blocked|unknown`, Version, Fallrevision, Rule-IDs und Evidence-IDs. Wiederholung desselben Schlüssels liefert dasselbe Ergebnis; anderer Payload mit gleichem Schlüssel führt zu `409`. Fakten-/Versionsänderung zwischen vorheriger Prüfung und Request führt zu `409/recheck`, kein Durchwinken. Direkte Action-Requests laufen durch dasselbe Gate; es existiert keine ungeprüfte Commit-Route. SQLite schreibt Ergebnis und Status atomar.

Bei `blocked/unknown` zeigt die UI sofort die Karte; anschließend erklärt der Tutor kurz anhand bestätigter Claims. Hold/Escalate ist nicht automatisch immer erlaubt: auch deren Bedingungen/Rollen werden aus bestätigtem Wissen geprüft. Ein Timeout oder Verbindungsabbruch bietet kein „trotzdem speichern“.

### 5.4 Bewertungsoracle und unabhängiger Transfer

Fälle E-01–03, C-01, L-01–03 entsprechen Product RFC §6.2. Musterlösungen liegen in einem separaten serverseitigen Evaluator und Testfixtures, außerhalb aller AI-Payload-Builder und Client-Bundles. Der Tutor erhält sichtbare Fakten und den Snapshot, keine erwartete Antwort. Gegenfälle können Feldwerte vorbereiten, dürfen keine Regelantwort vorwegnehmen.

`testType = counterfactual | coached | independent | regression`. Ein Resultat speichert erste Aktion, vor Feedback erfasste Begründung, alle Hinweise/Replays/Gate-Interventionen, finale Aktion und feste Version. Bei L-03 gibt es bis zur Erstentscheidung keine Regelhinweise oder Replay; ein Gate-Stopp zählt als Hilfe und beendet den selbstständigen Erfolgsnachweis dieses Versuchs. Nachfolgende Korrektur darf als gecoachter Erfolg erscheinen. Ein neuer unabhängiger Versuch benötigt einen weiteren ungesehenen Fall; derselbe Fall wird nicht als unabhängiger Wiederholungstest gezählt.

Das Oracle bewertet Aktion deterministisch. Begründungen werden gegen separat definierte Lernziele geprüft und mit Originaltext angezeigt; ein LLM kann eine vorläufige Zuordnung vorschlagen, darf aber kein ungeprüftes Mastery-Urteil setzen. Ergebnis: `selbstständig gezeigt | mit Hilfe gelöst | noch üben`, pro Lernziel und Fall, keine universelle Kompetenzbehauptung.

## 6. Improve, Teilinterviews und inkrementelles Review

### 6.1 Änderungen und Testabhängigkeiten

Ein ChangeProposal bindet `baseVersionId/baseDraftRevision`, betroffene Step-/Claim-/Rule-IDs, Quelle und typed Operations: `add_step`, `revise_step`, `add_edge`, `revise_rule`, `attach_claim`, `set_responsibility`. Kein beliebiges `patch: Record<string, unknown>` auf veröffentlichte Objekte. Server prüft IDs, Scope und Referenzintegrität.

Reviewentscheidungen sind `accept`, `edit_and_confirm`, `request_clarification`, `reject`, `duplicate_link`. Ein angenommenes Proposal verändert nur den Draft, nicht automatisch Published oder laufende Übungen. Bei veralteter Basis wird ein neuer Diff gegen den aktuellen Draft berechnet und erneut reviewt; Konflikte niemals durch Last-Write-Wins verstecken.

Neue Versionen invalidieren Bestätigungen geänderter Inhalte und markieren betroffene Tests als erneut erforderlich. Alte Testresultate behalten ihre alte Version. Testimpact wird über Step-/Rule-/Fact-/Handoff-Abhängigkeiten ermittelt; bei unklarer Abhängigkeit wird das vollständige kleine AP-Regressionsset wiederholt. Die neue Version wird ausdrücklich in einen neuen Run übernommen, nicht in einen alten Run injiziert.

Optimize-Vorschläge enthalten Problem, konkrete Quellen, Hypothese, Änderung, betroffene Guardrails und `suggested/expert_reviewed/approved_for_sandbox/tested/rejected`. Ohne belegten Reibungspunkt erscheint ein leerer Zustand. Eine getestete Optimierung braucht echte Testergebnisse; erfundene Zeitersparnis bleibt ausgeschlossen. Anwendung eines Sandbox-Layoutwechsels gehört zum P1-Stretch.

### 6.2 Lieferung B: Interviews und Recordings

Der Einstieg wählt neuen Prozess, bestehenden Prozess ergänzen oder Issue klären. Eine Quelle hat Expert, Rolle/Aufgabenbereich, Sprache, `live|import|written_clarification|replay`, Basisversion und Verarbeitungstatus. Import in B startet mit lokalem Audio-/Videoasset plus zeitmarkiertem Transcript-JSON; Audio/Video ohne Transcript bleibt `transcript_missing` und liefert keine veröffentlichbare Regel. Manuelle Segmentierung ist der MVP-Weg; beliebige automatische Videoanalyse ist kein versteckter Pflichtumfang.

Ein Segment ist eine Zeitspanne einer unveränderten Quelle. ContributionAssignments referenzieren ein Segment und beliebig viele passende Step-/Decision-IDs. Eine Passage kann mehrere Schritte/Prozesse unterstützen; Quelle wird nicht dupliziert. Unklare Zuordnung bleibt `unassigned`. Neue Step-Vorschläge werden nach Review entweder mit bestehender ID verknüpft, als Variante geführt oder erhalten eine neue stabile ID; Titelähnlichkeit allein führt nie zum Merge.

Review-Inbox zeigt Typ, Vorher/Nachher, Quelle, Scope und betroffene Nachbarschritte. Beiträge-/Abdeckungsmatrix zeigt konkrete Quellen pro Schritt; fehlende Zellen bedeuten unbekannte Abdeckung. Ohne definierte Sollstruktur kein Prozentwert. Rollenlabels und Handoffs zeigen benötigten Nachweis, Empfänger und Wiederaufnahmebedingung.

### 6.3 Konflikte und Teilpfadfreigabe

Verglichen werden Claims derselben Entscheidung mit kompatibler Rolle, Kontext und Gültigkeitszeit. Ein Modell kann möglichen Konflikt, Rollenunterschied, Kontextvariante oder Handoff-Lücke vorschlagen; Reviewer bestätigt die Einordnung. Issues können auch manuell entstehen. `open → assigned → clarification_received → resolved` beziehungsweise `deferred`; Zuständigkeitszuweisung allein ist keine Lösung.

Ein Folgeinterview referenziert `issueId + processId + stepIds`; seine Aussagen durchlaufen dieselben vier Bestätigungen. Ein Owner kann eine scoped Arbeitsregel auswählen und begründen; beide ursprünglichen Claims bleiben nachvollziehbar. Kein Mehrheits- oder Senioritätsentscheid als automatische Wahrheit.

Ein veröffentlichter Scope umfasst die gesamte zur Übung erforderliche Pfad-/Regel-/Handoff-Closure. Kritische Lücken in dieser Closure sperren die Übung; unabhängige geklärte Teilpfade dürfen nutzbar bleiben. Fehlender Lieferanten-/Rollenkontext ergibt Unknown. Eine Controller-Befugnis wird nie allein durch Übernahme eines Claims zur Learner-Befugnis.

## 7. Privacy, Originalaudio und Recovery

### 7.1 Off-record-Protokoll

Off record wirkt zuerst synchron im Client: `captureEpoch` wechseln, Sampler/Queue und Context-Updates stoppen, Requests abbrechen, Agent-/Scribe-Verbindungen beenden, Mikrofontracks/Recorder stoppen, flüchtige Buffer leeren. Mute allein ist kein hinreichender Upload-Stopp. In-flight-Antworten der alten Epoche werden verworfen. Anschließend bestätigt der Server die neue Epoch und sperrt weitere Daten dieser Epoche.

Resume erfordert eine neue Conversation, neues Scribe-Token und erneutes Mikrofon-/Screen-Setup nach Bedarf. Alte rohe Conversation-History wird nicht wieder eingesetzt. Wiederaufbau erhält nur weiterhin zulässiges reviewed Wissen und sichtbare aktuelle Fakten; unbestätigte Lücken werden erneut geklärt.

Der Upload-Stopp garantiert keine Rückholung bereits versendeter Daten. Providerretention, Audio Saving und gegebenenfalls Providerlöschung werden separat anhand der tatsächlichen Kontooptionen geprüft und im Startdialog angezeigt. Agent-Audio-Saving wird deaktiviert, eine unterstützte kurze Retention explizit gesetzt; `0` bedeutet laut Detaildokumentation geplante Löschung, keine nachgewiesene sofortige Löschung. Einstellungen für Agents werden nicht als Scribe-/Claude-Aufbewahrungsregel ausgegeben. Keine allgemeine Compliance-Zusage. [ElevenLabs Privacy][S3], [Retention][S18]

### 7.2 Evidence entfernen und Nutzung widerrufen

Quellenentfernung ist eine explizite lokale Aktion. Asset/Textinhalt und direkte Quellenlinks werden entfernt; die Dependency-Closure markiert betroffene Claims/Regeln, Snapshots, Providerbindungen und laufende Runs als überprüfungsbedürftig oder widerrufen. Regeln mit anderer gültiger unabhängiger Quelle müssen erneut auf ausreichende Unterstützung geprüft werden; sie bleiben nicht automatisch bestätigt.

Der Server sperrt betroffene Gates sofort; der Client beendet betroffene Tutor-Conversations. Bei veralteter Browseransicht bleibt das Server-Gate wirksam. Provider-KB/Procedure/Agent-Ressourcen werden separat entfernt oder ungebunden, soweit API/Konto dies ermöglicht. Fehlgeschlagene Providerbereinigung bleibt sichtbar. Bereits gelieferte Conversation-Kontexte werden nicht als löschbar behauptet.

Historische Ergebnisse behalten ID, Version und Status, enthalten nach Löschung aber keine Kopie des entfernten Zitats. Audit protokolliert nur Entfernung und Abhängigkeiten, nicht versteckt den gelöschten Text. Fachliche Snapshots können daher redacted werden; ihr ursprünglicher Hash dient historischem Bezug, die Nutzbarkeit wird separat widerrufen.

### 7.3 Originalaudio und Export

Original-Expert-Audio wird mit ausdrücklicher Zustimmung lokal aufgezeichnet, getrennt von synthetischer Agent-Stimme. Keine Vollvideoaufnahme. Die zweite Mikrofonaufnahme aus §4.2 wird in Mono-PCM resampelt und zugleich an Scribe gesendet. Ein auf 120 Sekunden begrenzter PCM-Ringbuffer hält lokale Samplepositionen und den Epoch-Anker. Ein committed Segment materialisiert anhand der Wortzeiten einen WAV-Clip mit je 250 ms Rand; überlappende Clipreferenzen sind zulässig. Segment, Clip und Frame tragen denselben Sessionzeitbezug. Überlange/nicht finalisierte Segmente vor Bufferverlust werden als `audio_unavailable` markiert, nicht falsch zusammengeschnitten. Lokale Speicherung ist unabhängig von Provider-Audio-Saving; Off record verwirft das aktuell unfertige Segment samt Buffer. [Scribe SDK][S14]

Ein Transcript-Fallback heißt ausdrücklich „Originalaudio nicht verfügbar“. Kein synthetisches Vorlesen wird als Originalbeleg ausgegeben. Importierte Aufnahmen in B dürfen Video enthalten; sie sind explizite Quellen, nicht eine Änderung des Live-Capture-Defaults.

Während der Session liegt Datenbestand im lokalen Sessionverzeichnis. Abschluss verlangt Export oder Verwerfen; kein stilles Langzeitprofil. Export enthält schemaVersion, Manifest, Snapshots, gültige Quellen und tatsächliche Ergebnisse. Verwerfen entfernt die lokale Session/Assets und widerruft ihre aktive Nutzung; Providerzustand wird separat berichtet. Reset einer Demo erstellt neue IDs, leere Live-Regeln und neue Runs; es lädt keine Musterregel.

### 7.4 Fehlerverträge

| Fehler | Reaktion |
|---|---|
| Screenquelle endet/Maskierung unsicher | Capture pausieren; kein weiterer Frame-Upload oder aktueller Screenclaim |
| Activity-Heartbeat fehlt | Fragen zurückstellen; Fakten vom Server nachladen |
| Vision Timeout/Schemafehler | letzten Zustand als veraltet markieren; höchstens ein Retry, keine Fixture |
| Voice oder Scribe getrennt | Capture pausieren, Recovery anzeigen; Text zählt nicht als Voice-Nachweis |
| Scribe-Segment älter als PCM-Buffer | Transcript mit fehlendem Audio markieren; keine fingierte präzise Wiedergabe |
| Unvollständige Extraktion | Draft/Issue, kein Publish; begrenzter Retry mit Fehlerbeschreibung |
| Ungültige/fehlende Gate-Version | Unknown, kein Commit und keine autoritative Tutor-Guidance |
| SQLite/Commit nicht bestätigt | Status als unbestätigt; idempotent erneut abfragen, kein optimistischer Erfolg |
| KB-Provisioning fehlgeschlagen | Run nicht starten beziehungsweise gekennzeichneten Ersatzmodus wählen |
| Veraltete Proposal-Basis | neuer Diff mit explizitem Review statt Überschreiben |

Replay wird nur durch Nutzerwahl aktiviert, mit dauerhafter Kennzeichnung und getrennter Ergebnisklasse. Replay/Testfixtures werden niemals als bestandene Live-Abnahme aggregiert.

## 8. API- und UI-Verträge

Alle API-Eingaben werden serverseitig validiert. Mutationen prüfen Same-Origin/CSRF, Sessionzugriff und servergebundenen Modus. A/B sind eine lokale Einzelplatz-Demo mit mehreren simulierten Rollen, kein sicherer Mehrbenutzerbetrieb. Ein localhost-Bootstrap erstellt eine zufällige HttpOnly/SameSite-Session-Cookie; serverseitiger Demo-Owner legt Rollen/Runs an. Öffentliche Nutzung benötigt zusätzlich echte Authentifizierung und Rollenberechtigungen.

Antworten verwenden `{requestId, data}` oder `{requestId, error:{code,message,retryable}}`. `400` Schemafehler, `403` fehlender Scope/Session, `409` veraltete Revision/Version, `422` ungültige Referenz/Publikation, `503` Provider oder Storage nicht verfügbar. Gate `blocked/unknown` ist ein erfolgreich berechnetes Ergebnis (`200`), kein HTTP-Transportfehler.

| Interface | Minimaler Vertrag |
|---|---|
| `POST /api/processes`, `GET /api/processes/:id` | Prozess erstellen; Header, Draft, Published-Pointer und nutzbare Scopes laden |
| `POST /api/sessions` | Rolle, sourceMode, Prozess/Basisversion, Teilbereich, optional Issue; neue Session/Epoch |
| `POST /api/sessions/:id/provider-tokens` | servergebundene Rolle/Version; frische Agent-/Scribe-Tokens, keine API-Keys |
| `POST /api/sessions/:id/capture-state` | erwartete Epoch, start/pause/off_record/resume/end; verbindlicher Datenannahmestatus |
| `POST /api/sessions/:id/observations` | idempotenter Batch aus finalen Events/Transcript-Segmenten mit Zeit-/Quellenbezug |
| `POST /api/sessions/:id/vision` | maskiertes Bildpaar, Frame-/Epoch-/Fallreferenzen; validierte Beobachtungen |
| `POST /api/sessions/:id/questions/plan` | letzter Event-Kontext und bekannte Gaps; Kandidaten ohne Sprechfreigabe |
| `GET /api/sessions/:id/knowledge`, `POST /api/sessions/:id/answer-links` | aktueller Draft/Revision und Gaps; explizite Segment-/Frage-/Claim-Zuordnung mit Review |
| `POST /api/sessions/:id/extract` | explizite finalisierte Quellenmenge; Draft-Claims/Proposal/Gaps, keine Veröffentlichung |
| `POST /api/confirmations`, `POST /api/processes/:id/publish` | Bestätigungsart und Subject-Hash; Publish mit erwarteter Draft-Revision und Scope |
| `POST /api/exercises`, `GET /api/exercises/:id/context` | feste veröffentlichte Version/Scope, coached/independent; redigierter Tutor-Kontext |
| `PATCH /api/sandbox/cases/:id` | erlaubte Faktenänderung, expectedRecordRevision/expectedFactsRevision; aktualisierter Entwurf mit beiden Revisionen |
| `POST /api/sandbox/cases/:id/verifications` | servergebundene berechtigte Demo-Rolle, Nachweis, beide erwarteten Revisionen und requirementHash; Verifikation dieser Faktenbasis |
| `POST /api/sandbox/cases/:id/actions` | exerciseRunId, action, beide erwarteten Revisionen, versionId, idempotencyKey; Gate + gegebenenfalls atomarer Commit |
| `POST /api/exercises/:id/attempts` | Erstentscheidung/Begründung und Hilfeereignisse; Ergebnis ohne Oracle an Tutor zurückzugeben |
| `GET /api/evidence/:id` | gültiger Scope/Version; maskierter Frame, Originaltext/Audiozeitbereich |
| `DELETE /api/source-segments/:id` | erwartete Quellrevision; Entfernung + Dependency-Invalidierung + Providerbereinigungsstatus |
| `POST /api/sessions/:id/export`, `DELETE /api/sessions/:id` | bewusster Export beziehungsweise lokales Verwerfen/Widerruf |
| Lieferung B: `/api/source-assets`, `/api/assignments`, `/api/proposals/:id/review`, `/api/issues` | Aufnahme/Transcript importieren, Segmente zuordnen, typed Diffs reviewen und Klärungen verknüpfen |
| `GET /api/sessions/:id/state?afterRevision=…`, `GET /api/operations/:id` | revisionsbasierter UI-Zustand beziehungsweise persistierter Operationsstatus |

### 8.1 Serverzustand, Polling und Reload

Normale Requests plus Polling sind der verbindliche MVP-Weg. Aktive Sessions/Runs pollen jede Sekunde, sichtbare ruhige Ansichten alle fünf Sekunden, Hintergrundtabs alle zehn Sekunden. Ein lokales Mutationsresultat aktualisiert die Anzeige sofort; BroadcastChannel signalisiert nur „neu laden“. Antworten enthalten `stateRevision`; unveränderter Zustand liefert `changed=false`. Widerruf greift unabhängig vom Polling sofort im Server-Gate; eine noch veraltete Tutoransicht wird beim nächsten Update beendet.

Längere Arbeiten erhalten `operationId, kind, inputRevision, inputHash, status, progress, resultRef, error, leaseExpiresAt` und `queued/running/succeeded/failed/cancelled`. Ein kleiner Worker im selben Node-Prozess übernimmt fällige DB-Operationen mit Lease; kein externer Jobdienst. Wiederholungen derselben Extraktion sind idempotent. Provider-Provisionierung speichert erzeugte Ressourcen-IDs sofort und gleicht sie vor Retry ab, statt Agenten blind zu duplizieren. Nach Prozessneustart werden abgelaufene Running-Leases kontrolliert erneut eingereiht oder als fehlgeschlagen markiert.

Reload lädt Session, KnowledgeDraft, Snapshot und Operationsstatus neu. Mikrofon und Screen werden nur durch erneute Nutzeraktion gestartet; verlorenes Audio wird als fehlend markiert. Übungen bleiben versiongebunden. Ein alter Browserzustand verändert keine serverseitige Freigabe.

App-Routen: `/capture/:sessionId`, `/processes/:processId`, `/teach/:runId`, zusätzlicher `/sandbox/:sessionId`-Tab. Process-Ansicht bündelt Blueprint/Evaluate/Improve; Teach bündelt Results/Control. Navigation zeigt stets Capture → Blueprint → Evaluate → Teach → Improve → Control.

Header-ViewModel: `processTitle, selectedVersion, activeScope, expertContributors, publicationStatus, criticalGapCount, dataBasis, usageBoundary`. Versionanzeige trennt Draft von Published; Quellen-/Testzahlen stammen aus echten Daten. Globale Auswahl `processId + versionId + selectedStepId` bleibt beim Wechsel zwischen Workflow, Wissen, Expertenvergleich, Beiträgen und Tests erhalten. Off record gehört sichtbar zur Live-Session, nicht zum globalen Governance-Status.

Graph/Timeline sind Projektionen desselben Snapshots. Nodes zeigen Typ, Rolle und Quellenstatus; Kanten Bedingungen/Rückwege. Nur erklärte Pfade und offene Annahmen sind beschriftet. Evidence Drawer enthält Originalmoment, Claim, Guardrail, Review und konkrete Tests. Wissensbaum projiziert KnowledgeRelations ohne Quellenkopien. Schmale Screens stapeln Map/Drawer; alle Aktionen per Tastatur, Bedeutung nie nur Farbe/Hover. Agent Tests zeigen ohne echten Lauf einen leeren Zustand.

## 9. Umsetzung, Messung und Abnahme

### 9.1 Früher technischer Durchstich

Bevor Best-Case-Funktionen als verfügbar zugesagt werden, wird ein Capability-Report mit Konto, Konfiguration, Datum und echten Ergebnissen erzeugt:

1. ElevenAgents-WebRTC mit frischem Token, geduldiger Voice und Unterbrechbarkeit starten; Expressive Mode prüfen.
2. Eine reale maskierte Sandbox-Aufnahme von Claude in einen Event umwandeln und in Voice-Kontext übertragen.
3. Explizites Scribe parallel betreiben; Original-Expert-Segment mit Zeitbezug und lokalem Audio öffnen.
4. Ein noch kleines, tatsächlich bestätigtes Testwissen an eine feste Tutor-KB/Procedure-Version binden; keine unerwartete spätere Änderung.
5. Off record: Netzwerk- und lokale Schreibaktivität stoppt; Resume verwendet neue Conversations ohne alte Rohhistory.

Ein fehlgeschlagener Punkt erzeugt eine konkrete Abweichung, keinen neuen generischen Research-Auftrag. SDK-/Konto-Fragen werden dann ad hoc recherchiert. Live-Berechtigungen oder Accountzugriff sind noch nicht geprüft. Nach zwei Engineering-Stunden entscheidet Engineering Lead über `works/limited/blocked` und dokumentiert den Pfad: Audio wie §4.2; fehlendes KB-/Procedure-Pinning führt zu festem Runtime-Kontext mit serverseitigem Lookup. Scheitert auch damit zuverlässige Versionbindung, startet der Tutor nicht. Ein eigener Audioadapter/Voice-Orchestrator benötigt separate Aufwandsschätzung und Product-Owner-Scopeentscheidung; die Zeitbox wird nicht still verlängert.

### 9.2 Lieferreihenfolge

| Meilenstein | Exit-Kriterium |
|---|---|
| A0 — Capability-Spike | Voice, Vision, Scribe, Replay und Wissenbindung demonstriert oder Abweichung dokumentiert |
| A1 — erster Durchstich, Planbudget sechs Engineering-Stunden nach A0 | reale Live-Beobachtung/Voice → Claim → explizite Bestätigung → Spike-Snapshot → neuer Fall → serverseitiger Stopp mit Originalbeleg; Persistenz, Zuordnung und kleiner Interpreter funktionieren |
| A2 — Capture/Debrief | drei passende Live-Fragen, drei neue Debrief-Antworten und bestätigtes gesprochenes Teach-back aus realen Quellen |
| A3 — Blueprint/Evaluate/Improve | Timeline/Graph/Evidence; C-01 korrekt; Review-Diff und neue Version; Optimize mit Beleg oder ehrlichem leeren Zustand |
| A4 — Teach/Results | L-01-Stop, L-02-Allow, L-03 ohne vorgezogene Hilfe, Originalmoment; Ergebnisse versionsgebunden |
| A5 — Hardening | Privacy-/Bypass-/Stale-Tests, Reset, markierter Replay, vollständiger Probelauf und Pitch-Nachweise |
| B1 — Quellen/Zuordnung | drei bis vier Experten; M:N Segmente, korrigierbare AI-Vorschläge, unassigned Inbox und Verantwortung |
| B2 — Review/Publikation | Kontext-/Rollendifferenzen, Issues, Folgeinterview, stale-base-Diff, freigegebener Teilpfad und Regression |

Das Veranstaltungsfenster beträgt 21 Kalenderstunden. Zwei Engineering-Stunden für A0 und anschließend sechs für A1 sind vorgeschlagene Planungsobergrenzen aus den Antworten, keine Zusage einer achtstündigen Kalenderlaufzeit oder der Teamkapazität. Die verbleibende tatsächlich verfügbare Zeit wird nach A1 auf A2–A5 verteilt; Tests, vollständige Probe und Abgabe erhalten Vorrang vor Zusatzumfang. Graph, eigenständiges Assessment, Improve und Optimize folgen dem Durchstich als Product-Best-Case-Funktionen. Bei unbekannter Teamgröße wird keine Fertigstellung aller Meilensteine zugesagt. Zeitdruck reduziert erst P1; fehlender P0-Nachweis wird explizit ausgewiesen. B bleibt eine eigene verbindliche Folgeiteration.

### 9.3 Automatisierte und manuelle Tests

| Testgruppe | Szenarien und Erwartung |
|---|---|
| Lernen | leere Live-Regelbasis; Expert nennt 1 % statt 2 %; Snapshot, Counterfactual und Gate ändern sich entsprechend |
| KnowledgeDraft | ein Segment beantwortet zwei Gaps; mehrdeutige AnswerLinks bleiben offen; Korrektur erhält Originalquelle; stale Patch/duplizierter Batch überschreibt keinen aktuellen Draft |
| Herkunft | unbekannte Evidence-ID/falsches Zitat rejected; Screenbeobachtung allein erzeugt keine Begründung; Hypothese als Hypothese |
| Timing | Tippen/Sprechen/Scrollen/unklares Lesen verhindert Trigger; abgeschlossener Check ermöglicht Kandidat; TTL/Fallwechsel/Barge-in |
| Debrief/Publish | wiederholtes Thema zählt nicht neu; drei neue Antworten; Teach-back-Änderung invalidiert Hash-Bestätigung; Gap/Konflikt sperrt Scope |
| DSL | Grenzwerte 199/200/201 bps nach tatsächlich gelernter Grenze; null/falsch typisiert; Unknown-AND/OR; Verbot vor Permit; kein Permit sperrt |
| Klärung/Wiederaufnahme | unbekannter Wareneingang stoppt Approve, bestätigter Hold-Pfad bleibt erlaubt; Bankänderung erst nach zuständigem Nachweis und erneutem Check auflösbar; Selbstverifikation durch Learner rejected |
| Revision/Resume | Verifikation erhöht nur recordRevision; relevante Faktenänderung invalidiert sie; resumeWhen löst nur das eigene Verbot und nie ein Permit aus |
| Commit | L-01 und direkter Request stoppen; L-02 erlaubt; gleiche Idempotenz liefert ein Ergebnis; parallele Faktenänderung/Versionwiderruf sperrt |
| Transfer | erste Begründung vor Feedback; Replay/Gate zählt Hilfe; gecoacht und unabhängig getrennt; Oracle nicht in AI-Payload/Browserbundle |
| Versionen | neue Bestätigung/Tests erforderlich; alte Ergebnisse unverändert referenziert; laufender Run bleibt gepinnt, Widerruf beendet Nutzbarkeit |
| Privacy | Resize/falsche Quelle hält Upload an; Off record stoppt beide Audiopipelines/Frames; verspätete Resultate verworfen; gelöschte Quelle invalidiert abhängiges Wissen |
| UI | sechs Stationen; gemeinsame Auswahl; sieben/drei/vier nur bei realen Belegen; Tastatur/schmaler Screen; keine fingierten Agent-/ROI-Ergebnisse |
| Replay | ausdrückliche Umschaltung; dauerhafte Kennzeichnung; keine Live-Abnahme auf Fixturebasis |
| Lieferung B | Interview↔zwei Schritte und Schritt↔zwei Experten; Fehlzuordnung korrigieren; unassigned erhalten; Rollenvariante vs Konflikt; Folgeinterview/Diff/Teilfreigabe |
| Reload/Operation | neue UI lädt serverseitige Revision; Audio startet nicht automatisch; abgelaufene Lease und Provider-Retry erzeugen keine doppelte Publikation/Ressource |

Playwright prüft zwei Tabs desselben Browsercontexts und echte API-Persistenz. Provider werden für Fehler-/Race-Tests gemockt; reale Screen-/Voice-/Scribe-Qualität und Kontooptionen benötigen zusätzlich manuelle Live-Probe. Mocktests ersetzen diese Abnahme nicht.

### 9.4 Beobachtbarkeit und Budget

Technische Logs: requestId, Session/Epoch, sequence, recordRevision/factsRevision, versionHash, Eventquelle, Requestdauer, Tokenverbrauch, Gate-Outcome, Rule-IDs und Hilfetyp. Keine Rawframes, Audiodaten, Quotes, Schlüssel oder Kontonummern in allgemeinen Logs. Session-Audit enthält die prüfbaren Fragen-/Bestätigungs-/Commit-Nachweise; sensible Originale bleiben in kontrollierten Quellen.

Startlimits: zehn Minuten Capture, fünf Minuten Debrief als UX-Ziel, ein Vision-Request gleichzeitig, 300 Vision-Aufrufe pro Capture als obere Budgetgrenze, maximal ein Retry pro fehlerhaftem Request. Kosten für zwei Audiopipelines, Agent-LLM und direkte Claude-Aufrufe getrennt erfassen. Kein pauschaler Research-Eurobetrag wird als gemessen übernommen.

Messziele, keine Zusagen: p95 serverseitiger Gate-Check unter 250 ms auf lokaler Maschine; visuelle Pending-Anzeige sofort; aktueller Vision-Kontext innerhalb fünf Sekunden. Überschreitung markiert Kontext als stale und unterdrückt neue Live-Fragen; der Commit-Schutz bleibt unabhängig. Messen: Capture-to-Event, Fragefreigabe-to-Audio, Originalaudio-Zeitabweichung, false blocks, tatsächliche Fragenlast und unabhängige Erstentscheidung.

## 10. Alternativen und noch zu validierende Punkte

| Alternative | Entscheidung |
|---|---|
| Eigener Claude-Voice-Server/Speech Engine | zunächst ausgeschlossen; zusätzliche Streaming-/Turntaking-/Tunnelkomplexität |
| Vercel AI SDK | dokumentierte Option, aber direkte Anthropic-Anbindung reduziert einen Layer für den vorhandenen Key |
| Freies JsonLogic | nicht gewählt wegen Typ-/Unknown-/Coercion-Vertrag; später nur kontrollierter Export |
| React Flow Pro Workflow Editor | nicht erforderlich; OSS-Bibliothek plus kleine eigene Ansicht |
| Supabase/Trigger.dev/Graphdatenbank | nicht im Critical Path; SQLite/relationales Modell deckt A/B ab |
| Screenshare-/Apprentice-Repos aus dem Blueprint | nur Pattern-/Konzeptreferenzen bis separate Lizenz-/Codeprüfung; nicht als App-Basis übernehmen |
| Presidio | später für breitere Layouts; synthetisches bekanntes Sandbox-Layout lokal maskieren |

Die in der CTO-Prüfung offenen Verträge sind in Revision 1.1 festgelegt: laufender KnowledgeDraft, Antwortzuordnung, Rollen/Resume, doppelte Revisionen, Polling/Operations und Spike-Entscheidung. Ausstehend bleiben **Capability-Nachweise und organisatorische Freigaben**: tatsächliches Kontoangebot, paralleles Audio, Zeitbezug, Wissenbindung, Paketkompatibilität, Maskierung/Latenz, Teamkapazität und bestätigtes Kostenbudget. Das Referenzpaket wird als erster Implementierungsvertrag vor der breiten UI umgesetzt. Veröffentlichung dieser Spezifikation ist keine technische Freigabe für Produktion.

### 10.1 Verantwortlichkeiten und Budget

| Entscheidung | Zuständige Rolle |
|---|---|
| Lieferumfang, Reihenfolge und sichtbare Scopeänderung | Product Owner |
| technische Abnahme, Architekturabweichung und Spike-Ergebnis | CTO / Engineering Lead |
| korrekte Wiedergabe und fachliche Aussage | zuständiger Expert |
| Veröffentlichung eines fachlich abgegrenzten Prozessscopes | Process Owner |
| formale Einreichung und Teilnahmebriefing | benannter Submission Owner |

Eine Person kann mehrere Hackathon-Rollen übernehmen; Bestätigungsakte bleiben getrennt. Die tatsächliche personelle Besetzung und Teamkapazität sind noch nicht angegeben. Vorgeschlagenes API-Budget: **100 € als unbestätigte Arbeitsannahme**, keine Ausgabenfreigabe. Vor bezahlten Live-Runs werden tatsächliches Limit, nutzbare Credits und verantwortliche Person festgelegt. Technische Request-/Tokenlimits ersetzen kein bestätigtes Geldbudget.

### 10.2 Implementierungsreferenzpaket

Vor breitem UI-Ausbau werden `contracts/examples`, `prompts` und die Integrationstests angelegt. Beispiele sind ausdrücklich Testdaten und werden nicht in den Live-Prozess geladen. Mindestkette: vorhandener ScreenEvent `ev-1`, finalisiertes Segment `ts-1` mit echten Testworten, Claim `cl-1` mit Zitatspanne, Confirmation mit Subject-Hash, ausführbare Regel `r-1`, unveränderlicher Snapshot `v-1`. Jeder Übergang prüft Referenzen und erzeugt das Folgeobjekt; kein Modell darf Confirmation/Published selbst setzen.

Beispiel einer isolierten Regel aus dem Referenztest, keine vorgegebene AP-Policy:

```json
{
  "id": "r-1",
  "stepId": "decision-1",
  "scopeId": "scope-test",
  "requiredCapabilityIds": ["sandbox_decide"],
  "when": {"kind": "compare", "field": "varianceBps", "op": "gte", "value": 200},
  "effect": {"kind": "prohibit", "action": "approve"},
  "claimIds": ["cl-1"],
  "evidenceIds": ["ev-1", "ts-1"],
  "review": "expert_confirmed",
  "usage": "exercise_only"
}
```

Der Integrationstest erzeugt diese Regel aus einer Quellenantwort, nicht durch Laden des JSON in den Live-Prozess. Er erzeugt zusätzlich ein belegtes Permit mit den anderen nötigen Voraussetzungen. In einer frischen zweiten Testsession nennt der Expert 1 % statt 2 %: bei 150 bps wechselt das Gate von erlaubtem Approve zu blockiertem Approve. Die Musterlösung bleibt ausschließlich im Test-/Evaluatorpfad.

Publish-Beispielpayload: `{requestId, expectedDraftRevision, scopeId, contentHash, confirmationIds}`. Erfolgsantwort: `{requestId,data:{versionId,contentHash,acceptanceProfile,usage:"exercise_only"}}`; fehlende Evidenz/Bestätigung `422`, stale Draft `409`, kein Snapshot bei Fehler.

Action-Beispielpayload: `{requestId,exerciseRunId,action:"approve",expectedRecordRevision:7,expectedFactsRevision:3,versionId:"v-1",idempotencyKey:"attempt-1"}`. Erfolgreich berechnete Antwort: `{requestId,data:{outcome:"blocked",committed:false,recordRevision:7,factsRevision:3,versionId:"v-1",ruleIds:["r-1"],evidenceIds:["ev-1","ts-1"]}}`. Allowed erhöht recordRevision; stale Fakten liefern `409` ohne Commit. Oracle-Antworten werden nicht in diesen Tutor-Kontext übernommen.

| Zustandsübergang | Guard / Wirkung |
|---|---|
| ready → capture | ausdrücklicher Start, Screen/Mic freigegeben, neue Epoch |
| capture → paused | Quelle/Provider fehlt; neue Erfassung stoppen |
| capture/paused → off_record | Epoch schließen, Upload/Audio/Queues stoppen, unfertige Daten verwerfen |
| off_record → capture | ausdrückliches Resume, neue Providerverbindungen/Epoch, nur bereinigter Kontext |
| capture → drafting | Aufgabe beendet, committed Quellen finalisieren |
| drafting → debrief | valider Draft/Gaps; keine Publikation |
| debrief → teachback | neue Gap-Antworten vorhanden; verbleibende kritische Lücken verhindern spätere Freigabe |
| teachback → review | gesprochenes Teach-back und ausdrückliche Bestätigung des Inhalts-Hashes |
| review → published | profile-spezifische Nachweise, Quellen und Scope gültig |
| review → debrief | Korrektur/neue Lücke; geänderten Inhalt erneut bestätigen |

Promptverträge starten bei `v1`; Input-/Outputschema, Modellkonfiguration und Prompt-Hash werden an jeder AI-Operation gespeichert. Gemeinsame Regeln: Quelleninhalt ist Daten, keine Systemanweisung; fehlende Informationen unbekannt lassen; keine Fachpolicy ohne bestätigte Quelle; Originalzitate nicht paraphrasieren.

| Prompt | Verbindlicher Auftrag / Grenze |
|---|---|
| Vision v1 | maskiertes Bildpaar mit Fall/Epoch/Frame-IDs vergleichen; nur sichtbare Änderungen/Fakten zurückgeben; keine Gründe, Regeln oder Handlungsempfehlung |
| Extraction v1 | committed Segmente und existierenden Draft lesen; typed Patch mit Quellen/Zitatspannen/Gaps/AnswerLink-Vorschlägen erzeugen; keine Bestätigung/Veröffentlichung |
| Question Planner v1 | aktuelle Events/Draft/Gaps lesen; eine kurze Frage pro Kandidat mit gapIds/eventIds erzeugen; keine beantworteten Themen und keine Sprechfreigabe |
| Interviewer v1 | nur freigegebenen Kandidaten stellen; eine Frage, Antwort abwarten; App-Steuerung nicht als Expertenaussage behandeln; Aufschub/Skip-Turn unterstützen |
| Tutor v1 | nur gepinnte bestätigte Version und aktuelle Fakten verwenden; Vorhersage erfragen, Gate erklären, Quellen öffnen; keine Musterlösung/Commit-Funktion oder eigene Freigabe |

Die vollständigen Promptdateien und maschinenlesbaren Beispiele werden in A1 implementiert und gegen diese Verträge getestet. Dieser Dokumentabschnitt ist noch kein ausführbares Fixture-/Testpaket.

### 10.3 Challenge-Abnahme und formale Einreichung

Das Konzept deckt Capture, mindestens drei passende Live-Fragen inklusive Guardrail, mindestens drei neue Debrief-Fragen, bestätigtes gesprochenes Teach-back, klickbare evidence-linked Work Map und Teach am ungesehenen Fall mit Pre-save-Stopp ab. Lernresultate, Privacy und Moonshot sind geplant. Erfüllung setzt funktionierende getestete Demo voraus. Expressive/Scribe und KB/Procedures sind zusätzliche technische Best-Case-Nachweise mit offenem Konto-/Integrationsstatus.

Expertenvergleich, Deutsch→Englisch und agentenfähiger Export sind PDF-Stretches; sie werden nicht sämtlich als erste verbindliche Lieferung ausgegeben. Mehrere Teilinterviews bleiben Lieferung B; sieben Schritte/drei Judgment Calls/vier Guardrails sind Beispiel-/Best-Case-Ziele, keine universellen Challenge-Mindestzahlen. Die konkrete abschließende Moonshot-Folie ist noch zu erstellen.

Formal offen: aktuelles Teilnehmerbriefing/Einreichungsformular, Repo-/Video-/Deploymentvorgaben, Teamregeln, zulässige Vorarbeiten und IP-Bedingungen. Der Submission Owner prüft diese anhand der aktuellen Veranstalterunterlagen, sobald sie vorliegen. Die öffentliche Agenda belegt die Zeitgrenze, nicht sämtliche Teilnahmebedingungen. Keine externe Nachricht oder Einreichung wird aus diesem RFC automatisch autorisiert.

Freigabezustände sind getrennt: **Konzeptabdeckung vorhanden · Durchstich ausstehend · vollständige Demo-Abnahme ausstehend · formale Einreichungsfähigkeit ungeprüft**. Die Pitch-Probe zeigt prüfbare Live-/Session-Nachweise; ein bestandener Spike ersetzt diese nicht.

## 11. Primärquellen und Wiederverwendung

Abruf-/Prüfstand: 3. Oktober 2026. Plattformbeschreibungen unterstützen die genannten Fähigkeiten; die konkrete Architektur ist eine eigene Schlussfolgerung. Keine der Starter-Apps wurde für diesen RFC installiert oder ausgeführt.

- **S1:** [ElevenLabs React SDK](https://elevenlabs.io/docs/eleven-agents/libraries/react) — Provider, Hooks, WebRTC-Tokens, Kontext-/Aktivitätssignale und Client Tools.
- **S2:** [Expressive Mode](https://elevenlabs.io/docs/eleven-agents/customization/voice/expressive-mode) — Voice-/Turntaking-Konfiguration.
- **S3:** [ElevenLabs Privacy](https://elevenlabs.io/docs/eleven-agents/customization/privacy) — getrennte Retention-/Audio-Saving-Kontrollen.
- **S4:** [Custom LLM](https://elevenlabs.io/docs/eleven-agents/customization/llm/custom-llm) — eigener Endpoint benötigt kompatible Streaming-Schnittstelle.
- **S5:** [Procedures](https://elevenlabs.io/docs/eleven-agents/customization/procedures) — freie und strukturierte Ablaufanweisungen.
- **S6:** [Claude Vision](https://platform.claude.com/docs/en/build-with-claude/vision) — Bilder, Vergleich, Auflösung und Grenzen.
- **S7:** [Claude Modelle](https://platform.claude.com/docs/en/models/overview) — Modell-ID und Auswahl; keine ungeprüfte Konto-Verfügbarkeit.
- **S8:** [Claude Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — Schema-Ausgaben; fachliche Integrität wird zusätzlich geprüft.
- **S9:** [Offizieller ElevenLabs Next.js Voice Quickstart](https://github.com/elevenlabs/examples/tree/main/agents/nextjs/quickstart/example) — selektive Wiederverwendung von Voice-/Token-Setup; keine Apprentice-Fachlogik.
- **S10:** [MDN getDisplayMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia) — nutzergesteuerte Screenquelle und Browsergrenzen.
- **S11:** [MDN MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) — lokale Audioaufnahme; präzise Clipzuordnung ist Implementierungsarbeit.
- **S12:** [MDN BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API) — Same-Origin-Tabkommunikation.
- **S13:** [Node SQLite](https://nodejs.org/api/sqlite.html) — lokaler DB-Treiber; lokal verfügbarer Node24-Durchstich erfolgreich.
- **S14:** [Scribe JavaScript SDK](https://elevenlabs.io/docs/eleven-api/resources/libraries/scribe-stt/javascript-scribe) — manueller Audioinput und Transkriptzeiten; PCM-/WAV-Pipeline ist eigene Implementierung.
- **S15:** [Öffentliche Agent-Input-Typen](https://raw.githubusercontent.com/elevenlabs/packages/main/packages/client/src/InputController.ts) — kein belegter externer MediaStream-Injection-Pfad.
- **S16:** [Knowledge Base](https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base) — Tutor-Dokumente; konkrete unveränderliche Bindung im Spike prüfen.
- **S17:** [WebRTC Conversation Token](https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get-webrtc-token) — Token und Agentversion.
- **S18:** [Retention](https://elevenlabs.io/docs/eleven-agents/customization/privacy/retention) — konfigurierte Frist versus tatsächliche Providerlöschung.
- **S19:** [React Flow OSS/MIT](https://github.com/xyflow/xyflow) und [Workflow Editor](https://reactflow.dev/ui/templates/workflow-editor) — freie Bibliothek versus Pro-Template.
- **S20:** [JsonLogic Operations](https://jsonlogic.com/operations.html) und [Originalcode](https://github.com/jwadhams/json-logic-js/blob/master/logic.js) — eigene Truthiness/Coercion; begründen die bewusst andere DSL-Semantik.

[S1]: https://elevenlabs.io/docs/eleven-agents/libraries/react
[S2]: https://elevenlabs.io/docs/eleven-agents/customization/voice/expressive-mode
[S3]: https://elevenlabs.io/docs/eleven-agents/customization/privacy
[S4]: https://elevenlabs.io/docs/eleven-agents/customization/llm/custom-llm
[S5]: https://elevenlabs.io/docs/eleven-agents/customization/procedures
[S6]: https://platform.claude.com/docs/en/build-with-claude/vision
[S7]: https://platform.claude.com/docs/en/models/overview
[S8]: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
[S9]: https://github.com/elevenlabs/examples/tree/main/agents/nextjs/quickstart/example
[S10]: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia
[S11]: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
[S12]: https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API
[S13]: https://nodejs.org/api/sqlite.html
[S14]: https://elevenlabs.io/docs/eleven-api/resources/libraries/scribe-stt/javascript-scribe
[S15]: https://raw.githubusercontent.com/elevenlabs/packages/main/packages/client/src/InputController.ts
[S16]: https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base
[S17]: https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get-webrtc-token
[S18]: https://elevenlabs.io/docs/eleven-agents/customization/privacy/retention
