import { NextRequest, NextResponse } from "next/server";
import { appendCronLog, loadPortfolio, savePortfolio, applySell, applyBuy, TRADE_AMOUNT, getCompletedTrades } from "@/lib/portfolio-server";
import type { CompletedTrade } from "@/lib/portfolio-server";
import { getAccount, getPositions, placeBuyOrder, closePosition } from "@/lib/alpaca";
import { getQuote, getCandles, getMetrics, getRecentHeadlines, getAnalystRecs, getEarningsBeats, getMarketNews, delay } from "@/lib/finnhub";
import { calcRSI, calcMACD, calcBollingerBands, signalStrength, calcMomentum, calcSMADistances } from "@/lib/indicators";
import { buildWatchlist, getBatch } from "@/lib/stocks-full";
import { loadConfig, saveConfig } from "@/lib/watchlist-config";
import { getFearGreed, getVIX, getUpcomingEarnings, getWSBSentiment, getSectorPerformance, getEconomicCalendar } from "@/lib/market-context";
import type { SectorPerf, EconomicEvent } from "@/lib/market-context";
import type { ScanResult } from "@/app/api/scan/route";
import type { AIDecision } from "@/app/api/ai-trader/route";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash-001", "gemini-2.0-flash"];
const USE_ALPACA = !!(process.env.ALPACA_KEY_ID && process.env.ALPACA_SECRET_KEY);
const MAX_POSITIONS = 10;
const HARD_STOP_LOSS_PCT = -8; // absolute floor — AI never gets to override this

function isMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const totalMins = et.getHours() * 60 + et.getMinutes();
  return totalMins >= 9 * 60 + 30 && totalMins < 16 * 60;
}

function getETTime(): string {
  return new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function minutesUntilClose(): number {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const closeMinutes = 16 * 60;
  const currentMinutes = et.getHours() * 60 + et.getMinutes();
  return closeMinutes - currentMinutes;
}

async function scanAll(watchlist: { ticker: string; name: string; sector: string }[]): Promise<ScanResult[]> {
  const results: ScanResult[] = [];
  for (let i = 0; i < watchlist.length; i++) {
    const { ticker, name, sector } = watchlist[i];
    try {
      const [quote, candles, metrics, headlines, analystRec, earningsBeats] = await Promise.all([
        getQuote(ticker), getCandles(ticker, 12), getMetrics(ticker),
        getRecentHeadlines(ticker, 5, 4), getAnalystRecs(ticker), getEarningsBeats(ticker, 4),
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
      const todayOpen = quote.o ?? price;
      const prevClose = quote.pc ?? price;
      const gapPct = prevClose > 0 ? +((todayOpen - prevClose) / prevClose * 100).toFixed(2) : 0;
      const intradayPct = todayOpen > 0 ? +((price - todayOpen) / todayOpen * 100).toFixed(2) : 0;

      const { d20: momentum20d, d60: momentum60d } = calcMomentum(closes);
      const { vsSma20, vsSma50, vsSma200, goldenCross } = calcSMADistances(closes);
      results.push({
        ticker, name, sector, price,
        change: quote.d ?? 0, changePct: quote.dp ?? 0,
        rsi, macdHistogram: histogram,
        low52, high52, posIn52, signal, score,
        pe: pe && pe > 0 ? pe : null, marketCap,
        change5d, volumeRatio, bollingerPos,
        todayOpen, todayHigh: quote.h ?? price, todayLow: quote.l ?? price,
        gapPct, intradayPct,
        headlines,
        analystBuy: (analystRec?.strongBuy ?? 0) + (analystRec?.buy ?? 0),
        analystHold: analystRec?.hold ?? 0,
        analystSell: (analystRec?.strongSell ?? 0) + (analystRec?.sell ?? 0),
        earningsBeats, momentum20d, momentum60d,
        vsSma20, vsSma50, vsSma200, goldenCross,
      });
    } catch { /* skip */ }
    if (i < watchlist.length - 1) await delay(500);
  }
  return results;
}

async function getAIDecisions(
  scanResults: ScanResult[],
  positions: { ticker: string; name: string; shares: number; buyPrice: number; buyDate?: string }[],
  cash: number,
  context: {
    fearGreedScore: number | null;
    fearGreedRating: string | null;
    vix: number | null;
    earnings: { ticker: string; date: string }[];
    wsb: { ticker: string; mentions: number; sentiment: string; topPost: string }[];
    macroNews: { headline: string; summary: string }[];
    sectorPerf: SectorPerf[];
    economicEvents: EconomicEvent[];
  },
  pastTrades: CompletedTrade[]
): Promise<AIDecision[]> {
  const heldMap = new Map(positions.map((p) => [p.ticker, p]));
  const etTime = getETTime();
  const minsLeft = minutesUntilClose();
  const isEndOfDay = minsLeft <= 45;

  const marketMood = context.fearGreedScore !== null
    ? `Fear & Greed: ${context.fearGreedScore}/100 (${context.fearGreedRating})`
    : "Fear & Greed: unavailable";
  const vixLine = context.vix !== null
    ? `VIX: ${context.vix} (${context.vix > 30 ? "HIGH — elevated risk" : context.vix > 20 ? "Elevated" : "Normal"})`
    : "VIX: unavailable";
  const wsbMap = new Map(context.wsb.map((w) => [w.ticker, w]));

  // Positions with full context
  const positionLines = positions.map((p) => {
    const scan = scanResults.find((s) => s.ticker === p.ticker);
    const price = scan?.price ?? p.buyPrice;
    const pnlPct = ((price - p.buyPrice) / p.buyPrice) * 100;
    const today = new Date().toISOString().split("T")[0];
    const boughtToday = p.buyDate?.startsWith(today) ? " [TODAY]" : "";
    const intraday = scan ? ` intra:${scan.intradayPct >= 0 ? "+" : ""}${scan.intradayPct}%` : "";
    const wsb = wsbMap.get(p.ticker);
    const wsbNote = wsb ? ` WSB:${wsb.sentiment}` : "";
    const newsNote = scan?.headlines?.length
      ? `\n    NEWS: ${scan.headlines.slice(0, 2).join(" | ")}`
      : "";
    return `  ${p.ticker}${boughtToday}: cost@$${p.buyPrice.toFixed(2)} now@$${price.toFixed(2)} P&L:${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}% RSI:${scan?.rsi ?? "?"}${intraday} vol:${scan?.volumeRatio ?? "?"}x${wsbNote}${newsNote}`;
  }).join("\n");

  // Watchlist sorted by score, not held — include full context per stock
  const watchlistLines = scanResults
    .filter((s) => !heldMap.has(s.ticker))
    .sort((a, b) => b.score - a.score)
    .slice(0, 35)
    .map((s) => {
      const wsb = wsbMap.get(s.ticker);
      const wsbNote = wsb ? ` | WSB:${wsb.mentions}x ${wsb.sentiment}` : "";
      const analystNote = (s.analystBuy + s.analystHold + s.analystSell) > 0
        ? ` | analysts: ${s.analystBuy}B/${s.analystHold}H/${s.analystSell}S`
        : "";
      const newsNote = s.headlines.length
        ? `\n    NEWS: ${s.headlines.slice(0, 3).join(" | ")}`
        : "";
      const smaNote = [
        s.vsSma20 !== null ? `SMA20:${s.vsSma20 >= 0 ? "+" : ""}${s.vsSma20}%` : "",
        s.vsSma50 !== null ? `SMA50:${s.vsSma50 >= 0 ? "+" : ""}${s.vsSma50}%` : "",
        s.vsSma200 !== null ? `SMA200:${s.vsSma200 >= 0 ? "+" : ""}${s.vsSma200}%` : "",
      ].filter(Boolean).join(" ");
      const trendNote = s.goldenCross === true ? " [GOLDEN CROSS]" : s.goldenCross === false ? " [DEATH CROSS]" : "";
      const earningsNote = s.earningsBeats > 0 ? ` EPS:${s.earningsBeats}/4 beats` : "";
      const momNote = `20d:${s.momentum20d >= 0 ? "+" : ""}${s.momentum20d}% 60d:${s.momentum60d >= 0 ? "+" : ""}${s.momentum60d}%`;
      return `  ${s.ticker} (${s.name}, ${s.sector}): $${s.price.toFixed(2)} | day:${s.changePct >= 0 ? "+" : ""}${s.changePct.toFixed(1)}% | ${momNote} | RSI:${s.rsi} BB:${s.bollingerPos}% vol:${s.volumeRatio}x | ${smaNote}${trendNote} | 52W:${s.posIn52}%${earningsNote}${analystNote}${wsbNote}${newsNote}`;
    }).join("\n");

  const earningsWarning = context.earnings.length > 0
    ? `EARNINGS IN NEXT 2 DAYS (avoid buying): ${context.earnings.map((e) => `${e.ticker}(${e.date})`).join(", ")}`
    : "No earnings risk in next 2 days";

  // Build trade performance summary for AI learning
  let learningSection = "";
  if (pastTrades.length > 0) {
    const wins = pastTrades.filter((t) => t.pnlPct > 0);
    const losses = pastTrades.filter((t) => t.pnlPct <= 0);
    const avgWin = wins.length ? (wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length).toFixed(1) : "0";
    const avgLoss = losses.length ? (losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length).toFixed(1) : "0";
    const winRate = ((wins.length / pastTrades.length) * 100).toFixed(0);
    const recentLines = pastTrades.slice(0, 15).map((t) => {
      const outcome = t.pnlPct >= 0 ? `✓ WIN  +${t.pnlPct.toFixed(1)}%` : `✗ LOSS ${t.pnlPct.toFixed(1)}%`;
      const dur = t.durationHours < 24 ? `${t.durationHours}h` : `${(t.durationHours / 24).toFixed(1)}d`;
      const buyNote = t.buyReason ? ` | BUY: "${t.buyReason}"` : "";
      const sellNote = t.sellReason ? ` | SELL: "${t.sellReason}"` : "";
      return `  ${outcome} ${t.ticker} (${dur})${buyNote}${sellNote}`;
    }).join("\n");

    learningSection = `
PAST TRADE PERFORMANCE — learn from these results:
Stats: ${wins.length}W/${losses.length}L (${winRate}% win rate) | avg win: +${avgWin}% | avg loss: ${avgLoss}%
Recent trades:
${recentLines}

Analyze what worked and what didn't. Avoid repeating losing patterns. Double down on winning strategies.
`;
  }

  const prompt = `You are a professional stock trader. Your job is to make money — not to trade frequently, but to trade RIGHT.

TIME: ${etTime} ET | ${minsLeft} min until close${isEndOfDay ? " ⚠️ END OF DAY" : ""}
${marketMood}
${vixLine}
${earningsWarning}

PORTFOLIO: $${cash.toFixed(0)} cash | ${positions.length}/${MAX_POSITIONS} slots used | $${TRADE_AMOUNT} per position

━━━ CURRENT HOLDINGS ━━━
${positionLines || "  None"}

━━━ CANDIDATES ━━━
${watchlistLines}

━━━ WHAT ACTUALLY MAKES MONEY ━━━

PRIORITY 1 — News/Catalyst trades (highest edge):
  • Positive earnings surprise + stock not yet up much = BUY (post-earnings drift)
  • Analyst upgrade + volume spike = BUY
  • Negative news on a held position = SELL immediately
  • Sector-wide news: if sector up strongly, buy laggards in same sector

PRIORITY 2 — Momentum (proven academic factor):
  • Stock up 3-8% today on 2x+ volume with no news = likely continuation, BUY
  • 5-day momentum +5%+ with RSI not overbought = trend in place
  • New 52W high on volume = breakout, strong BUY signal

PRIORITY 3 — Mean reversion (use sparingly, only with other signals):
  • RSI < 30 + positive headlines + volume spike = bounce trade
  • Never catch falling knives: need a catalyst to confirm reversal

IGNORE / LOW EDGE:
  • RSI/MACD alone with no catalyst — everyone sees these, no edge
  • "Oversold" without a reason for recovery = avoid
  • Low volume moves = noise

━━━ SELL RULES ━━━
  • Hard stop: down ${Math.abs(HARD_STOP_LOSS_PCT)}% → SELL no matter what
  • Thesis broken: bad news on a held position → SELL
  • Overbought + fading volume after big run → SELL
  • ${isEndOfDay ? "END OF DAY → close all positions opened today" : "Intraday buy up 3%+ → lock in profit"}

━━━ SECTOR PERFORMANCE TODAY ━━━
${context.sectorPerf.length
  ? context.sectorPerf.map((s) => `  ${s.changePct >= 0 ? "▲" : "▼"} ${s.sector} (${s.etf}): ${s.changePct >= 0 ? "+" : ""}${s.changePct}%`).join("\n")
  : "  Sector data unavailable"}
Hot sectors → favor stocks in those sectors. Cold sectors → exit weak positions.

━━━ UPCOMING ECONOMIC EVENTS (HIGH IMPACT) ━━━
${context.economicEvents.length
  ? context.economicEvents.map((e) => `  ${e.date} — ${e.event}${e.estimate ? ` (est: ${e.estimate}${e.prev ? `, prev: ${e.prev}` : ""})` : ""}`).join("\n")
  : "  No major US economic events in the next 7 days"}
⚠️ Avoid new BUYs 24h before high-impact events (Fed decision, CPI, Non-farm payroll) unless very high conviction.

━━━ MACRO & MARKET NEWS (read carefully — these move entire sectors) ━━━
${context.macroNews.length
  ? context.macroNews.map((n) => `  • ${n.headline}${n.summary ? `\n    ${n.summary}` : ""}`).join("\n")
  : "  No major macro news at this time"}

MACRO IMPACT GUIDE — reason about which holdings/candidates are affected:
  • Fed rate cut / dovish pivot → Financials (JPM,BAC,GS), REITs, growth tech benefit
  • Fed rate hike / hawkish → Banks net-interest margin up short-term; tech/growth hurt
  • Tariffs / trade war escalation → Industrials, autos, semiconductors hurt; domestic-only cos benefit
  • Tariff relief / trade deal → Export-heavy cos benefit (Boeing, Caterpillar, semis)
  • Energy regulation / drilling ban → Oil/gas (XOM,CVX) hurt; renewables (ENPH,FSLR) benefit
  • Tax cut / corporate tax reduction → Broad market up, domestic companies benefit most
  • Tax hike threat → Defensive sectors (utilities, staples) outperform
  • Strong dollar → Multinationals hurt (AAPL,MSFT sell overseas); domestic retailers benefit
  • Weak dollar → Commodities, gold miners, emerging market exposure benefits
  • Geopolitical tension / war → Defense (LMT,RTX,NOC) up; energy up; risk assets down
  • Inflation surprise high → Energy, commodities, value stocks; growth stocks hurt
  • Recession fear → Utilities, staples, healthcare outperform; cyclicals hurt

━━━ MARKET CONDITIONS ━━━
  ${context.vix && context.vix > 30 ? "⚠️ HIGH VIX: market is volatile — only highest-conviction buys, size down" : context.vix && context.vix < 15 ? "✓ Low VIX: stable market, normal trading" : "Normal volatility"}
  ${context.fearGreedScore !== null && context.fearGreedScore < 25 ? "⚠️ EXTREME FEAR: market oversold — contrarian buys with catalysts have high expected value" : context.fearGreedScore !== null && context.fearGreedScore > 75 ? "⚠️ EXTREME GREED: most gains priced in — raise bar for new buys, protect profits" : ""}

${learningSection}
━━━ DECISION RULES ━━━
- Only trade when you have CONVICTION based on a real reason (news, momentum, analyst)
- 0 trades is better than a bad trade — return [] if nothing qualifies
- Maximum 3 new buys per run (quality > quantity)
- Always sell losers fast, let winners run

Return ONLY valid JSON — BUY and SELL actions only, no HOLDs:
[{"ticker":"XYZ","action":"BUY","reason":"specific reason citing the actual catalyst or data"}]

No trades? Return: []`;

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
          }),
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;

      const raw: { ticker: string; action: string; reason: string }[] = JSON.parse(text);

      const decisions: AIDecision[] = raw
        .filter((d) => d.action === "BUY" || d.action === "SELL")
        .map((d) => {
          const scan = scanResults.find((s) => s.ticker === d.ticker);
          const pos = heldMap.get(d.ticker);
          if (!scan && d.action === "BUY") return null; // can't buy without data
          const price = scan?.price ?? pos?.buyPrice ?? 0;
          return {
            ticker: d.ticker,
            name: scan?.name ?? pos?.name ?? d.ticker,
            action: d.action as "BUY" | "SELL",
            reason: d.reason,
            currentPrice: price,
            signal: scan?.signal ?? "HOLD",
            rsi: scan?.rsi ?? 50,
            posIn52: scan?.posIn52 ?? 50,
            buyPrice: pos?.buyPrice,
            unrealizedPnLPct: pos
              ? ((price - pos.buyPrice) / pos.buyPrice) * 100
              : undefined,
          };
        })
        .filter(Boolean) as AIDecision[];

      return decisions;
    } catch { continue; }
  }

  // AI unavailable — apply only the hard stop loss
  return positions
    .filter((p) => {
      const scan = scanResults.find((s) => s.ticker === p.ticker);
      if (!scan) return false;
      const pnlPct = ((scan.price - p.buyPrice) / p.buyPrice) * 100;
      return pnlPct <= HARD_STOP_LOSS_PCT;
    })
    .map((p) => {
      const scan = scanResults.find((s) => s.ticker === p.ticker)!;
      const pnlPct = ((scan.price - p.buyPrice) / p.buyPrice) * 100;
      return {
        ticker: p.ticker, name: p.name,
        action: "SELL" as const,
        reason: `Emergency stop-loss: down ${pnlPct.toFixed(1)}% (AI unavailable)`,
        currentPrice: scan.price, signal: scan.signal,
        rsi: scan.rsi, posIn52: scan.posIn52,
        buyPrice: p.buyPrice, unrealizedPnLPct: pnlPct,
      };
    });
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
    const config = await loadConfig();
    const fullWatchlist = buildWatchlist(config);
    const watchlist = getBatch(fullWatchlist, config.batchSize, config.currentBatchIndex);

    const nextIndex = (config.currentBatchIndex + 1) * config.batchSize >= fullWatchlist.length
      ? 0
      : config.currentBatchIndex + 1;
    try { await saveConfig({ ...config, currentBatchIndex: nextIndex }); } catch { /* non-fatal */ }

    const scanResults = await scanAll(watchlist);
    if (!scanResults.length) {
      return NextResponse.json({ skipped: true, reason: "No scan data" });
    }

    let cash: number;
    let positions: { ticker: string; name: string; shares: number; buyPrice: number; buyDate?: string }[];

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

    const [fearGreed, vix, earnings, wsb, macroNews, sectorPerf, economicEvents] = await Promise.all([
      getFearGreed(), getVIX(), getUpcomingEarnings(), getWSBSentiment(),
      getMarketNews("general", 20), getSectorPerformance(), getEconomicCalendar(7),
    ]);
    const context = {
      fearGreedScore: fearGreed?.score ?? null,
      fearGreedRating: fearGreed?.rating ?? null,
      vix,
      earnings,
      wsb,
      macroNews,
      sectorPerf,
      economicEvents,
    };

    // Inject hard stop-loss sells before AI (non-negotiable)
    const hardStops = positions
      .filter((p) => {
        const scan = scanResults.find((s) => s.ticker === p.ticker);
        if (!scan) return false;
        return ((scan.price - p.buyPrice) / p.buyPrice) * 100 <= HARD_STOP_LOSS_PCT;
      })
      .map((p) => p.ticker);

    // Load past trades for AI learning
    let pastTrades: CompletedTrade[] = [];
    try {
      const portfolio = await loadPortfolio();
      pastTrades = getCompletedTrades(portfolio.trades, 20);
    } catch { /* non-fatal */ }

    const aiDecisions = await getAIDecisions(scanResults, positions, cash, context, pastTrades);

    // Merge: hard stops first, then AI decisions (dedup by ticker+action)
    const allDecisions = [...aiDecisions];
    for (const ticker of hardStops) {
      if (!allDecisions.find((d) => d.ticker === ticker && d.action === "SELL")) {
        const pos = positions.find((p) => p.ticker === ticker)!;
        const scan = scanResults.find((s) => s.ticker === ticker)!;
        const pnlPct = ((scan.price - pos.buyPrice) / pos.buyPrice) * 100;
        allDecisions.unshift({
          ticker, name: pos.name, action: "SELL",
          reason: `Hard stop-loss: down ${pnlPct.toFixed(1)}%`,
          currentPrice: scan.price, signal: scan.signal,
          rsi: scan.rsi, posIn52: scan.posIn52,
          buyPrice: pos.buyPrice, unrealizedPnLPct: pnlPct,
        });
      }
    }

    // Execute sells first, then buys
    const sorted = [...allDecisions].sort((a, b) =>
      a.action === "SELL" && b.action !== "SELL" ? -1 : 1
    );

    const executedTrades: { ticker: string; action: string; reason: string; price: number }[] = [];

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
            err = applyBuy(portfolio, d.ticker, d.name, d.currentPrice, d.signal, "cron", d.reason);
          } else {
            err = applySell(portfolio, d.ticker, d.currentPrice, d.signal, "cron", d.reason);
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
