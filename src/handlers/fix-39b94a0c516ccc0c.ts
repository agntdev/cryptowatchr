import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import type { Session } from "../bot.js";

const composer = new Composer<BotContext<Session>>();

composer.callbackQuery("alert:type:percent", async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Percent alerts coming soon." });
});

export default composer;
