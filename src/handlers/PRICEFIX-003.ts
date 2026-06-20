import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import { coinIdForTicker } from "../bot.js";
import type { Session } from "../bot.js";
import type { PersistentStore } from "../store.js";

export async function validateWatchlistTickers(
  store: PersistentStore,
  userId: number,
): Promise<string[]> {
  const invalidTickers: string[] = [];

  let entries;
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

export default new Composer<BotContext<Session>>();