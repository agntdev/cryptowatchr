import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import { coinIdForTicker } from "../bot.js";
import type { Session } from "../bot.js";
import { createStore } from "../store.js";

const composer = new Composer<BotContext<Session>>();

composer.command("price", async (ctx) => {
  const raw = ctx.match?.trim();
  if (raw) return;

  const store = createStore();

  let entries;
  try {
    entries = await store.getWatchlist(ctx.chat!.id);
  } catch (err) {
    console.error("[CryptoWatchr] failed to load watchlist for /price cleanup", {
      chatId: ctx.chat!.id,
      error: err instanceof Error ? err.message : String(err),
    });
    await ctx.reply(
      "Something went wrong. Please try again or use /help for assistance.",
    );
    return;
  }

  if (entries.length === 0) return;

  const invalidTickers: string[] = [];

  for (const entry of entries) {
    if (!coinIdForTicker(entry.ticker)) {
      try {
        await store.removeFromWatchlist(ctx.chat!.id, entry.ticker);
        invalidTickers.push(entry.ticker);
      } catch {
        // best-effort removal
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
});

export default composer;