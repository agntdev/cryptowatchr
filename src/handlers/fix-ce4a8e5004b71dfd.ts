import { Composer } from "grammy";
import { type BotContext, menuKeyboard } from "../toolkit/index.js";
import { formatPriceDisplay, PriceFetchError } from "../price.js";
import { coinIdForTicker } from "../bot.js";
import type { PersistentStore, WatchlistEntry } from "../store.js";
import { fetchPricesWithCache } from "./PRICEFIX-004.js";

const PRICE_UNAVAILABLE_TEXT =
  "Price service temporarily unavailable. Please try again in a moment.";

const EMPTY_WATCHLIST_TEXT =
  "Your watchlist is empty.\n\nUse the Add Coin menu or type a ticker to start building your watchlist.";

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

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

async function fetchPricesWithCacheRetry(
  coinIds: string[],
  store: PersistentStore,
  ctx: BotContext<Record<string, unknown>>,
): Promise<{ data: Record<string, { usd: number; usd_24h_change: number | null; last_updated_at: number }>; source: string }> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchPricesWithCache(coinIds, store);
    } catch (err) {
      lastError = err;
      const chatId = ctx.chat?.id ?? "unknown";
      if (err instanceof PriceFetchError) {
        console.error("[CryptoWatchr] price fetch error", {
          chatId,
          coinIds,
          kind: err.kind,
          message: err.message,
          details: err.details,
          attempt: attempt + 1,
        });
      } else {
        console.error("[CryptoWatchr] price fetch unexpected error", {
          chatId,
          coinIds,
          error: String(err),
          attempt: attempt + 1,
        });
      }

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS_MS[attempt] ?? 4000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

async function validateWatchlistTickers(
  store: PersistentStore,
  userId: number,
): Promise<string[]> {
  const invalidTickers: string[] = [];
  let entries: WatchlistEntry[];

  try {
    entries = await store.getWatchlist(userId);
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!coinIdForTicker(entry.ticker)) {
      try {
        await store.removeFromWatchlist(userId, entry.ticker);
        invalidTickers.push(entry.ticker);
      } catch {
        // best-effort removal
      }
    }
  }

  return invalidTickers;
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
        const { data } = await fetchPricesWithCacheRetry([coinId], store, ctx);
        const text = formatPriceDisplay(data, [{ ticker, coinId }]);
        await ctx.reply(text, { reply_markup: mainMenu() });
      } catch {
        await ctx.reply(PRICE_UNAVAILABLE_TEXT, {
          reply_markup: mainMenu(),
        });
      }
      return;
    }

    const invalidTickers = await validateWatchlistTickers(store, ctx.chat!.id);
    if (invalidTickers.length > 0) {
      const tickersList = invalidTickers.join(", ");
      const warning =
        invalidTickers.length === 1
          ? `${tickersList} is no longer a supported ticker and has been removed from your watchlist.`
          : `The following tickers are no longer supported and have been removed from your watchlist: ${tickersList}.`;
      await ctx.reply(warning);
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
      const { data } = await fetchPricesWithCacheRetry(coinIds, store, ctx);
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