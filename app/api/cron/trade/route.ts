import { NextRequest, NextResponse } from "next/server";
import { appendCronLog, loadPortfolio, savePortfolio, applySell, applyBuy, TRADE_AMOUNT } from "@/lib/portfolio-server";
import { getAccount, getPositions, placeBuyOrder, closePosition } from "@/lib/alpaca";
import { getQuote, getCandles, getMetrics, delay } from "@/lib/finnhub";
import { calcRSI, calcMACD, signalStrength } from "@/lib/indicators";
import { buildWatchlist, getBatch } from "@/lib/stocks-full";
import { loadConfig, saveConfig } from "@/lib/watchlist-config";
import { getFearGreed, getVIX, getUpcomingEarnings, getWSBSentiment } from "@/lib/market-context";
import type { ScanResult } from "@/app/api/scan/route";
import type { AIDecision } from "@/app/api/ai-trader/route";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash-001", "gemini-3-flash-preview"];
const USE_ALPACA = !!(process.env.ALPACA_KEY_ID && process.env.ALPACA_SECRET_KEY);

function isMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const totalMins = et.getHours() * 60 + et.getMinutes();
  return totalMins >= 9 * 60 + 30 && totalMins < 16 * 60;
}

async function scanAll(watchlist: { ticker: string; name: string; sector: string }[]): Promise<ScanResult[]> {
  const results: ScanResult[] = [];
  for (let i = 0; i < watchlist.length; i++) {
    const { ticker, name, sector } = watchlist[i];
    try {
      const [quote, candles, metrics] = await Promise.all([
        getQuote(ticker), getCandles(ticker, 6), getMetrics(ticker),
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
    } catch { /* skip */ }
    if (i < watchlist.length - 1) await delay(500);
  }
  return results;
}

async function getAIDecisions(
  scanResults: ScanResult[],
  positions: { ticker: string; shares: number; buyPrice: number }[],
  cash: number,
  context: { fearGreedScore: number | null; fearGreedRating: string | null; vix: number | null; earnings: { ticker: string; date: string }[]; wsb: { ticker: string; mentions: number; sentiment: string; topPost: string }[] }
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

  const earningsWarning = context.earnings.length > 0
    ? context.earnings.map((e) => `  ${e.ticker} reports on ${e.date} — AVOID buying, consider selling before`).join(
)
    : "  None in next 7 days";

  const wsbLines = context.wsb.length > 0
    ? context.wsb.map((w) => `  ${w.ticker}: ${w.mentions} mentions, ${w.sentiment} — "${w.topPost}"`).join(
)
    : "  No significant mentions";

  const marketMood = context.fearGreedScore !== null
    ? `Fear & Greed: ${context.fearGreedScore}/100 (${context.fearGreedRating})`
    : "Fear & Greed: unavailable";
  const vixLine = context.vix !== null
    ? `VIX: ${context.vix} (${context.vix > 30 ? "HIGH VOLATILITY — be cautious" : context.vix > 20 ? "Elevated volatility" : "Normal"})`
    : "VIX: unavailable";

  const prompt = `You are an AI stock trader. Buy-low, sell-high strategy. No emotional bias.

PORTFOLIO: $${cash.toFixed(2)} cash. $${TRADE_AMOUNT.toLocaleString()} per trade. Max 1 position per stock.

MARKET CONDITIONS:
  ${marketMood}
  ${vixLine}

UPCOMING EARNINGS (avoid these — high risk):
${earningsWarning}

REDDIT WSB SENTIMENT:
${wsbLines}

CURRENT POSITIONS:
${positionLines || "  None"}

WATCHLIST (not held):
${watchlistLines}

BUY if: signal BUY/STRONG BUY, RSI < 50, 52W% < 60%, MACD positive, have cash, Fear&Greed not Extreme Greed, no earnings this week
SELL if: signal SELL/STRONG SELL, OR gain > 18%, OR loss > 9%, OR RSI > 68, OR earnings within 2 days
EXTRA CAUTION if: VIX > 30 (only strong buys), Fear&Greed < 20 (Extreme Fear — wait for stabilization)
WSB MOMENTUM: if 3+ bullish mentions and technical signals agree, slightly favor buying

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
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runAt = new Date().toISOString();

  if (!isMarketOpen()) {
    return NextResponse.json({ skipped: true, reason: "Market closed" });
  }

  try {
    // Load config and build this run's batch
    const config = await loadConfig();
    const fullWatchlist = buildWatchlist(config);
    const watchlist = getBatch(fullWatchlist, config.batchSize, config.currentBatchIndex);

    // Advance batch index for next run
    const nextIndex = (config.currentBatchIndex + 1) * config.batchSize >= fullWatchlist.length
      ? 0
      : config.currentBatchIndex + 1;
    await saveConfig({ ...config, currentBatchIndex: nextIndex });

    const scanResults = await scanAll(watchlist);
    if (!scanResults.length) {
      return NextResponse.json({ skipped: true, reason: "No scan data" });
    }

    let cash: number;
    let positions: { ticker: string; name: string; shares: number; buyPrice: number }[];

    if (USE_ALPACA) {
      const [account, alpacaPositions] = await Promise.all([getAccount(), getPositions()]);
      cash = parseFloat(account.cash);
      positions = alpacaPositions.map((p) => ({
        ticker: p.symbol,
        name: fullWatchlist.find((w) => w.ticker === p.symbol)?.name ?? p.symbol,
        shares: parseFloat(p.qty),
        buyPrice: parseFloat(p.avg_entry_price),
      }));
    } else {
      const portfolio = await loadPortfolio();
      cash = portfolio.cash;
      positions = portfolio.positions;
    }

    const [fearGreed, vix, earnings, wsb] = await Promise.all([
      getFearGreed(), getVIX(), getUpcomingEarnings(), getWSBSentiment(),
    ]);
    const context = {
      fearGreedScore: fearGreed?.score ?? null,
      fearGreedRating: fearGreed?.rating ?? null,
      vix,
      earnings,
      wsb,
    };

    const decisions = await getAIDecisions(scanResults, positions, cash, context);
    const executedTrades: { ticker: string; action: string; reason: string; price: number }[] = [];
    const sorted = [...decisions].sort((a, b) =>
      a.action === "SELL" && b.action === "BUY" ? -1 : 1
    );

    for (const d of sorted) {
      try {
        if (USE_ALPACA) {
          if (d.action === "BUY") {
            await placeBuyOrder(d.ticker, TRADE_AMOUNT);
          } else {
            await closePosition(d.ticker);
          }
        } else {
          const portfolio = await loadPortfolio();
          let err: string | null = null;
          if (d.action === "BUY") {
            err = applyBuy(portfolio, d.ticker, d.name, d.currentPrice, d.signal, "cron");
          } else {
            err = applySell(portfolio, d.ticker, d.currentPrice, d.signal, "cron");
          }
          if (err) continue;
          await savePortfolio(portfolio);
        }
        executedTrades.push({ ticker: d.ticker, action: d.action, reason: d.reason, price: d.currentPrice });
      } catch (tradeErr) {
        console.error(`Trade failed for ${d.ticker}:`, tradeErr);
      }
    }

    await appendCronLog({ runAt, decisionsCount: executedTrades.length, trades: executedTrades });
    return NextResponse.json({
      success: true,
      mode: USE_ALPACA ? "alpaca-paper" : "mock",
      tradesExecuted: executedTrades.length,
      trades: executedTrades,
    });
  } catch (err) {
    await appendCronLog({ runAt, decisionsCount: 0, trades: [], error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
