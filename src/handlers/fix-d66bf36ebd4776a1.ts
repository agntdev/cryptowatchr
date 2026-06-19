import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import type { Session } from "../bot.js";
import type { PersistentStore } from "../store.js";

export default function (
  store: PersistentStore,
): Composer<BotContext<Session>> {
  const composer = new Composer<BotContext<Session>>();

  composer.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (userId != null) {
      try {
        await store.recordUserActivity(userId);
      } catch {
        // best-effort; do not block user interaction
      }
    }
    await next();
  });

  return composer;
}