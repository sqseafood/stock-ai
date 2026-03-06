import { NextRequest, NextResponse } from "next/server";
import { appendCronLog, loadPortfolio, savePortfolio, applySell, applyBuy, TRADE_AMOUNT } from "@/lib/portfolio-server";
import { getAccount, getPositions, placeBuyOrder, closePosition } from "@/lib/alpaca";
import { getQuote, getCandles, getMetrics, delay } from "@/lib/finnhub";
import { calcRSI, calcMACD, calcBollingerBands, signalStrength } from "@/lib/indicators";
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
      const volumes = candles.volumes;
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
      const change5d = closes.length >= 6
        ? +((closes[closes.length - 1] / closes[closes.length - 6] - 1) * 100).toFixed(2) : 0;
      const avgVol = volumes.length > 0
        ? volumes.slice(-20).reduce((a: number, b: number) => a + b, 0) / Math.min(volumes.length, 20) : 0;
      const lastVol = volumes[volumes.length - 1] ?? 0;
      const volumeRatio = avgVol > 0 ? Math.round((lastVol / avgVol) * 10) / 10 : 1;
      const { upper, lower } = calcBollingerBands(closes);
      const bbRange = upper - lower;
      const bollingerPos = bbRange > 0 ? Math.round(((price - lower) / bbRange) * 100) : 50;
      results.push({
        ticker, name, sector, price,
        change: quote.d ?? 0, changePct: quote.dp ?? 0,
        rsi, macdHistogram: histogram,
        low52, high52, posIn52, signal, score,
        pe: pe && pe > 0 ? pe : null, marketCap,
        change5d, volumeRatio, bollingerPos,
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
      `  ${s.ticker} (${s.sector}): $${s.price.toFixed(2)} | 1d: ${s.changePct.toFixed(1)}% | 5d: ${s.change5d}% | RSI: ${s.rsi} | signal: ${s.signal} | vol: ${s.volumeRatio}x | BB: ${s.bollingerPos}% | 52W: ${s.posIn52}%`
    ).join("\n");

  const earningsWarning = context.earnings.length > 0
    ? context.earnings.map((e) => `  ${e.ticker} reports on ${e.date}`).join("\n")
    : "  None in next 7 days";

  const wsbLines = context.wsb.length > 0
    ? context.wsb.map((w) => `  ${w.ticker}: ${w.mentions} mentions, ${w.sentiment} — "${w.topPost}"`).join("\n")
    : "  No significant mentions";

  const marketMood = context.fearGreedScore !== null
    ? `Fear & Greed: ${context.fearGreedScore}/100 (${context.fearGreedRating})`
    : "Fear & Greed: unavailable";
  const vixLine = context.vix !== null
    ? `VIX: ${context.vix} (${context.vix > 30 ? "HIGH VOLATILITY" : context.vix > 20 ? "Elevated" : "Normal"})`
    : "VIX: unavailable";

  const prompt = `You are an aggressive AI stock trader. Your ONLY goal is to MAXIMIZE PROFIT.

Use ANY strategy that makes money:
- Momentum: buy stocks surging with high volume, sell when momentum fades
- Mean reversion: buy extreme oversold dips, sell recovery
- Breakout: buy when volume spikes + price breaks resistance
- Scalping: take quick 1-3% gains and recycle capital into the next trade
- Trend: buy stocks in strong uptrends (RSI 50-65, rising 5d momentum)

PORTFOLIO: $${cash.toFixed(2)} cash | $${TRADE_AMOUNT.toLocaleString()} per trade | Max 1 position per ticker

MARKET:
  ${marketMood}
  ${vixLine}

UPCOMING EARNINGS (high risk — avoid buying, consider selling before):
${earningsWarning}

REDDIT WSB (momentum signals):
${wsbLines}

CURRENT POSITIONS (ticker | bought | now | P&L% | RSI | signal):
${positionLines || "  None"}

WATCHLIST (ticker | sector | price | 1d% | 5d% | RSI | signal | vol ratio | BB pos | 52W%):
${watchlistLines}

HARD RULES — never break these:
1. Max 8 open positions total (currently holding ${positions.length})
2. SELL immediately if any position is down -3% or more — capital protection
3. Avoid buying stocks with earnings within 2 days

EVERYTHING ELSE IS YOUR CALL. Be aggressive. Make multiple trades per run if opportunities exist.
High volume ratio (>1.5x) = unusual activity — pay attention.
BB position: 0% = at lower band (oversold), 100% = at upper band (overbought).

Return ONLY a JSON array of ALL trades you want to execute right now:
[{"ticker":"XYZ","action":"BUY","reason":"one sentence"},{"ticker":"ABC","action":"SELL","reason":"one sentence"}]
Empty array [] if no good opportunities.`;

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

    // Advance batch index for next run (non-fatal)
    const nextIndex = (config.currentBatchIndex + 1) * config.batchSize >= fullWatchlist.length
      ? 0
      : config.currentBatchIndex + 1;
    try { await saveConfig({ ...config, currentBatchIndex: nextIndex }); } catch { /* non-fatal */ }

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

    // Forced stop-loss: sell any position down -3% regardless of AI
    const forcedSells: typeof positions = [];
    for (const pos of positions) {
      const scan = scanResults.find((s) => s.ticker === pos.ticker);
      if (scan) {
        const pnlPct = ((scan.price - pos.buyPrice) / pos.buyPrice) * 100;
        if (pnlPct <= -3) forcedSells.push(pos);
      }
    }

    const decisions = await getAIDecisions(scanResults, positions, cash, context);

    // Merge forced sells (deduplicate with AI decisions)
    const aiSellTickers = new Set(decisions.filter((d) => d.action === "SELL").map((d) => d.ticker));
    for (const pos of forcedSells) {
      if (!aiSellTickers.has(pos.ticker)) {
        const scan = scanResults.find((s) => s.ticker === pos.ticker)!;
        decisions.push({
          ticker: pos.ticker, name: pos.name, action: "SELL",
          reason: "Forced stop-loss: position down -3%",
          currentPrice: scan.price, signal: scan.signal,
          rsi: scan.rsi, posIn52: scan.posIn52,
          buyPrice: pos.buyPrice,
          unrealizedPnLPct: ((scan.price - pos.buyPrice) / pos.buyPrice) * 100,
        });
      }
    }

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

    try { await appendCronLog({ runAt, decisionsCount: executedTrades.length, trades: executedTrades }); } catch { /* non-fatal */ }
    return NextResponse.json({
      success: true,
      mode: USE_ALPACA ? "alpaca-paper" : "mock",
      tradesExecuted: executedTrades.length,
      trades: executedTrades,
    });
  } catch (err) {
    try { await appendCronLog({ runAt, decisionsCount: 0, trades: [], error: (err as Error).message }); } catch { /* non-fatal */ }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
