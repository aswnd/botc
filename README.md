# Ravenswood · Trouble Brewing

A German, in-person Blood on the Clocktower game for 7–10 players. Your laptop runs the server and private terminal; a second browser window on a projector shows the public town square. Everyone can play, including the assistant who reads public announcements and records votes.

## Start

Requires **Node.js 24 or newer** and a modern browser. Node 26 is installed on this laptop. There are no packages to download and no build step.

```bash
npm start
```

Open **http://127.0.0.1:3000** on the laptop. Click **Beamer öffnen**, move that window to the projector, and enable sound there. Use an extended desktop, rather than mirrored displays. Keep the server terminal running; stop it with Ctrl+C.

For your first rehearsal, tick **Proberunde**. This makes all characters public and removes the minimum visit duration. Start a fresh, non-demo round before playing with friends. A seven-minute discussion timer starts after the assistant reads the dawn announcement.

The German walkthrough is in [docs/ERSTE_RUNDE.md](docs/ERSTE_RUNDE.md).

## AI setup

Copy `.env.example` to `.env` and set `OPENAI_API_KEY` and optionally `OPENAI_MODEL`. Restart the server after changing them. AI configuration is read only from environment variables; the website has no configuration controls.

The default is `gpt-5-mini` using the Responses API and structured outputs. The AI chooses only from engine-generated legal Storyteller options and answers private questions in German. Q&A receives only the speaker’s identity, an allowlisted public game view, public character rules, and retrieved manual excerpts. It receives no assigned or perceived character, team, private information, Spy Grimoire, evil introductions, hidden markers, or prior chat. Each question should be self-contained; history is displayed locally only. Storyteller decision requests can contain secret game state. Player names and the relevant game context are sent to OpenAI when online mode is used.

AI requests require a key. Transient failures retry once; missing credentials, exhausted credits, and API errors stop the action with an error and preserve the saved game. There is no local AI fallback or application spending cap. Your OpenAI API credits determine availability.

Estimated spending is displayed for information only. Input/output rates are configurable in `.env` and never limit requests.

## Playing

- Enter names in clockwise seating order. The circle must match the actual seats.
- Select an assistant. Their controls contain only public information.
- The assistant opens each waiting announcement and marks it as read.
- The projector calls each player by name. There are **no player PINs**.
- Everyone visits the laptop twice each night, including dead players. Round A collects choices; round B delivers information.
- End a private visit with **Fertig – Bildschirm verbergen**. A ten-second minimum applies to all real-game visits, with unlimited time to read or ask questions. It reduces obvious timing differences but does not guarantee identical visit durations.
- The Ravenkeeper receives an answer in their results visit and confirms once more after reading it.
- During the day, players can choose their name to ask the Storyteller a private question.
- Nominations and votes happen in the room. The assistant records individual raised hands, checks the tally with the group, then confirms. Dead votes are spent only on confirmation.
- The assistant explicitly closes the day. Timer expiry never makes that decision automatically.

Sound is synthesized locally with Web Audio. The projector has volume, mute (volume zero), replay, and fullscreen controls. Distinct cues mark nightfall, the next player, an assistant announcement, public attention, and the end of discussion. Browsers require a click on **Ton aktivieren** before sound can play. Choose the projector's audio output in your normal system settings.

## Recovery and persistence

Confirmed transitions, delivered information, choices, votes, and accepted AI decisions are stored in SQLite at `data/game.sqlite`. Restart the same command to resume. Private screens are not automatically reopened after refresh or restart. If a refresh leaves the terminal reserved, use **Laptop freigeben**; this clears the private session without advancing the queue.

Private screens hide after 90 seconds of inactivity or when their tab becomes hidden. Hidden sessions expire on the server after five minutes. There is deliberately no player authentication: the group is trusted. The local database and audit history contain secrets, so do not inspect them during a live game.

Vote entries can be corrected before confirmation. A confirmed vote cannot be silently undone; verify the public tally before committing it. Starting another game archives the previous game locally; the latest game resumes by default.

## Development and tests

```bash
npm test
npm run test:e2e
# Optional: uses your API key and makes small paid requests with fictional players.
npm run test:live
```

Tests use Node's built-in test runner and SQLite. Engine tests include all 22 roles, 800 generated setups, and complete games across the supported player counts. HTTP tests exercise the real request handler in memory, including private-session clearing, duplicate prevention, and restart recovery. UI tests execute the actual controller and templates against those handlers. AI tests use mocked Responses API calls, including refusals, malformed decisions, private-context isolation, and uncapped spending.

The Chromium test uses the installed Chromium binary, or `CHROMIUM_PATH`, and produces screenshots in `test-results/`. It drives actual pages over a debugging pipe against a real localhost server, including the production SSE transport. It uses isolated browser profiles and an in-process network service to avoid a network-service crash in this laptop's Chromium build; no browser configuration is changed. If Chromium is unavailable or prohibited by an execution sandbox, the test is reported as skipped.

**Validation on 2026-10-18:** engine, HTTP, persistence, AI-adapter, UI-controller, and actual Chromium tests run on this laptop. Desktop/projector/mobile screenshots are in `test-results/`. The live smoke check confirmed the configured `gpt-5-mini` connection, a German private rule answer, refusal to disclose hidden roles, a legal structured decision, a complete game over actual HTTP/SSE, and database restart recovery. The reported estimated API cost was US$0.0031. Physical projector output and audible room volume still need a check in the room.

The opt-in live smoke check uses a temporary database and fictional players; it never replaces the saved game. Its report is written to `test-results/live-smoke.json`. Ordinary automated tests disable real API access, even when a key is present in your environment.

## Structure

- `server/engine.ts`: deterministic game transitions and legal Storyteller decision choices.
- `server/ai.ts`: constrained online decisions, private answers, usage estimates, and explicit API errors.
- `server/app.ts`, `server/store.ts`: HTTP/SSE, trust-based private sessions, and transactional persistence.
- `shared/`: typed state interfaces and the German character/rule reference.
- `src/`: browser-native views, offline illustration/styles, and synthesized cues.
- `docs/RULES.md`: source precedence and the shared-terminal rules adaptation.

The implementation uses native Node HTTP, `node:sqlite`, and browser JavaScript rather than the initially proposed React/Fastify/Vite stack. The execution environment could not access npm and had no cached packages. The application has no runtime package dependencies. The optional Playwright testing harness adds a development dependency and requires `npm install`. The server and rules engine remain TypeScript, executed through Node's native type stripping; the tests perform runtime verification, not TypeScript static checking.

`HOST`, `PORT`, and `DB_PATH` can override the default local listener and database path. This release is designed for one trusted group using one laptop, with one projector window. It does not implement remote play, Travellers, Fabled, custom scripts, or other editions.

## Credits

Blood on the Clocktower and Trouble Brewing are by Steven Medway / The Pandemonium Institute. This is an unofficial local companion; it is not affiliated with the publisher. The supplied PDFs are kept unchanged. German text is a working translation, with English character names included for cross-reference. The clocktower illustration, interface, and sound synthesis are local application assets.

### Geführte Lernrunde

Über **„Geführte Lernrunde“** oben am Laptop startet ihr eine offene, angeleitete
Übung für 7–10 Personen (etwa 15–20 Minuten). Tragt vorher eure Namen in
Sitzreihenfolge ein. Ein laufendes Spiel wird pausiert und bleibt gespeichert.
Die Lernrunde läuft separat, nutzt keine KI und verursacht keine API-Kosten.

Die Assistenz liest die Schritte vor und klickt nach dem Ausprobieren weiter.
Der Beamer zeigt die Aufgaben, offene Rollen, Aufrufe und einen 60-Sekunden-Timer.
Ihr übt Gift, Nachtinformationen, Bluffen, Nominierung, Hände zählen, Hinrichtung
und die letzte Stimme toter Personen. Richtige Antworten beziehungsweise alle
Übungsstimmen schalten den nächsten Schritt frei. Alle 22 Charaktere haben
aufklappbare Karten mit Regeln und Beispielen. Fortschritt und Antworten bleiben
bei einem Neustart erhalten. „Zurück“ wiederholt einen Schritt und setzt dessen
Übung zurück. „Lernrunde beenden“ kehrt zum gespeicherten Spiel zurück; dieses
bleibt pausiert, bis ihr es fortsetzt.

Die Lernrunde ist ein festes Unterrichtsszenario: Sie kürzt Nachtbesuche ab und
führt zu einem gemeinsamen Sieg von Gut. Für die erste echte Runde beginnt ihr
anschließend ein neues Spiel mit geheimen, neu verteilten Rollen.

## Rules Q&A and manual wiki

During discussion and nominations, click your name on the laptop to open private rules Q&A. The question box opens automatically. This also works during scheduled night visits. It explains rules and hypothetical interactions without confirming secret causes or performing game actions. Static rules remain available without an API key.

The deterministic engine remains authoritative. `server/knowledge.ts` defines the read-only Q&A boundary, shared by the answer service and `GET /api/private/qa/context` (requires the current terminal token). `GET /api/rules/search?q=...` searches public rules and returns structured excerpts with stable IDs, source filenames, and PDF page numbers. Retrieval runs locally before the answer request; the model has no generic HTTP, database, filesystem, or game-command tool. Secret Storyteller decisions use a separate, stateless request and never become Q&A history. Players can still include claims or secrets in their own typed questions.

`shared/wiki/manuals.json` indexes all eight supplied official PDFs by edition, page, excerpt, and source SHA-256. Rebuild with `npm run wiki:build` (requires Poppler’s `pdftotext`); normal startup needs no PDF tools. Retrieval is limited to Trouble Brewing and the core Rulebook, with German character aliases and common rule terms mapped to English. German application rules take precedence for shared-laptop procedures. The index is extracted text, not a fully curated semantic rules model: graphical night-order diagrams are not captured by text extraction. Their authoritative order remains encoded in the engine and documented in `docs/RULES.md`. The PDFs remain unchanged.

## Engine architecture

The core uses an explicit state machine with guarded commands and legal phase
transitions. Game master decisions receive structured secret context and a bounded
set of legal options; public narration receives only public context. Services are
injected; failures stop the action without replacing the AI. Existing saved games remain compatible.
See [engine and game master architecture](docs/ENGINE.md) for the contracts.

### Background music

Run `npm run audio:download` once with internet access to download four unmodified ten-minute Tabletop Audio MP3s into `assets/audio/` (roughly 60 MB). The command skips existing valid files and can be rerun after a failed download. Playback then works locally without internet. Track credits and licence links are available from the Beamer's **Musiknachweis** link: Tabletop Audio, CC BY-NC-ND 4.0, for noncommercial use.

Open the Beamer tab on the computer connected to your speakers and click **Ton aktivieren** once. Only this tab plays audio; the private laptop screen stays silent. Village ambience accompanies setup, dawn, and day discussion, *Dark and Stormy* accompanies both night rounds, *In the Shadows* accompanies nominations, and *Solemn Vow* accompanies the ending. Tracks loop and crossfade. Public pauses stop music; resuming continues it. The volume slider controls music and existing notification cues, and **Musik stummschalten** silences background music independently. Music never follows private visits, roles, targets, or hidden outcomes. Use one Beamer tab for sound to avoid duplicate playback. Missing files produce a visible message while the rest of the game continues.

## LLM browser playtesting

Use `npm run --silent playtest` to let one LLM operate all players through
Playwright on the real laptop and projector UI. Real Storyteller AI calls remain
enabled with your configured settings; runs use a separate temporary game database.
The JSON-line browser interface provides visible controls, text, screenshots and
errors, and saves a Playwright trace. See [the playtesting guide](docs/PLAYTEST.md)
for the agent prompt, commands, coverage checklist, and setup.

`npm run test:harness` runs a complete scripted browser rehearsal with real visit
timing and AI calls. Add `-- --demo` for the faster open-role rehearsal.

## Readable rules wiki

Open **http://127.0.0.1:3000/wiki/** after `npm start`, or click **Regel-Wiki** in the game header. The English manual contains 114 linked articles: beginner lessons, voting examples, Storyteller procedures, a glossary, and all 99 characters from the supplied three editions and Travellers & Fabled almanac. Search across explanations or filter by collection. Each article links to the original PDF at the relevant viewer page. Use **Print article** for a clean handout.

This is an authored reading companion, separate from the raw PDF retrieval index. Edit `wiki/content.js` for manual content; `npm run wiki:build` rebuilds only `shared/wiki/manuals.json`. The manual reflects the supplied PDFs (including the rulebook’s non-final-version notice), not a claim of current live rulings. The app’s two-visit procedure has its own article. Reading other editions here does not add them to the game engine.
