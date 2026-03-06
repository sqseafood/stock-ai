const BASE = "https://finnhub.io/api/v1";
const KEY = process.env.FINNHUB_API_KEY!;

function api(path: string) {
  return fetch(`${BASE}${path}&token=${KEY}`, { next: { revalidate: 0 } }).then((r) => r.json());
}

export interface FinnQuote {
  c: number;  // current price
  d: number;  // change
  dp: number; // change %
  h: number;  // high
  l: number;  // low
  o: number;  // open
  pc: number; // prev close
}

export interface FinnCandle {
  c: number[]; // closes
  h: number[]; // highs
  l: number[]; // lows
  o: number[]; // opens
  v: number[]; // volumes
  t: number[]; // timestamps
  s: string;   // status
}

export interface FinnMetric {
  metric: {
    "52WeekHigh": number;
    "52WeekLow": number;
    peExclExtraTTM: number;
    marketCapitalization: number; // in millions
    revenueGrowthTTMYoy: number;
    netProfitMarginTTM: number;
  };
}

export async function getQuote(symbol: string): Promise<FinnQuote> {
  return api(`/quote?symbol=${symbol}`);
}

// Historical OHLCV via Yahoo Finance chart API (free, no key needed)
export async function getCandles(symbol: string, months = 6): Promise<{ closes: number[]; volumes: number[]; timestamps: number[] }> {
  const range = months <= 6 ? "6mo" : "1y";
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${range}`,
    { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 0 } }
  );
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) return { closes: [], volumes: [], timestamps: [] };
  return {
    closes: result.indicators.quote[0].close.map((v: number | null) => v ?? 0).filter(Boolean),
    volumes: result.indicators.quote[0].volume.map((v: number | null) => v ?? 0),
    timestamps: result.timestamp ?? [],
  };
}

export async function getMetrics(symbol: string): Promise<FinnMetric> {
  return api(`/stock/metric?symbol=${symbol}&metric=all`);
}

export async function getProfile(symbol: string): Promise<{ name: string; finnhubIndustry: string }> {
  return api(`/stock/profile2?symbol=${symbol}`);
}

export async function getNews(symbol: string, days = 7) {
  const to = new Date().toISOString().split("T")[0];
  const from = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
  return api(`/company-news?symbol=${symbol}&from=${from}&to=${to}`);
}

// Small delay to respect rate limits
export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
