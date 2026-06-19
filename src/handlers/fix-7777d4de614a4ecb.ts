import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import type { Session } from "../bot.js";
import type { PersistentStore } from "../store.js";

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function adminStatsText(stats: {
  totalUsers: number;
  activeUsers30d: number;
  topFiredRules: Array<{ ruleId: string; fireCount: number }>;
}): string {
  const lines: string[] = [];
  lines.push("*Admin Stats*");
  lines.push("");
  lines.push(`Total users: ${formatNumber(stats.totalUsers)}`);
  lines.push(`Active (30 days): ${formatNumber(stats.activeUsers30d)}`);
  if (stats.topFiredRules.length > 0) {
    lines.push("");
    lines.push("*Top Fired Alert Rules:*");
    for (let i = 0; i < stats.topFiredRules.length; i++) {
      const r = stats.topFiredRules[i];
      lines.push(`${i + 1}. Rule \`${r.ruleId}\` — ${formatNumber(r.fireCount)} fires`);
    }
  }
  return lines.join("\n");
}

export default function (
  store: PersistentStore,
): Composer<BotContext<Session>> {
  const composer = new Composer<BotContext<Session>>();

  composer.command("admin_stats", async (ctx) => {
    const ownerIdRaw = process.env.OWNER_ID;
    if (!ownerIdRaw || ctx.from?.id !== Number(ownerIdRaw)) {
      return;
    }

    try {
      const stats = await store.getAdminStats();
      await ctx.reply(adminStatsText(stats), { parse_mode: "Markdown" });
    } catch {
      await ctx.reply("Failed to load admin stats.");
    }
  });

  return composer;
}