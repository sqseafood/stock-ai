import { NextResponse } from "next/server";
import { getQuote, getCandles, getMetrics, delay } from "@/lib/finnhub";
import { calcRSI, calcMACD, signalStrength } from "@/lib/indicators";
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

    return {
      ticker, name, sector, price,
      change: quote.d ?? 0,
      changePct: quote.dp ?? 0,
      rsi, macdHistogram: histogram,
      low52, high52, posIn52, signal, score,
      pe: pe && pe > 0 ? pe : null,
      marketCap,
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
