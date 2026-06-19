import { Composer } from "grammy";
import { menuKeyboard, type BotContext } from "../toolkit/index.js";
import type { Session } from "../bot.js";
import type { PersistentStore } from "../store.js";
import { fetchPrices, formatPriceDisplay, PriceFetchError } from "../price.js";

const EMPTY_WATCHLIST_TEXT = "Your watchlist is empty.\n\nUse the Add Coin menu or type a ticker to start building your watchlist.";

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

function priceErrorMessage(kind: "network" | "rate_limit" | "server" | "unknown"): string {
  switch (kind) {
    case "network":
      return "The price service is unreachable. Please check your connection and try again.";
    case "rate_limit":
      return "The price service is busy. Please wait a moment and try again.";
    case "server":
      return "The price service is experiencing issues. Please try again later.";
    default:
      return "Unable to fetch price data right now. Please try again later.";
  }
}

function clearAlertSession(session: Session) {
  session.alertStep = undefined;
  session.alertCoin = undefined;
  session.alertDirection = undefined;
  session.alertPctCoin = undefined;
  session.alertPctPercent = undefined;
  session.alertPctTimeframe = undefined;
}

function clearAlertManageSession(session: Session) {
  session.alertManageStep = undefined;
  session.editingRuleId = undefined;
  session.tempEditPercent = undefined;
}

function clearWatchlistSession(session: Session) {
  session.watchlistStep = undefined;
}

export default function (store: PersistentStore): Composer<BotContext<Session>> {
  const composer = new Composer<BotContext<Session>>();

  composer.callbackQuery("menu:price", async (ctx) => {
    clearAlertSession(ctx.session);
    clearAlertManageSession(ctx.session);
    clearWatchlistSession(ctx.session);

    let entries;
    try {
      entries = await store.getWatchlist(ctx.chat!.id);
    } catch {
      await ctx.answerCallbackQuery({ text: "Failed to load watchlist. Please try again." });
      return;
    }

    if (entries.length === 0) {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(EMPTY_WATCHLIST_TEXT, { reply_markup: mainMenu() });
      return;
    }

    try {
      const coinIds = [...new Set(entries.map((e) => e.coinId))];
      const data = await fetchPrices(coinIds);
      const text = formatPriceDisplay(data, entries.map((e) => ({ ticker: e.ticker, coinId: e.coinId })));
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(text, { reply_markup: mainMenu() });
    } catch (err) {
      const msg = err instanceof PriceFetchError
        ? priceErrorMessage(err.kind)
        : "Unable to fetch price data right now. Please try again later.";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(msg, { reply_markup: mainMenu() });
    }
  });

  return composer;
}