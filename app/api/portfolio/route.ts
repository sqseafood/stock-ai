import { NextRequest, NextResponse } from "next/server";
import {
  loadPortfolio, savePortfolio, applyBuy, applySell,
  STARTING_CASH, type Portfolio,
} from "@/lib/portfolio-server";
import { getAccount, getPositions } from "@/lib/alpaca";
import { WATCHLIST } from "@/lib/stocks";

export const dynamic = "force-dynamic";

const USE_ALPACA = !!(process.env.ALPACA_KEY_ID && process.env.ALPACA_SECRET_KEY);

export async function GET() {
  if (USE_ALPACA) {
    try {
      const [account, alpacaPositions, mockPortfolio] = await Promise.all([
        getAccount(),
        getPositions(),
        loadPortfolio(),
      ]);
      const portfolio: Portfolio = {
        cash: parseFloat(account.cash),
        startingCash: mockPortfolio.startingCash ?? STARTING_CASH,
        positions: alpacaPositions.map((p) => ({
          ticker: p.symbol,
          name: WATCHLIST.find((w) => w.ticker === p.symbol)?.name ?? p.symbol,
          shares: parseFloat(p.qty),
          buyPrice: parseFloat(p.avg_entry_price),
          buyDate: "",
          buySignal: "",
        })),
        trades: mockPortfolio.trades,
      };
      return NextResponse.json(portfolio);
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
  }

  const portfolio = await loadPortfolio();
  return NextResponse.json(portfolio);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    action: "BUY" | "SELL" | "RESET" | "ADD_FUNDS";
    ticker?: string;
    name?: string;
    price?: number;
    signal?: string;
    startingCash?: number;
  };

  if (body.action === "ADD_FUNDS") {
    const amount = Math.max(1, body.startingCash ?? 0);
    const portfolio = await loadPortfolio();
    portfolio.cash += amount;
    portfolio.startingCash = (portfolio.startingCash ?? STARTING_CASH) + amount;
    await savePortfolio(portfolio);
    return NextResponse.json(portfolio);
  }

  if (body.action === "RESET") {
    const cash = Math.max(1, body.startingCash ?? STARTING_CASH);
    const fresh: Portfolio = { cash, startingCash: cash, positions: [], trades: [] };
    await savePortfolio(fresh);
    return NextResponse.json(fresh);
  }

  if (!body.ticker || !body.price || !body.signal || !body.name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const portfolio = await loadPortfolio();

  let err: string | null = null;
  if (body.action === "BUY") {
    err = applyBuy(portfolio, body.ticker, body.name, body.price, body.signal, "manual");
  } else {
    err = applySell(portfolio, body.ticker, body.price, body.signal, "manual");
  }

  if (err) return NextResponse.json({ error: err }, { status: 400 });

  await savePortfolio(portfolio);
  return NextResponse.json(portfolio);
}
