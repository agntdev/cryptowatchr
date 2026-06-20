import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import { coinIdForTicker } from "../bot.js";
import type { PersistentStore } from "../store.js";
import type { Session } from "../bot.js";

function isPricefixWarning(text: string): boolean {
  return (
    text.includes("is no longer a supported ticker and has been removed from your watchlist.") ||
    text.includes("are no longer supported and have been removed from your watchlist:")
  );
}

function isPriceDisplay(text: string): boolean {
  return (
    text.includes("Updated:") &&
    (text.includes("\u2022") || text.includes("\u2014"))
  );
}

export default function (
  store: PersistentStore,
): Composer<BotContext<Session>> {
  const composer = new Composer<BotContext<Session>>();

  let installed = false;

  composer.use(async (ctx, next) => {
    if (!installed) {
      installed = true;
      ctx.api.config.use((prev, method, payload, signal) => {
        if (
          payload &&
          typeof payload === "object" &&
          method === "sendMessage" &&
          "text" in payload &&
          typeof (payload as { text: unknown }).text === "string" &&
          "chat_id" in payload
        ) {
          const text = (payload as { text: string }).text;
          const chatId = (payload as { chat_id: number | string }).chat_id;

          if (isPricefixWarning(text)) {
            return Promise.resolve({ ok: true, result: null } as ReturnType<
              typeof prev
            >);
          }

          if (isPriceDisplay(text)) {
            return (async () => {
              try {
                const entries = await store.getWatchlist(Number(chatId));
                const invalidTickers: string[] = [];

                for (const entry of entries) {
                  if (!coinIdForTicker(entry.ticker)) {
                    try {
                      await store.removeFromWatchlist(
                        Number(chatId),
                        entry.ticker,
                      );
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

                  const modifiedText = warning + "\n\n" + text;
                  return prev(method, { ...payload, text: modifiedText }, signal);
                }
              } catch {
                // pass through original on validation failure
              }

              return prev(method, payload, signal);
            })();
          }
        }

        return prev(method, payload, signal);
      });
    }
    return next();
  });

  return composer;
}