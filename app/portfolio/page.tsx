"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Portfolio, Trade, CronLog } from "@/lib/portfolio-server";
import { STARTING_CASH, TRADE_AMOUNT } from "@/lib/portfolio-server";

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}
function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function SignalBadge({ signal }: { signal: string }) {
  const colors: Record<string, string> = {
    "STRONG BUY": "bg-green-900/50 text-green-400 border-green-700",
    "BUY": "bg-emerald-900/50 text-emerald-400 border-emerald-700",
    "HOLD": "bg-gray-800 text-gray-400 border-gray-700",
    "SELL": "bg-orange-900/50 text-orange-400 border-orange-700",
    "STRONG SELL": "bg-red-900/50 text-red-400 border-red-700",
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors[signal] ?? colors["HOLD"]}`}>
      {signal}
    </span>
  );
}

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [cronLogs, setCronLogs] = useState<CronLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [activeTab, setActiveTab] = useState<"positions" | "history" | "log">("positions");

  const loadData = useCallback(async () => {
    const [pRes, lRes] = await Promise.all([
      fetch("/api/portfolio"),
      fetch("/api/portfolio/log"),
    ]);
    const [p, l] = await Promise.all([pRes.json(), lRes.json()]);
    setPortfolio(p);
    setCronLogs(l);
    setLoading(false);
    return p as Portfolio;
  }, []);

  useEffect(() => {
    loadData().then((p) => {
      const tickers = p.positions.map((pos) => pos.ticker);
      if (!tickers.length) return;
      setLoadingPrices(true);
      fetch(`/api/quotes?tickers=${tickers.join(",")}`)
        .then((r) => r.json())
        .then(setPrices)
        .finally(() => setLoadingPrices(false));
    });
  }, [loadData]);

  async function handleSell(ticker: string, name: string) {
    const price = prices[ticker];
    if (!price || !portfolio) return;
    const scan = await fetch(`/api/quotes?tickers=${ticker}`).then((r) => r.json());
    const currentPrice = scan[ticker] ?? price;
    await fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "SELL", ticker, name, price: currentPrice, signal: "—" }),
    });
    await loadData();
  }

  async function handleReset() {
    if (!confirmReset) { setConfirmReset(true); return; }
    await fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "RESET" }),
    });
    setPortfolio({ cash: STARTING_CASH, positions: [], trades: [] });
    setPrices({});
    setConfirmReset(false);
  }

  if (loading || !portfolio) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500 animate-pulse text-sm">Loading portfolio…</div>
      </div>
    );
  }

  const positionValue = portfolio.positions.reduce((sum, pos) => {
    return sum + pos.shares * (prices[pos.ticker] ?? pos.buyPrice);
  }, 0);
  const totalValue = portfolio.cash + positionValue;
  const totalPnL = totalValue - STARTING_CASH;
  const totalPnLPct = (totalPnL / STARTING_CASH) * 100;
  const sells = portfolio.trades.filter((t) => t.type === "SELL");
  const wins = sells.filter((t) => (t.pnl ?? 0) > 0).length;
  const winRate = sells.length > 0 ? (wins / sells.length) * 100 : null;
  const totalRealizedPnL = sells.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const cronTrades = portfolio.trades.filter((t) => t.source === "cron").length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/" className="text-xs text-gray-500 hover:text-gray-300">← Scanner</Link>
              <span className="text-gray-700">·</span>
              <Link href="/ai-trader" className="text-xs text-purple-400 hover:text-purple-300">AI Trader</Link>
            </div>
            <h1 className="text-xl font-black text-white">Portfolio</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Server-side · Auto-traded by cron every hour during market hours
              {cronTrades > 0 && <span className="ml-2 text-purple-400">· {cronTrades} AI-executed trades</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/ai-trader"
              className="text-xs px-3 py-1.5 rounded-lg bg-purple-900/40 border border-purple-800 text-purple-300 hover:bg-purple-900/70 transition-colors font-semibold"
            >
              AI Trader
            </Link>
            <button
              onClick={handleReset}
              onBlur={() => setConfirmReset(false)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                confirmReset
                  ? "bg-red-900/50 border-red-700 text-red-400"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
              }`}
            >
              {confirmReset ? "Confirm Reset?" : "Reset"}
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total Value", value: fmt(totalValue), color: "text-white" },
            { label: "Cash", value: fmt(portfolio.cash), color: "text-blue-300" },
            { label: "Invested", value: fmt(positionValue), color: loadingPrices ? "text-gray-500" : "text-white" },
            {
              label: "Total P&L", value: fmt(totalPnL), sub: pct(totalPnLPct),
              color: totalPnL >= 0 ? "text-green-400" : "text-red-400",
            },
            {
              label: "Win Rate",
              value: winRate !== null ? `${winRate.toFixed(0)}%` : "—",
              sub: sells.length > 0 ? `${wins}/${sells.length} sells` : "No sells yet",
              color: winRate !== null ? (winRate >= 50 ? "text-green-400" : "text-red-400") : "text-gray-500",
            },
          ].map((s) => (
            <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">{s.label}</p>
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              {s.sub && <p className={`text-xs ${s.color} opacity-70`}>{s.sub}</p>}
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
          {([
            { id: "positions", label: `Positions (${portfolio.positions.length})` },
            { id: "history", label: `Trade History (${portfolio.trades.length})` },
            { id: "log", label: `AI Activity (${cronLogs.length})` },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-colors ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Positions Tab */}
        {activeTab === "positions" && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            {portfolio.positions.length === 0 ? (
              <p className="text-xs text-gray-600 px-4 py-8 text-center">
                No open positions. The AI trader will buy automatically when signals align.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-gray-600 uppercase border-b border-gray-800">
                      <th className="text-left px-4 py-2">Ticker</th>
                      <th className="text-right px-3 py-2">Bought</th>
                      <th className="text-right px-3 py-2">Current</th>
                      <th className="text-right px-3 py-2">P&L</th>
                      <th className="text-center px-3 py-2">Signal</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.positions.map((pos) => {
                      const current = prices[pos.ticker];
                      const value = current ? pos.shares * current : null;
                      const cost = pos.shares * pos.buyPrice;
                      const pnl = value !== null ? value - cost : null;
                      const pnlP = pnl !== null ? (pnl / cost) * 100 : null;
                      return (
                        <tr key={pos.ticker} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                          <td className="px-4 py-3">
                            <Link href={`/stock/${pos.ticker}`} className="hover:text-blue-400">
                              <p className="font-bold text-white">{pos.ticker}</p>
                              <p className="text-[10px] text-gray-500">{pos.name}</p>
                            </Link>
                          </td>
                          <td className="text-right px-3 py-3 text-gray-300">{fmt(pos.buyPrice)}</td>
                          <td className="text-right px-3 py-3">
                            {current ? (
                              <span className={current > pos.buyPrice ? "text-green-400" : "text-red-400"}>
                                {fmt(current)}
                              </span>
                            ) : <span className="text-gray-600 animate-pulse">…</span>}
                          </td>
                          <td className="text-right px-3 py-3">
                            {pnl !== null ? (
                              <div>
                                <p className={pnl >= 0 ? "text-green-400" : "text-red-400"}>{fmt(pnl)}</p>
                                <p className={`text-[10px] ${pnl >= 0 ? "text-green-600" : "text-red-600"}`}>{pct(pnlP!)}</p>
                              </div>
                            ) : "…"}
                          </td>
                          <td className="text-center px-3 py-3">
                            <SignalBadge signal={pos.buySignal} />
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleSell(pos.ticker, pos.name)}
                              disabled={!prices[pos.ticker]}
                              className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-red-900/40 border border-red-800 text-red-400 hover:bg-red-900/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                              Sell
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Trade History Tab */}
        {activeTab === "history" && (
          <>
            {sells.length > 0 && (
              <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${
                totalRealizedPnL >= 0 ? "bg-green-900/20 border-green-900" : "bg-red-900/20 border-red-900"
              }`}>
                <p className="text-xs text-gray-400">Realized P&L ({sells.length} closed)</p>
                <div className="text-right">
                  <p className={`font-bold ${totalRealizedPnL >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {fmt(totalRealizedPnL)}
                  </p>
                  <p className={`text-[10px] ${totalRealizedPnL >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {pct((totalRealizedPnL / STARTING_CASH) * 100)} vs start
                  </p>
                </div>
              </div>
            )}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
              {portfolio.trades.length === 0 ? (
                <p className="text-xs text-gray-600 px-4 py-8 text-center">No trades yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-gray-600 uppercase border-b border-gray-800">
                        <th className="text-left px-4 py-2">Date</th>
                        <th className="text-left px-3 py-2">Ticker</th>
                        <th className="text-center px-3 py-2">Type</th>
                        <th className="text-center px-3 py-2">By</th>
                        <th className="text-right px-3 py-2">Price</th>
                        <th className="text-right px-4 py-2">P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...portfolio.trades].reverse().map((t: Trade, i) => (
                        <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                          <td className="px-4 py-2.5 text-gray-500">
                            {new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            <span className="text-[10px] text-gray-700 ml-1">
                              {new Date(t.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <Link href={`/stock/${t.ticker}`} className="font-bold text-white hover:text-blue-400">
                              {t.ticker}
                            </Link>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                              t.type === "BUY" ? "bg-blue-900/50 text-blue-400" : "bg-gray-800 text-gray-400"
                            }`}>{t.type}</span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`text-[10px] font-semibold ${t.source === "cron" ? "text-purple-400" : "text-gray-500"}`}>
                              {t.source === "cron" ? "🤖 AI" : "👤 You"}
                            </span>
                          </td>
                          <td className="text-right px-3 py-2.5 text-gray-300">{fmt(t.price)}</td>
                          <td className="text-right px-4 py-2.5">
                            {t.type === "SELL" && t.pnl !== undefined ? (
                              <div>
                                <p className={t.pnl >= 0 ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                                  {fmt(t.pnl)}
                                </p>
                                <p className={`text-[10px] ${t.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  {pct(t.pnlPct ?? 0)}
                                </p>
                              </div>
                            ) : <span className="text-gray-700">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* AI Activity Log Tab */}
        {activeTab === "log" && (
          <div className="space-y-3">
            {cronLogs.length === 0 ? (
              <div className="bg-gray-900 rounded-2xl border border-gray-800 px-4 py-8 text-center">
                <p className="text-xs text-gray-600">No AI runs yet. Cron runs every hour during US market hours (9:30 AM – 4:00 PM ET).</p>
              </div>
            ) : (
              cronLogs.map((log, i) => (
                <div key={i} className={`bg-gray-900 rounded-xl border p-4 ${
                  log.error ? "border-red-900/50" : log.decisionsCount > 0 ? "border-purple-900/50" : "border-gray-800"
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-400">
                      {new Date(log.runAt).toLocaleString("en-US", {
                        timeZone: "America/New_York",
                        month: "short", day: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })} ET
                    </p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      log.error ? "bg-red-900/50 text-red-400" :
                      log.decisionsCount > 0 ? "bg-purple-900/50 text-purple-400" :
                      "bg-gray-800 text-gray-500"
                    }`}>
                      {log.error ? "Error" : log.decisionsCount > 0 ? `${log.decisionsCount} trades` : "No action"}
                    </span>
                  </div>
                  {log.error && <p className="text-xs text-red-400">{log.error}</p>}
                  {log.trades.map((t, j) => (
                    <div key={j} className="flex items-start gap-2 mt-1.5 text-xs">
                      <span className={`font-bold flex-shrink-0 ${t.action === "BUY" ? "text-green-400" : "text-red-400"}`}>
                        {t.action}
                      </span>
                      <span className="text-white font-bold flex-shrink-0">{t.ticker}</span>
                      <span className="text-gray-300">${t.price.toFixed(2)}</span>
                      <span className="text-gray-500 flex-1">— {t.reason}</span>
                    </div>
                  ))}
                  {!log.error && log.decisionsCount === 0 && (
                    <p className="text-[10px] text-gray-600 mt-1">AI evaluated all positions — no trades warranted.</p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
