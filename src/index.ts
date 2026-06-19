import { fileURLToPath } from "node:url";
import { buildBot } from "./bot.js";
import { createStore } from "./store.js";
import { startPoller } from "./poller.js";
import myalertsFix, { installMenuFix } from "./handlers/fix-14a4a4fbeeebf2f5.js";

async function main() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.error("BOT_TOKEN is required");
    process.exit(1);
  }

  const store = createStore();
  const bot = buildBot(store, token);
  installMenuFix(bot.api as any);
  bot.use(myalertsFix);
  startPoller(store, (chatId, text, replyMarkup) =>
    bot.api.sendMessage(chatId, text, { reply_markup: replyMarkup }),
  );
  await bot.start();
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  void main();
}