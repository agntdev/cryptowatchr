# fix-a72fc21dd9ca808c — E6T1: /admin_stats command is completely missing from bot.ts

**Weight:** 0.0000 (share of project budget)
**Reward:** 0 CWTR

The E6T1 spec requires implementing a `/admin_stats` command available to the configured owner Telegram ID, displaying total users, active users (last 30d), and top-fired alert rules. The `bot.ts` file (1870 lines) has **no** `bot.command("admin_stats", ...)` registration. The backend methods `getAdminStats()`, `recordUserActivity()`, and `incrementAlertFireCount()` exist in `store.ts` but are dead code with no consumer. The command is entirely unimplemented.

Required: add the `/admin_stats` command handler to `src/bot.ts`, gate it behind an `OWNER_ID` env var check, call `getAdminStats()` and format/display the results.

## Dialog tests

If this task adds or changes user-facing bot behavior, author its dialog tests as a `BotSpec` JSON array in its OWN file `tests/specs/fix-a72fc21dd9ca808c.json`. NEVER edit or append to a shared `tests/specs.json` — concurrent feature PRs would conflict on it. The tests-gate globs and merges all `tests/specs/*.json`.

If this task adds a bot command, declare it in its OWN file `tests/commands/fix-a72fc21dd9ca808c.json` (a JSON array of command strings, e.g. `["/start"]`). NEVER edit or append to a shared `tests/commands.json` — same conflict reason. The tests-gate globs, merges + de-duplicates all `tests/commands/*.json`.


## Handler module

Implement this feature in its OWN file `src/handlers/fix-a72fc21dd9ca808c.ts` that default-exports a grammY `Composer`. `buildBot()` auto-loads every file in `src/handlers/` at startup, so your handler is wired up automatically. NEVER edit `src/bot.ts` — every feature editing that one shared file makes concurrent PRs conflict. The global error boundary + unknown-command fallback already live in `buildBot()`; do not re-add them.


## Implementation contract

Ship a COMPLETE, working implementation — not a stub. A task is INCOMPLETE (and will be rejected) even if it compiles and the dialog tests pass when it does any of these:
- **Stubbed code:** empty bodies, `TODO`/`FIXME`, commented-out logic, or `throw new Error("not implemented")`.
- **Fabricated data:** `Math.random()`, hardcoded sample arrays, or canned responses standing in for real computed or fetched values.
- **No in-memory data store:** a `Map`/array/module-level variable used as a database is a defect. Anything that must survive a restart (records, subscriptions, balances, schedules, settings) MUST use the toolkit's persistent storage (Redis-backed), not process memory. (The toolkit's auto-selected session storage is only for ephemeral conversation state.)
- **Broken integrations:** call external APIs against their real contract — correct endpoints, ids and params (e.g. a coin *id* like `the-open-network`, not a ticker like `TON`) — with credentials read from env. Do not invent endpoints or fake responses.
- **Dead code:** the feature's command/handler must be registered via its default-exported `Composer` in `src/handlers/<slug>.ts` (auto-loaded) and reachable from the bot's command surface.
If the spec is genuinely under-specified, implement the smallest REAL slice you can verify and note the gap — never fake behavior to make the PR look complete.
