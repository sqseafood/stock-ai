import { put, head, del } from "@vercel/blob";

export interface Position {
  ticker: string;
  name: string;
  shares: number;
  buyPrice: number;
  buyDate: string;
  buySignal: string;
}

export interface Trade {
  id: string;
  ticker: string;
  name: string;
  type: "BUY" | "SELL";
  shares: number;
  price: number;
  total: number;
  date: string;
  signal: string;
  pnl?: number;
  pnlPct?: number;
  source?: "manual" | "cron"; // who made the trade
}

export interface Portfolio {
  startingCash?: number;
  cash: number;
  positions: Position[];
  trades: Trade[];
}

export interface CronLog {
  runAt: string;
  decisionsCount: number;
  trades: { ticker: string; action: string; reason: string; price: number }[];
  error?: string;
}

export const STARTING_CASH = 20_000;
export const TRADE_AMOUNT = 2_000;
const PORTFOLIO_KEY = "portfolio.json";
const CRON_LOG_KEY = "cron-log.json";

async function blobExists(key: string): Promise<boolean> {
  try {
    await head(`${process.env.BLOB_BASE_URL ?? ""}/${key}`);
    return true;
  } catch { return false; }
}

export async function loadPortfolio(): Promise<Portfolio> {
  try {
    const url = `${process.env.BLOB_BASE_URL}/${PORTFOLIO_KEY}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return { cash: STARTING_CASH, positions: [], trades: [] };
    return await res.json();
  } catch {
    return { cash: STARTING_CASH, positions: [], trades: [] };
  }
}

export async function savePortfolio(p: Portfolio): Promise<void> {
  await put(PORTFOLIO_KEY, JSON.stringify(p), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
  });
}

export async function loadCronLog(): Promise<CronLog[]> {
  try {
    const url = `${process.env.BLOB_BASE_URL}/${CRON_LOG_KEY}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

export async function appendCronLog(entry: CronLog): Promise<void> {
  const logs = await loadCronLog();
  logs.unshift(entry); // newest first
  const trimmed = logs.slice(0, 50); // keep last 50 runs
  await put(CRON_LOG_KEY, JSON.stringify(trimmed), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
  });
}

export function applyBuy(
  p: Portfolio,
  ticker: string, name: string, price: number, signal: string,
  source: "manual" | "cron" = "manual"
): string | null {
  if (p.positions.find((pos) => pos.ticker === ticker)) return "Already holding this stock";
  const spend = Math.min(TRADE_AMOUNT, p.cash);
  if (spend < 1) return "Insufficient funds";
  const shares = spend / price;
  p.cash -= spend;
  p.positions.push({ ticker, name, shares, buyPrice: price, buyDate: new Date().toISOString(), buySignal: signal });
  p.trades.push({
    id: Date.now().toString() + Math.random(),
    ticker, name, type: "BUY", shares, price, total: spend,
    date: new Date().toISOString(), signal, source,
  });
  return null;
}

export function applySell(
  p: Portfolio,
  ticker: string, currentPrice: number, signal: string,
  source: "manual" | "cron" = "manual"
): string | null {
  const pos = p.positions.find((pos) => pos.ticker === ticker);
  if (!pos) return "No position to sell";
  const total = pos.shares * currentPrice;
  const cost = pos.shares * pos.buyPrice;
  const pnl = total - cost;
  const pnlPct = (pnl / cost) * 100;
  p.cash += total;
  p.positions = p.positions.filter((pos) => pos.ticker !== ticker);
  p.trades.push({
    id: Date.now().toString() + Math.random(),
    ticker, name: pos.name, type: "SELL", shares: pos.shares, price: currentPrice, total,
    date: new Date().toISOString(), signal, pnl, pnlPct, source,
  });
  return null;
}
