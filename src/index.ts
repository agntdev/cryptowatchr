import { fileURLToPath } from "node:url";
import { createBot, menuKeyboard, inlineKeyboard } from "@agntdev/bot-toolkit";

export interface Session {
  initializedAt: string;
  onboardingStep?: "timezone" | "confirm" | "quietStart" | "quietEnd";
  timezone?: string;
  quietStart?: string;
  quietEnd?: string;
}

const WELCOME_TEXT = [
  "Welcome to CryptoWatchr!",
  "",
  "Track cryptocurrencies, create price alerts, check the latest prices, and tune your quiet hours \u2014 all from Telegram.",
  "",
  "Let\u2019s get you set up. What\u2019s your timezone?",
  "You can also type a custom timezone like UTC+2 or America/New_York.",
].join("\n");

const DEFAULT_QUIET_START = "22:00";
const DEFAULT_QUIET_END = "07:00";
const DEFAULT_COOLDOWN_HOURS = 1;

const LANGUAGE_TO_TZ: Record<string, string> = {
  ru: "UTC+3",
  uk: "UTC+3",
  be: "UTC+3",
  kk: "UTC+3",
  tr: "UTC+3",
  ar: "UTC+3",
  zh: "UTC+8",
  ja: "UTC+9",
  ko: "UTC+9",
  th: "UTC+7",
  vi: "UTC+7",
  id: "UTC+7",
  hi: "UTC+5:30",
  bn: "UTC+6",
  ur: "UTC+5",
  fa: "UTC+3:30",
  pt: "UTC-3",
  fr: "UTC+1",
  de: "UTC+1",
  es: "UTC+1",
  it: "UTC+1",
  nl: "UTC+1",
  pl: "UTC+1",
  sv: "UTC+1",
  nb: "UTC+1",
  da: "UTC+1",
  fi: "UTC+2",
  el: "UTC+2",
  ro: "UTC+2",
  bg: "UTC+2",
  cs: "UTC+1",
  sk: "UTC+1",
  hu: "UTC+1",
};

function detectTimezone(languageCode?: string): string {
  if (languageCode) {
    const tz = LANGUAGE_TO_TZ[languageCode] ?? LANGUAGE_TO_TZ[languageCode.split("-")[0]];
    if (tz) return tz;
  }
  return "UTC+0";
}

function confirmText(tz: string, detected?: boolean) {
  return [
    `Timezone set to ${tz}.${detected ? " (Auto-detected from your language settings.)" : ""}`,
    "",
    "Your default settings:",
    `\u2022 Quiet hours: ${DEFAULT_QUIET_START}\u2013${DEFAULT_QUIET_END} (alerts suppressed while you sleep)`,
    `\u2022 Alert cooldown: ${DEFAULT_COOLDOWN_HOURS} hour (no repeat alerts for the same rule)`,
    "",
    "Use the button below to customize quiet hours, or continue to the menu.",
  ].join("\n");
}

const MAIN_MENU_TEXT = [
  "Welcome to CryptoWatchr.",
  "",
  "Track coins, create price alerts, check the latest prices, and tune your quiet hours from the menu below.",
].join("\n");

const HELP_TEXT = [
  "*CryptoWatchr Help*",
  "",
  "Available commands:",
  "/start — Set up your CryptoWatchr profile and open the main menu",
  "/help — Show this help message",
  "",
  "You can also use the menu buttons below to manage your watchlist, create alerts, check prices, and configure settings.",
].join("\n");

const MENU_RESPONSES: Record<string, string> = {
  "menu:add": "Add Coin will let you add BTC, ETH, TON, or a custom ticker to your watchlist.",
  "menu:watchlist": "My Watchlist will show your tracked coins and remove buttons.",
  "menu:alerts": "Create Alert will guide you through threshold and percent-move alerts.",
  "menu:price": "Price Check will show current prices for one coin or your full watchlist.",
  "menu:settings": "Settings will manage timezone, quiet hours, cooldown, and morning summaries.",
  "menu:help": "Help will list commands and explain how CryptoWatchr alerts work.",
};

function mainMenu() {
  return menuKeyboard(
    [
      { text: "Add Coin", data: "menu:add" },
      { text: "My Watchlist", data: "menu:watchlist" },
      { text: "Create Alert", data: "menu:alerts" },
      { text: "Price Check", data: "menu:price" },
      { text: "Settings", data: "menu:settings" },
      { text: "Help", data: "menu:help" },
    ],
    2,
  );
}

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

function confirmKeyboard() {
  return inlineKeyboard([
    [{ text: "Customize quiet hours", callback_data: "onboard:quiet" }],
    [{ text: "Continue to menu", callback_data: "onboard:done" }],
  ]);
}

const QUIET_START_TEXT = [
  "Let's set up your quiet hours — alerts will be suppressed during this window.",
  "",
  "What time should quiet hours *start*?",
  "You can also type a custom time like 23:30.",
].join("\n");

const QUIET_END_TEXT = [
  "What time should quiet hours *end*?",
].join("\n");

function quietStartKeyboard() {
  return inlineKeyboard([
    [
      { text: "20:00", callback_data: "quiet:start:20:00" },
      { text: "21:00", callback_data: "quiet:start:21:00" },
    ],
    [
      { text: "22:00", callback_data: "quiet:start:22:00" },
      { text: "23:00", callback_data: "quiet:start:23:00" },
    ],
    [
      { text: "Use default (22:00)", callback_data: "quiet:start:default" },
    ],
  ]);
}

function quietEndKeyboard() {
  return inlineKeyboard([
    [
      { text: "06:00", callback_data: "quiet:end:06:00" },
      { text: "07:00", callback_data: "quiet:end:07:00" },
    ],
    [
      { text: "08:00", callback_data: "quiet:end:08:00" },
      { text: "09:00", callback_data: "quiet:end:09:00" },
    ],
    [
      { text: "Use default (07:00)", callback_data: "quiet:end:default" },
    ],
  ]);
}

function quietHoursSummary(start: string, end: string) {
  return [
    "Quiet hours set!",
    "",
    `\u2022 Start: ${start}`,
    `\u2022 End: ${end}`,
    "",
    "Alerts will be suppressed during this window.",
  ].join("\n");
}

export function makeBot(token = process.env.BOT_TOKEN ?? "test:cryptowatchr") {
  const bot = createBot<Session>(token, {
    initial: () => ({ initializedAt: new Date(0).toISOString() }),
    onError: async (err) => {
      console.error("[CryptoWatchr] unhandled error:", err);
      const botErr = err as { error: unknown; ctx?: { reply?: (text: string) => Promise<unknown>; chat?: { id: number } } };
      if (botErr.ctx?.chat?.id && typeof botErr.ctx.reply === "function") {
        try {
          await botErr.ctx.reply("Something went wrong. Please try again or use /help for assistance.");
        } catch {
          // best-effort reply; ignore if it also fails
        }
      }
    },
  });

  bot.command("start", async (ctx) => {
    ctx.session.onboardingStep = "timezone";
    await ctx.reply(WELCOME_TEXT, { reply_markup: timezoneKeyboard() });
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(HELP_TEXT, { parse_mode: "Markdown", reply_markup: mainMenu() });
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data.startsWith("onboard:tz:")) {
      const tz = data.slice("onboard:tz:".length);
      ctx.session.timezone = tz;
      ctx.session.onboardingStep = "confirm";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(confirmText(tz), { reply_markup: confirmKeyboard() });
      return;
    }

    if (data === "onboard:skip") {
      ctx.session.onboardingStep = undefined;
      ctx.session.timezone = detectTimezone(ctx.from?.language_code);
      ctx.session.quietStart = DEFAULT_QUIET_START;
      ctx.session.quietEnd = DEFAULT_QUIET_END;
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(MAIN_MENU_TEXT, { reply_markup: mainMenu() });
      return;
    }

    if (data === "onboard:quiet") {
      ctx.session.onboardingStep = "quietStart";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(QUIET_START_TEXT, { parse_mode: "Markdown", reply_markup: quietStartKeyboard() });
      return;
    }

    if (data === "onboard:done") {
      ctx.session.onboardingStep = undefined;
      ctx.session.quietStart = DEFAULT_QUIET_START;
      ctx.session.quietEnd = DEFAULT_QUIET_END;
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(MAIN_MENU_TEXT, { reply_markup: mainMenu() });
      return;
    }

    if (data.startsWith("quiet:start:")) {
      const val = data.slice("quiet:start:".length);
      const start = val === "default" ? DEFAULT_QUIET_START : val;
      ctx.session.quietStart = start;
      ctx.session.onboardingStep = "quietEnd";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(QUIET_END_TEXT, { parse_mode: "Markdown", reply_markup: quietEndKeyboard() });
      return;
    }

    if (data.startsWith("quiet:end:")) {
      const val = data.slice("quiet:end:".length);
      const end = val === "default" ? DEFAULT_QUIET_END : val;
      ctx.session.quietEnd = end;
      ctx.session.onboardingStep = undefined;
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(quietHoursSummary(ctx.session.quietStart!, end), { reply_markup: mainMenu() });
      return;
    }

    const response = MENU_RESPONSES[data];

    if (!response) {
      await ctx.answerCallbackQuery({ text: "Choose an option from the menu." });
      return;
    }

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(response, { reply_markup: mainMenu() });
  });

  bot.on("message", async (ctx) => {
    if (ctx.message?.text?.startsWith("/")) {
      await ctx.reply("Unknown command. Type /help to see available commands.");
      return;
    }

    if (ctx.session.onboardingStep === "timezone") {
      const tz = ctx.message?.text?.trim();
      if (tz) {
        ctx.session.timezone = tz;
        ctx.session.onboardingStep = "confirm";
        await ctx.reply(confirmText(tz), { reply_markup: confirmKeyboard() });
      }
      return;
    }

    if (ctx.session.onboardingStep === "quietStart") {
      const text = ctx.message?.text?.trim();
      if (text && /^\d{1,2}:\d{2}$/.test(text)) {
        ctx.session.quietStart = text;
        ctx.session.onboardingStep = "quietEnd";
        await ctx.reply(QUIET_END_TEXT, { parse_mode: "Markdown", reply_markup: quietEndKeyboard() });
      } else {
        await ctx.reply("Please enter a time in HH:MM format (e.g. 22:00 or 23:30).", { reply_markup: quietStartKeyboard() });
      }
      return;
    }

    if (ctx.session.onboardingStep === "quietEnd") {
      const text = ctx.message?.text?.trim();
      if (text && /^\d{1,2}:\d{2}$/.test(text)) {
        ctx.session.quietEnd = text;
        ctx.session.onboardingStep = undefined;
        await ctx.reply(quietHoursSummary(ctx.session.quietStart!, text), { reply_markup: mainMenu() });
      } else {
        await ctx.reply("Please enter a time in HH:MM format (e.g. 07:00 or 08:30).", { reply_markup: quietEndKeyboard() });
      }
      return;
    }

    await ctx.reply("CryptoWatchr is online. Send /start to begin setup.");
  });

  return bot;
}

async function main() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.error("BOT_TOKEN is required");
    process.exit(1);
  }

  const bot = makeBot(token);
  await bot.start();
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  void main();
}
