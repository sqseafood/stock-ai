const BASE = process.env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets";

function headers() {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_KEY_ID!,
    "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY!,
    "Content-Type": "application/json",
  };
}

export interface AlpacaAccount {
  cash: string;
  portfolio_value: string;
  buying_power: string;
  currency: string;
}

export interface AlpacaPosition {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  side: string;
}

export async function getAccount(): Promise<AlpacaAccount> {
  const res = await fetch(`${BASE}/v2/account`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`Alpaca account error: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getPositions(): Promise<AlpacaPosition[]> {
  const res = await fetch(`${BASE}/v2/positions`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`Alpaca positions error: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function placeBuyOrder(ticker: string, notional: number): Promise<void> {
  const body = {
    symbol: ticker,
    notional: notional.toFixed(2),
    side: "buy",
    type: "market",
    time_in_force: "day",
  };
  const res = await fetch(`${BASE}/v2/orders`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Alpaca buy error: ${await res.text()}`);
}

export async function closePosition(ticker: string): Promise<void> {
  const res = await fetch(`${BASE}/v2/positions/${ticker}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Alpaca sell error: ${await res.text()}`);
}
