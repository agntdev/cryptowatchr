import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import type { Session } from "../bot.js";

function clearAlertManageSession(session: Session) {
  session.alertManageStep = undefined;
  session.editingRuleId = undefined;
  session.tempEditPercent = undefined;
}

function clearSummarySession(session: Session) {
  session.summaryStep = undefined;
}

const composer = new Composer<BotContext<Session>>();

composer.command("list", async (ctx, next) => {
  clearAlertManageSession(ctx.session);
  clearSummarySession(ctx.session);
  await next();
});

composer.callbackQuery(["menu:watchlist", "menu:add"], async (ctx, next) => {
  clearAlertManageSession(ctx.session);
  clearSummarySession(ctx.session);
  await next();
});

export default composer;
