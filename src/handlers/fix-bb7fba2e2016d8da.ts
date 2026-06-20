import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import type { Session } from "../bot.js";
import type { PersistentStore } from "../store.js";

function readOwnerId(): number | null {
  const raw = process.env.TELEGRAM_OWNER_ID;
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

export default function (store: PersistentStore): Composer<BotContext<Session>> {
  const composer = new Composer<BotContext<Session>>();

  composer.use(async (ctx, next) => {
    if (ctx.chat?.id) {
      try {
        await store.recordUserActivity(ctx.chat.id);
      } catch {
        // best-effort recording; don't block the update
      }
    }
    return next();
  });

  composer.command("admin_stats", async (ctx) => {
    const ownerId = readOwnerId();
    if (ownerId === null) {
      await ctx.reply("Admin stats are not configured. Set TELEGRAM_OWNER_ID to enable.");
      return;
    }
    if (ctx.from?.id !== ownerId) {
      await ctx.reply("Access denied. This command is restricted to the bot owner.");
      return;
    }

    let stats;
    try {
      stats = await store.getAdminStats();
    } catch {
      await ctx.reply("Something went wrong. Please try again later.");
      return;
    }

    const lines = ["*Admin Stats*"];
    lines.push("");
    lines.push(`Total users: ${stats.totalUsers}`);
    lines.push(`Active users (30 days): ${stats.activeUsers30d}`);
    lines.push("");

    if (stats.topFiredRules.length === 0) {
      lines.push("Top fired rules: none yet");
    } else {
      lines.push("Top fired rules:");
      for (let i = 0; i < stats.topFiredRules.length; i++) {
        const r = stats.topFiredRules[i];
        lines.push(`${i + 1}. ${r.ruleId} — ${r.fireCount} fire${r.fireCount === 1 ? "" : "s"}`);
      }
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
  });

  return composer;
}

export const handledCommands = ["admin_stats"];