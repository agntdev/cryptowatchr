import { Composer } from "grammy";
import { menuKeyboard, type BotContext } from "../toolkit/index.js";
import type { Session } from "../bot.js";

const ORIGINAL_MAIN_MENU_DATA = new Set([
  "menu:add",
  "menu:watchlist",
  "menu:alerts",
  "menu:price",
  "menu:settings",
  "menu:help",
]);

function mainMenuWithAlerts() {
  return menuKeyboard(
    [
      { text: "Add Coin", data: "menu:add" },
      { text: "My Watchlist", data: "menu:watchlist" },
      { text: "Create Alert", data: "menu:alerts" },
      { text: "My Alerts", data: "menu:myalerts" },
      { text: "Price Check", data: "menu:price" },
      { text: "Settings", data: "menu:settings" },
      { text: "Help", data: "menu:help" },
    ],
    2,
  );
}

function isMainMenuMissingAlerts(replyMarkup: unknown): boolean {
  if (!replyMarkup || typeof replyMarkup !== "object") return false;
  const rm = replyMarkup as Record<string, unknown>;
  const ik = rm["inline_keyboard"];
  if (!Array.isArray(ik)) return false;
  const buttons = ik.flat();
  if (buttons.length !== 6) return false;
  const callbackData = new Set<string>();
  for (const btn of buttons) {
    if (!btn || typeof btn !== "object") return false;
    const cd = (btn as Record<string, unknown>)["callback_data"];
    if (typeof cd !== "string") return false;
    callbackData.add(cd);
  }
  if (callbackData.size !== 6) return false;
  for (const cd of callbackData) {
    if (!cd.startsWith("menu:")) return false;
    if (!ORIGINAL_MAIN_MENU_DATA.has(cd)) return false;
  }
  return true;
}

interface MutablePayload {
  reply_markup?: unknown;
  [key: string]: unknown;
}

let transformerInstalled = false;

export default function (): Composer<BotContext<Session>> {
  const composer = new Composer<BotContext<Session>>();

  composer.use(async (ctx, next) => {
    if (!transformerInstalled) {
      transformerInstalled = true;
      ctx.api.config.use((prev, method, payload, signal) => {
        if (method !== "sendMessage" && method !== "editMessageText") {
          return prev(method, payload, signal);
        }
        const p = payload as MutablePayload;
        if (isMainMenuMissingAlerts(p.reply_markup)) {
          return prev(method, { ...p, reply_markup: mainMenuWithAlerts() } as typeof payload, signal);
        }
        return prev(method, payload, signal);
      });
    }
    return next();
  });

  return composer;
}
