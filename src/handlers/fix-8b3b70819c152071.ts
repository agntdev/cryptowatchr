import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import type { Session } from "../bot.js";

const composer = new Composer<BotContext<Session>>();
composer.callbackQuery("alerts:status", async (ctx) => { await ctx.answerCallbackQuery(); });

export default composer;
