import { Composer } from "grammy";
import { inlineKeyboard, type BotContext } from "../toolkit/index.js";
import type { PersistentStore, AlertRule } from "../store.js";
import type { Session } from "../bot.js";

const EMPTY_ALERTS_TEXT =
  "You don't have any alerts yet.\n\nUse Create Alert to set up price alerts for your coins.";

function formatAlertDescription(rule: AlertRule): string {
  if (rule.type === "threshold") {
    const formattedPrice = rule.price!.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${rule.coin} ${rule.direction} $${formattedPrice}`;
  }
  const formattedPercent = rule.percent!.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
  const coinLabel =
    rule.coin === "any" ? "any coin in your watchlist" : rule.coin;
  let timeframeLabel: string;
  const mins = rule.timeframeMinutes!;
  if (mins >= 60 && mins % 60 === 0) {
    const h = mins / 60;
    timeframeLabel = h === 1 ? "1 hour" : `${h} hours`;
  } else {
    timeframeLabel = `${mins} minutes`;
  }
  return `${coinLabel} moves more than ${formattedPercent}% in ${timeframeLabel}`;
}

function myAlertsText(rules: AlertRule[]): string {
  if (rules.length === 0) return EMPTY_ALERTS_TEXT;
  const lines = ["Your alerts:"];
  for (let i = 0; i < rules.length; i++) {
    lines.push(`${i + 1}. ${formatAlertDescription(rules[i])}`);
  }
  lines.push("", "Tap Edit to modify or Delete to remove an alert.");
  return lines.join("\n");
}

function myAlertsKeyboard(rules: AlertRule[]) {
  const rows = rules.map((r) => [
    { text: "Edit", callback_data: `alerts:edit:${r.id}` },
    { text: "Delete", callback_data: `alerts:delete:${r.id}` },
  ]);
  rows.push([{ text: "Back to menu", callback_data: "menu:back" }]);
  return inlineKeyboard(rows);
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

function isMainMenuKeyboard(kb: unknown): kb is Array<Array<{ text: string; callback_data: string }>> {
  if (!Array.isArray(kb) || kb.length === 0) return false;
  const rows = kb as Array<unknown>;
  if (!Array.isArray(rows[0]) || rows[0].length !== 2) return false;
  const r0 = rows[0] as Array<Record<string, unknown>>;
  return (
    r0[0]?.callback_data === "menu:add" &&
    r0[1]?.callback_data === "menu:watchlist"
  );
}

const MY_ALERTS_BUTTON = { text: "My Alerts", callback_data: "menu:myalerts" };

function injectMyAlertsButton(payload: Record<string, unknown>): Record<string, unknown> {
  const replyMarkup = payload.reply_markup as
    | { inline_keyboard?: unknown }
    | undefined;
  if (!replyMarkup?.inline_keyboard) return payload;

  const kb = replyMarkup.inline_keyboard;
  if (!isMainMenuKeyboard(kb)) return payload;

  const newKb = [
    kb[0],
    [
      { text: "Create Alert", callback_data: "menu:alerts" },
      MY_ALERTS_BUTTON,
    ],
    [
      { text: "Price Check", callback_data: "menu:price" },
      { text: "Settings", callback_data: "menu:settings" },
    ],
    [{ text: "Help", callback_data: "menu:help" }],
  ];

  return {
    ...payload,
    reply_markup: { inline_keyboard: newKb },
  };
}

export default function (store: PersistentStore): Composer<BotContext<Session>> {
  const composer = new Composer<BotContext<Session>>();

  let installed = false;

  composer.use(async (ctx, next) => {
    if (!installed) {
      installed = true;
      ctx.api.config.use((prev, method, payload, signal) => {
        const m = method as string;
        if (
          payload &&
          typeof payload === "object" &&
          (m === "sendMessage" || m === "editMessageText" || m === "editMessageReplyMarkup")
        ) {
          const transformed = injectMyAlertsButton(
            payload as Record<string, unknown>,
          );
          return prev(method, transformed as typeof payload, signal);
        }
        return prev(method, payload, signal);
      });
    }
    return next();
  });

  composer.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data !== "menu:myalerts") return;

    clearAlertSession(ctx.session);
    clearAlertManageSession(ctx.session);
    clearWatchlistSession(ctx.session);

    let rules: AlertRule[];
    try {
      rules = await store.getAlertRules(ctx.chat!.id);
    } catch {
      await ctx.answerCallbackQuery({ text: "Failed to load alerts." });
      return;
    }

    await ctx.answerCallbackQuery();
    if (rules.length === 0) {
      await ctx.editMessageText(EMPTY_ALERTS_TEXT,
        { reply_markup: inlineKeyboard([
          [
            { text: "Add Coin", callback_data: "menu:add" },
            { text: "My Watchlist", callback_data: "menu:watchlist" },
          ],
          [
            { text: "Create Alert", callback_data: "menu:alerts" },
            MY_ALERTS_BUTTON,
          ],
          [
            { text: "Price Check", callback_data: "menu:price" },
            { text: "Settings", callback_data: "menu:settings" },
          ],
          [{ text: "Help", callback_data: "menu:help" }],
        ]) },
      );
    } else {
      await ctx.editMessageText(myAlertsText(rules),
        { reply_markup: myAlertsKeyboard(rules) },
      );
    }
  });

  return composer;
}