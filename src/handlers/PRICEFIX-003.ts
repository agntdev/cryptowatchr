import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import { coinIdForTicker } from "../bot.js";
import type { Session } from "../bot.js";
import type { PersistentStore } from "../store.js";

const composer = new Composer<BotContext<Session>>();

export async function validateAndCleanWatchlist(
  ctx: BotContext<Session>,
  store: PersistentStore,
): Promise<string[]> {
  let entries;
  try {
    entries = await store.getWatchlist(ctx.chat!.id);
  } catch {
    return [];
  }

  if (entries.length === 0) return [];

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

  return invalidTickers;
}

export default composer;