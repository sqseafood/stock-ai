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

type Context = {
  fearGreedScore: number | null;
  fearGreedRating: string | null;
  vix: number | null;
  earnings: { ticker: string; date: string }[];
  wsb: { ticker: string; mentions: number; sentiment: string; topPost: string }[];
};

type Candidate = {
  ticker: string;
  name: string;
  action: "BUY" | "SELL";
  technicalReason: string;
  scan: ScanResult;
  buyPrice?: number;
  pnlPct?: number;
};

// Phase 1: Pure rules — no AI, no hallucinations
function applyRules(
  scanResults: ScanResult[],
  positions: { ticker: string; name: string; shares: number; buyPrice: number }[],
  cash: number,
  earningsTickers: Set<string>,
): Candidate[] {
  const heldMap = new Map(positions.map((p) => [p.ticker, p]));
  const candidates: Candidate[] = [];

  // --- SELL rules ---
  for (const pos of positions) {
    const scan = scanResults.find((s) => s.ticker === pos.ticker);
    if (!scan) continue;
    const pnlPct = ((scan.price - pos.buyPrice) / pos.buyPrice) * 100;
    let reason = "";
    if (pnlPct <= -3)                                          reason = `Stop-loss triggered: down ${pnlPct.toFixed(1)}%`;
    else if (pnlPct >= 12)                                     reason = `Profit target hit: up ${pnlPct.toFixed(1)}%`;
    else if (pnlPct >= 5 && (scan.rsi > 65 || scan.macdHistogram < 0)) reason = `Quick profit ${pnlPct.toFixed(1)}%: momentum fading (RSI ${scan.rsi})`;
    else if (scan.rsi > 70)                                    reason = `Overbought: RSI ${scan.rsi}`;
    else if (earningsTickers.has(pos.ticker))                  reason = `Earnings within 2 days — exit before report`;
    if (reason) candidates.push({ ticker: pos.ticker, name: pos.name, action: "SELL", technicalReason: reason, scan, buyPrice: pos.buyPrice, pnlPct });
  }

  // --- BUY rules ---
  const openSlots = 8 - positions.length;
  if (cash >= TRADE_AMOUNT * 0.5 && openSlots > 0) {
    let slots = openSlots;
    for (const s of scanResults) {
      if (slots <= 0) break;
      if (heldMap.has(s.ticker)) continue;
      if (earningsTickers.has(s.ticker)) continue;

      const isOversoldBounce = s.rsi < 38 && s.bollingerPos < 25 && s.volumeRatio >= 1.1;
      const isTrendFollow   = s.rsi >= 45 && s.rsi <= 60 && s.change5d > 1.5 && s.bollingerPos >= 30 && s.bollingerPos <= 65 && s.macdHistogram > 0;
      const isBreakout      = s.changePct > 1.5 && s.volumeRatio > 1.5 && s.rsi < 68 && s.bollingerPos < 80;

      let reason = "";
      if (isOversoldBounce) reason = `Oversold bounce: RSI ${s.rsi}, BB ${s.bollingerPos}%, vol ${s.volumeRatio}x`;
      else if (isTrendFollow) reason = `Trend follow: RSI ${s.rsi}, 5d momentum +${s.change5d}%, MACD positive`;
      else if (isBreakout)  reason = `Breakout: +${s.changePct.toFixed(1)}% today, vol ${s.volumeRatio}x average`;

      if (reason) { candidates.push({ ticker: s.ticker, name: s.name, action: "BUY", technicalReason: reason, scan: s }); slots--; }
    }
  }

  return candidates;
}

// Phase 2: AI reviews only rule-qualified candidates for sentiment/news/macro context
async function getAIVerdicts(candidates: Candidate[], context: Context): Promise<AIDecision[]> {
  if (!candidates.length) return [];

  const marketMood = context.fearGreedScore !== null
    ? `Fear & Greed: ${context.fearGreedScore}/100 (${context.fearGreedRating})`
    : "Fear & Greed: unavailable";
  const vixLine = context.vix !== null
    ? `VIX: ${context.vix} (${context.vix > 30 ? "HIGH VOLATILITY" : context.vix > 20 ? "Elevated" : "Normal"})`
    : "VIX: unavailable";
  const wsbMap = new Map(context.wsb.map((w) => [w.ticker, w]));

  const candidateLines = candidates.map((c) => {
    const wsb = wsbMap.get(c.ticker);
    const wsbNote = wsb ? ` | WSB: ${wsb.mentions} mentions, ${wsb.sentiment}` : "";
    const pnl = c.pnlPct !== undefined ? ` | P&L: ${c.pnlPct >= 0 ? "+" : ""}${c.pnlPct.toFixed(1)}%` : "";
    return `  ${c.action} ${c.ticker}: ${c.technicalReason}${pnl}${wsbNote}`;
  }).join("\n");

  const prompt = `You are a risk manager reviewing trade candidates that already passed technical rules.

MARKET CONDITIONS:
  ${marketMood}
  ${vixLine}

UPCOMING EARNINGS RISK: ${context.earnings.map((e) => `${e.ticker} on ${e.date}`).join(", ") || "none"}

TRADE CANDIDATES (already approved by technical rules — your job is to VETO bad ones):
${candidateLines}

VETO a trade if:
- Earnings within 2 days (too risky)
- WSB sentiment is very negative AND technical signal is weak
- Market VIX > 35 AND it's a BUY (too volatile)
- Extreme Greed (Fear&Greed > 80) AND buying at 52W high

APPROVE everything else. When in doubt, APPROVE — the rules already filtered the list.

Return JSON array — include ALL candidates, mark each APPROVE or VETO:
[{"ticker":"XYZ","action":"BUY","verdict":"APPROVE","reason":"one sentence"},{"ticker":"ABC","action":"SELL","verdict":"VETO","reason":"earnings tomorrow"}]`;

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
      const raw: { ticker: string; action: string; verdict: string; reason: string }[] = JSON.parse(text);
      const approvedTickers = new Set(
        raw.filter((r) => r.verdict === "APPROVE").map((r) => r.ticker)
      );
      // Force-approve stop-losses regardless of AI verdict
      candidates.filter((c) => c.technicalReason.startsWith("Stop-loss")).forEach((c) => approvedTickers.add(c.ticker));

      return candidates
        .filter((c) => approvedTickers.has(c.ticker))
        .map((c) => {
          const verdict = raw.find((r) => r.ticker === c.ticker);
          return {
            ticker: c.ticker, name: c.name,
            action: c.action,
            reason: verdict?.reason ?? c.technicalReason,
            currentPrice: c.scan.price, signal: c.scan.signal,
            rsi: c.scan.rsi, posIn52: c.scan.posIn52,
            buyPrice: c.buyPrice,
            unrealizedPnLPct: c.pnlPct,
          } as AIDecision;
        });
    } catch { continue; }
  }

  // If AI fails, fall back to executing all candidates (rules already vetted them)
  return candidates.map((c) => ({
    ticker: c.ticker, name: c.name,
    action: c.action,
    reason: c.technicalReason,
    currentPrice: c.scan.price, signal: c.scan.signal,
    rsi: c.scan.rsi, posIn52: c.scan.posIn52,
    buyPrice: c.buyPrice,
    unrealizedPnLPct: c.pnlPct,
  } as AIDecision));
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

    const earningsTickers = new Set(context.earnings.map((e) => e.ticker));
    const candidates = applyRules(scanResults, positions, cash, earningsTickers);
    const decisions = await getAIVerdicts(candidates, context);

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
