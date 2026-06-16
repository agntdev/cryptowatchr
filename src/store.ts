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

export interface PriceSnapshot {
  coinId: string;
  priceUsd: number;
  fetchedAt: string;
}

export interface PersistentStore {
  createAlertRule(rule: AlertRule): Promise<void>;
  getAlertRules(userId: number): Promise<AlertRule[]>;
  deleteAlertRule(userId: number, ruleId: string): Promise<void>;
  getQuietHours(userId: number): Promise<QuietHours | null>;
  setQuietHours(userId: number, start: string, end: string): Promise<void>;
  deleteQuietHours(userId: number): Promise<void>;
  addToWatchlist(userId: number, ticker: string, coinId: string): Promise<void>;
  getWatchlist(userId: number): Promise<WatchlistEntry[]>;
  removeFromWatchlist(userId: number, ticker: string): Promise<void>;
  isInWatchlist(userId: number, ticker: string): Promise<boolean>;
  savePriceSnapshot(coinId: string, priceUsd: number): Promise<void>;
  getLatestPriceSnapshots(coinIds: string[]): Promise<Map<string, PriceSnapshot>>;
  getAllTrackedCoinIds(): Promise<string[]>;
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

  async savePriceSnapshot(coinId: string, priceUsd: number): Promise<void> {
    const snapshot: PriceSnapshot = {
      coinId,
      priceUsd,
      fetchedAt: new Date().toISOString(),
    };
    const ts = Date.now();
    const member = JSON.stringify(snapshot);
    const key = `${PREFIX}prices:${coinId}`;
    await this.#client.zadd(key, ts, member);
    await this.#client.sadd(`${PREFIX}tracked_coins`, coinId);
  }

  async getLatestPriceSnapshots(coinIds: string[]): Promise<Map<string, PriceSnapshot>> {
    const result = new Map<string, PriceSnapshot>();
    if (coinIds.length === 0) return result;
    const results = await Promise.all(
      coinIds.map(async (coinId) => {
        const key = `${PREFIX}prices:${coinId}`;
        const members = await this.#client.zrevrange(key, 0, 0);
        const snapshot = members.length > 0 ? (JSON.parse(members[0]) as PriceSnapshot) : null;
        return { coinId, snapshot };
      }),
    );
    for (const { coinId, snapshot } of results) {
      if (snapshot) result.set(coinId, snapshot);
    }
    return result;
  }

  async getAllTrackedCoinIds(): Promise<string[]> {
    return await this.#client.smembers(`${PREFIX}tracked_coins`);
  }
}

class MemoryStore implements PersistentStore {
  #rules = new Map<string, AlertRule>();
  #userRules = new Map<number, Set<string>>();
  #quietHours = new Map<number, QuietHours>();
  #watchlist = new Map<number, Map<string, WatchlistEntry>>();
  #prices = new Map<string, PriceSnapshot[]>();
  #trackedCoins = new Set<string>();

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

  async savePriceSnapshot(coinId: string, priceUsd: number): Promise<void> {
    const snapshot: PriceSnapshot = {
      coinId,
      priceUsd,
      fetchedAt: new Date().toISOString(),
    };
    let snapshots = this.#prices.get(coinId);
    if (!snapshots) {
      snapshots = [];
      this.#prices.set(coinId, snapshots);
    }
    snapshots.push(snapshot);
    this.#trackedCoins.add(coinId);
  }

  async getLatestPriceSnapshots(coinIds: string[]): Promise<Map<string, PriceSnapshot>> {
    const result = new Map<string, PriceSnapshot>();
    for (const coinId of coinIds) {
      const snapshots = this.#prices.get(coinId);
      if (snapshots && snapshots.length > 0) {
        result.set(coinId, snapshots[snapshots.length - 1]);
      }
    }
    return result;
  }

  async getAllTrackedCoinIds(): Promise<string[]> {
    return [...this.#trackedCoins];
  }
}

export function createStore(): PersistentStore {
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
