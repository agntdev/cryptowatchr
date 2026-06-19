import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import type { Session } from "../bot.js";
import type { PersistentStore } from "../store.js";

const CLEANUP_INTERVAL_MS = 60_000;

export default function (store: PersistentStore): Composer<BotContext<Session>> {
  const composer = new Composer<BotContext<Session>>();

  void store.cleanupExpiredSentAlerts().catch((err) => {
    console.error("[CryptoWatchr] initial sent_alerts cleanup failed:", err);
  });

  setInterval(() => {
    store.cleanupExpiredSentAlerts().catch((err) => {
      console.error("[CryptoWatchr] periodic sent_alerts cleanup failed:", err);
    });
  }, CLEANUP_INTERVAL_MS);

  return composer;
}
