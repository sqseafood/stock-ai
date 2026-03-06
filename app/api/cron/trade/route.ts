import { NextRequest, NextResponse } from "next/server";
import { loadPortfolio, savePortfolio, applyBuy, applySell, appendCronLog } from "@/lib/portfolio-server";
import { getQuote, getCandles, getMetrics, delay } from "@/lib/finnhub";
import { calcRSI, calcMACD, signalStrength } from "@/lib/indicators";
import { WATCHLIST } from "@/lib/stocks";
import type { ScanResult } from "@/app/api/scan/route";
import type { AIDecision } from "@/app/api/ai-trader/route";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min timeout for Vercel

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash-001", "gemini-3-flash-preview"];

// US market hours check (9:30 AM – 4:00 PM ET, Mon–Fri)
function isMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const hours = et.getHours();
  const mins = et.getMinutes();
  const totalMins = hours * 60 + mins;
  return totalMins >= 9 * 60 + 30 && totalMins < 16 * 60;
}

async function scanAll(): Promise<ScanResult[]> {
  const results: ScanResult[] = [];
  for (let i = 0; i < WATCHLIST.length; i++) {
    const { ticker, name, sector } = WATCHLIST[i];
    try {
      const [quote, candles, metrics] = await Promise.all([
        getQuote(ticker),
        getCandles(ticker, 6),
        getMetrics(ticker),
      ]);
      if (!quote.c || !candles.closes.length) continue;
      const closes = candles.closes;
      const price = quote.c;
      const low52 = metrics.metric?.["52WeekLow"] ?? Math.min(...closes);
      const high52 = metrics.metric?.["52WeekHigh"] ?? Math.max(...closes);
      const rsi = calcRSI(closes);
      const { histogram } = calcMACD(closes);
      const range = high52 - low52;
      const posIn52 = range > 0 ? Math.round(((price - low52) / range) * 100) : 50;
      const { signal, score } = signalStrength(rsi, price, low52, high52, histogram);
      const pe = metrics.metric?.peExclExtraTTM;
      const marketCap = metrics.metric?.marketCapitalization
        ? metrics.metric.marketCapitalization * 1_000_000 : null;
      results.push({
        ticker, name, sector, price,
        change: quote.d ?? 0, changePct: quote.dp ?? 0,
        rsi, macdHistogram: histogram,
        low52, high52, posIn52, signal, score,
        pe: pe && pe > 0 ? pe : null, marketCap,
      });
    } catch { /* skip failed tickers */ }
    if (i < WATCHLIST.length - 1) await delay(500);
  }
  return results;
}

async function getAIDecisions(
  scanResults: ScanResult[],
  positions: { ticker: string; name: string; shares: number; buyPrice: number; buySignal: string }[],
  cash: number
): Promise<AIDecision[]> {
  const heldMap = new Map(positions.map((p) => [p.ticker, p]));

  const positionLines = positions.map((p) => {
    const scan = scanResults.find((s) => s.ticker === p.ticker);
    const current = scan?.price ?? p.buyPrice;
    const pnlPct = ((current - p.buyPrice) / p.buyPrice) * 100;
    return `  ${p.ticker}: bought $${p.buyPrice.toFixed(2)}, now $${current.toFixed(2)} (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%), signal: ${scan?.signal ?? "?"}, RSI: ${scan?.rsi ?? "?"}`;
  }).join("\n");

  const watchlistLines = scanResults
    .filter((s) => !heldMap.has(s.ticker))
    .map((s) =>
      `  ${s.ticker} (${s.sector}): $${s.price.toFixed(2)}, signal: ${s.signal}, RSI: ${s.rsi}, 52W%: ${s.posIn52}%, MACD hist: ${s.macdHistogram.toFixed(3)}`
    ).join("\n");

  const prompt = `You are an AI stock trader. Buy-low, sell-high strategy. No emotional bias.

PORTFOLIO: $${cash.toFixed(2)} cash. $1,000 per trade. Max 1 position per stock.

CURRENT POSITIONS:
${positionLines || "  None"}

WATCHLIST (not held):
${watchlistLines}

BUY if: signal BUY/STRONG BUY, RSI < 50, 52W% < 60%, MACD positive, have cash
SELL if: signal SELL/STRONG SELL, OR gain > 18%, OR loss > 9%, OR RSI > 68

Return ONLY a JSON array with BUY/SELL actions (skip HOLD):
[{"ticker":"XYZ","action":"BUY","reason":"one sentence"}]
Empty array if no trades needed.`;

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
          }),
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;
      const raw: { ticker: string; action: string; reason: string }[] = JSON.parse(text);
      return raw
        .filter((d) => d.action === "BUY" || d.action === "SELL")
        .map((d) => {
          const scan = scanResults.find((s) => s.ticker === d.ticker);
          const pos = heldMap.get(d.ticker);
          if (!scan) return null;
          return {
            ticker: d.ticker, name: scan.name,
            action: d.action as "BUY" | "SELL",
            reason: d.reason,
            currentPrice: scan.price, signal: scan.signal,
            rsi: scan.rsi, posIn52: scan.posIn52,
            buyPrice: pos?.buyPrice,
            unrealizedPnLPct: pos ? ((scan.price - pos.buyPrice) / pos.buyPrice) * 100 : undefined,
          };
        })
        .filter(Boolean) as AIDecision[];
    } catch { continue; }
  }
  throw new Error("All Gemini models failed");
}

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized triggers
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runAt = new Date().toISOString();

  if (!isMarketOpen()) {
    return NextResponse.json({ skipped: true, reason: "Market closed" });
  }

  try {
    // 1. Scan market
    const scanResults = await scanAll();
    if (!scanResults.length) {
      return NextResponse.json({ skipped: true, reason: "No scan data" });
    }

    // 2. Load current portfolio
    const portfolio = await loadPortfolio();

    // 3. Get AI decisions
    const decisions = await getAIDecisions(scanResults, portfolio.positions, portfolio.cash);

    // 4. Execute trades — sells first, then buys
    const executedTrades: { ticker: string; action: string; reason: string; price: number }[] = [];
    const sorted = [...decisions].sort((a, b) =>
      a.action === "SELL" && b.action === "BUY" ? -1 : 1
    );

    for (const d of sorted) {
      let err: string | null = null;
      if (d.action === "BUY") {
        err = applyBuy(portfolio, d.ticker, d.name, d.currentPrice, d.signal, "cron");
      } else {
        err = applySell(portfolio, d.ticker, d.currentPrice, d.signal, "cron");
      }
      if (!err) {
        executedTrades.push({ ticker: d.ticker, action: d.action, reason: d.reason, price: d.currentPrice });
      }
    }

    // 5. Save portfolio + log
    await savePortfolio(portfolio);
    await appendCronLog({ runAt, decisionsCount: executedTrades.length, trades: executedTrades });

    return NextResponse.json({ success: true, tradesExecuted: executedTrades.length, trades: executedTrades });
  } catch (err) {
    await appendCronLog({ runAt, decisionsCount: 0, trades: [], error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
