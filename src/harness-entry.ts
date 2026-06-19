import { readdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildBot } from "./bot.js";

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

export function makeBot() {
  const bot = buildBot(undefined, process.env.BOT_TOKEN ?? "harness-test-token");
  for (const handler of handlers) {
    if (handler.default) bot.use(handler.default as any);
  }
  return bot;
}