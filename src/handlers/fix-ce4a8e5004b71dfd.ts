import { Composer } from "grammy";
import { type BotContext, menuKeyboard } from "../toolkit/index.js";
import { formatPriceDisplay } from "../price.js";
import { coinIdForTicker } from "../bot.js";
import type { Session } from "../bot.js";
import type { PersistentStore, WatchlistEntry } from "../store.js";
import { validateAndCleanWatchlist } from "./PRICEFIX-003.js";
import {
  fetchPricesWithCache,
  PRICE_UNAVAILABLE_TEXT,
  EMPTY_WATCHLIST_TEXT,
} from "./PRICEFIX-004.js";

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
): Composer<BotContext<Session>> {
  const composer = new Composer<BotContext<Session>>();

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

    const invalidTickers = await validateAndCleanWatchlist(ctx, store);

    let entries: WatchlistEntry[];
    try {
      entries = await store.getWatchlist(ctx.chat!.id);
    } catch {
      await ctx.reply(
        "Something went wrong. Please try again or use /help for assistance.",
      );
      return;
    }

    if (invalidTickers.length > 0) {
      const tickersList = invalidTickers.join(", ");
      const warning =
        invalidTickers.length === 1
          ? `${tickersList} is no longer a supported ticker and has been removed from your watchlist.`
          : `The following tickers are no longer supported and have been removed from your watchlist: ${tickersList}.`;
      await ctx.reply(warning);
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