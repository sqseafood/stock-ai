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

// Broad market/macro news (Fed, regulation, politics, rates, trade)
// category: "general" | "forex" | "merger"
export async function getMarketNews(category = "general", limit = 20): Promise<{ headline: string; summary: string; datetime: number }[]> {
  try {
    const data = await api(`/news?category=${category}`);
    if (!Array.isArray(data)) return [];
    return data
      .filter((a: { headline?: string }) => a.headline)
      .slice(0, limit)
      .map((a: { headline: string; summary?: string; datetime: number }) => ({
        headline: a.headline.trim(),
        summary: (a.summary ?? "").slice(0, 200).trim(),
        datetime: a.datetime,
      }));
  } catch { return []; }
}

// Returns top N recent headlines (last `days` days), empty array on failure
export async function getRecentHeadlines(symbol: string, days = 5, limit = 4): Promise<string[]> {
  try {
    const articles = await getNews(symbol, days);
    if (!Array.isArray(articles)) return [];
    return articles
      .filter((a: { headline?: string }) => a.headline)
      .slice(0, limit)
      .map((a: { headline: string }) => a.headline.trim());
  } catch { return []; }
}

// Earnings history: how many of last N quarters beat estimate (0-N)
export async function getEarningsBeats(symbol: string, quarters = 4): Promise<number> {
  try {
    const data = await api(`/stock/earnings?symbol=${symbol}&limit=${quarters}`);
    if (!Array.isArray(data) || !data.length) return 0;
    return data.filter((e: { actual?: number; estimate?: number }) =>
      e.actual !== null && e.estimate !== null && e.actual !== undefined && e.estimate !== undefined && e.actual > e.estimate
    ).length;
  } catch { return 0; }
}

// Latest analyst consensus: { buy, hold, sell, strongBuy, strongSell, period }
export interface AnalystRec {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  period: string;
}

export async function getAnalystRecs(symbol: string): Promise<AnalystRec | null> {
  try {
    const data = await api(`/stock/recommendation?symbol=${symbol}`);
    if (!Array.isArray(data) || !data.length) return null;
    const latest = data[0] as AnalystRec;
    return latest;
  } catch { return null; }
}

// Small delay to respect rate limits
export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
