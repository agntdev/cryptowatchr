import { Composer, Bot } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import type { Session } from "../bot.js";
import type { PersistentStore, WatchlistEntry } from "../store.js";
import { fetchPrices, formatPriceDisplay } from "../price.js";

const SUMMARY_POLL_INTERVAL_MS = 30_000;
const SUMMARY_DEDUP_MS = 22 * 60 * 60 * 1000;

function getLocalTimeForTimezone(
  now: Date,
  timezone: string,
): { hours: number; minutes: number } {
  const utcMatch = timezone.match(/^UTC([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (utcMatch) {
    const sign = utcMatch[1] === "+" ? 1 : -1;
    const h = parseInt(utcMatch[2], 10);
    const m = parseInt(utcMatch[3] || "0", 10);
    const offsetMinutes = sign * (h * 60 + m);
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const localMinutes = (utcMinutes + offsetMinutes + 1440) % 1440;
    return {
      hours: Math.floor(localMinutes / 60),
      minutes: localMinutes % 60,
    };
  }

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const h = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    const m = parseInt(
      parts.find((p) => p.type === "minute")?.value || "0",
      10,
    );
    return { hours: h, minutes: m };
  } catch {
    return { hours: now.getUTCHours(), minutes: now.getUTCMinutes() };
  }
}

function formatSummaryMessage(
  entries: WatchlistEntry[],
  priceData: Record<
    string,
    { usd: number; usd_24h_change: number | null; last_updated_at: number }
  >,
  time: string,
): string {
  const body = formatPriceDisplay(
    priceData,
    entries.map((e) => ({ ticker: e.ticker, coinId: e.coinId })),
  );
  return `*Daily Summary* \u2014 ${time}\n\n${body}`;
}

function startSummaryScheduler(
  store: PersistentStore,
  sendMessage: (chatId: number, text: string) => Promise<unknown>,
): () => void {
  let running = true;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function check(): Promise<void> {
    if (!running) return;

    try {
      const configs = await store.getAllMorningSummaryConfigs();
      if (configs.length === 0) return;

      const now = Date.now();
      const nowDate = new Date(now);

      for (const config of configs) {
        try {
          const tz = await store.getTimezone(config.userId);
          if (!tz) continue;

          const localTime = getLocalTimeForTimezone(nowDate, tz);
          const localTimeStr = `${String(localTime.hours).padStart(2, "0")}:${String(localTime.minutes).padStart(2, "0")}`;

          if (localTimeStr !== config.time) continue;

          const lastSent = await store.getLastSummarySent(config.userId);
          if (lastSent && now - lastSent < SUMMARY_DEDUP_MS) continue;

          const watchlist = await store.getWatchlist(config.userId);
          if (watchlist.length === 0) continue;

          const coinIds = [...new Set(watchlist.map((e) => e.coinId))];
          const priceData = await fetchPrices(coinIds);
          if (!priceData || Object.keys(priceData).length === 0) continue;

          const text = formatSummaryMessage(watchlist, priceData, config.time);
          try {
            await sendMessage(config.userId, text);
          } catch (err) {
            console.error(
              "[CryptoWatchr] failed to send summary message:",
              err,
            );
          }

          await store.recordSummarySent(config.userId);
          console.info(
            "[CryptoWatchr] morning summary sent:",
            `user=${config.userId}`,
            `time=${config.time}`,
            `coins=${coinIds.length}`,
          );
        } catch (err) {
          console.error(
            "[CryptoWatchr] summary check failed for user:",
            err,
          );
        }
      }
    } catch (err) {
      console.error("[CryptoWatchr] summary scheduler error:", err);
    } finally {
      if (running) {
        timer = setTimeout(check, SUMMARY_POLL_INTERVAL_MS);
      }
    }
  }

  timer = setTimeout(check, 0);

  return () => {
    running = false;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

export default function (
  store: PersistentStore,
): Composer<BotContext<Session>> {
  const composer = new Composer<BotContext<Session>>();

  const token = process.env.BOT_TOKEN;
  if (token) {
    const notifyBot = new Bot(token);
    startSummaryScheduler(store, (chatId, text) =>
      notifyBot.api.sendMessage(chatId, text, { parse_mode: "Markdown" }),
    );
  }

  return composer;
}
