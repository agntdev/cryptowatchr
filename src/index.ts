import { fileURLToPath } from "node:url";
import { createBot, menuKeyboard } from "@agntdev/bot-toolkit";

export interface Session {
  initializedAt: string;
}

function mainMenu() {
  return menuKeyboard([
    { text: "📊 Add Coin", data: "menu:add_coin" },
    { text: "📋 My Watchlist", data: "menu:watchlist" },
    { text: "💰 Check Prices", data: "menu:prices" },
    { text: "🔔 Alerts", data: "menu:alerts" },
    { text: "⚙️ Settings", data: "menu:settings" },
    { text: "❓ Help", data: "menu:help" },
  ], 2);
}

export function makeBot(token = process.env.BOT_TOKEN ?? "test:cryptowatchr") {
  const bot = createBot<Session>(token, {
    initial: () => ({ initializedAt: new Date(0).toISOString() }),
  });

  bot.command("start", async (ctx) => {
    const welcomeText = [
      "🚀 *Welcome to CryptoWatchr!*",
      "",
      "Your personal crypto watchlist and alert bot. Track your favorite coins and receive non-spammy price alerts.",
      "",
      "*Features:*",
      "• Add coins to your watchlist",
      "• Get real-time price checks",
      "• Set threshold and percentage alerts",
      "• Morning summaries",
      "• Quiet hours to avoid overnight pings",
      "",
      "Use the menu below to get started:",
    ].join("\n");

    await ctx.reply(welcomeText, {
      parse_mode: "Markdown",
      reply_markup: mainMenu(),
    });
  });

  bot.on("message", async (ctx) => {
    if (ctx.message?.text?.startsWith("/")) {
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
