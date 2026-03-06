"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ALL_SECTORS, SP500, type WatchlistMode, type WatchlistConfig, buildWatchlist } from "@/lib/stocks-full";

const PRESETS: { mode: WatchlistMode; label: string; desc: string; color: string }[] = [
  { mode: "top50",  label: "Top 50",   desc: "Largest 50 S&P 500 stocks",    color: "border-blue-600 bg-blue-900/30 text-blue-300" },
  { mode: "top100", label: "Top 100",  desc: "Largest 100 S&P 500 stocks",   color: "border-purple-600 bg-purple-900/30 text-purple-300" },
  { mode: "sp500",  label: "S&P 500",  desc: "All ~500 stocks (batch scan)", color: "border-yellow-600 bg-yellow-900/30 text-yellow-300" },
  { mode: "custom", label: "Custom",   desc: "Pick sectors & stock count",   color: "border-green-600 bg-green-900/30 text-green-300" },
];

export default function SettingsPage() {
  const [config, setConfig] = useState<WatchlistConfig | null>(null);
  const [totalStocks, setTotalStocks] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(({ config, totalStocks }) => {
      setConfig(config);
      setTotalStocks(totalStocks);
    });
  }, []);

  function updateConfig(changes: Partial<WatchlistConfig>) {
    if (!config) return;
    const updated = { ...config, ...changes };
    setConfig(updated);
    setTotalStocks(buildWatchlist(updated).length);
  }

  function toggleSector(sector: string) {
    if (!config) return;
    const enabled = config.enabledSectors.includes(sector)
      ? config.enabledSectors.filter((s) => s !== sector)
      : [...config.enabledSectors, sector];
    updateConfig({ enabledSectors: enabled });
  }

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!config) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500 animate-pulse text-sm">Loading settings…</p>
      </div>
    );
  }

  const sectorCounts = ALL_SECTORS.reduce((acc, s) => {
    acc[s] = SP500.filter((stock) => stock.sector === s).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/" className="text-xs text-gray-500 hover:text-gray-300">← Scanner</Link>
              <span className="text-gray-700">·</span>
              <Link href="/portfolio" className="text-xs text-gray-500 hover:text-gray-300">Portfolio</Link>
            </div>
            <h1 className="text-xl font-black text-white">Watchlist Settings</h1>
            <p className="text-xs text-gray-500 mt-0.5">Configure which stocks the AI scans and trades</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`text-sm px-5 py-2 rounded-xl font-bold transition-colors ${
              saved
                ? "bg-green-700 text-white"
                : "bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
            }`}
          >
            {saved ? "Saved!" : saving ? "Saving…" : "Save & Apply"}
          </button>
        </div>
      </div>

      <div className="px-6 py-6 max-w-3xl space-y-8">

        {/* Mode selector */}
        <div>
          <h2 className="text-sm font-bold text-gray-300 mb-3 uppercase tracking-wide">Scan Mode</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {PRESETS.map((p) => (
              <button
                key={p.mode}
                onClick={() => updateConfig({ mode: p.mode })}
                className={`rounded-xl border p-4 text-left transition-all ${
                  config.mode === p.mode ? p.color : "border-gray-800 bg-gray-900 text-gray-500 hover:border-gray-700"
                }`}
              >
                <p className="font-bold text-sm">{p.label}</p>
                <p className="text-[11px] mt-0.5 opacity-80">{p.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* S&P 500 batch info */}
        {config.mode === "sp500" && (
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-xl p-4 text-sm">
            <p className="font-bold text-yellow-400 mb-1">Batch Scanning Mode</p>
            <p className="text-yellow-200/70 text-xs">
              With {SP500.length} stocks, the AI scans <strong>{config.batchSize} stocks per run</strong> and rotates through the full list.
              Full coverage every ~{Math.ceil(SP500.length / config.batchSize)} runs ({Math.ceil(SP500.length / config.batchSize * 5)} minutes).
            </p>
            <div className="mt-3">
              <label className="text-xs text-yellow-300 block mb-1">Batch size (stocks per run)</label>
              <input
                type="range" min={20} max={100} step={10}
                value={config.batchSize}
                onChange={(e) => updateConfig({ batchSize: parseInt(e.target.value) })}
                className="w-full accent-yellow-500"
              />
              <div className="flex justify-between text-[10px] text-yellow-600 mt-1">
                <span>20 (slower, thorough)</span>
                <span className="font-bold text-yellow-400">{config.batchSize} stocks/run</span>
                <span>100 (faster, less detail)</span>
              </div>
            </div>
          </div>
        )}

        {/* Custom sector picker */}
        {config.mode === "custom" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide">Sectors</h2>
              <div className="flex gap-2">
                <button onClick={() => updateConfig({ enabledSectors: [...ALL_SECTORS] })} className="text-xs text-blue-400 hover:text-blue-300">All</button>
                <span className="text-gray-700">·</span>
                <button onClick={() => updateConfig({ enabledSectors: [] })} className="text-xs text-gray-500 hover:text-gray-400">None</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {ALL_SECTORS.map((sector) => {
                const enabled = config.enabledSectors.includes(sector);
                return (
                  <button
                    key={sector}
                    onClick={() => toggleSector(sector)}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-left ${
                      enabled
                        ? "border-blue-700 bg-blue-900/30 text-white"
                        : "border-gray-800 bg-gray-900 text-gray-500 hover:border-gray-700"
                    }`}
                  >
                    <span className="text-sm font-semibold">{sector}</span>
                    <span className={`text-xs ${enabled ? "text-blue-400" : "text-gray-600"}`}>
                      {Math.min(config.maxPerSector || sectorCounts[sector], sectorCounts[sector])} / {sectorCounts[sector]} stocks
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Stocks per sector */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <label className="text-sm font-bold text-gray-300 block mb-3">
                Stocks per sector: <span className="text-white">{config.maxPerSector === 0 ? "All" : config.maxPerSector}</span>
              </label>
              <input
                type="range" min={1} max={40} step={1}
                value={config.maxPerSector === 0 ? 40 : config.maxPerSector}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  updateConfig({ maxPerSector: val >= 40 ? 0 : val });
                }}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                <span>1</span>
                <span>All</span>
              </div>
            </div>
          </div>
        )}

        {/* Summary */}
        <div className={`rounded-xl border p-4 ${totalStocks > 100 ? "border-yellow-800 bg-yellow-900/10" : "border-gray-800 bg-gray-900"}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">Total stocks to scan: <span className="text-blue-400">{totalStocks}</span></p>
              <p className="text-xs text-gray-500 mt-0.5">
                {totalStocks <= 24 && "Scanned fully every 5 minutes"}
                {totalStocks > 24 && totalStocks <= 80 && "Scanned fully every 5 minutes"}
                {totalStocks > 80 && `Batch scan — full coverage every ~${Math.ceil(totalStocks / config.batchSize) * 5} minutes`}
              </p>
            </div>
            {totalStocks > 200 && (
              <span className="text-xs text-yellow-400 font-bold">Large list</span>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
