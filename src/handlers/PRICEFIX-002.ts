import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import { fetchPrices, PriceFetchError } from "../price.js";

export const MAX_RETRIES = 3;
export const RETRY_DELAYS_MS = [1000, 2000, 4000];

export async function fetchPricesWithRetry<S extends object>(
  coinIds: string[],
  ctx: BotContext<S>,
): Promise<ReturnType<typeof fetchPrices>> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchPrices(coinIds);
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

export default new Composer<BotContext<Record<string, unknown>>>();