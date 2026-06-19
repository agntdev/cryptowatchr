import { Composer } from "grammy";
import { inlineKeyboard, type BotContext } from "../toolkit/index.js";
import { coinIdForTicker } from "../bot.js";
import type { Session } from "../bot.js";

const composer = new Composer<BotContext<Session>>();

composer.on("message:text", async (ctx, next) => {
  const session = ctx.session;

  if (session.alertStep === "coin") {
    const ticker = ctx.message.text.trim().toUpperCase();
    if (ticker.length < 2) {
      return next();
    }
    const coinId = coinIdForTicker(ticker);
    if (!coinId) {
      await ctx.reply(
        `"${ticker}" is not a recognized ticker. Please enter a valid ticker like BTC, ETH, or SOL.`,
        { reply_markup: inlineKeyboard([[{ text: "Back", callback_data: "alert:back:type" }]]) },
      );
      return;
    }
    return next();
  }

  if (session.alertStep === "pctCoin") {
    const ticker = ctx.message.text.trim().toUpperCase();
    if (ticker.length < 2 || ticker === "ANY") {
      return next();
    }
    const coinId = coinIdForTicker(ticker);
    if (!coinId) {
      await ctx.reply(
        `"${ticker}" is not a recognized ticker. Please enter a valid ticker like BTC, ETH, or SOL.`,
        { reply_markup: inlineKeyboard([[{ text: "Back", callback_data: "alert:back:type" }]]) },
      );
      return;
    }
    return next();
  }

  return next();
});

export default composer;
