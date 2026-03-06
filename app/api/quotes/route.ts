import { NextRequest, NextResponse } from "next/server";
import { getQuote } from "@/lib/finnhub";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tickers = req.nextUrl.searchParams.get("tickers")?.split(",").filter(Boolean) ?? [];
  const results: Record<string, number> = {};
  await Promise.all(
    tickers.map(async (t) => {
      try {
        const q = await getQuote(t.toUpperCase());
        if (q.c) results[t.toUpperCase()] = q.c;
      } catch {}
    })
  );
  return NextResponse.json(results);
}
