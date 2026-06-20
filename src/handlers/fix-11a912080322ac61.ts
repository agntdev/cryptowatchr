import { Composer } from "grammy";
import { inlineKeyboard, type BotContext } from "../toolkit/index.js";
import type { Session } from "../bot.js";
import type { PersistentStore, QuietHours, MorningSummary } from "../store.js";

function parseTime(input: string): string | null {
  const m = input.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours < 0 || hours > 23) return null;
  if (minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function enhancedSettingsText(
  tz: string | null,
  qh: QuietHours | null,
  summary: MorningSummary | null,
): string {
  const lines = ["*Settings*"];
  lines.push("");
  if (tz) {
    lines.push(`\u2022 Timezone: ${tz}`);
  } else {
    lines.push("\u2022 Timezone: Not set");
  }
  if (qh) {
    lines.push(`\u2022 Quiet Hours: ${qh.start}\u2013${qh.end}`);
  } else {
    lines.push("\u2022 Quiet Hours: Off");
  }
  if (summary) {
    lines.push(`\u2022 Morning Summary: On at ${summary.time}`);
  } else {
    lines.push("\u2022 Morning Summary: Off");
  }
  lines.push("");
  lines.push("Configure your timezone, quiet hours, and morning summary.");
  return lines.join("\n");
}

function enhancedSettingsKeyboard(
  tz: string | null,
  qh: QuietHours | null,
  summary: MorningSummary | null,
) {
  const rows = [];

  if (tz) {
    rows.push([{ text: "Change Timezone", callback_data: "settings:tz:change" }]);
  } else {
    rows.push([{ text: "Set Timezone", callback_data: "settings:tz:change" }]);
  }

  if (qh) {
    rows.push([
      { text: "Change Quiet Hours", callback_data: "settings:qhours:change" },
      { text: "Clear Quiet Hours", callback_data: "settings:qhours:clear" },
    ]);
  } else {
    rows.push([{ text: "Set Quiet Hours", callback_data: "settings:qhours:change" }]);
  }

  if (summary) {
    rows.push([{ text: "Change Summary Time", callback_data: "settings:summary:time" }]);
    rows.push([{ text: "Turn Off Summary", callback_data: "settings:summary:disable" }]);
  } else {
    rows.push([{ text: "Turn On Summary", callback_data: "settings:summary:enable" }]);
  }

  rows.push([{ text: "Back to menu", callback_data: "menu:back" }]);

  return inlineKeyboard(rows);
}

function timezoneKeyboard() {
  return inlineKeyboard([
    [
      { text: "UTC-8 (PST)", callback_data: "settings:tz:set:UTC-8" },
      { text: "UTC-5 (EST)", callback_data: "settings:tz:set:UTC-5" },
    ],
    [
      { text: "UTC+0 (GMT)", callback_data: "settings:tz:set:UTC+0" },
      { text: "UTC+3 (MSK)", callback_data: "settings:tz:set:UTC+3" },
    ],
    [
      { text: "UTC+8 (CST)", callback_data: "settings:tz:set:UTC+8" },
      { text: "Custom timezone", callback_data: "settings:tz:custom" },
    ],
    [
      { text: "Back", callback_data: "settings:back" },
    ],
  ]);
}

interface SettingsSession extends Session {
  _settingsStep?: "tz" | "qhours_start" | "qhours_end";
  _settingsQhoursStart?: string;
}

function ss(session: Session): SettingsSession {
  return session as SettingsSession;
}

async function showSettings(
  ctx: BotContext<Session>,
  store: PersistentStore,
) {
  const userId = ctx.chat!.id;
  const [tz, qh, summary] = await Promise.all([
    store.getTimezone(userId),
    store.getQuietHours(userId),
    store.getMorningSummary(userId),
  ]);
  await ctx.editMessageText(enhancedSettingsText(tz, qh, summary), {
    parse_mode: "Markdown",
    reply_markup: enhancedSettingsKeyboard(tz, qh, summary),
  });
}

async function showSettingsNew(
  ctx: BotContext<Session>,
  store: PersistentStore,
) {
  const userId = ctx.chat!.id;
  const [tz, qh, summary] = await Promise.all([
    store.getTimezone(userId),
    store.getQuietHours(userId),
    store.getMorningSummary(userId),
  ]);
  await ctx.reply(enhancedSettingsText(tz, qh, summary), {
    parse_mode: "Markdown",
    reply_markup: enhancedSettingsKeyboard(tz, qh, summary),
  });
}

export default function (
  store: PersistentStore,
): Composer<BotContext<Session>> {
  const composer = new Composer<BotContext<Session>>();

  composer.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery.data;

    if (data === "menu:settings") {
      await ctx.answerCallbackQuery();
      await showSettings(ctx, store);
      return;
    }

    if (data === "settings:back") {
      ss(ctx.session)._settingsStep = undefined;
      ss(ctx.session)._settingsQhoursStart = undefined;
      await ctx.answerCallbackQuery();
      await showSettings(ctx, store);
      return;
    }

    if (data === "settings:tz:change") {
      ss(ctx.session)._settingsStep = "tz";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        "Choose your timezone or type a custom one:",
        { reply_markup: timezoneKeyboard() },
      );
      return;
    }

    if (data.startsWith("settings:tz:set:")) {
      const tz = data.slice("settings:tz:set:".length);
      ss(ctx.session)._settingsStep = undefined;
      try {
        await store.setTimezone(ctx.chat!.id, tz);
      } catch {
        // best-effort
      }
      await ctx.answerCallbackQuery({ text: `Timezone set to ${tz}.` });
      await showSettings(ctx, store);
      return;
    }

    if (data === "settings:tz:custom") {
      ss(ctx.session)._settingsStep = "tz";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        "Enter your timezone (e.g. UTC+2, America/New_York, Europe/London):",
        { reply_markup: inlineKeyboard([[{ text: "Back", callback_data: "settings:back" }]]) },
      );
      return;
    }

    if (data === "settings:qhours:change") {
      ss(ctx.session)._settingsStep = "qhours_start";
      ss(ctx.session)._settingsQhoursStart = undefined;
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        "Set your quiet hours.\n\nWhat time should your quiet hours start? (HH:MM, 24-hour format)\n\nExample: 22:00",
        {
          reply_markup: inlineKeyboard([
            [{ text: "Keep defaults", callback_data: "settings:qhours:skip" }],
            [{ text: "Back", callback_data: "settings:back" }],
          ]),
        },
      );
      return;
    }

    if (data === "settings:qhours:skip") {
      ss(ctx.session)._settingsStep = undefined;
      ss(ctx.session)._settingsQhoursStart = undefined;
      try {
        await store.deleteQuietHours(ctx.chat!.id);
      } catch {
        // best-effort; if deletion fails, defaults still show correctly
      }
      await ctx.answerCallbackQuery();
      await showSettings(ctx, store);
      return;
    }

    if (data === "settings:qhours:clear") {
      try {
        await store.deleteQuietHours(ctx.chat!.id);
      } catch {
        // best-effort
      }
      await ctx.answerCallbackQuery({ text: "Quiet hours cleared." });
      await showSettings(ctx, store);
      return;
    }

    if (data === "settings:summary:enable") {
      ctx.session.summaryStep = "time";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        "Enter the time for your daily morning summary (HH:MM, 24-hour format, in your timezone):\n\nExample: 08:00",
        {
          reply_markup: inlineKeyboard([[{ text: "Back", callback_data: "settings:summary:back" }]]),
        },
      );
      return;
    }

    if (data === "settings:summary:time") {
      ctx.session.summaryStep = "time";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        "Enter the new time for your daily morning summary (HH:MM, 24-hour format, in your timezone):\n\nExample: 08:00",
        {
          reply_markup: inlineKeyboard([[{ text: "Back", callback_data: "settings:summary:back" }]]),
        },
      );
      return;
    }

    if (data === "settings:summary:disable") {
      try {
        await store.deleteMorningSummary(ctx.chat!.id);
      } catch {
        // best-effort
      }
      await ctx.answerCallbackQuery({ text: "Morning summary turned off." });
      await showSettings(ctx, store);
      return;
    }

    if (data === "settings:summary:back") {
      ctx.session.summaryStep = undefined;
      await ctx.answerCallbackQuery();
      await showSettings(ctx, store);
      return;
    }

    if (data === "menu:back") {
      ss(ctx.session)._settingsStep = undefined;
      ss(ctx.session)._settingsQhoursStart = undefined;
    }

    return next();
  });

  composer.on("message:text", async (ctx, next) => {
    const s = ss(ctx.session);

    if (s._settingsStep === "tz") {
      const tz = ctx.message.text.trim();
      s._settingsStep = undefined;
      try {
        await store.setTimezone(ctx.chat!.id, tz);
      } catch {
        // best-effort
      }
      await ctx.reply(`Timezone set to ${tz}.`);
      await showSettingsNew(ctx, store);
      return;
    }

    if (s._settingsStep === "qhours_start") {
      const raw = ctx.message.text.trim();
      const parsed = parseTime(raw);
      if (!parsed) {
        await ctx.reply(
          "Please enter a valid time in HH:MM format (e.g. 22:00).",
          {
            reply_markup: inlineKeyboard([
              [{ text: "Keep defaults", callback_data: "settings:qhours:skip" }],
              [{ text: "Back", callback_data: "settings:back" }],
            ]),
          },
        );
        return;
      }
      s._settingsQhoursStart = parsed;
      s._settingsStep = "qhours_end";
      await ctx.reply(
        "What time should your quiet hours end? (HH:MM, 24-hour format)\n\nExample: 07:00",
        {
          reply_markup: inlineKeyboard([
            [{ text: "Keep defaults", callback_data: "settings:qhours:skip" }],
            [{ text: "Back", callback_data: "settings:back" }],
          ]),
        },
      );
      return;
    }

    if (s._settingsStep === "qhours_end") {
      const raw = ctx.message.text.trim();
      const parsed = parseTime(raw);
      if (!parsed) {
        await ctx.reply(
          "Please enter a valid time in HH:MM format (e.g. 07:00).",
          {
            reply_markup: inlineKeyboard([
              [{ text: "Keep defaults", callback_data: "settings:qhours:skip" }],
              [{ text: "Back", callback_data: "settings:back" }],
            ]),
          },
        );
        return;
      }
      s._settingsStep = undefined;
      try {
        await store.setQuietHours(ctx.chat!.id, s._settingsQhoursStart!, parsed);
      } catch {
        s._settingsQhoursStart = undefined;
      }
      await ctx.reply(
        `Quiet hours set to ${s._settingsQhoursStart}\u2013${parsed}.`,
      );
      s._settingsQhoursStart = undefined;
      await showSettingsNew(ctx, store);
      return;
    }

    if (ctx.session.summaryStep === "time") {
      const raw = ctx.message.text.trim();
      const parsed = parseTime(raw);
      if (!parsed) {
        await ctx.reply(
          "Please enter a valid time in HH:MM format (e.g. 08:00).",
          {
            reply_markup: inlineKeyboard([[{ text: "Back", callback_data: "settings:summary:back" }]]),
          },
        );
        return;
      }
      ctx.session.summaryStep = undefined;
      try {
        await store.setMorningSummary(ctx.chat!.id, parsed);
      } catch {
        await ctx.reply("Failed to save summary time. Please try again later.");
        return;
      }
      await ctx.reply(`Morning summary is now on at ${parsed}.`);
      await showSettingsNew(ctx, store);
      return;
    }

    return next();
  });

  return composer;
}