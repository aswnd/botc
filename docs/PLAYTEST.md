# Browser playtesting with one LLM

Playwright drives the actual laptop UI and a second projector page, including the
real HTTP server, SQLite persistence, SSE updates, and Storyteller AI. One external
LLM (for example the coding agent working on this repository) chooses actions for
all players and the public assistant. The game's Storyteller remains a separate AI
service. The harness itself does not choose an LLM provider or launch another model.

## Agent-driven playtest

Give the testing agent this task:

> Read `docs/PLAYTEST.md`. Use the interactive `playtest` command to play a complete
> normal game as every player and the assistant. You choose all player actions,
> targets, nominations and votes. Keep the real Storyteller AI enabled. Inspect
> both screens and test controls and game rules as you play. Save findings and
> reproduction steps with the final report. Do not run the scripted rehearsal as
> a substitute for playing.

For an agent using the shell tools in this workspace:

1. Start `npm run --silent playtest` with `exec_command`, `tty: true`, and
   `yield_time_ms: 1000`. Keep the returned process session ID. A PTY keeps stdin
   available for subsequent commands.
2. Read the initial JSON observation. If startup is still running, poll the same
   process with `write_stdin`. Parse complete JSON lines; output can span chunks.
3. Choose an action from the visible controls, then use `write_stdin` on that
   session to send one JSON command followed by a newline. Wait for the resulting
   observation before choosing the next action.
4. Open the returned screenshot files with the image viewer. Keep separate notes
   for each player: role, information received, action, alive/dead and ghost vote.
   Choose behavior for the current player, then switch when the UI hands over.
5. Continue through night visits, public announcements, discussions, nominations
   and voting to the ending. Use `wait` commands for the real visit countdown.
6. Send `finish` with the outcome and findings. Return the report and artifact paths.

The controlling agent is the player LLM. Playwright supplies its eyes and controls;
the real game supplies the Storyteller AI. Starting the command alone waits for
agent input; it does not launch an additional player model.

Install dependencies with `npm install`. It uses this machine's Chromium, or
`CHROMIUM_PATH`. Otherwise install a browser with `npx playwright install chromium`.

Start the tool session:

```bash
npm run --silent playtest
# Optional visible browser:
npm run --silent playtest -- --headed
```

The process stays open. It emits one JSON observation, then accepts one JSON object
per stdin line and emits a fresh observation after each action. A coding LLM can
keep the process alive with its shell session tool and send commands through stdin.
This also gives other agent frameworks a provider-independent browser tool adapter.
`finish` saves artifacts and exits even if the caller keeps stdin open. Startup
failures emit a JSON object with `status: "failed"` and `error`, exit with a
nonzero status, and save the failure in the run's `report.json`.

Both pages expose rendered text, visible controls with IDs and select options,
screenshot paths, horizontal overflow, and browser/HTTP errors. Open the screenshots
with the agent's image viewer to inspect actual display quality. Control IDs are
valid only for the latest observation and the specified screen. CSS selectors are
also supported. Actions use Playwright's normal visibility and actionability checks.

```json
{"action":"fill","control":"c3","value":"Anna"}
{"action":"select","selector":"#assistant","value":"0"}
{"action":"click","selector":"[data-action=\"create\"]"}
{"action":"click","control":"c4","screen":"laptop"}
{"action":"check","selector":"[data-voter=\"p2\"]","checked":true}
{"action":"press","key":"Escape"}
{"action":"resize","width":390,"height":844}
{"action":"reload"}
{"action":"wait","ms":1000}
{"action":"assert","text":"Anna"}
{"action":"assert","text":"secret text","absent":true,"screen":"projector"}
{"action":"assert","noOverflow":true,"noPageErrors":true}
{"action":"observe"}
{"action":"finish","outcome":"pass","findings":[]}
```

Actions default to the laptop. `screen` accepts `laptop` or `projector`. `wait` is
capped at 15 seconds per call. JavaScript dialogs are recorded and dismissed by default. For a deliberate
confirmation such as a Slayer shot, include `"acceptDialog":true` on its click
command. Keep the laptop active during private visits:
hiding its tab intentionally closes its private screen. Screenshots do not switch
tabs. Reloading deliberately exercises the real session recovery behavior.

Each run has a temporary database. Environment configuration from `.env` supplies
`OPENAI_API_KEY` and `OPENAI_MODEL` just as it does for normal startup. Real AI calls
are enabled and can cost money. Check the visible AI status; missing credentials or
service failures are real test failures. The harness never substitutes mocked
Storyteller responses.
The harness does not read or replace your saved game. Its temporary database is removed on normal exit. Reports, observations, screenshots and a
Playwright trace remain under `test-results/playtest-<timestamp>/`. These artifacts
include private player information. Inspect traces with:

```bash
npx playwright show-trace test-results/playtest-<timestamp>/trace.zip
```

## Suggested instruction for the controlling LLM

> Run `npm run --silent playtest` as a persistent process. Play a complete real game
> as all eight players and the assistant, using only observations, screenshots,
> and browser actions. Leave Proberunde unchecked. Keep notes for each player's
> role, information, choices, life status and remaining dead vote. This is an
> omniscient QA run: one model sees every player's information; do not claim it
> measures independent strategy or resistance to information sharing.
>
> Inspect laptop and projector screenshots at setup, distribution, both night
> rounds, dawn, nominations, voting, and the ending. Verify the announced next
> player, target count, information delivery, hidden private screens after Finish,
> and public/private separation. Check that queued visits include dead players.
> Ask at least one private rule question and verify the visible AI status.
>
> Exercise timer pause/adjustment, attention and replay, nominations, vote edits
> before confirmation, confirmed totals, ties when possible, executions, and dead
> votes. Verify that editing a draft does not spend a dead vote and confirming it
> does. Try an incomplete target choice and inspect the disabled Finish control.
> Reload and recover a reserved terminal; check that it does not skip the player.
> Inspect mobile overflow and projector readability. Continue until a winner is
> displayed, with a maximum of 400 actions. On failure record the exact steps,
> expected/actual behavior, player/phase and screenshot paths. Send a finish command
> containing findings. Distinguish failures from coverage you could not reach.

## Repeatable harness check

```bash
npm run test:playtest
npm run test:harness
# Faster open-role rehearsal, still using the real AI service:
npm run test:harness -- --demo
```

`test:playtest` tests the actual JSON/stdin adapter in Chromium: control IDs,
both screens, invalid-command recovery, reload, finish, and saved artifacts. It
also injects a server startup denial to verify failure reporting. It creates no
game and makes no AI calls.

This scripted Playwright check traverses a whole game, operates visits and required
targets, timer controls, nominations and ballots, checks confirmed vote totals,
requires a winner, and checks ending layout at mobile width. Normal mode preserves
the real minimum private-visit time. Demo mode uses the application's existing
fixed open-role setup and skips that delay. Neither command disables AI calls.
This deterministic check validates the browser harness; the LLM session supplies
exploratory behavior and screenshot review. Existing engine tests remain the
broader oracle for role interactions and game rules (`npm test`). Browser voting
assertions use a read-only public view; the LLM protocol exposes no engine mutation,
JavaScript evaluation, secret database access, or direct game-command endpoint.
