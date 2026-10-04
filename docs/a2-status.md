# A2 — Capture/Debrief: Logik und Tests

Stand: 4. Oktober 2026. **Logik implementiert; autonome Provider-Basisprüfung bestanden; A2-Live-Abnahme offen.** Browser-/Expertenproben bleiben offen. Die Basisprüfung verwendete bestehende Keys und vorhandene Credits.

## Implementierter Umfang

- Persistente Fragenkandidaten mit Phase, Topic-Key, Priorität, Event-/Fallbezug, Epoch, Draftrevision, 30-Sekunden-TTL und sichtbarem Ergebnis (`planned`, `deferred`, `released`, `completed`, `interrupted`, `unanswered`, `cancelled`). Der Planner darf keine Frage zur Quotenfüllung erzeugen. Serverwahl priorisiert Guardrail, Branch, Bedingung, Ausnahme und Grund.
- Serverseitige Freigabe prüft erneut Fall, Kontextalter, Revision und Gapzustand. Sprachfreiheit, zwei Sekunden Aktivitätsruhe, 1,5 Sekunden Screenstabilität, frischer Heartbeat und Checkabschluss/„Frag jetzt“ sind Pflicht. 30 Sekunden Abstand und fünf Releases im rollierenden Zehn-Minuten-Fenster bleiben über Reload/Resume erhalten. Auch unterbrochene Releases verbrauchen das Lastbudget.
- Eine neue Frage wartet auf die bestätigte Zuordnung der vorherigen Antwort oder ein ausdrückliches Überspringen. Zurückgestellte Kandidaten werden bei Aktivität nicht gesprochen; Fall-/Epoch-/Revisionswechsel verwerfen sie.
- Agententext allein zählt nicht als gesprochene Frage. Der Capture-Client verbindet Transkript mit Beginn/Ende der Ausgabe und Interruption-Signalen. Die Serverlogik akzeptiert nur den Text der freigegebenen Frage. Unterbrochene, spontane, bloß geplante und unbeantwortete Fragen zählen nicht als beantwortete Live-Fragen.
- AnswerLinks bleiben Vorschläge, bis ausdrücklich zugeordnet. Die Zuordnung prüft Segmentphase, Zeitpunkt, Fall/Epoch, exakte zuvor validierte Claims, Event-/Gapbezüge und Korrekturketten. Ein Segment kann mehrere Gaps erklären; zeitliche Nähe allein bestätigt nichts.
- Eindeutige Lernereignisse enthalten einen Proof-Hash aus Zuordnung, Claims und Gapbezug. Wiederholtes Bestätigen erzeugt keinen zweiten Nachweis. Claimänderungen, Korrekturen oder konflikthafte Gaps machen alte Nachweise ungültig.
- Debrief friert die bereits beantworteten Themen beim Eintritt ein, wählt offene neue Themen und zählt Themen sowie tatsächlich beantwortete Fragen. Identische normalisierte Topic-Keys zählen einmal; semantische Ähnlichkeit wird nicht automatisch zur Identität erklärt.
- Der Gegenfall wird vor Sprechfreigabe aus einem vorhandenen ScreenEvent abgeleitet, verändert ausschließlich `goodsReceiptConfirmed` und ist ausdrücklich hypothetisch. Eine bereits bekannte Bedingung wird als bestätigender Test erfasst. Bei neuer Bedingung muss die Antwort in einer belegten Regel berücksichtigt sein.
- Off record/Resume funktioniert auch im Debrief: geschlossene Quellen/Fragen, neue Epoch, erhaltene Phase und zulässiger historischer Screenbezug. Es gibt keinen automatischen Mikrofonstart bei Reload.
- Ein neuer Challenge-Prozess startet leer und erhält das serverseitig gewählte Profil `challenge_initial`. Publish verlangt drei verschiedene beantwortete Live-Themen, drei neue Debrief-Themen aus mindestens drei beantworteten Fragen, eine belegte Guardrail-Antwort, berücksichtigten Gegenfall, aktuelles gesprochenes Teach-back und die bestehenden vier Hashbestätigungen. Fehlende Nachweise liefern `422 challenge_incomplete`; der Spike behält `technical_spike`. Replay ist kein Live-Nachweis.

## Schnittstellen

Alle Routen verwenden die bestehenden Request-/Response-Umschläge, lokale Owner-Scope-Prüfung und Same-Origin-Schutz.

| Route | Zweck |
|---|---|
| `POST /api/processes/challenge` | `{title}` startet leere Challenge; kein Client-Profilflag |
| `POST /api/sessions/:id/questions/plan` | Provider erzeugt maximal fünf Kandidaten; Server validiert und wählt Priorität |
| `POST /api/sessions/:id/questions/release` | `{id, activity}` → `release`, `defer` oder `discard` |
| `POST /api/sessions/:id/questions/spoken` | `{id, epoch, outcome, transcript}`; Outcome `transcript_seen`, `completed` oder `interrupted` |
| `POST /api/sessions/:id/questions/cancel` | `{id, epoch}`; ausdrücklich überspringen/abbrechen |
| `POST /api/sessions/:id/counterfactuals` | `{questionId, baseEventId}` vor Sprechfreigabe |
| `POST /api/sessions/:id/answer-links` | bestehende korrigierbare Zuordnung mit `expectedDraftRevision` |
| `GET /api/sessions/:id/a2-status` | Zähler, fehlende Nachweise und Eligibility; erteilt keine Freigabe |

Debrief verwendet bestehende Sources-/Audio-/Operations-APIs. Segmente tragen explizit `phase=debrief`; Live-Segmente dürfen nicht nachträglich als Debrief hochgeladen werden. Gegenfall, Fragenlog und Lernnachweise sind im Hash der Challenge-Version enthalten. Alte A1-Fragen ohne A2-Felder werden konservativ als abgebrochen migriert und nicht nachträglich gezählt.

## Nachweise und offene Arbeit

Die erste Prüfung mit echten Providern ist am 4. Oktober 2026 bestanden, einschließlich einer quellengebundenen A2-Guardrail-Frage. Sie verwendet erzeugte Sprache und synthetisches Bild, zählt keine Challenge-Quoten und ersetzt keine A2-Live-Abnahme. Die dabei gefundenen Extraktionsprobleme und Korrekturen sind in [provider-smoke.md](provider-smoke.md) dokumentiert.

**42 Vitest-Tests bestanden**, davon 21 neue A2-/API-/Playback-Prüfungen. **Zwei Playwright-Szenarien bestanden** als A1-Browserregression; sie sind keine A2-Live-Abnahme. Produktionsbuild und TypeScript-Prüfung erfolgreich.

Die Tests decken eine vollständige Challenge-Logikkette, fehlende Quoten, Transkript/Unterbrechung, Timing/TTL, Priorität, Fall-/Epoch-/Revisionswechsel, Planner-Race, korrigierte Claims, Debrief-Neuheit, Gegenfall, Replay-Ausschluss und echtes Schließen/Neuöffnen einer SQLite-Datei ab. Die bestehenden A1-Tests bleiben erhalten.

**Grenzen:** Activity und Playback sind Beobachtungen des lokalen Clients, keine unabhängige Provider-Attestation. Der reale Voice-Abschluss, Barge-in, Spontanfragen und Quellenqualität bleiben mit Conversation-/Audio-Logs zu prüfen. Es gibt weiterhin keinen eigenen Voice-Orchestrator. Topic-Key-Normalisierung ersetzt keine fachliche Interpretation. Der gesprochene Debrief-Client und eine vollständige A2-Bedienoberfläche sind noch nicht verdrahtet; diese Lieferung umfasst die angeforderte Logik/API und Tests. Breiter UI-Ausbau, Graph und A3–A5 wurden nicht vorgezogen. Erst echte neue Debrief-Antworten und das reale Teach-back ermöglichen A2-Live-Abnahme.
