"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { StockDetail } from "@/app/api/stock/[ticker]/route";
import { TRADE_AMOUNT } from "@/lib/portfolio-server";
import type { Portfolio, Position } from "@/lib/portfolio-server";

const SIGNAL_COLOR: Record<string, string> = {
  "STRONG BUY":  "text-green-400 bg-green-900/40 border-green-700",
  "BUY":         "text-emerald-400 bg-emerald-900/40 border-emerald-700",
  "HOLD":        "text-gray-400 bg-gray-800 border-gray-700",
  "SELL":        "text-orange-400 bg-orange-900/40 border-orange-700",
  "STRONG SELL": "text-red-400 bg-red-900/40 border-red-700",
};

function fmtMktCap(n: number | null) {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  return `$${(n / 1e6).toFixed(0)}M`;
}

export default function StockPage({ params }: { params: Promise<{ ticker: string }> }) {
  const [ticker, setTicker] = useState<string>("");
  const [data, setData] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tradeMsg, setTradeMsg] = useState<string | null>(null);
  const [tradeMsgType, setTradeMsgType] = useState<"ok" | "err">("ok");
  const [position, setPosition] = useState<Position | null>(null);
  const [portfolioCash, setPortfolioCash] = useState(0);

  const refreshPortfolio = useCallback((sym: string) => {
    fetch("/api/portfolio")
      .then((r) => r.json())
      .then((p: Portfolio) => {
        setPortfolioCash(p.cash);
        setPosition(p.positions.find((pos) => pos.ticker === sym) ?? null);
      });
  }, []);

  useEffect(() => {
    params.then((p) => {
      const sym = p.ticker.toUpperCase();
      setTicker(sym);
      refreshPortfolio(sym);
      fetch(`/api/stock/${p.ticker}`)
        .then((r) => r.json())
        .then((d) => { if (d.error) throw new Error(d.error); setData(d); })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    });
  }, [params]);

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-pulse">🤖</div>
        <p className="text-gray-400">Fetching data + running AI analysis for {ticker}…</p>
        <p className="text-xs text-gray-600 mt-1">Analyzing news, financials, macro conditions</p>
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-400 mb-4">{error}</p>
        <Link href="/" className="text-blue-400 hover:underline">← Back to scanner</Link>
      </div>
    </div>
  );

  const smaColor = data.price > data.sma50 ? "#10b981" : "#f87171";

  async function handleBuy() {
    if (!data) return;
    const res = await fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "BUY", ticker: data.ticker, name: data.name, price: data.price, signal: data.signal }),
    });
    const body = await res.json();
    if (!res.ok) { setTradeMsg(body.error); setTradeMsgType("err"); }
    else {
      const spent = Math.min(TRADE_AMOUNT, portfolioCash);
      setTradeMsg(`Bought ${(spent / data.price).toFixed(4)} shares at $${data.price.toFixed(2)}`);
      setTradeMsgType("ok");
      refreshPortfolio(data.ticker);
    }
    setTimeout(() => setTradeMsg(null), 4000);
  }

  async function handleSell() {
    if (!data) return;
    const res = await fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "SELL", ticker: data.ticker, name: data.name, price: data.price, signal: data.signal }),
    });
    const body = await res.json();
    if (!res.ok) { setTradeMsg(body.error); setTradeMsgType("err"); }
    else {
      setTradeMsg(`Sold at $${data.price.toFixed(2)}`);
      setTradeMsgType("ok");
      refreshPortfolio(data.ticker);
    }
    setTimeout(() => setTradeMsg(null), 4000);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <Link href="/" className="text-xs text-gray-500 hover:text-gray-300 mb-3 block">← Back to scanner</Link>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-black text-white">{data.ticker}</h1>
              <span className={`text-sm font-bold px-3 py-1 rounded-full border ${SIGNAL_COLOR[data.signal]}`}>
                {data.signal}
              </span>
            </div>
            <p className="text-gray-400 mt-0.5">{data.name}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black text-white">${data.price.toFixed(2)}</p>
            <p className={`text-sm font-semibold ${data.changePct >= 0 ? "text-green-400" : "text-red-400"}`}>
              {data.changePct >= 0 ? "+" : ""}{data.change.toFixed(2)} ({data.changePct.toFixed(2)}%)
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Trading Panel */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
              {position ? (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Your Position</p>
                  <p className="text-sm text-white font-bold">
                    {position.shares.toFixed(4)} shares @ ${position.buyPrice.toFixed(2)}
                  </p>
                  <p className={`text-xs font-semibold mt-0.5 ${
                    data.price > position.buyPrice ? "text-green-400" : "text-red-400"
                  }`}>
                    {data.price > position.buyPrice ? "+" : ""}
                    ${((data.price - position.buyPrice) * position.shares).toFixed(2)} (
                    {(((data.price - position.buyPrice) / position.buyPrice) * 100).toFixed(2)}%)
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Cash Available</p>
                  <p className="text-sm text-white font-bold">
                    ${portfolioCash.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-[10px] text-gray-600 mt-0.5">Buys ${TRADE_AMOUNT} worth per trade</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href="/portfolio"
                className="text-xs px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white transition-colors"
              >
                View Portfolio
              </Link>
              {position ? (
                <button
                  onClick={handleSell}
                  className="text-sm font-bold px-5 py-2 rounded-lg bg-red-900/50 border border-red-700 text-red-300 hover:bg-red-900/80 transition-colors"
                >
                  Sell All Shares
                </button>
              ) : (
                <button
                  onClick={handleBuy}
                  disabled={portfolioCash < 1}
                  className="text-sm font-bold px-5 py-2 rounded-lg bg-green-900/50 border border-green-700 text-green-300 hover:bg-green-900/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Buy ${TRADE_AMOUNT.toLocaleString()}
                </button>
              )}
            </div>
          </div>
          {tradeMsg && (
            <p className={`text-xs mt-3 px-3 py-1.5 rounded-lg ${
              tradeMsgType === "ok"
                ? "bg-green-900/30 text-green-400 border border-green-900"
                : "bg-red-900/30 text-red-400 border border-red-900"
            }`}>
              {tradeMsg}
            </p>
          )}
        </div>

        {/* Price Chart */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
          <p className="text-xs text-gray-500 mb-3 font-semibold uppercase tracking-wide">Price — Last 90 Days</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.history}>
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }}
                tickFormatter={(v) => v.slice(5)} interval={14} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: "#6b7280", fontSize: 10 }}
                tickFormatter={(v) => `$${v.toFixed(0)}`} width={55} />
              <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                labelStyle={{ color: "#9ca3af", fontSize: 11 }}
                formatter={(v: number | undefined) => v !== undefined ? [`$${v.toFixed(2)}`, "Close"] : ["—", "Close"]} />
              <ReferenceLine y={data.sma20} stroke="#6366f1" strokeDasharray="4 2" strokeWidth={1} label={{ value: "SMA20", fill: "#6366f1", fontSize: 9 }} />
              <ReferenceLine y={data.sma50} stroke={smaColor} strokeDasharray="4 2" strokeWidth={1} label={{ value: "SMA50", fill: smaColor, fontSize: 9 }} />
              <Line type="monotone" dataKey="close" stroke="#3b82f6" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Technicals + Fundamentals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "RSI (14)", value: data.rsi, color: data.rsi < 35 ? "text-green-400" : data.rsi > 65 ? "text-red-400" : "text-white" },
            { label: "MACD Hist", value: data.macdHistogram.toFixed(3), color: data.macdHistogram > 0 ? "text-green-400" : "text-red-400" },
            { label: "SMA 20", value: `$${data.sma20.toFixed(2)}`, color: "text-indigo-300" },
            { label: "SMA 50", value: `$${data.sma50.toFixed(2)}`, color: smaColor === "#10b981" ? "text-green-400" : "text-red-400" },
            { label: "52W Low", value: `$${data.low52.toFixed(2)}`, color: "text-gray-300" },
            { label: "52W High", value: `$${data.high52.toFixed(2)}`, color: "text-gray-300" },
            { label: "P/E Ratio", value: data.pe?.toFixed(1) ?? "—", color: "text-white" },
            { label: "Mkt Cap", value: fmtMktCap(data.marketCap), color: "text-white" },
          ].map((item) => (
            <div key={item.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">{item.label}</p>
              <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>

        {/* 52-week position bar */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>52W Low ${data.low52.toFixed(2)}</span>
            <span className="font-semibold text-white">{data.posIn52}% of yearly range</span>
            <span>52W High ${data.high52.toFixed(2)}</span>
          </div>
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${data.posIn52 < 30 ? "bg-green-500" : data.posIn52 > 70 ? "bg-red-500" : "bg-blue-500"}`}
              style={{ width: `${data.posIn52}%` }} />
          </div>
          <p className="text-xs text-gray-600 mt-2">
            {data.posIn52 < 25 ? "⬇ Near yearly low — potential buy zone" :
             data.posIn52 > 75 ? "⬆ Near yearly high — consider taking profits" :
             "↔ Mid-range — watch for direction"}
          </p>
        </div>

        {/* AI Analysis */}
        <div className="bg-gray-900 rounded-2xl border border-blue-900/50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🤖</span>
            <p className="text-sm font-bold text-blue-300">AI Analysis</p>
            <span className="text-[10px] bg-blue-900/50 text-blue-400 px-2 py-0.5 rounded-full">Gemini</span>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{data.aiAnalysis}</p>
        </div>

        {/* Company News */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Company News — Last 7 Days</p>
          <div className="space-y-2">
            {data.companyNews.length === 0 && <p className="text-xs text-gray-600">No recent news found.</p>}
            {data.companyNews.map((n, i) => (
              <a key={i} href={n.url} target="_blank" rel="noopener noreferrer"
                className="block hover:bg-gray-800 rounded-lg p-2 transition-colors group">
                <p className="text-xs text-gray-300 group-hover:text-white leading-snug">{n.headline}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">
                  {n.source} · {new Date(n.datetime * 1000).toLocaleDateString()}
                </p>
              </a>
            ))}
          </div>
        </div>

        {/* Macro News */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Macro & Market News</p>
          <div className="space-y-2">
            {data.macroNews.map((n, i) => (
              <a key={i} href={n.url} target="_blank" rel="noopener noreferrer"
                className="block hover:bg-gray-800 rounded-lg p-2 transition-colors group">
                <p className="text-xs text-gray-300 group-hover:text-white leading-snug">{n.title}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">
                  {n.source} · {new Date(n.publishedAt).toLocaleDateString()}
                </p>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
