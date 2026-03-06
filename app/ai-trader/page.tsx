"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import type { Portfolio } from "@/lib/portfolio-server";
import type { ScanResult } from "@/app/api/scan/route";
import type { AIDecision } from "@/app/api/ai-trader/route";

type Step = "idle" | "scanning" | "thinking" | "ready" | "executing" | "done";

interface ExecutedTrade {
  ticker: string;
  action: "BUY" | "SELL";
  price: number;
  reason: string;
  result: "ok" | "err";
  message: string;
}

function DecisionCard({ d, executed }: { d: AIDecision; executed?: ExecutedTrade }) {
  const isBuy = d.action === "BUY";
  return (
    <div className={`rounded-xl border p-4 ${
      isBuy ? "bg-green-900/10 border-green-900/50" : "bg-red-900/10 border-red-900/50"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${
              isBuy ? "bg-green-900/50 text-green-300" : "bg-red-900/50 text-red-300"
            }`}>
              {d.action}
            </span>
            <span className="text-white font-bold">{d.ticker}</span>
            <span className="text-gray-500 text-xs">{d.name}</span>
          </div>
          <p className="text-xs text-gray-300 mt-2 leading-relaxed">{d.reason}</p>
          <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-gray-500">
            <span>Price: <span className="text-gray-300">${d.currentPrice.toFixed(2)}</span></span>
            <span>Signal: <span className={`font-semibold ${
              d.signal.includes("BUY") ? "text-green-400" : d.signal.includes("SELL") ? "text-red-400" : "text-gray-400"
            }`}>{d.signal}</span></span>
            <span>RSI: <span className={`font-semibold ${d.rsi < 35 ? "text-green-400" : d.rsi > 65 ? "text-red-400" : "text-gray-300"}`}>{d.rsi}</span></span>
            <span>52W: <span className="text-gray-300">{d.posIn52}%</span></span>
            {d.unrealizedPnLPct !== undefined && (
              <span>P&L: <span className={d.unrealizedPnLPct >= 0 ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                {d.unrealizedPnLPct >= 0 ? "+" : ""}{d.unrealizedPnLPct.toFixed(1)}%
              </span></span>
            )}
          </div>
        </div>
        {executed && (
          <div className={`text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0 ${
            executed.result === "ok"
              ? "bg-gray-800 text-gray-400"
              : "bg-red-900/50 text-red-400"
          }`}>
            {executed.result === "ok" ? "Executed" : "Failed"}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AITraderPage() {
  const [step, setStep] = useState<Step>("idle");
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [decisions, setDecisions] = useState<AIDecision[]>([]);
  const [executed, setExecuted] = useState<ExecutedTrade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);

  const runAnalysis = useCallback(async () => {
    setStep("scanning");
    setDecisions([]);
    setExecuted([]);
    setError(null);

    try {
      // Step 1: Fetch fresh market scan
      const scanRes = await fetch("/api/scan");
      if (!scanRes.ok) throw new Error("Scan failed");
      const scan: ScanResult[] = await scanRes.json();
      setScanResults(scan);

      // Step 2: Get current portfolio from server
      const p: Portfolio = await fetch("/api/portfolio").then((r) => r.json());
      setPortfolio(p);

      // Step 3: Ask AI for decisions
      setStep("thinking");
      const aiRes = await fetch("/api/ai-trader", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanResults: scan, positions: p.positions, cash: p.cash }),
      });
      if (!aiRes.ok) {
        const err = await aiRes.json();
        throw new Error(err.error ?? "AI trader failed");
      }
      const aiDecisions: AIDecision[] = await aiRes.json();
      setDecisions(aiDecisions);
      setStep("ready");
    } catch (e) {
      setError((e as Error).message);
      setStep("idle");
    }
  }, []);

  async function executeTrades() {
    setStep("executing");
    const trades: ExecutedTrade[] = [];
    // Execute in order: sells first (free up cash), then buys
    const sorted = [...decisions].sort((a, b) =>
      a.action === "SELL" && b.action === "BUY" ? -1 : 1
    );

    for (const d of sorted) {
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: d.action, ticker: d.ticker, name: d.name, price: d.currentPrice, signal: d.signal }),
      });
      const body = await res.json();
      const err = res.ok ? null : body.error;
      trades.push({
        ticker: d.ticker, action: d.action as "BUY" | "SELL", price: d.currentPrice, reason: d.reason,
        result: err ? "err" : "ok",
        message: err ?? (d.action === "BUY" ? `Bought at $${d.currentPrice.toFixed(2)}` : `Sold at $${d.currentPrice.toFixed(2)}`),
      });
    }

    const updatedPortfolio: Portfolio = await fetch("/api/portfolio").then((r) => r.json());
    setExecuted(trades);
    setPortfolio(updatedPortfolio);
    setStep("done");
  }

  const buys = decisions.filter((d) => d.action === "BUY");
  const sells = decisions.filter((d) => d.action === "SELL");
  const currentPortfolio = portfolio ?? { cash: 10000, positions: [], trades: [] };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/" className="text-xs text-gray-500 hover:text-gray-300">← Scanner</Link>
              <span className="text-gray-700">·</span>
              <Link href="/portfolio" className="text-xs text-gray-500 hover:text-gray-300">Portfolio</Link>
            </div>
            <h1 className="text-xl font-black text-white">AI Auto-Trader</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Emotion-free decisions · Real market data · Gemini-powered analysis
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Cash</p>
            <p className="text-lg font-bold text-blue-300">
              ${currentPortfolio.cash.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[10px] text-gray-600">{currentPortfolio.positions.length} open positions</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5 max-w-2xl mx-auto">
        {/* How it works */}
        {step === "idle" && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
            <p className="text-sm font-bold text-white mb-3">How the AI Trader works</p>
            <div className="space-y-2 text-xs text-gray-400">
              <div className="flex gap-3">
                <span className="text-blue-400 font-bold w-5">1.</span>
                <span>Fetches live prices, RSI, MACD, and 52-week data for all 24 watchlist stocks</span>
              </div>
              <div className="flex gap-3">
                <span className="text-blue-400 font-bold w-5">2.</span>
                <span>Feeds your current portfolio + all market data to Gemini AI in one shot</span>
              </div>
              <div className="flex gap-3">
                <span className="text-blue-400 font-bold w-5">3.</span>
                <span>AI applies strict buy-low/sell-high rules: stop-loss at -9%, take-profit at +18%, RSI limits</span>
              </div>
              <div className="flex gap-3">
                <span className="text-blue-400 font-bold w-5">4.</span>
                <span>Shows you every decision with reasoning — you approve and execute with one click</span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center text-[10px] text-gray-500">
              <div className="bg-gray-800 rounded-lg p-2">
                <p className="text-green-400 font-bold text-sm">BUY</p>
                <p>BUY/STRONG BUY signal · RSI &lt;50 · 52W &lt;60%</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-2">
                <p className="text-red-400 font-bold text-sm">SELL</p>
                <p>SELL signal · +18% profit · -9% loss · RSI &gt;68</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-2">
                <p className="text-gray-400 font-bold text-sm">HOLD</p>
                <p>No action — stay the course</p>
              </div>
            </div>
          </div>
        )}

        {/* Status / Progress */}
        {(step === "scanning" || step === "thinking") && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8 text-center">
            <div className="text-4xl mb-4 animate-pulse">{step === "scanning" ? "📊" : "🤖"}</div>
            <p className="text-white font-semibold">
              {step === "scanning" ? "Scanning 24 stocks…" : "AI is analyzing your portfolio…"}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {step === "scanning"
                ? "Fetching live prices, RSI, MACD, 52-week data (~20 seconds)"
                : "Gemini is evaluating signals and generating trade decisions"}
            </p>
            {step === "scanning" && scanResults.length > 0 && (
              <p className="text-xs text-green-400 mt-3">{scanResults.length} stocks scanned…</p>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-900/20 border border-red-900 rounded-xl px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Decisions */}
        {(step === "ready" || step === "done") && (
          <>
            {decisions.length === 0 ? (
              <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8 text-center">
                <div className="text-4xl mb-3">✋</div>
                <p className="text-white font-semibold">AI says: Hold everything</p>
                <p className="text-xs text-gray-500 mt-1">
                  No stocks meet the buy criteria and no positions need to be exited right now.
                  Market conditions don't justify action.
                </p>
              </div>
            ) : (
              <>
                {/* Summary bar */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-center">
                    <p className="text-2xl font-black text-green-400">{buys.length}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Buy orders</p>
                  </div>
                  <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-center">
                    <p className="text-2xl font-black text-red-400">{sells.length}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Sell orders</p>
                  </div>
                  <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-center">
                    <p className="text-2xl font-black text-white">{decisions.length}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Total actions</p>
                  </div>
                </div>

                {/* Sell decisions first */}
                {sells.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Sell Orders</p>
                    {sells.map((d) => (
                      <DecisionCard
                        key={d.ticker} d={d}
                        executed={executed.find((e) => e.ticker === d.ticker && e.action === "SELL")}
                      />
                    ))}
                  </div>
                )}

                {/* Buy decisions */}
                {buys.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Buy Orders</p>
                    {buys.map((d) => (
                      <DecisionCard
                        key={d.ticker} d={d}
                        executed={executed.find((e) => e.ticker === d.ticker && e.action === "BUY")}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Execution results */}
        {step === "done" && executed.length > 0 && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Execution Log</p>
            <div className="space-y-1.5">
              {executed.map((t, i) => (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <span className={`font-bold w-8 ${t.action === "BUY" ? "text-green-400" : "text-red-400"}`}>
                    {t.action}
                  </span>
                  <span className="text-white font-bold w-12">{t.ticker}</span>
                  <span className="text-gray-400 flex-1">{t.message}</span>
                  <span className={t.result === "ok" ? "text-gray-600" : "text-red-400"}>
                    {t.result === "ok" ? "✓" : "✗"}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between text-xs">
              <span className="text-gray-500">Cash after trades</span>
              <span className="font-bold text-blue-300">
                ${currentPortfolio.cash.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          {(step === "idle" || step === "done") && (
            <button
              onClick={runAnalysis}
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors"
            >
              {step === "done" ? "Run Again" : "Run AI Trader"}
            </button>
          )}
          {step === "ready" && decisions.length > 0 && (
            <>
              <button
                onClick={() => setStep("idle")}
                className="px-5 py-3 rounded-xl bg-gray-800 border border-gray-700 text-gray-400 hover:text-white font-semibold text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeTrades}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors"
              >
                Execute {decisions.length} Trade{decisions.length !== 1 ? "s" : ""}
              </button>
            </>
          )}
          {step === "ready" && decisions.length === 0 && (
            <button
              onClick={() => setStep("idle")}
              className="flex-1 py-3 rounded-xl bg-gray-800 border border-gray-700 text-gray-400 hover:text-white font-semibold text-sm transition-colors"
            >
              Back
            </button>
          )}
        </div>

        {step === "done" && (
          <Link
            href="/portfolio"
            className="block text-center py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-400 hover:text-white text-sm transition-colors"
          >
            View Updated Portfolio →
          </Link>
        )}
      </div>
    </div>
  );
}
