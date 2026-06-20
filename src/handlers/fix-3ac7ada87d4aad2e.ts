import { Composer } from "grammy";
import { menuKeyboard, type BotContext } from "../toolkit/index.js";
import { fetchPrices, formatPriceDisplay, PriceFetchError } from "../price.js";
import { coinIdForTicker } from "../bot.js";
import type { PersistentStore, WatchlistEntry } from "../store.js";

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
        const data = await fetchPrices([coinId]);
        const text = formatPriceDisplay(data, [{ ticker, coinId }]);
        await ctx.reply(text, { reply_markup: mainMenu() });
      } catch (err) {
        console.error("[CryptoWatchr] price fetch error", {
          userId: ctx.chat?.id ?? "unknown",
          ticker,
          coinId,
          error: err instanceof Error ? err.message : String(err),
        });
        await ctx.reply(PRICE_UNAVAILABLE_TEXT, {
          reply_markup: mainMenu(),
        });
      }
      return;
    }

    let entries: WatchlistEntry[];
    try {
      entries = await store.getWatchlist(ctx.chat!.id);
    } catch (err) {
      console.error("[CryptoWatchr] failed to load watchlist", {
        userId: ctx.chat!.id,
        error: err instanceof Error ? err.message : String(err),
      });
      await ctx.reply(
        "Something went wrong. Please try again or use /help for assistance.",
      );
      return;
    }

    if (entries.length === 0) {
      await ctx.reply(EMPTY_WATCHLIST_TEXT, { reply_markup: mainMenu() });
      return;
    }

    const invalidTickers: string[] = [];

    for (const entry of entries) {
      if (!coinIdForTicker(entry.ticker)) {
        try {
          await store.removeFromWatchlist(ctx.chat!.id, entry.ticker);
          invalidTickers.push(entry.ticker);
        } catch (err) {
          console.error("[CryptoWatchr] failed to remove invalid ticker from watchlist", {
            userId: ctx.chat!.id,
            ticker: entry.ticker,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    if (invalidTickers.length > 0) {
      const tickersList = invalidTickers.join(", ");
      const warning =
        invalidTickers.length === 1
          ? `${tickersList} is no longer a supported ticker and has been removed from your watchlist.`
          : `The following tickers are no longer supported and have been removed from your watchlist: ${tickersList}.`;
      await ctx.reply(warning);
    }

    const validEntries = entries.filter((e) => coinIdForTicker(e.ticker) !== null);

    if (validEntries.length === 0) {
      await ctx.reply(EMPTY_WATCHLIST_TEXT, { reply_markup: mainMenu() });
      return;
    }

    const coinIds = [...new Set(validEntries.map((e) => e.coinId))];
    try {
      const data = await fetchPrices(coinIds);
      const text = formatPriceDisplay(
        data,
        validEntries.map((e) => ({ ticker: e.ticker, coinId: e.coinId })),
      );
      await ctx.reply(text, { reply_markup: mainMenu() });
    } catch (err) {
      console.error("[CryptoWatchr] price fetch error", {
        userId: ctx.chat?.id ?? "unknown",
        coinIds,
        error: err instanceof Error ? err.message : String(err),
      });
      await ctx.reply(PRICE_UNAVAILABLE_TEXT, {
        reply_markup: mainMenu(),
      });
    }
  });

  return composer;
}

export const handledCommands = ["price"];
