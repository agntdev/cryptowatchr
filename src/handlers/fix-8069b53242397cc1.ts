import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";

export default function (): Composer<BotContext<Record<string, unknown>>> {
  const composer = new Composer<BotContext<Record<string, unknown>>>();
  composer.callbackQuery("bot:status", async (ctx) => { await ctx.answerCallbackQuery(); });
  return composer;
}
