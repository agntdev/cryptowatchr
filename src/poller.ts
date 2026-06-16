import type { PersistentStore } from "./store.js";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const POLL_INTERVAL_MS = 60_000;

async function fetchPrices(coinIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (coinIds.length === 0) return result;

  const ids = coinIds.join(",");
  const url = `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.error(`[poller] CoinGecko returned ${res.status} ${res.statusText}`);
      return result;
    }
    const data = (await res.json()) as Record<string, { usd?: number }>;
    for (const [id, value] of Object.entries(data)) {
      if (typeof value?.usd === "number" && value.usd > 0) {
        result.set(id, value.usd);
      }
    }
  } catch (err) {
    console.error("[poller] fetch error:", err);
  } finally {
    clearTimeout(timeout);
  }

  return result;
}

export function startPoller(store: PersistentStore): { stop: () => void } {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function poll(): Promise<void> {
    if (stopped) return;

    let coinIds: string[];
    try {
      coinIds = await store.getAllTrackedCoinIds();
    } catch (err) {
      console.error("[poller] failed to get tracked coin ids:", err);
      coinIds = [];
    }

    if (coinIds.length > 0) {
      const prices = await fetchPrices(coinIds);
      for (const [coinId, price] of prices) {
        try {
          await store.savePriceSnapshot(coinId, price);
        } catch (err) {
          console.error(`[poller] failed to save snapshot for ${coinId}:`, err);
        }
      }
    }

    if (!stopped) {
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }
  }

  timer = setTimeout(poll, 0);

  return {
    stop: () => {
      stopped = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
