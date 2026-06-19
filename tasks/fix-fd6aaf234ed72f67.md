# fix-fd6aaf234ed72f67 — Watchlist navigation leaks alert-management and summary session state

**Weight:** 0.0000 (share of project budget)
**Reward:** 0 CWTR

The `/list` command handler (bot.ts:723) and the `menu:watchlist` callback handler (bot.ts:965) both call `clearAlertSession()` and `clearWatchlistSession()` but do **not** call `clearAlertManageSession()` or `clearSummarySession()`. The `menu:add` callback (bot.ts:956) has the same gap.

**Impact:** If a user is in the middle of editing an alert (`alertManageStep` is set to `edit_price`, `edit_percent`, or `edit_timeframe`) or setting a morning-summary time (`summaryStep` is set), then types `/list` or navigates to the watchlist via the menu, the stale session state persists. Any subsequent free-text message will be captured by the alert-management or summary message handlers instead of being handled as a normal interaction, causing confusing/incorrect behavior.

**Required fix:** Have `/list`, `menu:watchlist`, and `menu:add` handlers also call `clearAlertManageSession(ctx.session)` and `clearSummarySession(ctx.session)`, matching the behavior of `menu:back` (bot.ts:1088-1092).

## Dialog tests

If this task adds or changes user-facing bot behavior, author its dialog tests as a `BotSpec` JSON array in its OWN file `tests/specs/fix-fd6aaf234ed72f67.json`. NEVER edit or append to a shared `tests/specs.json` — concurrent feature PRs would conflict on it. The tests-gate globs and merges all `tests/specs/*.json`.

If this task adds a bot command, declare it in its OWN file `tests/commands/fix-fd6aaf234ed72f67.json` (a JSON array of command strings, e.g. `["/start"]`). NEVER edit or append to a shared `tests/commands.json` — same conflict reason. The tests-gate globs, merges + de-duplicates all `tests/commands/*.json`.


## Handler module

Implement this feature in its OWN file `src/handlers/fix-fd6aaf234ed72f67.ts` that default-exports a grammY `Composer`. `buildBot()` auto-loads every file in `src/handlers/` at startup, so your handler is wired up automatically. NEVER edit `src/bot.ts` — every feature editing that one shared file makes concurrent PRs conflict. The global error boundary + unknown-command fallback already live in `buildBot()`; do not re-add them.


## Implementation contract

Ship a COMPLETE, working implementation — not a stub. A task is INCOMPLETE (and will be rejected) even if it compiles and the dialog tests pass when it does any of these:
- **Stubbed code:** empty bodies, `TODO`/`FIXME`, commented-out logic, or `throw new Error("not implemented")`.
- **Fabricated data:** `Math.random()`, hardcoded sample arrays, or canned responses standing in for real computed or fetched values.
- **No in-memory data store:** a `Map`/array/module-level variable used as a database is a defect. Anything that must survive a restart (records, subscriptions, balances, schedules, settings) MUST use the toolkit's persistent storage (Redis-backed), not process memory. (The toolkit's auto-selected session storage is only for ephemeral conversation state.)
- **Broken integrations:** call external APIs against their real contract — correct endpoints, ids and params (e.g. a coin *id* like `the-open-network`, not a ticker like `TON`) — with credentials read from env. Do not invent endpoints or fake responses.
- **Dead code:** the feature's command/handler must be registered via its default-exported `Composer` in `src/handlers/<slug>.ts` (auto-loaded) and reachable from the bot's command surface.
If the spec is genuinely under-specified, implement the smallest REAL slice you can verify and note the gap — never fake behavior to make the PR look complete.
