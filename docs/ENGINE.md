# Engine and game master

`server/machine.ts` defines legal phase edges and accepted events per state.
New games carry a phone-mode marker. Existing laptop saves remain archived and are not converted. Announcement,
voting, and paused substates are derived from the snapshot. Only `transition`
changes phase after creation. Invalid events are rejected before services run.
Role rules and event actions live in `server/engine.ts`.

```
distribution -> night_choices -> night_results -> dawn -> discussion
                    ^                                    |
                    +------------ nominations <----------+
```

Night resolution and daytime deaths can also end the game. Night choices are
collected first, then resolved in rule order, independently of phone submission order. Ravenkeeper targets are preselected; conditional information resolves before later information roles. Each phone confirms results before dawn.

`applyCommand(snapshot, event, services, now)` clones the snapshot, performs the
transition, and returns the next snapshot. The HTTP layer serializes commands and
commits only completed transitions. No service receives a mutable game object.
The engine has no network, database, or OpenAI dependency.

`GameMasterServices` provides two capabilities:

- `decide(request)`: a keyed decision with legal options and fallback. Context
  schema version 1 contains the phase/day/night, grimoire with status markers,
  submitted targets, information history, demon bluffs, red herring, recent
  decisions, and structured details of the specific rule check. The engine
  validates the response against its original options and caches the result.
- `narrate(request)`: optional German atmosphere for a new public announcement.
  Receives a public snapshot and the factual announcement. Demo reveals and final
  debriefs are removed. Output never changes the engine state or replaces the
  canonical rules/facts. API failures stop the action and preserve the saved game.

`Storyteller.services(game)` adapts these capabilities to the OpenAI client. Decisions and narration use separate schemas and prompts; narration
runs only when a command creates a new announcement. Private Q&A remains a separate
read-only rules capability with public context. Initial welcome text and tutorial
instructions stay deterministic. Spending estimates do not cap requests.
Structured output follows the [OpenAI Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs).

AI services are required for decisions. Existing callers may still pass a `Decider` directly. Tests inject deterministic services without API calls.

`tests/machine.test.ts` covers the phase matrix, guarded substates, service
isolation, rejected injected options, structured decision context, and narration
failure handling. Existing engine/HTTP/browser tests cover the playable rules and UI.


## Phone transport

`server/phones.ts` owns the persisted lobby, hashed device/recovery credentials,
per-member idempotency keys, and durable AI decision journal. `/api/lobby/register`
accepts `{lobbyId,name,seat}`; `/api/player/recover` accepts `{code}` and rotates the
device credential. `/api/player` uses `X-Player-Token` and returns only that member's
identity, private view, and submission status. `/api/player/submit` accepts
`{commandId,gameId,phase,night,targets}`. It binds the actor to the credential and
does not require the global game version. Submitted choices commit before
resolution; keyed AI decisions survive a failed resolution and restart.

Laptop mutations use `X-Host-Token`, bootstrapped by `/api/host` only on a loopback
connection. Lobby assistant/start/reset and night retry are host operations.
Public state/SSE never include device credentials, readiness identities, targets,
or private role data, except intentional open-role demo/end-game reveals.
Legacy terminal endpoints are disabled in the production app. The explicit
`legacyApi` option exists for historical regression fixtures only.
