import { Composer } from "grammy";
import type { BotContext } from "../toolkit/index.js";
import type { Session } from "../bot.js";
import { KNOWN_COINS } from "../bot.js";
import { COIN_ID_TO_TICKER } from "../price.js";

const composer = new Composer<BotContext<Session>>();

function validateCoinMaps(): void {
  let issues = 0;

  for (const [coinId, ticker] of Object.entries(COIN_ID_TO_TICKER)) {
    const expectedCoinId = KNOWN_COINS[ticker];
    if (expectedCoinId !== coinId) {
      console.error(
        `[CryptoWatchr] coin-id map mismatch: COIN_ID_TO_TICKER["${coinId}"] = "${ticker}" but KNOWN_COINS["${ticker}"] = "${expectedCoinId ?? "undefined"}"`,
      );
      issues++;
    }
  }

  for (const [ticker, coinId] of Object.entries(KNOWN_COINS)) {
    const expectedTicker = COIN_ID_TO_TICKER[coinId];
    if (expectedTicker !== ticker) {
      console.error(
        `[CryptoWatchr] coin-id map mismatch: KNOWN_COINS["${ticker}"] = "${coinId}" but COIN_ID_TO_TICKER["${coinId}"] = "${expectedTicker ?? "undefined"}"`,
      );
      issues++;
    }
  }

  if (issues > 0) {
    console.error(
      `[CryptoWatchr] coin-id map consistency check FAILED with ${issues} mismatches between COIN_ID_TO_TICKER and KNOWN_COINS`,
    );
  }
}

validateCoinMaps();

export default composer;