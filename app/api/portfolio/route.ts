import { NextRequest, NextResponse } from "next/server";
import {
  loadPortfolio, savePortfolio, applyBuy, applySell,
  STARTING_CASH, type Portfolio,
} from "@/lib/portfolio-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const portfolio = await loadPortfolio();
  return NextResponse.json(portfolio);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    action: "BUY" | "SELL" | "RESET";
    ticker?: string;
    name?: string;
    price?: number;
    signal?: string;
  };

  if (body.action === "RESET") {
    const fresh: Portfolio = { cash: STARTING_CASH, positions: [], trades: [] };
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
