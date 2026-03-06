import { NextResponse } from "next/server";
import { loadCronLog } from "@/lib/portfolio-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const logs = await loadCronLog();
  return NextResponse.json(logs);
}
