import { NextResponse } from "next/server";
import { getQuote, getCandles, getMetrics, getRecentHeadlines, getAnalystRecs, getEarningsBeats, delay } from "@/lib/finnhub";
import { calcRSI, calcMACD, calcBollingerBands, signalStrength, calcMomentum, calcSMADistances } from "@/lib/indicators";
import { WATCHLIST } from "@/lib/stocks";

export const dynamic = "force-dynamic";

export interface ScanResult {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePct: number;
  rsi: number;
  macdHistogram: number;
  low52: number;
  high52: number;
  posIn52: number;
  signal: "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "STRONG SELL";
  score: number;
  pe: number | null;
  marketCap: number | null;
  change5d: number;
  volumeRatio: number;
  bollingerPos: number; // 0=at lower band, 100=at upper band
  todayOpen: number;
  todayHigh: number;
  todayLow: number;
  gapPct: number;      // % gap from prev close to today's open
  intradayPct: number; // % move from today's open to current price
  headlines: string[]; // recent news headlines
  analystBuy: number;  // # of buy/strong-buy analyst ratings
  analystHold: number;
  analystSell: number; // # of sell/strong-sell analyst ratings
  earningsBeats: number;   // quarters beating estimate out of last 4
  momentum20d: number;     // % return last 20 trading days
  momentum60d: number;     // % return last 60 trading days
  vsSma20: number | null;  // % above/below 20-day SMA
  vsSma50: number | null;
  vsSma200: number | null;
  goldenCross: boolean | null; // SMA50 > SMA200 = bullish long-term trend
}

async function scanTicker(ticker: string, name: string, sector: string): Promise<ScanResult | null> {
  try {
    const [quote, candles, metrics, headlines, analystRec, earningsBeats] = await Promise.all([
      getQuote(ticker),
      getCandles(ticker, 12), // 1yr for SMA200 + 60d momentum
      getMetrics(ticker),
      getRecentHeadlines(ticker, 5, 4),
      getAnalystRecs(ticker),
      getEarningsBeats(ticker, 4),
    ]);

    if (!quote.c || !candles.closes.length) return null;

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
      ? metrics.metric.marketCapitalization * 1_000_000
      : null;
    const change5d = closes.length >= 6
      ? +((closes[closes.length - 1] / closes[closes.length - 6] - 1) * 100).toFixed(2)
      : 0;
    const avgVol = volumes.length > 0
      ? volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(volumes.length, 20)
      : 0;
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

    return {
      ticker, name, sector, price,
      change: quote.d ?? 0,
      changePct: quote.dp ?? 0,
      rsi, macdHistogram: histogram,
      low52, high52, posIn52, signal, score,
      pe: pe && pe > 0 ? pe : null,
      marketCap,
      change5d, volumeRatio, bollingerPos,
      todayOpen, todayHigh: quote.h ?? price, todayLow: quote.l ?? price,
      gapPct, intradayPct,
      headlines,
      analystBuy: (analystRec?.strongBuy ?? 0) + (analystRec?.buy ?? 0),
      analystHold: analystRec?.hold ?? 0,
      analystSell: (analystRec?.strongSell ?? 0) + (analystRec?.sell ?? 0),
      earningsBeats, momentum20d, momentum60d,
      vsSma20, vsSma50, vsSma200, goldenCross,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const results: ScanResult[] = [];
  for (let i = 0; i < WATCHLIST.length; i++) {
    const { ticker, name, sector } = WATCHLIST[i];
    const result = await scanTicker(ticker, name, sector);
    if (result) results.push(result);
    if (i < WATCHLIST.length - 1) await delay(500);
  }
  results.sort((a, b) => b.score - a.score);
  return NextResponse.json(results);
}
