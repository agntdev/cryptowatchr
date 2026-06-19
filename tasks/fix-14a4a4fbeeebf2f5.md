# fix-14a4a4fbeeebf2f5 — Main menu missing "My Alerts" button — alert management UI unreachable from menu

**Weight:** 0.0000 (share of project budget)
**Reward:** 0 CWTR

The `mainMenu()` function at `src/bot.ts:379-391` does not include a "My Alerts" entry with `callback_data: "menu:myalerts"`. The `menu:myalerts` callback handler exists (line 1068-1086) and works when triggered, but it is unreachable through the main menu UI. Users can only access their alert rules via the `/alerts` command.

The E3T3 dialog test specs (`tests/specs/E3T3.json`) explicitly expect `menu:myalerts` in the main menu keyboard in multiple tests ("my alerts menu shows empty state", "/alerts command shows empty state", "back to menu from alerts list"). This is a gap between the implementation and the E3T3 spec — the "My Alerts" menu item must be added to `mainMenu()` for the alert management feature to be fully surfaced.

## Dialog tests

If this task adds or changes user-facing bot behavior, author its dialog tests as a `BotSpec` JSON array in its OWN file `tests/specs/fix-14a4a4fbeeebf2f5.json`. NEVER edit or append to a shared `tests/specs.json` — concurrent feature PRs would conflict on it. The tests-gate globs and merges all `tests/specs/*.json`.

If this task adds a bot command, declare it in its OWN file `tests/commands/fix-14a4a4fbeeebf2f5.json` (a JSON array of command strings, e.g. `["/start"]`). NEVER edit or append to a shared `tests/commands.json` — same conflict reason. The tests-gate globs, merges + de-duplicates all `tests/commands/*.json`.


## Handler module

Implement this feature in its OWN file `src/handlers/fix-14a4a4fbeeebf2f5.ts` that default-exports a grammY `Composer`. `buildBot()` auto-loads every file in `src/handlers/` at startup, so your handler is wired up automatically. NEVER edit `src/bot.ts` — every feature editing that one shared file makes concurrent PRs conflict. The global error boundary + unknown-command fallback already live in `buildBot()`; do not re-add them.


## Implementation contract

Ship a COMPLETE, working implementation — not a stub. A task is INCOMPLETE (and will be rejected) even if it compiles and the dialog tests pass when it does any of these:
- **Stubbed code:** empty bodies, `TODO`/`FIXME`, commented-out logic, or `throw new Error("not implemented")`.
- **Fabricated data:** `Math.random()`, hardcoded sample arrays, or canned responses standing in for real computed or fetched values.
- **No in-memory data store:** a `Map`/array/module-level variable used as a database is a defect. Anything that must survive a restart (records, subscriptions, balances, schedules, settings) MUST use the toolkit's persistent storage (Redis-backed), not process memory. (The toolkit's auto-selected session storage is only for ephemeral conversation state.)
- **Broken integrations:** call external APIs against their real contract — correct endpoints, ids and params (e.g. a coin *id* like `the-open-network`, not a ticker like `TON`) — with credentials read from env. Do not invent endpoints or fake responses.
- **Dead code:** the feature's command/handler must be registered via its default-exported `Composer` in `src/handlers/<slug>.ts` (auto-loaded) and reachable from the bot's command surface.
If the spec is genuinely under-specified, implement the smallest REAL slice you can verify and note the gap — never fake behavior to make the PR look complete.
