"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { ScanResult } from "@/app/api/scan/route";
import { TRADE_AMOUNT } from "@/lib/portfolio-server";
import type { Portfolio } from "@/lib/portfolio-server";

const SIGNAL_COLOR: Record<string, string> = {
  "STRONG BUY":  "bg-green-900/60 text-green-300 border-green-700",
  "BUY":         "bg-emerald-900/60 text-emerald-300 border-emerald-700",
  "HOLD":        "bg-gray-800 text-gray-400 border-gray-700",
  "SELL":        "bg-orange-900/60 text-orange-300 border-orange-700",
  "STRONG SELL": "bg-red-900/60 text-red-300 border-red-700",
};

function fmtMktCap(n: number | null) {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

export default function Dashboard() {
  const [results, setResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const [sector, setSector] = useState("ALL");
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio>({ cash: 10000, positions: [], trades: [] });
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const refreshPortfolio = useCallback(() => {
    fetch("/api/portfolio").then((r) => r.json()).then(setPortfolio);
  }, []);

  useEffect(() => {
    refreshPortfolio();
    fetch("/api/scan")
      .then((r) => r.json())
      .then((data) => {
        setResults(data);
        setScannedAt(new Date().toLocaleTimeString("en-US", {
          timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit"
        }));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [refreshPortfolio]);

  async function handleBuy(r: ScanResult, e: React.MouseEvent) {
    e.preventDefault();
    const res = await fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "BUY", ticker: r.ticker, name: r.name, price: r.price, signal: r.signal }),
    });
    const body = await res.json();
    if (!res.ok) { setToastMsg(body.error); }
    else {
      setToastMsg(`Bought ${r.ticker} @ $${r.price.toFixed(2)}`);
      refreshPortfolio();
    }
    setTimeout(() => setToastMsg(null), 3000);
  }

  const sectors = ["ALL", ...Array.from(new Set(results.map((r) => r.sector))).sort()];
  const visible = results.filter((r) => {
    if (sector !== "ALL" && r.sector !== sector) return false;
    if (filter === "BUY") return r.signal === "BUY" || r.signal === "STRONG BUY";
    if (filter === "SELL") return r.signal === "SELL" || r.signal === "STRONG SELL";
    return true;
  });

  const buys = results.filter((r) => r.signal === "BUY" || r.signal === "STRONG BUY").length;
  const sells = results.filter((r) => r.signal === "SELL" || r.signal === "STRONG SELL").length;
  const heldTickers = new Set(portfolio.positions.map((p) => p.ticker));

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Stock AI Scanner</h1>
          <p className="text-xs text-gray-400">
            Buy-low / sell-high signals · AI-powered · US Markets
            {scannedAt && <span className="ml-2">· Scanned {scannedAt} PT</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs flex-wrap justify-end">
          <span className="bg-green-900/50 text-green-400 px-3 py-1.5 rounded-full font-semibold">{buys} Buy</span>
          <span className="bg-red-900/50 text-red-400 px-3 py-1.5 rounded-full font-semibold">{sells} Sell</span>
          <Link
            href="/portfolio"
            className="bg-blue-900/50 border border-blue-800 text-blue-300 px-3 py-1.5 rounded-full font-semibold hover:bg-blue-900/80 transition-colors"
          >
            Portfolio · ${portfolio.cash.toFixed(0)}
          </Link>
          <Link
            href="/ai-trader"
            className="bg-purple-900/50 border border-purple-800 text-purple-300 px-3 py-1.5 rounded-full font-semibold hover:bg-purple-900/80 transition-colors"
          >
            AI Trader
          </Link>
        </div>
      </div>

      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-gray-800 border border-gray-600 text-white text-xs px-4 py-2.5 rounded-xl shadow-xl">
          {toastMsg}
        </div>
      )}

      <div className="px-6 py-4">
        <div className="flex flex-wrap gap-2 mb-5">
          {(["ALL", "BUY", "SELL"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                filter === f ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
              {f}
            </button>
          ))}
          <div className="w-px bg-gray-700 mx-1" />
          {sectors.map((s) => (
            <button key={s} onClick={() => setSector(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                sector === s ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
              {s}
            </button>
          ))}
        </div>

        {error && <div className="p-4 rounded-xl bg-red-900/30 border border-red-800 text-red-300 text-sm mb-4">{error}</div>}

        {loading && (
          <div className="text-center py-20">
            <div className="text-4xl mb-4 animate-pulse">📊</div>
            <p className="text-gray-400">Scanning stocks — fetching prices, RSI, MACD…</p>
            <p className="text-xs text-gray-600 mt-1">This takes about 15–20 seconds</p>
          </div>
        )}

        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {visible.map((r) => {
              const held = heldTickers.has(r.ticker);
              return (
                <div key={r.ticker} className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-2xl p-4 transition-all hover:shadow-xl relative group">
                  <Link href={`/stock/${r.ticker}`} className="block">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-black text-white">{r.ticker}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${SIGNAL_COLOR[r.signal]}`}>
                            {r.signal}
                          </span>
                          {held && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-900/50 border border-blue-800 text-blue-300">
                              HELD
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{r.name} · {r.sector}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-white">${r.price.toFixed(2)}</p>
                        <p className={`text-xs font-semibold ${r.changePct >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {r.changePct >= 0 ? "+" : ""}{r.changePct.toFixed(2)}%
                        </p>
                      </div>
                    </div>

                    <div className="mb-3">
                      <div className="flex justify-between text-[10px] text-gray-600 mb-1">
                        <span>${r.low52.toFixed(0)}</span>
                        <span className="text-gray-500">{r.posIn52}% of 52W range</span>
                        <span>${r.high52.toFixed(0)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${r.posIn52 < 30 ? "bg-green-500" : r.posIn52 > 70 ? "bg-red-500" : "bg-blue-500"}`}
                          style={{ width: `${r.posIn52}%` }} />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-gray-800 rounded-lg py-1.5">
                        <p className="text-[10px] text-gray-500">RSI</p>
                        <p className={`text-sm font-bold ${r.rsi < 35 ? "text-green-400" : r.rsi > 65 ? "text-red-400" : "text-white"}`}>{r.rsi}</p>
                      </div>
                      <div className="bg-gray-800 rounded-lg py-1.5">
                        <p className="text-[10px] text-gray-500">P/E</p>
                        <p className="text-sm font-bold text-white">{r.pe?.toFixed(1) ?? "—"}</p>
                      </div>
                      <div className="bg-gray-800 rounded-lg py-1.5">
                        <p className="text-[10px] text-gray-500">Mkt Cap</p>
                        <p className="text-sm font-bold text-white">{fmtMktCap(r.marketCap)}</p>
                      </div>
                    </div>
                  </Link>

                  <div className="flex items-center justify-between mt-3">
                    <p className="text-[10px] text-gray-700 group-hover:text-gray-500 transition-colors">
                      Tap for AI analysis →
                    </p>
                    {!held ? (
                      <button
                        onClick={(e) => handleBuy(r, e)}
                        disabled={portfolio.cash < 1}
                        className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-green-900/40 border border-green-800 text-green-400 hover:bg-green-900/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        Buy ${TRADE_AMOUNT.toLocaleString()}
                      </button>
                    ) : (
                      <Link
                        href={`/stock/${r.ticker}`}
                        className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-blue-900/40 border border-blue-800 text-blue-400 hover:bg-blue-900/70 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Manage →
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
