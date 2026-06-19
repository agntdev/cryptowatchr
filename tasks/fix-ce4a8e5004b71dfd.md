# fix-ce4a8e5004b71dfd — Triple /price handlers fire simultaneously, causing duplicate replies

**Weight:** 0.0000 (share of project budget)
**Reward:** 0 CWTR

PRICEFIX-002.ts, PRICEFIX-003.ts, and PRICEFIX-004.ts each register `composer.command("price", ...)`. In `buildBot()` (src/bot.ts:727-728), the auto-loader calls `bot.use(composer)` for every handler module. In grammY, all registered `bot.command("price")` middleware fires sequentially on a single `/price` command — they do NOT shadow each other.

**Impact:**
- `/price BTC` triggers handlers in PRICEFIX-002 AND PRICEFIX-004 → user receives 2 price replies.
- `/price` (no args) triggers all three → user receives up to 3 replies (price from 002, optional warning from 003, price/cache from 004).
- The bot.ts built-in `/price` handler (line 782) correctly checks `autoLoadedCommands.has("price")` and returns early, but the auto-loaded handlers have no mutual exclusion.

**Fix:** Only ONE handler should register `/price`. The other two should export their logic as plain functions callable from the single handler, or `buildBot()` should de-duplicate by picking one handler per command.

## Dialog tests

If this task adds or changes user-facing bot behavior, author its dialog tests as a `BotSpec` JSON array in its OWN file `tests/specs/fix-ce4a8e5004b71dfd.json`. NEVER edit or append to a shared `tests/specs.json` — concurrent feature PRs would conflict on it. The tests-gate globs and merges all `tests/specs/*.json`.

If this task adds a bot command, declare it in its OWN file `tests/commands/fix-ce4a8e5004b71dfd.json` (a JSON array of command strings, e.g. `["/start"]`). NEVER edit or append to a shared `tests/commands.json` — same conflict reason. The tests-gate globs, merges + de-duplicates all `tests/commands/*.json`.


## Handler module

Implement this feature in its OWN file `src/handlers/fix-ce4a8e5004b71dfd.ts` that default-exports a grammY `Composer`. `buildBot()` auto-loads every file in `src/handlers/` at startup, so your handler is wired up automatically. NEVER edit `src/bot.ts` — every feature editing that one shared file makes concurrent PRs conflict. The global error boundary + unknown-command fallback already live in `buildBot()`; do not re-add them.


## Implementation contract

Ship a COMPLETE, working implementation — not a stub. A task is INCOMPLETE (and will be rejected) even if it compiles and the dialog tests pass when it does any of these:
- **Stubbed code:** empty bodies, `TODO`/`FIXME`, commented-out logic, or `throw new Error("not implemented")`.
- **Fabricated data:** `Math.random()`, hardcoded sample arrays, or canned responses standing in for real computed or fetched values.
- **No in-memory data store:** a `Map`/array/module-level variable used as a database is a defect. Anything that must survive a restart (records, subscriptions, balances, schedules, settings) MUST use the toolkit's persistent storage (Redis-backed), not process memory. (The toolkit's auto-selected session storage is only for ephemeral conversation state.)
- **Broken integrations:** call external APIs against their real contract — correct endpoints, ids and params (e.g. a coin *id* like `the-open-network`, not a ticker like `TON`) — with credentials read from env. Do not invent endpoints or fake responses.
- **Dead code:** the feature's command/handler must be registered via its default-exported `Composer` in `src/handlers/<slug>.ts` (auto-loaded) and reachable from the bot's command surface.
If the spec is genuinely under-specified, implement the smallest REAL slice you can verify and note the gap — never fake behavior to make the PR look complete.
