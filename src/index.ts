import { fileURLToPath } from "node:url";
import { readdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildBot } from "./bot.js";
import { createStore } from "./store.js";
import { startPoller } from "./poller.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const handlerDir = resolve(__dirname, "handlers");

const handlers: Array<{ default: unknown }> = [];
if (existsSync(handlerDir)) {
  for (const file of readdirSync(handlerDir)) {
    if (file.endsWith(".js") || file.endsWith(".ts")) {
      const url = pathToFileURL(resolve(handlerDir, file)).href;
      handlers.push(await import(url));
    }
  }
}

async function main() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.error("BOT_TOKEN is required");
    process.exit(1);
  }

  const store = createStore();
  const bot = buildBot(store, token);
  for (const handler of handlers) {
    if (handler.default) bot.use(handler.default as any);
  }
  startPoller(store, (chatId, text, replyMarkup) =>
    bot.api.sendMessage(chatId, text, { reply_markup: replyMarkup }),
  );
  await bot.start();
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  void main();
}