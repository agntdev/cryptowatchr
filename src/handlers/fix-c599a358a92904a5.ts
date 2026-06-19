import { Composer } from "grammy";
import { inlineKeyboard, type BotContext } from "../toolkit/index.js";
import type { Session } from "../bot.js";

const WELCOME_TEXT = [
  "Welcome to CryptoWatchr!",
  "",
  "Track cryptocurrencies, create price alerts, check the latest prices, and tune your quiet hours \u2014 all from Telegram.",
  "",
  "Let\u2019s get you set up. What\u2019s your timezone?",
  "You can also type a custom timezone like UTC+2 or America/New_York.",
].join("\n");

function timezoneKeyboard() {
  return inlineKeyboard([
    [
      { text: "UTC-8 (PST)", callback_data: "onboard:tz:UTC-8" },
      { text: "UTC-5 (EST)", callback_data: "onboard:tz:UTC-5" },
    ],
    [
      { text: "UTC+0 (GMT)", callback_data: "onboard:tz:UTC+0" },
      { text: "UTC+3 (MSK)", callback_data: "onboard:tz:UTC+3" },
    ],
    [
      { text: "UTC+8 (CST)", callback_data: "onboard:tz:UTC+8" },
      { text: "Skip for now", callback_data: "onboard:skip" },
    ],
  ]);
}

function clearSessions(session: Session): void {
  session.alertStep = undefined;
  session.alertCoin = undefined;
  session.alertDirection = undefined;
  session.alertPctCoin = undefined;
  session.alertPctPercent = undefined;
  session.alertPctTimeframe = undefined;
  session.alertManageStep = undefined;
  session.editingRuleId = undefined;
  session.tempEditPercent = undefined;
  session.watchlistStep = undefined;
  session.summaryStep = undefined;
}

const composer = new Composer<BotContext<Session>>();

composer.command("start", async (ctx) => {
  clearSessions(ctx.session);
  ctx.session.onboardingStep = "timezone";
  await ctx.reply(WELCOME_TEXT, { reply_markup: timezoneKeyboard() });
});

export default composer;