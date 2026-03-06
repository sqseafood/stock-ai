import { NextResponse } from "next/server";
import { getQuote, getCandles, getMetrics, delay } from "@/lib/finnhub";
import { calcRSI, calcMACD, calcBollingerBands, signalStrength } from "@/lib/indicators";
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
}

async function scanTicker(ticker: string, name: string, sector: string): Promise<ScanResult | null> {
  try {
    const [quote, candles, metrics] = await Promise.all([
      getQuote(ticker),
      getCandles(ticker, 6),
      getMetrics(ticker),
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

    return {
      ticker, name, sector, price,
      change: quote.d ?? 0,
      changePct: quote.dp ?? 0,
      rsi, macdHistogram: histogram,
      low52, high52, posIn52, signal, score,
      pe: pe && pe > 0 ? pe : null,
      marketCap,
      change5d, volumeRatio, bollingerPos,
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
