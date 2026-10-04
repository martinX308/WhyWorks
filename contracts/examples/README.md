# Referenzpaket §10.2

`learning-chain.v1.json` enthält ausdrücklich isolierte Testdaten: ScreenEvent, committed Segment, exakte Zitatspanne, Extraktionspatch, vier getrennte Bestätigungen, unveränderlicher Snapshot und Publish-/Action-Verträge. Die Live-App importiert diese Datei nicht.

Die 2-%-/1-%-Variation wird in `tests/domain.test.ts` aus zwei separaten Quellenantworten erzeugt und durch das echte Publish-/Gate-Verfahren geprüft. Die Grenzwerte stehen nicht im Interpreter oder in Provider-Prompts. `scripts/reference-package.ts` regeneriert das Paket; der Generator wird nie vom App-Server gestartet.

Claude verwendet ein nicht rekursives Transportformat gemäß `src/adapters/extraction-wire.ts`. Der validierende Decoder erzeugt die kanonische RFC-AST. Promptdateien v1 liegen unter `prompts/`; ihre Hashes, Modell und Eingangsrevision werden pro Operation persistiert.
