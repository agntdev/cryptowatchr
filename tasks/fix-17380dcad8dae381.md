# fix-17380dcad8dae381 — Price Check menu button does not fetch prices (vs spec tests)

**Weight:** 0.0000 (share of project budget)
**Reward:** 0 CWTR

The `menu:price` callback handler in `src/bot.ts:1430-1438` falls through to the generic `MENU_RESPONSES` lookup, which returns only a static description text (`"Price Check will show current prices for one coin or your full watchlist."`). It never calls `fetchPrices` or checks the user's watchlist.

The dialog tests in `tests/specs/E9T1.json` ("Price Check menu button with empty watchlist shows empty message") and `tests/specs/E9T2.json` ("Price Check menu button with coins in watchlist fetches prices") expect the button to actually inspect the watchlist and display prices (or the empty-watchlist message).

This means the main-menu "Price Check" button is non-functional for its advertised purpose — users must use the `/price` command instead.

## Dialog tests

If this task adds or changes user-facing bot behavior, author its dialog tests as a `BotSpec` JSON array in its OWN file `tests/specs/fix-17380dcad8dae381.json`. NEVER edit or append to a shared `tests/specs.json` — concurrent feature PRs would conflict on it. The tests-gate globs and merges all `tests/specs/*.json`.

If this task adds a bot command, declare it in its OWN file `tests/commands/fix-17380dcad8dae381.json` (a JSON array of command strings, e.g. `["/start"]`). NEVER edit or append to a shared `tests/commands.json` — same conflict reason. The tests-gate globs, merges + de-duplicates all `tests/commands/*.json`.


## Handler module

Implement this feature in its OWN file `src/handlers/fix-17380dcad8dae381.ts` that default-exports a grammY `Composer`. `buildBot()` auto-loads every file in `src/handlers/` at startup, so your handler is wired up automatically. NEVER edit `src/bot.ts` — every feature editing that one shared file makes concurrent PRs conflict. The global error boundary + unknown-command fallback already live in `buildBot()`; do not re-add them.


## Implementation contract

Ship a COMPLETE, working implementation — not a stub. A task is INCOMPLETE (and will be rejected) even if it compiles and the dialog tests pass when it does any of these:
- **Stubbed code:** empty bodies, `TODO`/`FIXME`, commented-out logic, or `throw new Error("not implemented")`.
- **Fabricated data:** `Math.random()`, hardcoded sample arrays, or canned responses standing in for real computed or fetched values.
- **No in-memory data store:** a `Map`/array/module-level variable used as a database is a defect. Anything that must survive a restart (records, subscriptions, balances, schedules, settings) MUST use the toolkit's persistent storage (Redis-backed), not process memory. (The toolkit's auto-selected session storage is only for ephemeral conversation state.)
- **Broken integrations:** call external APIs against their real contract — correct endpoints, ids and params (e.g. a coin *id* like `the-open-network`, not a ticker like `TON`) — with credentials read from env. Do not invent endpoints or fake responses.
- **Dead code:** the feature's command/handler must be registered via its default-exported `Composer` in `src/handlers/<slug>.ts` (auto-loaded) and reachable from the bot's command surface.
If the spec is genuinely under-specified, implement the smallest REAL slice you can verify and note the gap — never fake behavior to make the PR look complete.
