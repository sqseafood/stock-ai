// Curated watchlist across major sectors — good for "buy low sell high" scanning
export const WATCHLIST: { ticker: string; name: string; sector: string }[] = [
  // Technology
  { ticker: "AAPL",  name: "Apple",            sector: "Technology" },
  { ticker: "MSFT",  name: "Microsoft",         sector: "Technology" },
  { ticker: "GOOGL", name: "Alphabet",          sector: "Technology" },
  { ticker: "META",  name: "Meta",              sector: "Technology" },
  { ticker: "NVDA",  name: "NVIDIA",            sector: "Technology" },
  { ticker: "AMD",   name: "AMD",               sector: "Technology" },
  { ticker: "INTC",  name: "Intel",             sector: "Technology" },
  // Finance
  { ticker: "JPM",   name: "JPMorgan Chase",    sector: "Finance" },
  { ticker: "BAC",   name: "Bank of America",   sector: "Finance" },
  { ticker: "GS",    name: "Goldman Sachs",     sector: "Finance" },
  { ticker: "V",     name: "Visa",              sector: "Finance" },
  // Healthcare
  { ticker: "JNJ",   name: "Johnson & Johnson", sector: "Healthcare" },
  { ticker: "PFE",   name: "Pfizer",            sector: "Healthcare" },
  { ticker: "UNH",   name: "UnitedHealth",      sector: "Healthcare" },
  // Energy
  { ticker: "XOM",   name: "ExxonMobil",        sector: "Energy" },
  { ticker: "CVX",   name: "Chevron",           sector: "Energy" },
  // Consumer
  { ticker: "AMZN",  name: "Amazon",            sector: "Consumer" },
  { ticker: "WMT",   name: "Walmart",           sector: "Consumer" },
  { ticker: "COST",  name: "Costco",            sector: "Consumer" },
  { ticker: "MCD",   name: "McDonald's",        sector: "Consumer" },
  // Industrial
  { ticker: "BA",    name: "Boeing",            sector: "Industrial" },
  { ticker: "CAT",   name: "Caterpillar",       sector: "Industrial" },
  // ETFs
  { ticker: "SPY",   name: "S&P 500 ETF",       sector: "ETF" },
  { ticker: "QQQ",   name: "Nasdaq ETF",        sector: "ETF" },
];
