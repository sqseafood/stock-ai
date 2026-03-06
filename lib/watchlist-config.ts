import { put, list } from "@vercel/blob";
import { DEFAULT_CONFIG, type WatchlistConfig } from "@/lib/stocks-full";

const CONFIG_KEY = "watchlist-config.json";

export async function loadConfig(): Promise<WatchlistConfig> {
  try {
    const { blobs } = await list({ prefix: CONFIG_KEY });
    if (!blobs.length) return DEFAULT_CONFIG;
    const res = await fetch(blobs[0].url, { cache: "no-store" });
    if (!res.ok) return DEFAULT_CONFIG;
    return await res.json();
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: WatchlistConfig): Promise<void> {
  await put(CONFIG_KEY, JSON.stringify(config), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
  });
}
