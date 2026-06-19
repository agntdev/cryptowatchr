import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";

export default function (): Composer<BotContext<Record<string, unknown>>> {
  return new Composer<BotContext<Record<string, unknown>>>();
}
