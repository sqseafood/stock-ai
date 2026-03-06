import { put } from "@vercel/blob";
import { DEFAULT_CONFIG, type WatchlistConfig } from "@/lib/stocks-full";

const CONFIG_KEY = "watchlist-config.json";

export async function loadConfig(): Promise<WatchlistConfig> {
  try {
    const url = `${process.env.BLOB_BASE_URL}/${CONFIG_KEY}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
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
