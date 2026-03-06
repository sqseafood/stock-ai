import { NextRequest, NextResponse } from "next/server";
import type { ScanResult } from "@/app/api/scan/route";
import type { Position } from "@/lib/portfolio";

export interface AIDecision {
  ticker: string;
  name: string;
  action: "BUY" | "SELL" | "HOLD";
  reason: string;
  currentPrice: number;
  signal: string;
  rsi: number;
  posIn52: number;
  buyPrice?: number;
  unrealizedPnLPct?: number;
}

interface TraderInput {
  scanResults: ScanResult[];
  positions: Position[];
  cash: number;
}

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash-001", "gemini-3-flash-preview"];

async function getAIDecisions(input: TraderInput): Promise<AIDecision[]> {
  const { scanResults, positions, cash } = input;
  const heldMap = new Map(positions.map((p) => [p.ticker, p]));

  // Build context for positions
  const positionLines = positions.map((p) => {
    const scan = scanResults.find((s) => s.ticker === p.ticker);
    const current = scan?.price ?? p.buyPrice;
    const pnlPct = ((current - p.buyPrice) / p.buyPrice) * 100;
    return `  ${p.ticker} (${p.name}): bought $${p.buyPrice.toFixed(2)}, now $${current.toFixed(2)} (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%), signal: ${scan?.signal ?? "?"}, RSI: ${scan?.rsi ?? "?"}`;
  }).join("\n");

  // Build watchlist context (unowned stocks)
  const watchlistLines = scanResults
    .filter((s) => !heldMap.has(s.ticker))
    .map((s) =>
      `  ${s.ticker} (${s.name}, ${s.sector}): $${s.price.toFixed(2)}, signal: ${s.signal}, RSI: ${s.rsi}, 52W%: ${s.posIn52}%, MACD hist: ${s.macdHistogram.toFixed(3)}, P/E: ${s.pe?.toFixed(1) ?? "N/A"}`
    ).join("\n");

  const prompt = `You are an AI stock trader executing a strict buy-low, sell-high strategy with no emotional bias.

PORTFOLIO:
- Cash available: $${cash.toFixed(2)}
- Trade size: $1,000 per position (fractional shares)
- Max 1 position per stock at a time

CURRENT POSITIONS (${positions.length}):
${positionLines || "  None"}

WATCHLIST — NOT HELD (${scanResults.length - positions.length} stocks):
${watchlistLines}

DECISION RULES:
BUY a stock if ALL of:
  - Not already held
  - Enough cash ($1,000+)
  - Signal is BUY or STRONG BUY
  - RSI < 50 (not overbought)
  - 52W position < 60% (not near yearly high)
  - MACD histogram trending positive

SELL a held position if ANY of:
  - Signal is SELL or STRONG SELL
  - Unrealized gain > 18% (take profit)
  - Unrealized loss > 9% (stop loss — cut losses fast)
  - RSI > 68 (overbought — exit before reversal)

HOLD everything else.

Your job is to be disciplined. Ignore news hype. Follow the data.

Return ONLY a valid JSON array (no markdown, no explanation outside JSON). Include ONLY BUY and SELL actions — skip HOLD entirely:
[{"ticker":"XYZ","action":"BUY","reason":"one clear sentence why"}]

If no trades should be made, return an empty array: []`;

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
          }),
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;

      // Parse JSON decisions
      const raw: { ticker: string; action: string; reason: string }[] = JSON.parse(text);

      // Enrich with current market data
      const decisions: AIDecision[] = raw
        .filter((d) => d.action === "BUY" || d.action === "SELL")
        .map((d) => {
          const scan = scanResults.find((s) => s.ticker === d.ticker);
          const pos = heldMap.get(d.ticker);
          if (!scan) return null;
          return {
            ticker: d.ticker,
            name: scan.name,
            action: d.action as "BUY" | "SELL",
            reason: d.reason,
            currentPrice: scan.price,
            signal: scan.signal,
            rsi: scan.rsi,
            posIn52: scan.posIn52,
            buyPrice: pos?.buyPrice,
            unrealizedPnLPct: pos
              ? ((scan.price - pos.buyPrice) / pos.buyPrice) * 100
              : undefined,
          };
        })
        .filter(Boolean) as AIDecision[];

      return decisions;
    } catch { continue; }
  }

  throw new Error("AI trader unavailable — all models failed");
}

export async function POST(req: NextRequest) {
  try {
    const body: TraderInput = await req.json();
    if (!body.scanResults?.length) {
      return NextResponse.json({ error: "No scan data provided" }, { status: 400 });
    }
    const decisions = await getAIDecisions(body);
    return NextResponse.json(decisions);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
