import { WATCHLIST } from "@/lib/stocks";

// --- Sector ETF Performance (Yahoo Finance, no key needed) ---
const SECTOR_ETFS = [
  { sector: "Technology",       etf: "XLK" },
  { sector: "Financials",       etf: "XLF" },
  { sector: "Healthcare",       etf: "XLV" },
  { sector: "Energy",           etf: "XLE" },
  { sector: "Industrials",      etf: "XLI" },
  { sector: "Consumer Disc",    etf: "XLY" },
  { sector: "Consumer Staples", etf: "XLP" },
  { sector: "Utilities",        etf: "XLU" },
  { sector: "Materials",        etf: "XLB" },
  { sector: "Real Estate",      etf: "XLRE" },
  { sector: "Communication",    etf: "XLC" },
];

export interface SectorPerf {
  sector: string;
  etf: string;
  changePct: number;
}

export async function getSectorPerformance(): Promise<SectorPerf[]> {
  try {
    const results = await Promise.all(
      SECTOR_ETFS.map(async ({ sector, etf }) => {
        try {
          const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${etf}?interval=1d&range=5d`,
            { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 0 } }
          );
          const data = await res.json();
          const quote = data?.chart?.result?.[0]?.indicators?.quote?.[0];
          const closes: number[] = (quote?.close ?? []).filter(Boolean);
          if (closes.length < 2) return { sector, etf, changePct: 0 };
          const changePct = +((closes.at(-1)! / closes.at(-2)! - 1) * 100).toFixed(2);
          return { sector, etf, changePct };
        } catch { return { sector, etf, changePct: 0 }; }
      })
    );
    return results.sort((a, b) => b.changePct - a.changePct);
  } catch { return []; }
}

// --- Economic Calendar (Finnhub) — Fed, CPI, jobs, GDP, etc. ---
export interface EconomicEvent {
  event: string;
  country: string;
  date: string;
  impact: string; // "high" | "medium" | "low"
  estimate?: string;
  prev?: string;
}

export async function getEconomicCalendar(days = 7): Promise<EconomicEvent[]> {
  try {
    const from = new Date().toISOString().split("T")[0];
    const to = new Date(Date.now() + days * 86400000).toISOString().split("T")[0];
    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${process.env.FINNHUB_API_KEY}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const events: EconomicEvent[] = (data?.economicCalendar ?? [])
      .filter((e: { country: string; impact: string }) => e.country === "US" && e.impact === "high")
      .slice(0, 10)
      .map((e: { event: string; country: string; time: string; impact: string; estimate?: string; prev?: string }) => ({
        event: e.event,
        country: e.country,
        date: e.time?.split("T")[0] ?? from,
        impact: e.impact,
        estimate: e.estimate ?? undefined,
        prev: e.prev ?? undefined,
      }));
    return events;
  } catch { return []; }
}

// --- Fear & Greed Index (CNN) ---
export interface FearGreed {
  score: number;       // 0-100
  rating: string;      // "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed"
}

export async function getFearGreed(): Promise<FearGreed | null> {
  try {
    const res = await fetch(
      "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const score = Math.round(data?.fear_and_greed?.score ?? 0);
    const rating = data?.fear_and_greed?.rating ?? "Neutral";
    return { score, rating };
  } catch { return null; }
}

// --- VIX (Volatility Index via Yahoo Finance) ---
export async function getVIX(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d",
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const closes: number[] = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const last = closes.filter(Boolean).at(-1);
    return last ? Math.round(last * 100) / 100 : null;
  } catch { return null; }
}

// --- Earnings Calendar (Finnhub) ---
export interface EarningsEvent {
  ticker: string;
  date: string;  // YYYY-MM-DD
}

export async function getUpcomingEarnings(): Promise<EarningsEvent[]> {
  try {
    const today = new Date();
    const from = today.toISOString().split("T")[0];
    const to = new Date(today.getTime() + 7 * 86400000).toISOString().split("T")[0];
    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${process.env.FINNHUB_API_KEY}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const tickers = new Set(WATCHLIST.map((w) => w.ticker));
    return (data?.earningsCalendar ?? [])
      .filter((e: { symbol: string; date: string }) => tickers.has(e.symbol))
      .map((e: { symbol: string; date: string }) => ({ ticker: e.symbol, date: e.date }));
  } catch { return []; }
}

// --- Reddit WSB Sentiment ---
export interface RedditMention {
  ticker: string;
  mentions: number;
  sentiment: "bullish" | "bearish" | "mixed";
  topPost: string;
}

export async function getWSBSentiment(): Promise<RedditMention[]> {
  try {
    const res = await fetch(
      "https://www.reddit.com/r/wallstreetbets/hot.json?limit=50",
      { headers: { "User-Agent": "stock-ai-bot/1.0" }, next: { revalidate: 0 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const posts: { title: string; score: number; selftext?: string }[] =
      data?.data?.children?.map((c: { data: { title: string; score: number; selftext?: string } }) => c.data) ?? [];

    const tickers = WATCHLIST.map((w) => w.ticker);
    const mentionMap = new Map<string, { count: number; bullish: number; bearish: number; topPost: string; topScore: number }>();

    const bullishWords = /\b(buy|long|calls|moon|bullish|squeeze|breakout|pump|upside|bull)\b/i;
    const bearishWords = /\b(sell|short|puts|crash|bearish|dump|downside|bear|drop)\b/i;

    for (const post of posts) {
      const text = `${post.title} ${post.selftext ?? ""}`;
      for (const ticker of tickers) {
        const pattern = new RegExp(`\\b${ticker}\\b`);
        if (!pattern.test(text)) continue;
        const entry = mentionMap.get(ticker) ?? { count: 0, bullish: 0, bearish: 0, topPost: "", topScore: 0 };
        entry.count++;
        if (bullishWords.test(text)) entry.bullish++;
        if (bearishWords.test(text)) entry.bearish++;
        if (post.score > entry.topScore) {
          entry.topScore = post.score;
          entry.topPost = post.title.slice(0, 100);
        }
        mentionMap.set(ticker, entry);
      }
    }

    return Array.from(mentionMap.entries())
      .filter(([, v]) => v.count > 0)
      .map(([ticker, v]) => ({
        ticker,
        mentions: v.count,
        sentiment: (v.bullish > v.bearish ? "bullish" : v.bearish > v.bullish ? "bearish" : "mixed") as "bullish" | "bearish" | "mixed",
        topPost: v.topPost,
      }))
      .sort((a, b) => b.mentions - a.mentions);
  } catch { return []; }
}
