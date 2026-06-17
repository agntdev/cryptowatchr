export interface CoinPrice {
  ticker: string;
  coinId: string;
  usd: number;
  usd24hChange: number | null;
  lastUpdatedAt: number;
}

interface CoinGeckoPriceResponse {
  [coinId: string]: {
    usd: number;
    usd_24h_change: number | null;
    last_updated_at: number;
  };
}

export class PriceFetchError extends Error {
  kind: "network" | "rate_limit" | "server" | "unknown";
  constructor(message: string, kind: PriceFetchError["kind"]) {
    super(message);
    this.name = "PriceFetchError";
    this.kind = kind;
  }
}

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;

export async function fetchPrices(coinIds: string[]): Promise<CoinGeckoPriceResponse> {
  if (coinIds.length === 0) return {};

  const ids = coinIds.join(",");
  const url = `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`;

  const headers: Record<string, string> = {};
  if (COINGECKO_API_KEY) {
    headers["x-cg-pro-api-key"] = COINGECKO_API_KEY;
  }

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (err) {
    throw new PriceFetchError("Network error reaching the price service", "network");
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new PriceFetchError("Rate limited by the price service", "rate_limit");
    }
    if (response.status >= 500) {
      throw new PriceFetchError("The price service encountered an error", "server");
    }
    throw new PriceFetchError(`Unexpected response from price service (${response.status})`, "unknown");
  }

  const data = (await response.json()) as CoinGeckoPriceResponse;

  return data;
}

export function formatLastUpdated(timestamp: number): string {
  if (!timestamp || timestamp <= 0) return "unknown";
  const d = new Date(timestamp * 1000);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[d.getUTCMonth()];
  const day = String(d.getUTCDate()).padStart(2, "0");
  const year = d.getUTCFullYear();
  const hours = String(d.getUTCHours()).padStart(2, "0");
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  return `${month} ${day}, ${year} ${hours}:${minutes} UTC`;
}

export function formatPriceDisplay(data: CoinGeckoPriceResponse, entries: Array<{ ticker: string; coinId: string }>): string {
  if (entries.length === 0) return "";

  const timestamps: number[] = [];
  const lines: string[] = [];

  const single = entries.length === 1;

  for (const entry of entries) {
    const coin = data[entry.coinId];
    const unavailable = !coin;
    const price = unavailable || coin.usd <= 0
      ? "Unavailable"
      : `$${coin.usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const change = !unavailable && coin.usd_24h_change != null
      ? `${coin.usd_24h_change >= 0 ? "+" : ""}${coin.usd_24h_change.toFixed(1)}%`
      : "N/A";

    if (single) {
      lines.push(`${entry.ticker} \u2014 ${price}`);
      lines.push(`24h: ${change}`);
    } else {
      lines.push(`\u2022 ${entry.ticker}: ${price} (${change})`);
    }

    if (!unavailable && coin.last_updated_at) {
      timestamps.push(coin.last_updated_at);
    }
  }

  if (timestamps.length > 0) {
    const latest = Math.max(...timestamps);
    lines.push(`Updated: ${formatLastUpdated(latest)}`);
  }

  return lines.join("\n");
}
