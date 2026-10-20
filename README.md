# Ravenswood · Trouble Brewing

A German, in-person Blood on the Clocktower game for 7–10 players, played entirely on phones. The laptop only runs the server.

## Start

Requires **Node.js 24 or newer**.

```bash
npm start
```

Keep the laptop running and connect all phones to the same Wi-Fi. On the leader phone open **http://LAPTOP-IP:3000/leader**. Players open **http://LAPTOP-IP:3000/** (or `/join`). The leader screen shows join links and a QR code.

The leader also joins as a player through **Meine Spieleransicht**. Register a name and clockwise seat, then return to `/leader` to select the assistant and start with 7–10 registered players. **Leitung / Tagesablauf** on that phone returns to the separate public control screen; private role information stays in the player view.

Read announcements, open nominations, record raised-hand votes, and close the day on the leader phone. Discussion has no timer. Players declare daytime Slayer shots on their own phones; every player can make this public claim to allow bluffing. Say the shot aloud before confirming it. The engine determines its effect without confirming the shooter's role.

This is trusted local Wi-Fi play: `/leader` grants game controls to anyone in the group who opens it. No laptop browser or projector is needed. Keep the server terminal running; stop with Ctrl+C.

## AI setup

Copy `.env.example` to `.env` and set `OPENAI_API_KEY` and optionally `OPENAI_MODEL`. Restart the server after changing them. AI configuration is read only from environment variables; the website has no configuration controls.

The game master defaults to `gpt-6.1-sol`; private Q&A defaults to `gpt-6-luna` (configurable with `OPENAI_QA_MODEL`, `OPENAI_QA_INPUT_PRICE`, and `OPENAI_QA_OUTPUT_PRICE`). Both use the Responses API and structured outputs. The AI chooses only from engine-generated legal Storyteller options and answers private questions in German. Q&A receives only the speaker’s identity, an allowlisted public game view, public character rules, and retrieved manual excerpts. It receives no assigned or perceived character, team, private information, Spy Grimoire, evil introductions, hidden markers, or prior chat. Each question should be self-contained; history is displayed locally only. Storyteller decision requests can contain secret game state. Player names and the relevant game context are sent to OpenAI when online mode is used.

AI requests require a key. Transient failures retry once; missing credentials, exhausted credits, and API errors stop the action with an error and preserve the saved game. Fast nights are an explicit local rules mode, not an AI failure fallback. AI mode never silently falls back. There is no application spending cap. Your OpenAI API credits determine availability.

Estimated spending is displayed for information only. Input/output rates are configurable in `.env` and never limit requests.

## Playing and recovery

- Register names and consecutive clockwise seats on player phones. Each player uploads a photo through **Dein Spielerfoto**; photos are cropped and resized locally, saved on the laptop server, and shown beside names in nomination buttons, voting lists, and night targets. Players can replace their photo from their phone. The leader selects the assistant and starts the game on `/leader`.
- Read and confirm roles privately. Phone credentials are saved locally for automatic reconnection.
- At night everyone stays on their phone, including dead players. Submit the role action or complete the symbol activity. New private information requires acknowledgement.
- **Schnelle Nächte** uses local legal choices without AI requests. Disable it for AI night decisions. The Ravenkeeper preselects a target and receives information only if killed that night.
- The leader reads announcements and records nominations and raised-hand votes. Votes can be corrected before confirmation. Dead players spend their last vote only when confirmed.
- Players declare daytime shots through their own phone screen. The leader reads the resulting announcement.
- The leader opens nominations and explicitly closes the day. There is no discussion countdown.

Game state and credentials persist in `data/game.sqlite`. Restarting the server resumes the saved round. If night resolution fails, use **Auflösung erneut versuchen** on `/leader`. Starting a new round archives the old game.

The server listens on `0.0.0.0:3000`. `HOST`, `PORT`, and `DB_PATH` override its listener and database. Allow the port through the laptop firewall and use Wi-Fi without client isolation. `/leader` is available to the trusted local group; it does not require a password. This application is intended for local HTTP play.

## Development and tests

```bash
npm test
npm run test:e2e
# Optional: uses your API key and makes small paid requests with fictional players.
npm run test:live
```

Tests use Node's built-in test runner and SQLite. Engine tests include all 22 roles, 800 generated setups, and complete games across the supported player counts. HTTP tests exercise the real request handler in memory, including private-session clearing, duplicate prevention, and restart recovery. UI tests execute the actual controller and templates against those handlers. AI tests use mocked Responses API calls, including refusals, malformed decisions, private-context isolation, and uncapped spending.

The Chromium test uses the installed Chromium binary, or `CHROMIUM_PATH`, and produces screenshots in `test-results/`. It drives actual pages over a debugging pipe against a real localhost server, including the production SSE transport. It uses isolated browser profiles and an in-process network service to avoid a network-service crash in this laptop's Chromium build; no browser configuration is changed. If Chromium is unavailable or prohibited by an execution sandbox, the test is reported as skipped.

## Structure

- `server/engine.ts`: deterministic game transitions and legal Storyteller decision choices.
- `server/ai.ts`: constrained online decisions, private answers, usage estimates, and explicit API errors.
- `server/app.ts`, `server/store.ts`: HTTP/SSE, isolated phone credentials and private sessions, and transactional persistence.
- `shared/`: typed state interfaces and the German character/rule reference.
- `src/`: browser-native views, offline illustration/styles, and synthesized cues.
- `docs/RULES.md`: source precedence and the phone-night timing adaptation.

The implementation uses native Node HTTP, `node:sqlite`, and browser JavaScript rather than the initially proposed React/Fastify/Vite stack. The execution environment could not access npm and had no cached packages. The application has no runtime npm dependencies; QR codes use `qrencode`. The optional Playwright testing harness adds a development dependency and requires `npm install`. The server and rules engine remain TypeScript, executed through Node's native type stripping; the tests perform runtime verification, not TypeScript static checking.

`HOST`, `PORT`, and `DB_PATH` can override the default local listener and database path. This release is designed for one trusted group using a laptop server and phones on the same Wi-Fi. It does not implement remote play, Travellers, Fabled, custom scripts, or other editions.

## Credits

Blood on the Clocktower and Trouble Brewing are by Steven Medway / The Pandemonium Institute. This is an unofficial local companion; it is not affiliated with the publisher. The supplied PDFs are kept unchanged. German text is a working translation, with English character names included for cross-reference. The clocktower illustration, interface, and sound synthesis are local application assets.

### Geführte Lernrunde

Start the optional open-role tutorial from `/leader`. It runs separately from the saved game and uses no AI. Registered players take part from their phones; the leader reads the steps and advances the exercise. The tutorial retains its own timed practice step.

## Rules Q&A and manual wiki

During discussion and nominations, open private rules Q&A on your own phone. The question box opens automatically. This also works during the shared night steps. It explains rules and hypothetical interactions without confirming secret causes or performing game actions. Static rules remain available without an API key.

The deterministic engine remains authoritative. `server/knowledge.ts` defines the read-only Q&A boundary, shared by the answer service and `GET /api/player/qa/context` (requires the player credential). `GET /api/rules/search?q=...` searches public rules and returns structured excerpts with stable IDs, source filenames, and PDF page numbers. Retrieval runs locally before the answer request; the model has no generic HTTP, database, filesystem, or game-command tool. Secret Storyteller decisions use a separate, stateless request and never become Q&A history. Players can still include claims or secrets in their own typed questions.

`shared/wiki/manuals.json` indexes all eight supplied official PDFs by edition, page, excerpt, and source SHA-256. Rebuild with `npm run wiki:build` (requires Poppler’s `pdftotext`); normal startup needs no PDF tools. Retrieval is limited to Trouble Brewing and the core Rulebook, with German character aliases and common rule terms mapped to English. German application rules take precedence for phone-based procedures. The index is extracted text, not a fully curated semantic rules model: graphical night-order diagrams are not captured by text extraction. Their authoritative order remains encoded in the engine and documented in `docs/RULES.md`. The PDFs remain unchanged.

## Engine architecture

The core uses an explicit state machine with guarded commands and legal phase
transitions. Game master decisions receive structured secret context and a bounded
set of legal options; public narration receives only public context. Services are
injected; failures stop the action without replacing the AI. Existing saved games remain compatible.
See [engine and game master architecture](docs/ENGINE.md) for the contracts.

## Readable rules wiki

Open **http://127.0.0.1:3000/wiki/** after `npm start`, or click **Regel-Wiki** in the game header. The English manual contains 114 linked articles: beginner lessons, voting examples, Storyteller procedures, a glossary, and all 99 characters from the supplied three editions and Travellers & Fabled almanac. Search across explanations or filter by collection. Each article links to the original PDF at the relevant viewer page. Use **Print article** for a clean handout.

This is an authored reading companion, separate from the raw PDF retrieval index. Edit `wiki/content.js` for manual content; `npm run wiki:build` rebuilds only `shared/wiki/manuals.json`. The manual reflects the supplied PDFs (including the rulebook’s non-final-version notice), not a claim of current live rulings. The app’s phone-night procedure has its own article. Reading other editions here does not add them to the game engine.
