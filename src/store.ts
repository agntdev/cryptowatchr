import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

export interface AlertRule {
  id: string;
  userId: number;
  type: "threshold" | "percent";
  coin: string;
  direction?: "above" | "below";
  price?: number;
  percent?: number;
  timeframeMinutes?: number;
  createdAt: string;
}

export interface WatchlistEntry {
  userId: number;
  ticker: string;
  coinId: string;
  addedAt: string;
}

export interface QuietHours {
  start: string;
  end: string;
}

export interface MorningSummary {
  enabled: boolean;
  time: string;
}

export interface PriceSnapshot {
  coinId: string;
  usd: number;
  usd24hChange: number | null;
  lastUpdatedAt: number;
  polledAt: number;
}

export interface PersistentStore {
  createAlertRule(rule: AlertRule): Promise<void>;
  getAlertRules(userId: number): Promise<AlertRule[]>;
  getAllAlertRules(): Promise<AlertRule[]>;
  deleteAlertRule(userId: number, ruleId: string): Promise<void>;
  getQuietHours(userId: number): Promise<QuietHours | null>;
  setQuietHours(userId: number, start: string, end: string): Promise<void>;
  deleteQuietHours(userId: number): Promise<void>;
  addToWatchlist(userId: number, ticker: string, coinId: string): Promise<void>;
  getWatchlist(userId: number): Promise<WatchlistEntry[]>;
  removeFromWatchlist(userId: number, ticker: string): Promise<void>;
  isInWatchlist(userId: number, ticker: string): Promise<boolean>;
  getMorningSummary(userId: number): Promise<MorningSummary | null>;
  setMorningSummary(userId: number, time: string): Promise<void>;
  deleteMorningSummary(userId: number): Promise<void>;
  getAllTrackedCoinIds(): Promise<string[]>;
  savePriceSnapshot(snapshot: PriceSnapshot): Promise<void>;
  getLatestPriceSnapshot(coinId: string): Promise<PriceSnapshot | null>;
  recordSentAlert(userId: number, ruleId: string, cooldownMs: number): Promise<void>;
  isAlertSuppressed(userId: number, ruleId: string): Promise<boolean>;
  setTimezone(userId: number, timezone: string): Promise<void>;
  getTimezone(userId: number): Promise<string | null>;
}

function createRedisClient(url: string) {
  const require = createRequire(import.meta.url);
  const ioredis = require("ioredis");
  const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
  return new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });
}

const PREFIX = "cryptowatchr:";
const RULES_KEY = (userId: number) => `${PREFIX}alert:rules:${userId}`;
const WATCHLIST_KEY = (userId: number) => `${PREFIX}watchlist:${userId}`;

class RedisStore implements PersistentStore {
  #client: ReturnType<typeof createRedisClient>;

  constructor(url: string) {
    this.#client = createRedisClient(url);
  }

  async createAlertRule(rule: AlertRule): Promise<void> {
    const key = `${PREFIX}alert:${rule.userId}:${rule.id}`;
    await this.#client.set(key, JSON.stringify(rule));
    await this.#client.sadd(RULES_KEY(rule.userId), rule.id);
  }

  async getAlertRules(userId: number): Promise<AlertRule[]> {
    const ids = await this.#client.smembers(RULES_KEY(userId));
    if (ids.length === 0) return [];
    const keys = ids.map((id: string) => `${PREFIX}alert:${userId}:${id}`);
    const results = await Promise.all(keys.map((k: string) => this.#client.get(k)));
    return results
      .filter((r): r is string => r !== null)
      .map((r) => JSON.parse(r) as AlertRule);
  }

  async getAllAlertRules(): Promise<AlertRule[]> {
    const rules: AlertRule[] = [];
    let cursor = "0";
    do {
      const [nextCursor, keys] = await this.#client.scan(cursor, "MATCH", `${PREFIX}alert:*:*`, "COUNT", 100);
      cursor = nextCursor;
      for (const key of keys) {
        if (key.includes(":rules:")) continue;
        const raw = await this.#client.get(key);
        if (raw) {
          rules.push(JSON.parse(raw) as AlertRule);
        }
      }
    } while (cursor !== "0");
    return rules;
  }

  async deleteAlertRule(userId: number, ruleId: string): Promise<void> {
    const key = `${PREFIX}alert:${userId}:${ruleId}`;
    await this.#client.del(key);
    await this.#client.srem(RULES_KEY(userId), ruleId);
  }

  async getQuietHours(userId: number): Promise<QuietHours | null> {
    const key = `${PREFIX}quiet_hours:${userId}`;
    const raw = await this.#client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as QuietHours;
  }

  async setQuietHours(userId: number, start: string, end: string): Promise<void> {
    const key = `${PREFIX}quiet_hours:${userId}`;
    await this.#client.set(key, JSON.stringify({ start, end }));
  }

  async deleteQuietHours(userId: number): Promise<void> {
    const key = `${PREFIX}quiet_hours:${userId}`;
    await this.#client.del(key);
  }

  async getMorningSummary(userId: number): Promise<MorningSummary | null> {
    const key = `${PREFIX}morning_summary:${userId}`;
    const raw = await this.#client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as MorningSummary;
  }

  async setMorningSummary(userId: number, time: string): Promise<void> {
    const key = `${PREFIX}morning_summary:${userId}`;
    await this.#client.set(key, JSON.stringify({ enabled: true, time }));
  }

  async deleteMorningSummary(userId: number): Promise<void> {
    const key = `${PREFIX}morning_summary:${userId}`;
    await this.#client.del(key);
  }

  async getAllTrackedCoinIds(): Promise<string[]> {
    const coinIds = new Set<string>();
    let cursor = "0";
    do {
      const [nextCursor, keys] = await this.#client.scan(cursor, "MATCH", `${PREFIX}watchlist:*`, "COUNT", 100);
      cursor = nextCursor;
      for (const key of keys) {
        const raw = await this.#client.hgetall(key);
        if (raw) {
          for (const v of Object.values(raw)) {
            const entry = JSON.parse(v as string) as WatchlistEntry;
            coinIds.add(entry.coinId);
          }
        }
      }
    } while (cursor !== "0");
    return [...coinIds];
  }

  async savePriceSnapshot(snapshot: PriceSnapshot): Promise<void> {
    const key = `${PREFIX}snapshot:${snapshot.coinId}`;
    await this.#client.set(key, JSON.stringify(snapshot));
  }

  async getLatestPriceSnapshot(coinId: string): Promise<PriceSnapshot | null> {
    const key = `${PREFIX}snapshot:${coinId}`;
    const raw = await this.#client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as PriceSnapshot;
  }

  async recordSentAlert(userId: number, ruleId: string, cooldownMs: number): Promise<void> {
    const key = `${PREFIX}sent_alert:${userId}:${ruleId}`;
    await this.#client.set(key, String(Date.now()), "PX", cooldownMs);
  }

  async isAlertSuppressed(userId: number, ruleId: string): Promise<boolean> {
    const key = `${PREFIX}sent_alert:${userId}:${ruleId}`;
    const exists = await this.#client.exists(key);
    return exists === 1;
  }

  async setTimezone(userId: number, timezone: string): Promise<void> {
    const key = `${PREFIX}timezone:${userId}`;
    await this.#client.set(key, timezone);
  }

  async getTimezone(userId: number): Promise<string | null> {
    const key = `${PREFIX}timezone:${userId}`;
    return await this.#client.get(key);
  }

  async addToWatchlist(userId: number, ticker: string, coinId: string): Promise<void> {
    const entry: WatchlistEntry = { userId, ticker, coinId, addedAt: new Date().toISOString() };
    await this.#client.hset(WATCHLIST_KEY(userId), ticker, JSON.stringify(entry));
  }

  async getWatchlist(userId: number): Promise<WatchlistEntry[]> {
    const raw = await this.#client.hgetall(WATCHLIST_KEY(userId));
    if (!raw) return [];
    return Object.values(raw).map((v) => JSON.parse(v as string) as WatchlistEntry);
  }

  async removeFromWatchlist(userId: number, ticker: string): Promise<void> {
    await this.#client.hdel(WATCHLIST_KEY(userId), ticker);
  }

  async isInWatchlist(userId: number, ticker: string): Promise<boolean> {
    const exists = await this.#client.hexists(WATCHLIST_KEY(userId), ticker);
    return exists === 1;
  }
}

class MemoryStore implements PersistentStore {
  #rules = new Map<string, AlertRule>();
  #userRules = new Map<number, Set<string>>();
  #quietHours = new Map<number, QuietHours>();
  #morningSummary = new Map<number, MorningSummary>();
  #watchlist = new Map<number, Map<string, WatchlistEntry>>();

  async createAlertRule(rule: AlertRule): Promise<void> {
    this.#rules.set(rule.id, rule);
    let set = this.#userRules.get(rule.userId);
    if (!set) {
      set = new Set();
      this.#userRules.set(rule.userId, set);
    }
    set.add(rule.id);
  }

  async getAlertRules(userId: number): Promise<AlertRule[]> {
    const ids = this.#userRules.get(userId);
    if (!ids) return [];
    return [...ids].map((id) => this.#rules.get(id)!).filter(Boolean);
  }

  async getAllAlertRules(): Promise<AlertRule[]> {
    return [...this.#rules.values()];
  }

  async deleteAlertRule(userId: number, ruleId: string): Promise<void> {
    this.#rules.delete(ruleId);
    this.#userRules.get(userId)?.delete(ruleId);
  }

  async getQuietHours(userId: number): Promise<QuietHours | null> {
    return this.#quietHours.get(userId) ?? null;
  }

  async setQuietHours(userId: number, start: string, end: string): Promise<void> {
    this.#quietHours.set(userId, { start, end });
  }

  async deleteQuietHours(userId: number): Promise<void> {
    this.#quietHours.delete(userId);
  }

  async getMorningSummary(userId: number): Promise<MorningSummary | null> {
    return this.#morningSummary.get(userId) ?? null;
  }

  async setMorningSummary(userId: number, time: string): Promise<void> {
    this.#morningSummary.set(userId, { enabled: true, time });
  }

  async deleteMorningSummary(userId: number): Promise<void> {
    this.#morningSummary.delete(userId);
  }

  async getAllTrackedCoinIds(): Promise<string[]> {
    const coinIds = new Set<string>();
    for (const map of this.#watchlist.values()) {
      for (const entry of map.values()) {
        coinIds.add(entry.coinId);
      }
    }
    return [...coinIds];
  }

  #snapshots = new Map<string, PriceSnapshot>();

  async savePriceSnapshot(snapshot: PriceSnapshot): Promise<void> {
    this.#snapshots.set(snapshot.coinId, snapshot);
  }

  async getLatestPriceSnapshot(coinId: string): Promise<PriceSnapshot | null> {
    return this.#snapshots.get(coinId) ?? null;
  }

  #sentAlerts = new Map<string, number>();

  async recordSentAlert(userId: number, ruleId: string, cooldownMs: number): Promise<void> {
    const key = `${userId}:${ruleId}`;
    this.#sentAlerts.set(key, Date.now() + cooldownMs);
  }

  async isAlertSuppressed(userId: number, ruleId: string): Promise<boolean> {
    const key = `${userId}:${ruleId}`;
    const expiresAt = this.#sentAlerts.get(key);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      this.#sentAlerts.delete(key);
      return false;
    }
    return true;
  }

  #timezones = new Map<number, string>();

  async setTimezone(userId: number, timezone: string): Promise<void> {
    this.#timezones.set(userId, timezone);
  }

  async getTimezone(userId: number): Promise<string | null> {
    return this.#timezones.get(userId) ?? null;
  }

  async addToWatchlist(userId: number, ticker: string, coinId: string): Promise<void> {
    let map = this.#watchlist.get(userId);
    if (!map) {
      map = new Map();
      this.#watchlist.set(userId, map);
    }
    map.set(ticker, { userId, ticker, coinId, addedAt: new Date().toISOString() });
  }

  async getWatchlist(userId: number): Promise<WatchlistEntry[]> {
    const map = this.#watchlist.get(userId);
    if (!map) return [];
    return [...map.values()];
  }

  async removeFromWatchlist(userId: number, ticker: string): Promise<void> {
    this.#watchlist.get(userId)?.delete(ticker);
  }

  async isInWatchlist(userId: number, ticker: string): Promise<boolean> {
    return this.#watchlist.get(userId)?.has(ticker) ?? false;
  }
}

class PostgresStore implements PersistentStore {
  #pool: ReturnType<typeof createPgPool>;

  constructor(url: string) {
    this.#pool = createPgPool(url);
    this.#createTables().catch((err) => {
      console.error("[CryptoWatchr] Postgres table init failed:", err);
    });
  }

  async #createTables() {
    await this.#pool.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id BIGINT PRIMARY KEY,
        timezone TEXT,
        quiet_hours_start TEXT,
        quiet_hours_end TEXT,
        morning_summary_enabled BOOLEAN DEFAULT false,
        morning_summary_time TEXT
      )
    `);
    await this.#pool.query(`
      CREATE TABLE IF NOT EXISTS alert_rules (
        id TEXT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        type TEXT NOT NULL,
        coin TEXT NOT NULL,
        direction TEXT,
        price DOUBLE PRECISION,
        percent DOUBLE PRECISION,
        timeframe_minutes INTEGER,
        created_at TEXT NOT NULL
      )
    `);
    await this.#pool.query(`
      CREATE TABLE IF NOT EXISTS watchlist (
        user_id BIGINT NOT NULL,
        ticker TEXT NOT NULL,
        coin_id TEXT NOT NULL,
        added_at TEXT NOT NULL,
        PRIMARY KEY (user_id, ticker)
      )
    `);
    await this.#pool.query(`
      CREATE TABLE IF NOT EXISTS price_snapshots (
        coin_id TEXT PRIMARY KEY,
        usd DOUBLE PRECISION NOT NULL,
        usd_24h_change DOUBLE PRECISION,
        last_updated_at BIGINT NOT NULL,
        polled_at BIGINT NOT NULL
      )
    `);
    await this.#pool.query(`
      CREATE TABLE IF NOT EXISTS sent_alerts (
        user_id BIGINT NOT NULL,
        rule_id TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        PRIMARY KEY (user_id, rule_id)
      )
    `);
  }

  async setTimezone(userId: number, timezone: string): Promise<void> {
    await this.#pool.query(
      `INSERT INTO user_settings (user_id, timezone)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET timezone = $2`,
      [userId, timezone],
    );
  }

  async getTimezone(userId: number): Promise<string | null> {
    const res = await this.#pool.query(
      `SELECT timezone FROM user_settings WHERE user_id = $1`,
      [userId],
    );
    if (res.rows.length === 0) return null;
    return res.rows[0].timezone ?? null;
  }

  async setQuietHours(userId: number, start: string, end: string): Promise<void> {
    await this.#pool.query(
      `INSERT INTO user_settings (user_id, quiet_hours_start, quiet_hours_end)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET quiet_hours_start = $2, quiet_hours_end = $3`,
      [userId, start, end],
    );
  }

  async getQuietHours(userId: number): Promise<QuietHours | null> {
    const res = await this.#pool.query(
      `SELECT quiet_hours_start, quiet_hours_end FROM user_settings WHERE user_id = $1`,
      [userId],
    );
    if (res.rows.length === 0 || !res.rows[0].quiet_hours_start || !res.rows[0].quiet_hours_end) {
      return null;
    }
    return { start: res.rows[0].quiet_hours_start, end: res.rows[0].quiet_hours_end };
  }

  async deleteQuietHours(userId: number): Promise<void> {
    await this.#pool.query(
      `UPDATE user_settings SET quiet_hours_start = NULL, quiet_hours_end = NULL WHERE user_id = $1`,
      [userId],
    );
  }

  async setMorningSummary(userId: number, time: string): Promise<void> {
    await this.#pool.query(
      `INSERT INTO user_settings (user_id, morning_summary_enabled, morning_summary_time)
       VALUES ($1, true, $2)
       ON CONFLICT (user_id) DO UPDATE SET morning_summary_enabled = true, morning_summary_time = $2`,
      [userId, time],
    );
  }

  async getMorningSummary(userId: number): Promise<MorningSummary | null> {
    const res = await this.#pool.query(
      `SELECT morning_summary_enabled, morning_summary_time FROM user_settings WHERE user_id = $1`,
      [userId],
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    if (!row.morning_summary_enabled || !row.morning_summary_time) return null;
    return { enabled: true, time: row.morning_summary_time };
  }

  async deleteMorningSummary(userId: number): Promise<void> {
    await this.#pool.query(
      `UPDATE user_settings SET morning_summary_enabled = false, morning_summary_time = NULL WHERE user_id = $1`,
      [userId],
    );
  }

  async createAlertRule(rule: AlertRule): Promise<void> {
    await this.#pool.query(
      `INSERT INTO alert_rules (id, user_id, type, coin, direction, price, percent, timeframe_minutes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET user_id = $2, type = $3, coin = $4, direction = $5, price = $6, percent = $7, timeframe_minutes = $8, created_at = $9`,
      [rule.id, rule.userId, rule.type, rule.coin, rule.direction ?? null, rule.price ?? null, rule.percent ?? null, rule.timeframeMinutes ?? null, rule.createdAt],
    );
  }

  async getAlertRules(userId: number): Promise<AlertRule[]> {
    const res = await this.#pool.query(
      `SELECT id, user_id, type, coin, direction, price, percent, timeframe_minutes, created_at
       FROM alert_rules WHERE user_id = $1`,
      [userId],
    );
    return res.rows.map(rowToAlertRule);
  }

  async getAllAlertRules(): Promise<AlertRule[]> {
    const res = await this.#pool.query(
      `SELECT id, user_id, type, coin, direction, price, percent, timeframe_minutes, created_at FROM alert_rules`,
    );
    return res.rows.map(rowToAlertRule);
  }

  async deleteAlertRule(userId: number, ruleId: string): Promise<void> {
    await this.#pool.query(
      `DELETE FROM alert_rules WHERE id = $1 AND user_id = $2`,
      [ruleId, userId],
    );
  }

  async addToWatchlist(userId: number, ticker: string, coinId: string): Promise<void> {
    await this.#pool.query(
      `INSERT INTO watchlist (user_id, ticker, coin_id, added_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, ticker) DO NOTHING`,
      [userId, ticker, coinId, new Date().toISOString()],
    );
  }

  async getWatchlist(userId: number): Promise<WatchlistEntry[]> {
    const res = await this.#pool.query(
      `SELECT user_id, ticker, coin_id, added_at FROM watchlist WHERE user_id = $1`,
      [userId],
    );
    return res.rows.map(rowToWatchlistEntry);
  }

  async removeFromWatchlist(userId: number, ticker: string): Promise<void> {
    await this.#pool.query(
      `DELETE FROM watchlist WHERE user_id = $1 AND ticker = $2`,
      [userId, ticker],
    );
  }

  async isInWatchlist(userId: number, ticker: string): Promise<boolean> {
    const res = await this.#pool.query(
      `SELECT 1 FROM watchlist WHERE user_id = $1 AND ticker = $2`,
      [userId, ticker],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async getAllTrackedCoinIds(): Promise<string[]> {
    const res = await this.#pool.query(
      `SELECT DISTINCT coin_id FROM watchlist`,
    );
    return res.rows.map((r: { coin_id: string }) => r.coin_id);
  }

  async savePriceSnapshot(snapshot: PriceSnapshot): Promise<void> {
    await this.#pool.query(
      `INSERT INTO price_snapshots (coin_id, usd, usd_24h_change, last_updated_at, polled_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (coin_id) DO UPDATE SET usd = $2, usd_24h_change = $3, last_updated_at = $4, polled_at = $5`,
      [snapshot.coinId, snapshot.usd, snapshot.usd24hChange, snapshot.lastUpdatedAt, snapshot.polledAt],
    );
  }

  async getLatestPriceSnapshot(coinId: string): Promise<PriceSnapshot | null> {
    const res = await this.#pool.query(
      `SELECT coin_id, usd, usd_24h_change, last_updated_at, polled_at
       FROM price_snapshots WHERE coin_id = $1`,
      [coinId],
    );
    if (res.rows.length === 0) return null;
    return rowToPriceSnapshot(res.rows[0]);
  }

  async recordSentAlert(userId: number, ruleId: string, cooldownMs: number): Promise<void> {
    await this.#pool.query(
      `INSERT INTO sent_alerts (user_id, rule_id, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, rule_id) DO UPDATE SET expires_at = $3`,
      [userId, ruleId, Date.now() + cooldownMs],
    );
  }

  async isAlertSuppressed(userId: number, ruleId: string): Promise<boolean> {
    const res = await this.#pool.query(
      `SELECT expires_at FROM sent_alerts WHERE user_id = $1 AND rule_id = $2`,
      [userId, ruleId],
    );
    if (res.rows.length === 0) return false;
    const expiresAt: number = res.rows[0].expires_at;
    if (Date.now() > expiresAt) {
      await this.#pool.query(
        `DELETE FROM sent_alerts WHERE user_id = $1 AND rule_id = $2`,
        [userId, ruleId],
      );
      return false;
    }
    return true;
  }
}

function rowToAlertRule(row: Record<string, unknown>): AlertRule {
  return {
    id: row.id as string,
    userId: Number(row.user_id),
    type: row.type as "threshold" | "percent",
    coin: row.coin as string,
    direction: (row.direction ?? undefined) as "above" | "below" | undefined,
    price: row.price != null ? Number(row.price) : undefined,
    percent: row.percent != null ? Number(row.percent) : undefined,
    timeframeMinutes: row.timeframe_minutes != null ? Number(row.timeframe_minutes) : undefined,
    createdAt: row.created_at as string,
  };
}

function rowToWatchlistEntry(row: Record<string, unknown>): WatchlistEntry {
  return {
    userId: Number(row.user_id),
    ticker: row.ticker as string,
    coinId: row.coin_id as string,
    addedAt: row.added_at as string,
  };
}

function rowToPriceSnapshot(row: Record<string, unknown>): PriceSnapshot {
  return {
    coinId: row.coin_id as string,
    usd: Number(row.usd),
    usd24hChange: row.usd_24h_change != null ? Number(row.usd_24h_change) : null,
    lastUpdatedAt: Number(row.last_updated_at),
    polledAt: Number(row.polled_at),
  };
}

function createPgPool(url: string) {
  const require = createRequire(import.meta.url);
  const pg = require("pg");
  const { Pool } = pg.default ?? pg;
  return new Pool({ connectionString: url, ssl: url.includes("?sslmode=require") || url.includes("?ssl=true") ? { rejectUnauthorized: false } : false });
}

export function createStore(): PersistentStore {
  if (process.env.DATABASE_URL) {
    return new PostgresStore(process.env.DATABASE_URL);
  }
  if (process.env.REDIS_URL) {
    return new RedisStore(process.env.REDIS_URL);
  }
  return new MemoryStore();
}

export function newAlertRule(
  userId: number,
  coin: string,
  direction: "above" | "below",
  price: number,
): AlertRule {
  return {
    id: randomUUID(),
    userId,
    type: "threshold",
    coin,
    direction,
    price,
    createdAt: new Date().toISOString(),
  };
}

export function newPercentAlertRule(
  userId: number,
  coin: string,
  percent: number,
  timeframeMinutes: number,
): AlertRule {
  return {
    id: randomUUID(),
    userId,
    type: "percent",
    coin,
    percent,
    timeframeMinutes,
    createdAt: new Date().toISOString(),
  };
}
