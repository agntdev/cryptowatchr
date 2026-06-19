import { Composer } from "grammy";
import { createRequire } from "node:module";
import { type BotContext, menuKeyboard } from "../toolkit/index.js";
import { fetchPrices, formatPriceDisplay, PriceFetchError } from "../price.js";
import { coinIdForTicker } from "../bot.js";
import type { PersistentStore, WatchlistEntry, PriceSnapshot } from "../store.js";

interface CircuitState {
  failures: number;
  lastFailure: number;
  state: "closed" | "open" | "half_open";
  openedAt: number;
}

const CIRCUIT_KEY = "cryptowatchr:circuit:coingecko";
const FAILURE_THRESHOLD = 5;
const OPEN_TIMEOUT_MS = 60_000;
const CACHE_FRESHNESS_MS = 5 * 60 * 1000;

const PRICE_UNAVAILABLE_TEXT =
  "Price service temporarily unavailable. Please try again in a moment.";

const EMPTY_WATCHLIST_TEXT =
  "Your watchlist is empty.\n\nUse the Add Coin menu or type a ticker to start building your watchlist.";

function mainMenu() {
  return menuKeyboard(
    [
      { text: "Add Coin", data: "menu:add" },
      { text: "My Watchlist", data: "menu:watchlist" },
      { text: "Create Alert", data: "menu:alerts" },
      { text: "Price Check", data: "menu:price" },
      { text: "Settings", data: "menu:settings" },
      { text: "Help", data: "menu:help" },
    ],
    2,
  );
}

class CircuitBreaker {
  #redis: unknown = null;
  #memoryState: CircuitState = {
    failures: 0,
    lastFailure: 0,
    state: "closed",
    openedAt: 0,
  };

  constructor() {
    if (process.env.REDIS_URL) {
      const require = createRequire(import.meta.url);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ioredis: any = require("ioredis");
      const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
      this.#redis = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: null,
        lazyConnect: false,
      });
    }
  }

  private get redis(): RedisClient | null {
    return this.#redis as RedisClient | null;
  }

  private async getState(): Promise<CircuitState> {
    if (!this.redis) return { ...this.#memoryState };
    try {
      const raw = await this.redis.get(CIRCUIT_KEY);
      if (!raw) return { failures: 0, lastFailure: 0, state: "closed", openedAt: 0 };
      return JSON.parse(raw) as CircuitState;
    } catch {
      return { failures: 0, lastFailure: 0, state: "closed", openedAt: 0 };
    }
  }

  private async saveState(state: CircuitState): Promise<void> {
    if (!this.redis) {
      this.#memoryState = { ...state };
      return;
    }
    try {
      await this.redis.set(CIRCUIT_KEY, JSON.stringify(state));
    } catch {
      this.#memoryState = { ...state };
    }
  }

  async allowRequest(): Promise<boolean> {
    const state = await this.getState();

    if (state.state === "open") {
      if (Date.now() - state.openedAt >= OPEN_TIMEOUT_MS) {
        state.state = "half_open";
        await this.saveState(state);
        return true;
      }
      return false;
    }

    return true;
  }

  async recordSuccess(): Promise<void> {
    await this.saveState({ failures: 0, lastFailure: 0, state: "closed", openedAt: 0 });
  }

  async recordFailure(): Promise<void> {
    const state = await this.getState();
    state.failures += 1;
    state.lastFailure = Date.now();

    if (state.failures >= FAILURE_THRESHOLD) {
      state.state = "open";
      state.openedAt = Date.now();
    }

    await this.saveState(state);
  }
}

interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
}

const circuitBreaker = new CircuitBreaker();

function snapshotIsFresh(snapshot: PriceSnapshot): boolean {
  return Date.now() - snapshot.polledAt < CACHE_FRESHNESS_MS;
}

function snapshotToApiFormat(
  snapshot: PriceSnapshot,
): { usd: number; usd_24h_change: number | null; last_updated_at: number } {
  return {
    usd: snapshot.usd,
    usd_24h_change: snapshot.usd24hChange,
    last_updated_at: snapshot.lastUpdatedAt,
  };
}

async function fetchPricesWithCache(
  coinIds: string[],
  store: PersistentStore,
): Promise<{
  data: Record<string, { usd: number; usd_24h_change: number | null; last_updated_at: number }>;
  source: "cache" | "api" | "stale_cache";
}> {
  const freshSnapshots: PriceSnapshot[] = [];
  const staleCoinIds: string[] = [];
  const staleSnapshots: PriceSnapshot[] = [];

  for (const coinId of coinIds) {
    const snapshot = await store.getLatestPriceSnapshot(coinId);
    if (snapshot && snapshotIsFresh(snapshot)) {
      freshSnapshots.push(snapshot);
    } else if (snapshot) {
      staleCoinIds.push(coinId);
      staleSnapshots.push(snapshot);
    } else {
      staleCoinIds.push(coinId);
    }
  }

  if (staleCoinIds.length === 0) {
    const result: Record<string, { usd: number; usd_24h_change: number | null; last_updated_at: number }> = {};
    for (const s of freshSnapshots) {
      result[s.coinId] = snapshotToApiFormat(s);
    }
    return { data: result, source: "cache" };
  }

  const allowed = await circuitBreaker.allowRequest();

  if (!allowed) {
    const result: Record<string, { usd: number; usd_24h_change: number | null; last_updated_at: number }> = {};
    for (const s of freshSnapshots) {
      result[s.coinId] = snapshotToApiFormat(s);
    }
    for (const s of staleSnapshots) {
      if (!result[s.coinId]) {
        result[s.coinId] = snapshotToApiFormat(s);
      }
    }
    return { data: result, source: freshSnapshots.length === coinIds.length ? "cache" : "stale_cache" };
  }

  try {
    const apiData = await fetchPrices(staleCoinIds);
    await circuitBreaker.recordSuccess();

    const result: Record<string, { usd: number; usd_24h_change: number | null; last_updated_at: number }> = {};
    for (const s of freshSnapshots) {
      result[s.coinId] = snapshotToApiFormat(s);
    }
    for (const [coinId, price] of Object.entries(apiData)) {
      result[coinId] = price;
    }
    return { data: result, source: "api" };
  } catch (err) {
    await circuitBreaker.recordFailure();

    const result: Record<string, { usd: number; usd_24h_change: number | null; last_updated_at: number }> = {};
    for (const s of freshSnapshots) {
      result[s.coinId] = snapshotToApiFormat(s);
    }
    for (const s of staleSnapshots) {
      if (!result[s.coinId]) {
        result[s.coinId] = snapshotToApiFormat(s);
      }
    }

    if (Object.keys(result).length > 0) {
      console.error(
        "[CryptoWatchr] CoinGecko API failed, serving stale cache",
        err instanceof Error ? err.message : String(err),
      );
      return { data: result, source: "stale_cache" };
    }

    throw err;
  }
}

export default function (
  store: PersistentStore,
): Composer<BotContext<Record<string, unknown>>> {
  const composer = new Composer<BotContext<Record<string, unknown>>>();

  composer.command("price", async (ctx) => {
    const raw = ctx.match?.trim();

    if (raw) {
      const ticker = raw.toUpperCase();
      const coinId = coinIdForTicker(ticker);
      if (!coinId) {
        await ctx.reply(
          `"${ticker}" is not a recognized ticker. Try a known ticker like BTC, ETH, or SOL.`,
          { reply_markup: mainMenu() },
        );
        return;
      }
      try {
        const { data } = await fetchPricesWithCache([coinId], store);
        const text = formatPriceDisplay(data, [{ ticker, coinId }]);
        await ctx.reply(text, { reply_markup: mainMenu() });
      } catch {
        await ctx.reply(PRICE_UNAVAILABLE_TEXT, {
          reply_markup: mainMenu(),
        });
      }
      return;
    }

    let entries: WatchlistEntry[];
    try {
      entries = await store.getWatchlist(ctx.chat!.id);
    } catch {
      await ctx.reply(
        "Something went wrong. Please try again or use /help for assistance.",
      );
      return;
    }

    if (entries.length === 0) {
      await ctx.reply(EMPTY_WATCHLIST_TEXT, { reply_markup: mainMenu() });
      return;
    }

    const coinIds = [...new Set(entries.map((e) => e.coinId))];
    try {
      const { data } = await fetchPricesWithCache(coinIds, store);
      const text = formatPriceDisplay(
        data,
        entries.map((e) => ({ ticker: e.ticker, coinId: e.coinId })),
      );
      await ctx.reply(text, { reply_markup: mainMenu() });
    } catch {
      await ctx.reply(PRICE_UNAVAILABLE_TEXT, {
        reply_markup: mainMenu(),
      });
    }
  });

  return composer;
}

export const handledCommands = ["price"];