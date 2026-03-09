// Technical indicator calculations

export function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - 100 / (1 + rs));
}

export function calcMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
  const ema = (data: number[], period: number) => {
    const k = 2 / (period + 1);
    let emaVal = data[0];
    for (let i = 1; i < data.length; i++) emaVal = data[i] * k + emaVal * (1 - k);
    return emaVal;
  };
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  const ema12 = ema(closes.slice(-26), 12);
  const ema26 = ema(closes.slice(-26), 26);
  const macd = ema12 - ema26;
  const signal = macd * (2 / 10); // simplified
  return { macd: +macd.toFixed(4), signal: +signal.toFixed(4), histogram: +(macd - signal).toFixed(4) };
}

export function calcSMA(closes: number[], period: number): number {
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// Multi-timeframe momentum: % return over N days
export function calcMomentum(closes: number[]): { d20: number; d60: number } {
  const last = closes.at(-1)!;
  const d20 = closes.length >= 21 ? +((last / closes.at(-21)! - 1) * 100).toFixed(2) : 0;
  const d60 = closes.length >= 61 ? +((last / closes.at(-61)! - 1) * 100).toFixed(2) : 0;
  return { d20, d60 };
}

// Price vs key moving averages (% above = positive, below = negative)
export function calcSMADistances(closes: number[]): {
  vsSma20: number | null;
  vsSma50: number | null;
  vsSma200: number | null;
  goldenCross: boolean | null; // SMA50 > SMA200
} {
  const price = closes.at(-1)!;
  const sma = (n: number) => closes.length >= n
    ? closes.slice(-n).reduce((a, b) => a + b, 0) / n
    : null;
  const s20 = sma(20), s50 = sma(50), s200 = sma(200);
  return {
    vsSma20: s20 ? +((price / s20 - 1) * 100).toFixed(1) : null,
    vsSma50: s50 ? +((price / s50 - 1) * 100).toFixed(1) : null,
    vsSma200: s200 ? +((price / s200 - 1) * 100).toFixed(1) : null,
    goldenCross: s50 && s200 ? s50 > s200 : null,
  };
}

export function calcBollingerBands(closes: number[], period = 20) {
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  return { upper: +(sma + 2 * std).toFixed(2), middle: +sma.toFixed(2), lower: +(sma - 2 * std).toFixed(2) };
}

export function signalStrength(rsi: number, price: number, low52: number, high52: number, macdHist: number): {
  signal: "STRONG BUY" | "BUY" | "HOLD" | "SELL" | "STRONG SELL";
  score: number;
} {
  let score = 0;
  // RSI
  if (rsi < 25) score += 3;
  else if (rsi < 35) score += 2;
  else if (rsi < 45) score += 1;
  else if (rsi > 75) score -= 3;
  else if (rsi > 65) score -= 2;
  else if (rsi > 55) score -= 1;
  // 52-week position
  const range = high52 - low52;
  if (range > 0) {
    const pos = (price - low52) / range;
    if (pos < 0.15) score += 3;
    else if (pos < 0.30) score += 2;
    else if (pos < 0.45) score += 1;
    else if (pos > 0.85) score -= 2;
    else if (pos > 0.70) score -= 1;
  }
  // MACD
  if (macdHist > 0) score += 1;
  else if (macdHist < 0) score -= 1;

  const signal =
    score >= 5 ? "STRONG BUY" :
    score >= 2 ? "BUY" :
    score <= -5 ? "STRONG SELL" :
    score <= -2 ? "SELL" : "HOLD";

  return { signal, score };
}
