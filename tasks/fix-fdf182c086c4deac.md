# fix-fdf182c086c4deac — PRICEFIX-003 creates a separate store instance, bypassing dependency injection

**Weight:** 0.0000 (share of project budget)
**Reward:** 0 CWTR

PRICEFIX-003.ts exports a plain `Composer` object (line 47: `export default composer`), not a factory function. `buildBot()` (src/bot.ts:727) checks `typeof raw === "function"` — since it's not a function, it calls `bot.use(composer)` directly without passing `effectiveStore`. However, PRICEFIX-003.ts internally calls `createStore()` on line 13, creating its own independent store instance.

**Impact:**
- **MemoryStore**: the PRICEFIX-003 store is a different `MemoryStore` than what the rest of the app uses. Watchlist data modified by PRICEFIX-003 (e.g. `removeFromWatchlist`) goes to the wrong store — the main store never sees the removal.
- **Redis/Postgres**: creates a second database connection pool, wasting resources.
- The spec says "NEVER edit src/bot.ts" but the handler should match the pattern of PRICEFIX-002/004: export a factory function `(store: PersistentStore) => Composer` so `buildBot()` injects the canonical store.

## Dialog tests

If this task adds or changes user-facing bot behavior, author its dialog tests as a `BotSpec` JSON array in its OWN file `tests/specs/fix-fdf182c086c4deac.json`. NEVER edit or append to a shared `tests/specs.json` — concurrent feature PRs would conflict on it. The tests-gate globs and merges all `tests/specs/*.json`.

If this task adds a bot command, declare it in its OWN file `tests/commands/fix-fdf182c086c4deac.json` (a JSON array of command strings, e.g. `["/start"]`). NEVER edit or append to a shared `tests/commands.json` — same conflict reason. The tests-gate globs, merges + de-duplicates all `tests/commands/*.json`.


## Handler module

Implement this feature in its OWN file `src/handlers/fix-fdf182c086c4deac.ts` that default-exports a grammY `Composer`. `buildBot()` auto-loads every file in `src/handlers/` at startup, so your handler is wired up automatically. NEVER edit `src/bot.ts` — every feature editing that one shared file makes concurrent PRs conflict. The global error boundary + unknown-command fallback already live in `buildBot()`; do not re-add them.


## Implementation contract

Ship a COMPLETE, working implementation — not a stub. A task is INCOMPLETE (and will be rejected) even if it compiles and the dialog tests pass when it does any of these:
- **Stubbed code:** empty bodies, `TODO`/`FIXME`, commented-out logic, or `throw new Error("not implemented")`.
- **Fabricated data:** `Math.random()`, hardcoded sample arrays, or canned responses standing in for real computed or fetched values.
- **No in-memory data store:** a `Map`/array/module-level variable used as a database is a defect. Anything that must survive a restart (records, subscriptions, balances, schedules, settings) MUST use the toolkit's persistent storage (Redis-backed), not process memory. (The toolkit's auto-selected session storage is only for ephemeral conversation state.)
- **Broken integrations:** call external APIs against their real contract — correct endpoints, ids and params (e.g. a coin *id* like `the-open-network`, not a ticker like `TON`) — with credentials read from env. Do not invent endpoints or fake responses.
- **Dead code:** the feature's command/handler must be registered via its default-exported `Composer` in `src/handlers/<slug>.ts` (auto-loaded) and reachable from the bot's command surface.
If the spec is genuinely under-specified, implement the smallest REAL slice you can verify and note the gap — never fake behavior to make the PR look complete.
