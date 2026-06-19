import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import type { Session } from "../bot.js";
import type { PersistentStore, AdminStats } from "../store.js";

function formatStats(stats: AdminStats): string {
  const lines = [
    "Admin Stats",
    "",
    `Total users: ${stats.totalUsers}`,
    `Active users (last 30 days): ${stats.activeUsers30d}`,
    "",
    "Top Fired Alert Rules:",
  ];

  if (stats.topFiredRules.length === 0) {
    lines.push("(none)");
  } else {
    for (let i = 0; i < stats.topFiredRules.length; i++) {
      const rule = stats.topFiredRules[i];
      lines.push(`${i + 1}. ${rule.ruleId} \u2014 ${rule.fireCount} fires`);
    }
  }

  return lines.join("\n");
}

export default function (
  store: PersistentStore,
): Composer<BotContext<Session>> {
  const composer = new Composer<BotContext<Session>>();

  const ownerIdRaw = process.env.OWNER_TELEGRAM_ID;
  const ownerId = ownerIdRaw ? Number(ownerIdRaw) : null;

  composer.command("admin_stats", async (ctx) => {
    if (ownerId === null || isNaN(ownerId)) {
      await ctx.reply(
        "Owner not configured. Set the OWNER_TELEGRAM_ID environment variable.",
      );
      return;
    }
    if (ctx.from?.id !== ownerId) {
      await ctx.reply("This command is only available to the bot owner.");
      return;
    }
    try {
      const stats = await store.getAdminStats();
      await ctx.reply(formatStats(stats));
    } catch {
      await ctx.reply(
        "Failed to retrieve stats. Please try again later.",
      );
    }
  });

  return composer;
}

export const handledCommands = ["admin_stats"];
