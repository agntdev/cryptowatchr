# CryptoWatch - personal price alerts — Bot specification

**Archetype:** finance

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A personal Telegram bot that lets each user maintain a private crypto watchlist, create price-threshold and percent-change alerts with per-rule cooldowns, query live prices on demand, schedule a daily local-time morning summary, and set quiet hours; the owner receives anonymized aggregated metrics (active users, top triggered alerts/tickers).

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Individual crypto investors
- Retail traders who want price alerts
- Users who prefer private, personal notifications

## Success criteria

- Users can add/remove coins to a private watchlist and persist it across sessions
- Users can create, view, edit, and delete alert rules (price-threshold and percent-change) with configurable cooldowns
- Alerts fire based on fresh price data, respect per-rule cooldowns and user quiet hours, and are delivered only to the user's Telegram account
- Users receive an opt-in daily morning summary at their chosen local time showing current prices and notable moves since the prior summary
- Users can query /price [ticker|all] to receive current price + 24h percent for a ticker or compact list for their watchlist
- Owner receives anonymized aggregated metrics (active users in last 30 days and top 10 triggered alerts/tickers) delivered to ADMIN_CHAT_ID on a configurable cadence
- Price-source failures are retried with exponential backoff and alerts are suppressed until fresh data is available

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open onboarding and main menu (explains features and shows quick actions)
  - outputs: main_menu
- **Manage watchlist** (button, actor: user, callback: watchlist:menu) — Open watchlist manager (add common / free-text coin, remove items)
  - outputs: watchlist_list, add_coin_prompt, remove_confirmation
- **Create alert** (button, actor: user, callback: alerts:create) — Start guided inline flow to create a new alert for a watchlist coin
  - outputs: choose_coin, choose_type, enter_value, choose_cooldown, confirmation
- **/price** (command, actor: user, command: /price) — Typed command to request current price for a ticker or 'all' for watchlist; use slash command for free-form input
  - inputs: ticker or 'all'
  - outputs: price_response, error_unknown_ticker
- **Summary & Schedule** (button, actor: user, callback: summary:menu) — Set daily summary time or toggle opt-in/opt-out
  - outputs: set_time_prompt, summary_preview
- **Quiet hours** (button, actor: user, callback: quiet:menu) — Configure quiet hours start/end; bot will suppress alerts during window and send queued summary at end
  - outputs: set_quiet_hours_prompt, quiet_status
- **/help** (command, actor: user, command: /help) — Show help and command shortcuts
  - outputs: help_text

## Flows

### Onboarding & Main menu
_Trigger:_ /start

1. Send short welcome explaining features in voice
2. Show main inline keyboard: Manage watchlist, Create alert, Summary & Schedule, Quiet hours, /price usage hint
3. Offer quick seed coins add buttons (BTC, ETH, TON, USDT, ADA, SOL, BNB, XRP) and 'Other' -> ForceReply for custom ticker

_Data touched:_ User

### Manage watchlist - add coin
_Trigger:_ callback watchlist:menu -> button add

1. Show seed coins inline buttons and 'Other' option
2. If seed pressed, add that symbol to user's watchlist and show success message with undo button
3. If 'Other' selected, prompt ForceReply for ticker symbol; validate ticker via price API; on unknown ticker show correction hint
4. Persist watchlist item with optional user label

_Data touched:_ WatchlistItem, User

### Manage watchlist - remove coin
_Trigger:_ callback watchlist:menu -> choose existing item remove

1. List user's watchlist items each with inline 'Remove' button
2. On remove press show confirm/cancel inline buttons
3. On confirm delete item and acknowledge

_Data touched:_ WatchlistItem

### Create alert guided flow
_Trigger:_ callback alerts:create

1. Show user's watchlist (or prompt to add if empty); let user pick coin or use ForceReply ticker input
2. Ask alert type via inline choices: 'Price threshold' or 'Percent-change over interval'
3. Ask direction via inline choices: 'Above / Below' or 'Rise / Fall' respectively
4. For price threshold: ForceReply numeric price; for percent-change: ForceReply percent value (default 5%) and inline to accept default interval (1h) or change to another interval
5. Ask cooldown using inline common options (6h default, 1h, 12h, 24h) and allow custom entry
6. Show summary confirmation with 'Save' and 'Cancel'
7. Persist Alert rule and acknowledge

_Data touched:_ Alert

### Alert evaluation & firing
_Trigger:_ price update event or periodic poll

1. Fetch latest price data from price API with retry/backoff on transient failures
2. If data is fresh proceed; if stale, suppress alerts and log failure
3. For each enabled alert rule evaluate condition; skip if rule in cooldown or user in quiet hours (queue summary or defer non-critical alerts)
4. If alert fires send one Telegram message to the user describing rule, current price, and link to manage rule
5. Record last_triggered_at for the rule and increment anonymized metric counters for owner
6. Enforce duplicate suppression via cooldown

_Data touched:_ Alert, AlertEventLog, MetricsAggregate, User, QuietHours

### Scheduled morning summary
_Trigger:_ cron at user's local scheduled time

1. Resolve user's local time (from Telegram locale or stored timezone; fall back to platform default and surface setting to user)
2. Fetch current prices for watchlist; if price API stale skip summary and notify a brief 'summary postponed' message
3. Compute notable moves since prior summary (percent changes) and include compact list and notable highlights
4. Send summary to user only if enabled; if inside quiet hours, queue and send a single summary at quiet end
5. Record metrics for owner (counts) without PII

_Data touched:_ ScheduledSummary, WatchlistItem, MetricsAggregate, User

### Quiet hours handling
_Trigger:_ user sets quiet hours or alert firing during quiet window

1. Persist quiet hours on user record
2. During quiet window suppress immediate alerts and non-critical messages; queue a single aggregated notification/summary at end time
3. When quiet window ends deliver queued summary/notifications once and resume normal alerting

_Data touched:_ QuietHours, Alert, User

### Owner metrics aggregation & delivery
_Trigger:_ daily scheduled job

1. Aggregate anonymized metrics: active users last 30 days and top 10 most-triggered (coin + alert type) counts
2. Format anonymized report and send to ADMIN_CHAT_ID via Telegram (no user identifiers)
3. Rotate/expire metric buckets per retention policy

_Data touched:_ MetricsAggregate

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Telegram chat id where anonymized owner metrics are sent
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **User** _(retention: persistent)_ — Per-telegram-account private settings and preferences
  - fields: telegram_id, locale, timezone (optional), quiet_hours {start_local, end_local, enabled}, summary_time_local {hour, minute, enabled}, created_at, last_active_at
- **WatchlistItem** _(retention: persistent)_ — A coin/token tracked by a user
  - fields: id, user_telegram_id, symbol (ticker), label (optional), added_at
- **Alert** _(retention: persistent)_ — An alert rule owned by a user
  - fields: id, user_telegram_id, coin_symbol, type (price_threshold|percent_change), direction (above|below|rise|fall), threshold_value (price or percent), percent_interval_minutes (for percent-change; default 60), cooldown_seconds, last_triggered_at, enabled, created_at
- **ScheduledSummary** _(retention: persistent)_ — User's daily summary preference
  - fields: user_telegram_id, time_local {hour, minute}, enabled, last_sent_at
- **QuietHours** _(retention: persistent)_ — User quiet hours window
  - fields: user_telegram_id, start_local_hour, end_local_hour, enabled
- **AlertEventLog / MetricsAggregate** _(retention: persistent)_ — Event counts used only for aggregated, anonymized owner metrics
  - fields: event_date, coin_symbol, alert_type, trigger_count

## Integrations

- **Telegram** (required) — Bot API messaging for user interactions, callbacks, scheduled messages, and owner metrics delivery
- **Public Crypto Price API** (required) — Fetch current prices and 24h percent-change for tickers (implementer chooses provider); callers must retry on transient failures and mark data stale until fresh
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Provide ADMIN_CHAT_ID to receive anonymized metrics
- Request on-demand metrics report via /metrics_admin command
- Pause/resume metrics reporting
- Configure seed watchlist (optional via environment or admin command)
- Set metrics report cadence/time (missing field if owner wants non-default)

## Notifications

- Price alert message to user when an alert condition is met (includes rule summary, current price, and manage link)
- Queued aggregated summary at end of quiet hours if alerts occurred during quiet time
- Daily/Opt-in morning summary at user-chosen local time
- Responses to /price query with current price and 24h percent
- User-visible error when a ticker is unknown or on bad input with suggested corrections
- Brief user notice when price-source is offline and alerts/summaries are suspended

## Permissions & privacy

- Per-user watchlists, alerts, quiet hours, and summary time are private and stored per-telegram account
- Owner receives only anonymized aggregated metrics (active users last 30 days, top 10 triggered alert counts by coin+type) with no user-identifying information
- No sharing of user watchlists or alerts to other users or groups
- Stored data limited to what's required for functionality (no chat message history export to owner)
- Users may request deletion of their data (owner/admin must implement a data-deletion action)

## Edge cases

- Unknown/ambiguous ticker symbols: bot should validate via price API and return a helpful correction hint
- Price API rate limits or prolonged downtime: suppress alerts, retry with exponential backoff, and surface brief status to affected users (summary postponed)
- Stale data detection: do not fire alerts if latest price timestamp older than configured freshness threshold
- User timezone not available or ambiguous: default to Telegram locale-based heuristics and surface a timezone setting for correction
- Overlapping quiet windows or multiple queued alerts: deliver a single aggregated summary at quiet end; avoid duplicate messages for same rule due to batching
- Duplicate rules: allow but warn if user creates exact-duplicate; cooldown per (user, coin, rule id) prevents repeat spamming
- High user volume causing price API rate limits: implement per-user batching and caching for frequent tickers
- Daylight saving time shifts: scheduled summary should use stored local hour and handle DST transitions by re-resolving timezone

## Required tests

- Dialog-level acceptance: onboarding /start shows main menu and seed coin buttons
- Watchlist: add seed coin, add custom ticker (valid & invalid), remove coin and undo behavior
- Alert creation: guided flow completes for price-threshold and percent-change (including custom cooldown), persisted rule visible in list
- Alert firing: simulated price feed triggers alert, respects cooldown, records trigger in metrics, and sends only one message per rule
- Quiet hours: set quiet window, trigger alerts during window, verify suppression and single queued summary delivery at window end
- /price command: valid ticker returns price+24h, 'all' returns compact watchlist list; unknown ticker returns helpful error
- Scheduled summary: user receives summary at configured local time; if price API stale the summary is postponed and user informed
- Price-source failure handling: verify retries with backoff, that alerts are suppressed while data is stale, and user-visible status is correct
- Owner metrics: aggregated anonymized counts (active users last 30 days and top 10 triggered) generated and delivered to ADMIN_CHAT_ID

## Assumptions

- Default percent-change interval = 1 hour and default threshold = 5% unless user overrides
- Default alert cooldown = 6 hours unless user sets per-rule cooldown
- Seed watchlist options are BTC, ETH, TON, USDT, ADA, SOL, BNB, XRP; users can add any ticker
- Owner wants anonymized top 10 triggered alerts/tickers (brief specified top 10 already)
- Platform provides persistent storage and scheduled job runner; implementer will choose an appropriate public price API provider
