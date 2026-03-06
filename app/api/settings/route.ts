import { NextRequest, NextResponse } from "next/server";
import { loadConfig, saveConfig } from "@/lib/watchlist-config";
import { buildWatchlist, type WatchlistConfig } from "@/lib/stocks-full";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await loadConfig();
  const watchlist = buildWatchlist(config);
  return NextResponse.json({ config, totalStocks: watchlist.length });
}

export async function POST(req: NextRequest) {
  const config = await req.json() as WatchlistConfig;
  config.currentBatchIndex = 0; // reset batch on config change
  await saveConfig(config);
  const watchlist = buildWatchlist(config);
  return NextResponse.json({ config, totalStocks: watchlist.length });
}
