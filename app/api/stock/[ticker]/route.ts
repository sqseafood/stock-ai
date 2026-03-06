import { NextRequest, NextResponse } from "next/server";
import { getQuote, getCandles, getMetrics, getProfile, getNews } from "@/lib/finnhub";
import { calcRSI, calcMACD, calcSMA, calcBollingerBands, signalStrength } from "@/lib/indicators";

export const dynamic = "force-dynamic";

export interface StockDetail {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  low52: number;
  high52: number;
  posIn52: number;
  pe: number | null;
  marketCap: number | null;
  rsi: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  sma20: number;
  sma50: number;
  bollingerUpper: number;
  bollingerLower: number;
  signal: "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "STRONG SELL";
  score: number;
  history: { date: string; close: number; volume: number }[];
  companyNews: { headline: string; source: string; url: string; datetime: number }[];
  macroNews: { title: string; source: string; url: string; publishedAt: string }[];
  aiAnalysis: string;
}

async function fetchMacroNews() {
  try {
    const res = await fetch(
      `https://newsapi.org/v2/top-headlines?category=business&language=en&pageSize=10&apiKey=${process.env.NEWSAPI_KEY}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles as { title: string; source: { name: string }; url: string; publishedAt: string }[])
      .slice(0, 8)
      .map((a) => ({ title: a.title, source: a.source.name, url: a.url, publishedAt: a.publishedAt }));
  } catch { return []; }
}

const GEMINI_MODELS = ["gemini-3-flash-preview", "gemini-2.5-flash", "gemini-2.0-flash-001"];

async function getAIAnalysis(
  ticker: string, name: string, price: number, rsi: number,
  signal: string, posIn52: number, pe: number | null,
  companyNews: { headline: string }[],
  macroNews: { title: string }[]
): Promise<string> {
  const prompt = `You are a stock analyst helping a buy-low-sell-high investor. Analyze ${name} (${ticker}).

Technical snapshot:
- Current price: $${price.toFixed(2)}
- RSI: ${rsi} (under 30 = oversold/buy zone, over 70 = overbought/sell zone)
- Position in 52-week range: ${posIn52}% (0% = yearly low, 100% = yearly high)
- P/E ratio: ${pe?.toFixed(1) ?? "N/A"}
- Signal: ${signal}

Recent company news:
${companyNews.slice(0, 5).map((n) => `• ${n.headline}`).join("\n")}

Macro & market news:
${macroNews.slice(0, 5).map((n) => `• ${n.title}`).join("\n")}

Write 4–6 sentences covering:
1. What's driving the current price (specific news or events)
2. Whether the move is temporary or a structural shift
3. How macro factors (Fed policy, geopolitics, sector trends) affect this stock
4. A clear buy/hold/sell recommendation with a practical entry or exit note

Be direct and actionable. Skip disclaimers.`;

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
    } catch { continue; }
  }
  return "AI analysis temporarily unavailable. Check back shortly.";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const sym = ticker.toUpperCase();

  try {
    const [quote, candles, metrics, profile, companyNews, macroNews] = await Promise.all([
      getQuote(sym),
      getCandles(sym, 6),
      getMetrics(sym),
      getProfile(sym),
      getNews(sym, 7),
      fetchMacroNews(),
    ]);

    if (!quote.c || !candles.closes.length) {
      return NextResponse.json({ error: `No data for ${sym}` }, { status: 404 });
    }

    const closes = candles.closes;
    const price = quote.c;
    const low52 = metrics.metric?.["52WeekLow"] ?? Math.min(...closes);
    const high52 = metrics.metric?.["52WeekHigh"] ?? Math.max(...closes);
    const rsi = calcRSI(closes);
    const { macd, signal: macdSig, histogram } = calcMACD(closes);
    const sma20 = calcSMA(closes, 20);
    const sma50 = calcSMA(closes, 50);
    const { upper, lower } = calcBollingerBands(closes);
    const range = high52 - low52;
    const posIn52 = range > 0 ? Math.round(((price - low52) / range) * 100) : 50;
    const { signal, score } = signalStrength(rsi, price, low52, high52, histogram);
    const pe = metrics.metric?.peExclExtraTTM;
    const marketCap = metrics.metric?.marketCapitalization
      ? metrics.metric.marketCapitalization * 1_000_000 : null;

    const aiAnalysis = await getAIAnalysis(
      sym, profile?.name ?? sym, price, rsi, signal, posIn52,
      pe && pe > 0 ? pe : null, companyNews.slice(0, 8), macroNews
    );

    const detail: StockDetail = {
      ticker: sym,
      name: profile?.name ?? sym,
      price, change: quote.d ?? 0, changePct: quote.dp ?? 0,
      low52, high52, posIn52,
      pe: pe && pe > 0 ? pe : null, marketCap,
      rsi, macd, macdSignal: macdSig, macdHistogram: histogram,
      sma20, sma50, bollingerUpper: upper, bollingerLower: lower,
      signal, score,
      history: candles.timestamps.slice(-90).map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().split("T")[0],
        close: candles.closes[candles.closes.length - 90 + i] ?? 0,
        volume: candles.volumes[candles.volumes.length - 90 + i] ?? 0,
      })),
      companyNews: (companyNews as { headline: string; source: string; url: string; datetime: number }[]).slice(0, 8),
      macroNews,
      aiAnalysis,
    };

    return NextResponse.json(detail);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
