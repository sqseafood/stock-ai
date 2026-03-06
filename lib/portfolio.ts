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
}

export interface Portfolio {
  cash: number;
  positions: Position[];
  trades: Trade[];
}

export const STARTING_CASH = 20_000;
export const TRADE_AMOUNT = 2_000; // $1,000 per trade

export function getPortfolio(): Portfolio {
  if (typeof window === "undefined") return { cash: STARTING_CASH, positions: [], trades: [] };
  const raw = localStorage.getItem("mock-portfolio");
  if (!raw) return { cash: STARTING_CASH, positions: [], trades: [] };
  try { return JSON.parse(raw); } catch { return { cash: STARTING_CASH, positions: [], trades: [] }; }
}

export function savePortfolio(p: Portfolio) {
  localStorage.setItem("mock-portfolio", JSON.stringify(p));
}

export function buyStock(
  ticker: string, name: string, price: number, signal: string
): string | null {
  const p = getPortfolio();
  if (p.positions.find((pos) => pos.ticker === ticker)) return "Already holding this stock";
  const spend = Math.min(TRADE_AMOUNT, p.cash);
  if (spend < 1) return "Insufficient funds";
  const shares = spend / price;
  p.cash -= spend;
  p.positions.push({
    ticker, name, shares, buyPrice: price,
    buyDate: new Date().toISOString(), buySignal: signal,
  });
  p.trades.push({
    id: Date.now().toString(), ticker, name, type: "BUY",
    shares, price, total: spend,
    date: new Date().toISOString(), signal,
  });
  savePortfolio(p);
  return null;
}

export function sellStock(
  ticker: string, currentPrice: number, signal: string
): string | null {
  const p = getPortfolio();
  const pos = p.positions.find((pos) => pos.ticker === ticker);
  if (!pos) return "No position to sell";
  const total = pos.shares * currentPrice;
  const cost = pos.shares * pos.buyPrice;
  const pnl = total - cost;
  const pnlPct = (pnl / cost) * 100;
  p.cash += total;
  p.positions = p.positions.filter((pos) => pos.ticker !== ticker);
  p.trades.push({
    id: Date.now().toString(), ticker, name: pos.name, type: "SELL",
    shares: pos.shares, price: currentPrice, total,
    date: new Date().toISOString(), signal, pnl, pnlPct,
  });
  savePortfolio(p);
  return null;
}

export function resetPortfolio() {
  localStorage.removeItem("mock-portfolio");
}
