import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, string> = {};

  checks.FINNHUB_API_KEY = process.env.FINNHUB_API_KEY ? "set" : "MISSING";
  checks.GEMINI_API_KEY = process.env.GEMINI_API_KEY ? "set" : "MISSING";
  checks.NEWSAPI_KEY = process.env.NEWSAPI_KEY ? "set" : "MISSING";
  checks.CRON_SECRET = process.env.CRON_SECRET ? "set" : "MISSING";
  checks.ALPACA_KEY_ID = process.env.ALPACA_KEY_ID ? "set" : "MISSING";
  checks.ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY ? "set" : "MISSING";
  checks.BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN ? "set" : "MISSING";
  checks.BLOB_BASE_URL = process.env.BLOB_BASE_URL ? "set" : "MISSING";

  // Test Finnhub
  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${process.env.FINNHUB_API_KEY}`);
    checks.finnhub_test = res.ok ? "ok" : `error ${res.status}`;
  } catch (e) { checks.finnhub_test = `exception: ${e}`; }

  // Test Gemini
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "say ok" }] }] }),
    });
    checks.gemini_test = res.ok ? "ok" : `error ${res.status}`;
  } catch (e) { checks.gemini_test = `exception: ${e}`; }

  // Test Alpaca
  try {
    const res = await fetch("https://paper-api.alpaca.markets/v2/account", {
      headers: {
        "APCA-API-KEY-ID": process.env.ALPACA_KEY_ID!,
        "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET_KEY!,
      },
    });
    checks.alpaca_test = res.ok ? "ok" : `error ${res.status}`;
  } catch (e) { checks.alpaca_test = `exception: ${e}`; }

  // Test Blob write
  try {
    const { put } = await import("@vercel/blob");
    await put("debug-test.txt", "ok", { access: "public", allowOverwrite: true });
    checks.blob_write_test = "ok";
  } catch (e) { checks.blob_write_test = `exception: ${e}`; }

  return NextResponse.json(checks);
}
