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
  details: { url?: string; status?: number; body?: string } | null;
  constructor(
    message: string,
    kind: PriceFetchError["kind"],
    details?: { url?: string; status?: number; body?: string },
  ) {
    super(message);
    this.name = "PriceFetchError";
    this.kind = kind;
    this.details = details ?? null;
  }
}

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;
const CRYPTOCOMPARE_API_KEY = process.env.CRYPTOCOMPARE_API_KEY;
const COINAPI_KEY = process.env.COINAPI_KEY;

export const COIN_ID_TO_TICKER: Record<string, string> = {
  "bitcoin": "BTC",
  "ethereum": "ETH",
  "the-open-network": "TON",
  "tether": "USDT",
  "binancecoin": "BNB",
  "solana": "SOL",
  "ripple": "XRP",
  "usd-coin": "USDC",
  "cardano": "ADA",
  "dogecoin": "DOGE",
  "tron": "TRX",
  "avalanche-2": "AVAX",
  "polkadot": "DOT",
  "matic-network": "MATIC",
  "chainlink": "LINK",
  "shiba-inu": "SHIB",
  "litecoin": "LTC",
  "uniswap": "UNI",
  "cosmos": "ATOM",
  "stellar": "XLM",
  "near": "NEAR",
  "algorand": "ALGO",
  "aptos": "APT",
  "sui": "SUI",
  "arbitrum": "ARB",
  "optimism": "OP",
  "filecoin": "FIL",
  "internet-computer": "ICP",
  "vechain": "VET",
  "the-graph": "GRT",
  "theta-token": "THETA",
  "ethereum-classic": "ETC",
  "fantom": "FTM",
  "flow": "FLOW",
  "the-sandbox": "SAND",
  "decentraland": "MANA",
  "axie-infinity": "AXS",
  "gala": "GALA",
  "enjincoin": "ENJ",
  "chiliz": "CHZ",
  "crypto-com-chain": "CRO",
  "ftx-token": "FTT",
  "bitdao": "BIT",
  "okb": "OKB",
  "leo-token": "LEO",
  "kucoin-shares": "KCS",
  "monero": "XMR",
  "dash": "DASH",
  "zcash": "ZEC",
  "tezos": "XTZ",
  "eos": "EOS",
  "waves": "WAVES",
  "neo": "NEO",
  "qtum": "QTUM",
  "zilliqa": "ZIL",
  "icon": "ICX",
  "ontology": "ONT",
  "bittorrent": "BTT",
  "holotoken": "HOT",
  "basic-attention-token": "BAT",
  "0x": "ZRX",
  "republic-protocol": "REN",
  "loopring": "LRC",
  "havven": "SNX",
  "compound-governance-token": "COMP",
  "aave": "AAVE",
  "maker": "MKR",
  "curve-dao-token": "CRV",
  "sushi": "SUSHI",
  "yearn-finance": "YFI",
  "injective-protocol": "INJ",
  "thorchain": "RUNE",
  "kava": "KAVA",
  "dydx": "DYDX",
  "gmx": "GMX",
  "lido-dao": "LDO",
  "rocket-pool": "RPL",
  "blockstack": "STX",
  "mina-protocol": "MINA",
  "elrond-erd-2": "EGLD",
  "ecash": "XEC",
  "klay-token": "KLAY",
  "kadena": "KDA",
  "casper-network": "CSPR",
  "flare-networks": "FLR",
  "coredaoorg": "CORE",
  "conflux-token": "CFX",
  "akash-network": "AKT",
  "oasis-network": "ROSE",
  "moonbeam": "GLMR",
  "moonriver": "MOVR",
  "astar": "ASTR",
  "audius": "AUDIO",
  "ethereum-name-service": "ENS",
  "livepeer": "LPT",
  "fetch-ai": "FET",
  "singularitynet": "AGIX",
  "ocean-protocol": "OCEAN",
  "worldcoin-wld": "WLD",
  "sei-network": "SEI",
  "celestia": "TIA",
  "pyth-network": "PYTH",
  "jupiter-exchange-solana": "JUP",
  "dogwifcoin": "WIF",
  "notcoin": "NOT",
  "pepe": "PEPE",
  "floki": "FLOKI",
  "bonk": "BONK",
  "ordinals": "ORDI",
  "starknet": "STRK",
  "ethena": "ENA",
  "mantra-dao": "OM",
  "bittensor": "TAO",
  "render-token": "RENDER",
  "helium": "HNT",
  "bitcoin-sv": "BSV",
  "bitcoin-cash": "BCH",
};

function coinIdToTicker(coinId: string): string | null {
  return COIN_ID_TO_TICKER[coinId] ?? null;
}

function tickerToCoinId(ticker: string): string | null {
  const upper = ticker.toUpperCase();
  for (const [coinId, sym] of Object.entries(COIN_ID_TO_TICKER)) {
    if (sym === upper) return coinId;
  }
  return null;
}

async function fetchPricesFromCoinGecko(coinIds: string[]): Promise<CoinGeckoPriceResponse> {
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
    console.error("[CryptoWatchr] CoinGecko fetch failed", {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new PriceFetchError(
      "Network error reaching the price service",
      "network",
      { url },
    );
  }

  if (!response.ok) {
    let body: string | undefined;
    try {
      body = await response.text();
    } catch {
      // best-effort body capture
    }

    console.error("[CryptoWatchr] CoinGecko response error", {
      url,
      status: response.status,
      body: body ? body.slice(0, 500) : undefined,
    });

    const details = { url, status: response.status, body };
    if (response.status === 429) {
      throw new PriceFetchError("Rate limited by the price service", "rate_limit", details);
    }
    if (response.status >= 500) {
      throw new PriceFetchError("The price service encountered an error", "server", details);
    }
    throw new PriceFetchError(`Unexpected response from price service (${response.status})`, "unknown", details);
  }

  const data = (await response.json()) as CoinGeckoPriceResponse;

  return data;
}

async function fetchFromCryptoCompare(coinIds: string[], apiKey: string): Promise<CoinGeckoPriceResponse> {
  const tickers = coinIds
    .map((id) => coinIdToTicker(id))
    .filter((t): t is string => t !== null);
  if (tickers.length === 0) throw new PriceFetchError("No matching tickers for CryptoCompare", "unknown");

  const url = `https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${encodeURIComponent(tickers.join(","))}&tsyms=USD`;
  const headers: Record<string, string> = { authorization: `Apikey ${apiKey}` };

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch {
    throw new PriceFetchError("Network error reaching CryptoCompare", "network");
  }

  if (!response.ok) {
    if (response.status === 429) throw new PriceFetchError("CryptoCompare rate limited", "rate_limit");
    throw new PriceFetchError(`CryptoCompare error (${response.status})`, "server");
  }

  const data = await response.json() as {
    RAW?: Record<string, { USD: { PRICE: number; CHANGEPCT24HOUR?: number; LASTUPDATE?: number } }>;
  };

  const result: CoinGeckoPriceResponse = {};
  for (const coinId of coinIds) {
    const ticker = coinIdToTicker(coinId);
    if (!ticker) continue;
    const raw = data.RAW?.[ticker]?.USD;
    if (!raw || raw.PRICE <= 0) continue;
    result[coinId] = {
      usd: raw.PRICE,
      usd_24h_change: raw.CHANGEPCT24HOUR != null ? raw.CHANGEPCT24HOUR : null,
      last_updated_at: raw.LASTUPDATE ?? Math.floor(Date.now() / 1000),
    };
  }

  return result;
}

interface CoinApiExchangeRateResponse {
  asset_id_base: string;
  rate: number;
  time: string;
}

async function fetchFromCoinApiSingle(ticker: string, apiKey: string): Promise<{ coinId: string; usd: number; last_updated_at: number } | null> {
  const url = `https://rest.coinapi.io/v1/exchangerate/${encodeURIComponent(ticker)}/USD`;
  const headers: Record<string, string> = { "X-CoinAPI-Key": apiKey };

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch {
    return null;
  }

  if (!response.ok) {
    if (response.status === 429) throw new PriceFetchError("CoinAPI rate limited", "rate_limit");
    return null;
  }

  const data = await response.json() as CoinApiExchangeRateResponse;
  if (!data.rate || data.rate <= 0) return null;

  const coinId = tickerToCoinId(data.asset_id_base);
  if (!coinId) return null;

  const lastUpdatedAt = Math.floor(new Date(data.time).getTime() / 1000);

  return { coinId, usd: data.rate, last_updated_at: isNaN(lastUpdatedAt) ? Math.floor(Date.now() / 1000) : lastUpdatedAt };
}

async function fetchFromCoinAPI(coinIds: string[], apiKey: string): Promise<CoinGeckoPriceResponse> {
  const results = await Promise.all(
    coinIds.map(async (coinId) => {
      const ticker = coinIdToTicker(coinId);
      if (!ticker) return null;
      try {
        return await fetchFromCoinApiSingle(ticker, apiKey);
      } catch (err) {
        if (err instanceof PriceFetchError && err.kind === "rate_limit") throw err;
        return null;
      }
    }),
  );

  const data: CoinGeckoPriceResponse = {};
  for (const r of results) {
    if (!r) continue;
    data[r.coinId] = { usd: r.usd, usd_24h_change: null, last_updated_at: r.last_updated_at };
  }

  return data;
}

export async function fetchPrices(coinIds: string[]): Promise<CoinGeckoPriceResponse> {
  try {
    return await fetchPricesFromCoinGecko(coinIds);
  } catch (coinGeckoErr) {
    const fallbacks: Array<{ label: string; fn: () => Promise<CoinGeckoPriceResponse> }> = [];

    if (CRYPTOCOMPARE_API_KEY) {
      fallbacks.push({
        label: "CryptoCompare",
        fn: () => fetchFromCryptoCompare(coinIds, CRYPTOCOMPARE_API_KEY),
      });
    }

    if (COINAPI_KEY) {
      fallbacks.push({
        label: "CoinAPI",
        fn: () => fetchFromCoinAPI(coinIds, COINAPI_KEY),
      });
    }

    for (const fallback of fallbacks) {
      try {
        const result = await fallback.fn();
        if (Object.keys(result).length > 0) {
          return result;
        }
      } catch {
        continue;
      }
    }

    throw coinGeckoErr;
  }
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
