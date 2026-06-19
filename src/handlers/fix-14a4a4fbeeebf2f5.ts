import { Composer } from "grammy";
import { menuKeyboard } from "../toolkit/index.js";

const MENU_ITEMS = [
  { text: "Add Coin", data: "menu:add" },
  { text: "My Watchlist", data: "menu:watchlist" },
  { text: "Create Alert", data: "menu:alerts" },
  { text: "My Alerts", data: "menu:myalerts" },
  { text: "Price Check", data: "menu:price" },
  { text: "Settings", data: "menu:settings" },
  { text: "Help", data: "menu:help" },
];

export function installMenuFix(api: {
  config: {
    use: (
      fn: (
        prev: (method: string, payload: Record<string, unknown>, signal?: AbortSignal) => unknown,
        method: string,
        payload: Record<string, unknown>,
        signal?: AbortSignal,
      ) => unknown,
    ) => void;
  };
}): void {
  api.config.use(
    (
      prev: (method: string, payload: Record<string, unknown>, signal?: AbortSignal) => unknown,
      method: string,
      payload: Record<string, unknown>,
      signal?: AbortSignal,
    ) => {
      if (
        (method === "sendMessage" || method === "editMessageText") &&
        payload?.reply_markup &&
        typeof payload.reply_markup === "object" &&
        "inline_keyboard" in (payload.reply_markup as Record<string, unknown>)
      ) {
        const rows = (payload.reply_markup as { inline_keyboard: Array<Array<{ callback_data?: string }>> }).inline_keyboard;
        const hasMenuAdd = rows.some((r) =>
          r.some((b) => b.callback_data === "menu:add"),
        );
        const hasMyAlerts = rows.some((r) =>
          r.some((b) => b.callback_data === "menu:myalerts"),
        );
        if (hasMenuAdd && !hasMyAlerts) {
          payload.reply_markup = menuKeyboard(MENU_ITEMS, 2);
        }
      }
      return prev(method, payload, signal);
    },
  );
}

const composer = new Composer();

composer.use(async (ctx, next) => {
  const api = ctx.api as unknown as {
    __myalerts_menu_fixed?: boolean;
    config: {
      use: (
        fn: (
          prev: (method: string, payload: Record<string, unknown>, signal?: AbortSignal) => unknown,
          method: string,
          payload: Record<string, unknown>,
          signal?: AbortSignal,
        ) => unknown,
      ) => void;
    };
  };
  if (!api.__myalerts_menu_fixed) {
    api.__myalerts_menu_fixed = true;
    installMenuFix(api);
  }
  await next();
});

export default composer;