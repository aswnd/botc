# Rules specification · Trouble Brewing · v1

Rules baseline inspected on 2026-10-18. This application implements the supplied official Trouble Brewing material, with a shared-terminal delivery procedure for a trusted in-person group. German names and explanations are working translations, with English names retained in the reference.

## Sources and precedence

1. User-supplied `official_pdfs/Trouble Brewing script.pdf`, including its graphical night-order page.
2. User-supplied `official_pdfs/Rulebook.pdf` and `official_pdfs/Trouble_Brewing.pdf` for detailed procedures and ability interactions.
3. The supplied wiki at <https://wiki.bloodontheclocktower.com/Main_Page>, particularly the [edition](https://wiki.bloodontheclocktower.com/Trouble_Brewing), [setup](https://wiki.bloodontheclocktower.com/Setup), [rules explanation](https://wiki.bloodontheclocktower.com/Rules_Explanation), and individual character pages.
4. The unofficial PDFs are supplementary only. Their older night order does not override the official script sheet.

Individual references: [Imp](https://wiki.bloodontheclocktower.com/Imp), [Scarlet Woman](https://wiki.bloodontheclocktower.com/Scarlet_Woman), [Poisoner](https://wiki.bloodontheclocktower.com/Poisoner), [Spy](https://wiki.bloodontheclocktower.com/Spy), [Butler](https://wiki.bloodontheclocktower.com/Butler), [Drunk](https://wiki.bloodontheclocktower.com/Drunk), [Virgin](https://wiki.bloodontheclocktower.com/Virgin), [Monk](https://wiki.bloodontheclocktower.com/Monk), [Recluse](https://wiki.bloodontheclocktower.com/Recluse), [Mayor](https://wiki.bloodontheclocktower.com/Mayor).

## Setup

| Players | Townsfolk | Outsiders | Minions | Demons |
|---:|---:|---:|---:|---:|
| 7 | 5 | 0 | 1 | 1 |
| 8 | 5 | 1 | 1 | 1 |
| 9 | 5 | 2 | 1 | 1 |
| 10 | 7 | 0 | 2 | 1 |

A Baron exchanges two Townsfolk for two Outsiders at setup. The Drunk counts as an Outsider but sees an otherwise unassigned Townsfolk identity. There are no duplicate actual characters. Three Demon bluffs are unused good characters, also excluding the Drunk's apparent identity. The Fortune Teller's red herring is a good player selected at setup. Alignment is stored separately from character.

## Night order and delivery adaptation

**First night:** Minion information → Demon information → Poisoner → Washerwoman → Librarian → Investigator → Chef → Empath → Fortune Teller → Butler → Spy → dawn.

**Other nights:** Poisoner → Monk → Scarlet Woman notification when relevant → original Imp action → triggered Ravenkeeper → Empath → Fortune Teller → Butler → Undertaker → Spy → dawn.

The unofficial older sheet places the Spy before several other actions, and orders the Undertaker differently. The implementation follows the supplied official graphical sheet, with the Spy last.

Everyone opens their own phone at nightfall and keeps the game page visible. Closed eyes and individual calls are unnecessary. Players remain seated, do not communicate during the night, and keep their screen contents private.

All players, including dead players and players without an action, submit a choice or readiness confirmation. Choices are locked after submission and are resolved in the official order above once everyone has submitted. A queued action belonging to someone killed before their ability acts has no effect. First-night evil information is supplied before choices. A Scarlet Woman who became the Imp during the preceding day learns their changed identity before choosing.

All phones receive results together. Everyone confirms reading before dawn. No individual readiness list or role-specific sound is public. Players without information still confirm. There are no minimum visit durations or seating-order queues.

**Ravenkeeper timing adaptation:** choose a conditional target during the shared choice step each night. If killed that night, receive that target's character in the shared results step. Resolve the ability after the Imp and before later information abilities. A surviving Ravenkeeper receives no result. This changes when the target is chosen, not when the ability resolves. Spy snapshots are captured at their ability point and contain no buffered commands or AI decision logs. A same-night successor does not receive another Imp attack.

## Character and state invariants

- Poisoned/drunk abilities do not function. Apparent choices still appear and plausible false or true information can be supplied. Failure is never identified to the affected player.
- A Poisoner's ongoing effect ends on their death or change of character; a Monk's protection ends when its source loses the ability. Poisoning clears at the following dusk.
- First-night information can account for permitted Spy/Recluse misregistration. Registrations are individual Storyteller choices, rather than permanent changes to identity or alignment.
- The Storyteller always declines optional Recluse registration for evil-team introductions and Imp succession. This is a legal discretionary policy, avoiding the advanced good-Imp edge case in beginner games.
- The Spy may register as good/Townsfolk/Outsider even when dead. The Recluse may register as evil/Minion/Demon even when dead, provided their registration ability is not disabled.
- Chef uses actual seating adjacency, including the circular boundary. Empath skips dead players. Fortune Teller uses two distinct targets and the red herring.
- Undertaker learns only after a death by execution. Virgin-triggered execution qualifies; a Slayer death does not.
- Scarlet Woman checks the living count immediately before the Demon dies. At five or more, an active Scarlet Woman must take over, including on an Imp self-kill.
- Other Imp self-kills can pass to a living Minion. A new Imp does not act again on that same night.
- Soldier and Monk protection also apply to a Mayor's redirected Demon attack. A redirected attack can hit a dead player and cause no new death.
- Healthy Saint death by execution loses for good. Healthy Mayor checks at day close with exactly three living and no execution.
- Normal good victory is checked before normal evil victory when both coincide. Abilities such as the Saint can provide their own ending.

## Days and public actions

Living players nominate at most once per day; each player is nominated at most once per day. Dead players can be nominated. One nomination is processed at a time. Threshold is the living count divided by two, rounded up. The unique highest qualifying result is the execution candidate; a tie clears the candidate until a later nomination strictly exceeds the tied total.

Each dead player has one remaining vote. Votes are counted individually, with ghost tokens consumed only on confirmation. Drafts are editable beforehand. Butler restrictions remain private player responsibilities; the application does not publicly reject their vote based on a hidden character. This follows the official Butler guidance.

All players can publicly claim a Slayer shot; only an unused active Slayer applies its effect. Poisoned attempts consume the real Slayer's use. Public no-effect announcements do not reveal whether an actual ability existed. A Virgin's first nomination is consumed even when it does not execute anyone; a drunk apparent Virgin does not have the actual ability.

Discussion defaults to seven minutes, with assistant pause/adjust controls. Timer expiry produces a public cue only. The assistant must explicitly open nominations and close the day. There is at most one execution per day; a Virgin-triggered execution immediately ends that day.

## Information boundaries and recovery

The public projection has no actual role, perceived role, poison marker, red herring, Demon bluff, or internal decision fields. Night deaths remain unpublished until dawn, except if the game has ended. All roles are public in clearly labelled demonstration mode and after game end.

Rules Q&A gets only the speaker’s identity, an explicit allowlist of public game facts, public character definitions, and retrieved manual excerpts. It receives no player role, team, opening messages, private information (including Spy Grimoire snapshots), public reveal/debrief fields, or previous chat. This boundary applies in demonstration mode and after game end too. Chat history stays local; questions must be self-contained. Players may of course type their own private claims into a question. Storyteller decision requests are a separate interface with legal options and current secret context. AI outputs are validated against the offered options before application. Engine state is cloned before transitions; invalid commands leave the saved state unchanged. Accepted transitions are saved transactionally before responses/events publish them. Duplicate command IDs do not apply an effect twice.

After a restart, persisted information is reused instead of regenerated. Each phone has a separate player credential. The browser saves its private identifier in local storage and uses it to log back in automatically. Private content is concealed when the tab is hidden or inactive; registration and confirmed choices persist. Laptop controls require a separate capability obtained through the local loopback connection. The trusted local Wi-Fi uses HTTP; this is not an internet-hosted service.
