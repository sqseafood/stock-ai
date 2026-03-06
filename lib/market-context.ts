import { WATCHLIST } from "@/lib/stocks";

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
        sentiment: v.bullish > v.bearish ? "bullish" : v.bearish > v.bullish ? "bearish" : "mixed",
        topPost: v.topPost,
      }))
      .sort((a, b) => b.mentions - a.mentions);
  } catch { return []; }
}
