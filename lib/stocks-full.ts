export interface StockEntry {
  ticker: string;
  name: string;
  sector: string;
}

export const ALL_SECTORS = [
  "Technology",
  "Communication Services",
  "Financials",
  "Healthcare",
  "Consumer Discretionary",
  "Consumer Staples",
  "Energy",
  "Industrials",
  "Materials",
  "Real Estate",
  "Utilities",
];

export const SP500: StockEntry[] = [
  // Technology
  { ticker: "AAPL",  name: "Apple",                  sector: "Technology" },
  { ticker: "MSFT",  name: "Microsoft",               sector: "Technology" },
  { ticker: "NVDA",  name: "NVIDIA",                  sector: "Technology" },
  { ticker: "AVGO",  name: "Broadcom",                sector: "Technology" },
  { ticker: "AMD",   name: "AMD",                     sector: "Technology" },
  { ticker: "INTC",  name: "Intel",                   sector: "Technology" },
  { ticker: "ORCL",  name: "Oracle",                  sector: "Technology" },
  { ticker: "CRM",   name: "Salesforce",              sector: "Technology" },
  { ticker: "ADBE",  name: "Adobe",                   sector: "Technology" },
  { ticker: "QCOM",  name: "Qualcomm",                sector: "Technology" },
  { ticker: "TXN",   name: "Texas Instruments",       sector: "Technology" },
  { ticker: "NOW",   name: "ServiceNow",              sector: "Technology" },
  { ticker: "INTU",  name: "Intuit",                  sector: "Technology" },
  { ticker: "AMAT",  name: "Applied Materials",       sector: "Technology" },
  { ticker: "MU",    name: "Micron Technology",       sector: "Technology" },
  { ticker: "LRCX",  name: "Lam Research",            sector: "Technology" },
  { ticker: "KLAC",  name: "KLA Corp",                sector: "Technology" },
  { ticker: "SNPS",  name: "Synopsys",                sector: "Technology" },
  { ticker: "CDNS",  name: "Cadence Design",          sector: "Technology" },
  { ticker: "MRVL",  name: "Marvell Technology",      sector: "Technology" },
  { ticker: "ANET",  name: "Arista Networks",         sector: "Technology" },
  { ticker: "PANW",  name: "Palo Alto Networks",      sector: "Technology" },
  { ticker: "CRWD",  name: "CrowdStrike",             sector: "Technology" },
  { ticker: "FTNT",  name: "Fortinet",                sector: "Technology" },
  { ticker: "DDOG",  name: "Datadog",                 sector: "Technology" },
  { ticker: "ZS",    name: "Zscaler",                 sector: "Technology" },
  { ticker: "WDAY",  name: "Workday",                 sector: "Technology" },
  { ticker: "SNOW",  name: "Snowflake",               sector: "Technology" },
  { ticker: "PLTR",  name: "Palantir",                sector: "Technology" },
  { ticker: "DELL",  name: "Dell Technologies",       sector: "Technology" },
  { ticker: "HPQ",   name: "HP Inc",                  sector: "Technology" },
  { ticker: "HPE",   name: "Hewlett Packard Enterprise", sector: "Technology" },
  { ticker: "STX",   name: "Seagate Technology",      sector: "Technology" },
  { ticker: "WDC",   name: "Western Digital",         sector: "Technology" },
  { ticker: "KEYS",  name: "Keysight Technologies",   sector: "Technology" },
  { ticker: "GDDY",  name: "GoDaddy",                 sector: "Technology" },
  { ticker: "AKAM",  name: "Akamai Technologies",     sector: "Technology" },
  { ticker: "CTSH",  name: "Cognizant Technology",    sector: "Technology" },
  { ticker: "ACN",   name: "Accenture",               sector: "Technology" },
  { ticker: "IBM",   name: "IBM",                     sector: "Technology" },

  // Communication Services
  { ticker: "META",  name: "Meta Platforms",          sector: "Communication Services" },
  { ticker: "GOOGL", name: "Alphabet",                sector: "Communication Services" },
  { ticker: "NFLX",  name: "Netflix",                 sector: "Communication Services" },
  { ticker: "DIS",   name: "Walt Disney",             sector: "Communication Services" },
  { ticker: "CMCSA", name: "Comcast",                 sector: "Communication Services" },
  { ticker: "T",     name: "AT&T",                    sector: "Communication Services" },
  { ticker: "VZ",    name: "Verizon",                 sector: "Communication Services" },
  { ticker: "TMUS",  name: "T-Mobile",                sector: "Communication Services" },
  { ticker: "CHTR",  name: "Charter Communications",  sector: "Communication Services" },
  { ticker: "EA",    name: "Electronic Arts",         sector: "Communication Services" },
  { ticker: "TTWO",  name: "Take-Two Interactive",    sector: "Communication Services" },
  { ticker: "SNAP",  name: "Snap",                    sector: "Communication Services" },
  { ticker: "PINS",  name: "Pinterest",               sector: "Communication Services" },
  { ticker: "RBLX",  name: "Roblox",                  sector: "Communication Services" },
  { ticker: "LYV",   name: "Live Nation",             sector: "Communication Services" },
  { ticker: "WBD",   name: "Warner Bros Discovery",   sector: "Communication Services" },
  { ticker: "PARA",  name: "Paramount Global",        sector: "Communication Services" },
  { ticker: "OMC",   name: "Omnicom Group",           sector: "Communication Services" },
  { ticker: "IPG",   name: "Interpublic Group",       sector: "Communication Services" },

  // Financials
  { ticker: "JPM",   name: "JPMorgan Chase",          sector: "Financials" },
  { ticker: "BAC",   name: "Bank of America",         sector: "Financials" },
  { ticker: "WFC",   name: "Wells Fargo",             sector: "Financials" },
  { ticker: "GS",    name: "Goldman Sachs",           sector: "Financials" },
  { ticker: "MS",    name: "Morgan Stanley",          sector: "Financials" },
  { ticker: "C",     name: "Citigroup",               sector: "Financials" },
  { ticker: "BLK",   name: "BlackRock",               sector: "Financials" },
  { ticker: "SCHW",  name: "Charles Schwab",          sector: "Financials" },
  { ticker: "AXP",   name: "American Express",        sector: "Financials" },
  { ticker: "V",     name: "Visa",                    sector: "Financials" },
  { ticker: "MA",    name: "Mastercard",              sector: "Financials" },
  { ticker: "COF",   name: "Capital One",             sector: "Financials" },
  { ticker: "USB",   name: "US Bancorp",              sector: "Financials" },
  { ticker: "PNC",   name: "PNC Financial",           sector: "Financials" },
  { ticker: "TFC",   name: "Truist Financial",        sector: "Financials" },
  { ticker: "CB",    name: "Chubb",                   sector: "Financials" },
  { ticker: "MMC",   name: "Marsh McLennan",          sector: "Financials" },
  { ticker: "AON",   name: "Aon",                     sector: "Financials" },
  { ticker: "PGR",   name: "Progressive",             sector: "Financials" },
  { ticker: "SPGI",  name: "S&P Global",              sector: "Financials" },
  { ticker: "MCO",   name: "Moody's",                 sector: "Financials" },
  { ticker: "ICE",   name: "Intercontinental Exchange", sector: "Financials" },
  { ticker: "CME",   name: "CME Group",               sector: "Financials" },
  { ticker: "NDAQ",  name: "Nasdaq",                  sector: "Financials" },
  { ticker: "FIS",   name: "Fidelity National Info",  sector: "Financials" },
  { ticker: "PYPL",  name: "PayPal",                  sector: "Financials" },
  { ticker: "SQ",    name: "Block",                   sector: "Financials" },
  { ticker: "COIN",  name: "Coinbase",                sector: "Financials" },
  { ticker: "MSTR",  name: "MicroStrategy",           sector: "Financials" },

  // Healthcare
  { ticker: "UNH",   name: "UnitedHealth",            sector: "Healthcare" },
  { ticker: "JNJ",   name: "Johnson & Johnson",       sector: "Healthcare" },
  { ticker: "LLY",   name: "Eli Lilly",               sector: "Healthcare" },
  { ticker: "ABBV",  name: "AbbVie",                  sector: "Healthcare" },
  { ticker: "MRK",   name: "Merck",                   sector: "Healthcare" },
  { ticker: "TMO",   name: "Thermo Fisher",           sector: "Healthcare" },
  { ticker: "ABT",   name: "Abbott Laboratories",     sector: "Healthcare" },
  { ticker: "DHR",   name: "Danaher",                 sector: "Healthcare" },
  { ticker: "BMY",   name: "Bristol-Myers Squibb",    sector: "Healthcare" },
  { ticker: "AMGN",  name: "Amgen",                   sector: "Healthcare" },
  { ticker: "GILD",  name: "Gilead Sciences",         sector: "Healthcare" },
  { ticker: "VRTX",  name: "Vertex Pharmaceuticals",  sector: "Healthcare" },
  { ticker: "REGN",  name: "Regeneron",               sector: "Healthcare" },
  { ticker: "SYK",   name: "Stryker",                 sector: "Healthcare" },
  { ticker: "BSX",   name: "Boston Scientific",       sector: "Healthcare" },
  { ticker: "MDT",   name: "Medtronic",               sector: "Healthcare" },
  { ticker: "EW",    name: "Edwards Lifesciences",    sector: "Healthcare" },
  { ticker: "BDX",   name: "Becton Dickinson",        sector: "Healthcare" },
  { ticker: "CI",    name: "Cigna",                   sector: "Healthcare" },
  { ticker: "CVS",   name: "CVS Health",              sector: "Healthcare" },
  { ticker: "HUM",   name: "Humana",                  sector: "Healthcare" },
  { ticker: "HCA",   name: "HCA Healthcare",          sector: "Healthcare" },
  { ticker: "ISRG",  name: "Intuitive Surgical",      sector: "Healthcare" },
  { ticker: "BIIB",  name: "Biogen",                  sector: "Healthcare" },
  { ticker: "MRNA",  name: "Moderna",                 sector: "Healthcare" },
  { ticker: "PFE",   name: "Pfizer",                  sector: "Healthcare" },
  { ticker: "ZBH",   name: "Zimmer Biomet",           sector: "Healthcare" },
  { ticker: "BAX",   name: "Baxter International",    sector: "Healthcare" },
  { ticker: "DGX",   name: "Quest Diagnostics",       sector: "Healthcare" },
  { ticker: "IQV",   name: "IQVIA Holdings",          sector: "Healthcare" },

  // Consumer Discretionary
  { ticker: "AMZN",  name: "Amazon",                  sector: "Consumer Discretionary" },
  { ticker: "TSLA",  name: "Tesla",                   sector: "Consumer Discretionary" },
  { ticker: "HD",    name: "Home Depot",              sector: "Consumer Discretionary" },
  { ticker: "MCD",   name: "McDonald's",              sector: "Consumer Discretionary" },
  { ticker: "NKE",   name: "Nike",                    sector: "Consumer Discretionary" },
  { ticker: "SBUX",  name: "Starbucks",               sector: "Consumer Discretionary" },
  { ticker: "TJX",   name: "TJX Companies",           sector: "Consumer Discretionary" },
  { ticker: "BKNG",  name: "Booking Holdings",        sector: "Consumer Discretionary" },
  { ticker: "LOW",   name: "Lowe's",                  sector: "Consumer Discretionary" },
  { ticker: "TGT",   name: "Target",                  sector: "Consumer Discretionary" },
  { ticker: "ROST",  name: "Ross Stores",             sector: "Consumer Discretionary" },
  { ticker: "CMG",   name: "Chipotle",                sector: "Consumer Discretionary" },
  { ticker: "ORLY",  name: "O'Reilly Automotive",     sector: "Consumer Discretionary" },
  { ticker: "AZO",   name: "AutoZone",                sector: "Consumer Discretionary" },
  { ticker: "DRI",   name: "Darden Restaurants",      sector: "Consumer Discretionary" },
  { ticker: "YUM",   name: "Yum! Brands",             sector: "Consumer Discretionary" },
  { ticker: "HLT",   name: "Hilton",                  sector: "Consumer Discretionary" },
  { ticker: "MAR",   name: "Marriott",                sector: "Consumer Discretionary" },
  { ticker: "F",     name: "Ford Motor",              sector: "Consumer Discretionary" },
  { ticker: "GM",    name: "General Motors",          sector: "Consumer Discretionary" },
  { ticker: "RIVN",  name: "Rivian",                  sector: "Consumer Discretionary" },
  { ticker: "LCID",  name: "Lucid Group",             sector: "Consumer Discretionary" },
  { ticker: "DHI",   name: "D.R. Horton",             sector: "Consumer Discretionary" },
  { ticker: "LEN",   name: "Lennar",                  sector: "Consumer Discretionary" },
  { ticker: "EBAY",  name: "eBay",                    sector: "Consumer Discretionary" },
  { ticker: "ETSY",  name: "Etsy",                    sector: "Consumer Discretionary" },
  { ticker: "W",     name: "Wayfair",                 sector: "Consumer Discretionary" },

  // Consumer Staples
  { ticker: "WMT",   name: "Walmart",                 sector: "Consumer Staples" },
  { ticker: "PG",    name: "Procter & Gamble",        sector: "Consumer Staples" },
  { ticker: "COST",  name: "Costco",                  sector: "Consumer Staples" },
  { ticker: "KO",    name: "Coca-Cola",               sector: "Consumer Staples" },
  { ticker: "PEP",   name: "PepsiCo",                 sector: "Consumer Staples" },
  { ticker: "PM",    name: "Philip Morris",           sector: "Consumer Staples" },
  { ticker: "MO",    name: "Altria Group",            sector: "Consumer Staples" },
  { ticker: "MDLZ",  name: "Mondelez",                sector: "Consumer Staples" },
  { ticker: "CL",    name: "Colgate-Palmolive",       sector: "Consumer Staples" },
  { ticker: "GIS",   name: "General Mills",           sector: "Consumer Staples" },
  { ticker: "K",     name: "Kellanova",               sector: "Consumer Staples" },
  { ticker: "HSY",   name: "Hershey",                 sector: "Consumer Staples" },
  { ticker: "CAG",   name: "Conagra Brands",          sector: "Consumer Staples" },
  { ticker: "CPB",   name: "Campbell Soup",           sector: "Consumer Staples" },
  { ticker: "MKC",   name: "McCormick",               sector: "Consumer Staples" },
  { ticker: "CLX",   name: "Clorox",                  sector: "Consumer Staples" },
  { ticker: "KMB",   name: "Kimberly-Clark",          sector: "Consumer Staples" },
  { ticker: "SYY",   name: "Sysco",                   sector: "Consumer Staples" },
  { ticker: "KR",    name: "Kroger",                  sector: "Consumer Staples" },
  { ticker: "DLTR",  name: "Dollar Tree",             sector: "Consumer Staples" },
  { ticker: "DG",    name: "Dollar General",          sector: "Consumer Staples" },

  // Energy
  { ticker: "XOM",   name: "ExxonMobil",              sector: "Energy" },
  { ticker: "CVX",   name: "Chevron",                 sector: "Energy" },
  { ticker: "COP",   name: "ConocoPhillips",          sector: "Energy" },
  { ticker: "EOG",   name: "EOG Resources",           sector: "Energy" },
  { ticker: "SLB",   name: "Schlumberger",            sector: "Energy" },
  { ticker: "MPC",   name: "Marathon Petroleum",      sector: "Energy" },
  { ticker: "VLO",   name: "Valero Energy",           sector: "Energy" },
  { ticker: "PSX",   name: "Phillips 66",             sector: "Energy" },
  { ticker: "OXY",   name: "Occidental Petroleum",    sector: "Energy" },
  { ticker: "HAL",   name: "Halliburton",             sector: "Energy" },
  { ticker: "BKR",   name: "Baker Hughes",            sector: "Energy" },
  { ticker: "DVN",   name: "Devon Energy",            sector: "Energy" },
  { ticker: "HES",   name: "Hess",                    sector: "Energy" },
  { ticker: "APA",   name: "APA Corp",                sector: "Energy" },
  { ticker: "MRO",   name: "Marathon Oil",            sector: "Energy" },
  { ticker: "CTRA",  name: "Coterra Energy",          sector: "Energy" },
  { ticker: "FANG",  name: "Diamondback Energy",      sector: "Energy" },
  { ticker: "KMI",   name: "Kinder Morgan",           sector: "Energy" },
  { ticker: "WMB",   name: "Williams Companies",      sector: "Energy" },
  { ticker: "OKE",   name: "ONEOK",                   sector: "Energy" },

  // Industrials
  { ticker: "CAT",   name: "Caterpillar",             sector: "Industrials" },
  { ticker: "GE",    name: "GE Aerospace",            sector: "Industrials" },
  { ticker: "HON",   name: "Honeywell",               sector: "Industrials" },
  { ticker: "UPS",   name: "United Parcel Service",   sector: "Industrials" },
  { ticker: "RTX",   name: "RTX Corp",                sector: "Industrials" },
  { ticker: "LMT",   name: "Lockheed Martin",         sector: "Industrials" },
  { ticker: "BA",    name: "Boeing",                  sector: "Industrials" },
  { ticker: "DE",    name: "Deere & Company",         sector: "Industrials" },
  { ticker: "MMM",   name: "3M",                      sector: "Industrials" },
  { ticker: "GD",    name: "General Dynamics",        sector: "Industrials" },
  { ticker: "NOC",   name: "Northrop Grumman",        sector: "Industrials" },
  { ticker: "LHX",   name: "L3Harris Technologies",   sector: "Industrials" },
  { ticker: "TDG",   name: "TransDigm Group",         sector: "Industrials" },
  { ticker: "EMR",   name: "Emerson Electric",        sector: "Industrials" },
  { ticker: "ETN",   name: "Eaton",                   sector: "Industrials" },
  { ticker: "ROK",   name: "Rockwell Automation",     sector: "Industrials" },
  { ticker: "ITW",   name: "Illinois Tool Works",     sector: "Industrials" },
  { ticker: "PH",    name: "Parker Hannifin",         sector: "Industrials" },
  { ticker: "WM",    name: "Waste Management",        sector: "Industrials" },
  { ticker: "RSG",   name: "Republic Services",       sector: "Industrials" },
  { ticker: "PCAR",  name: "PACCAR",                  sector: "Industrials" },
  { ticker: "FDX",   name: "FedEx",                   sector: "Industrials" },
  { ticker: "UBER",  name: "Uber",                    sector: "Industrials" },
  { ticker: "LYFT",  name: "Lyft",                    sector: "Industrials" },
  { ticker: "DAL",   name: "Delta Air Lines",         sector: "Industrials" },
  { ticker: "UAL",   name: "United Airlines",         sector: "Industrials" },
  { ticker: "AAL",   name: "American Airlines",       sector: "Industrials" },
  { ticker: "SW",    name: "Southwest Airlines",      sector: "Industrials" },
  { ticker: "CSX",   name: "CSX Corp",                sector: "Industrials" },
  { ticker: "UNP",   name: "Union Pacific",           sector: "Industrials" },

  // Materials
  { ticker: "LIN",   name: "Linde",                   sector: "Materials" },
  { ticker: "APD",   name: "Air Products",            sector: "Materials" },
  { ticker: "ECL",   name: "Ecolab",                  sector: "Materials" },
  { ticker: "SHW",   name: "Sherwin-Williams",        sector: "Materials" },
  { ticker: "FCX",   name: "Freeport-McMoRan",        sector: "Materials" },
  { ticker: "NEM",   name: "Newmont",                 sector: "Materials" },
  { ticker: "NUE",   name: "Nucor",                   sector: "Materials" },
  { ticker: "VMC",   name: "Vulcan Materials",        sector: "Materials" },
  { ticker: "MLM",   name: "Martin Marietta",         sector: "Materials" },
  { ticker: "CF",    name: "CF Industries",           sector: "Materials" },
  { ticker: "MOS",   name: "Mosaic",                  sector: "Materials" },
  { ticker: "ALB",   name: "Albemarle",               sector: "Materials" },
  { ticker: "PPG",   name: "PPG Industries",          sector: "Materials" },
  { ticker: "IP",    name: "International Paper",     sector: "Materials" },
  { ticker: "PKG",   name: "Packaging Corp",          sector: "Materials" },

  // Real Estate
  { ticker: "AMT",   name: "American Tower",          sector: "Real Estate" },
  { ticker: "PLD",   name: "Prologis",                sector: "Real Estate" },
  { ticker: "EQIX",  name: "Equinix",                 sector: "Real Estate" },
  { ticker: "CCI",   name: "Crown Castle",            sector: "Real Estate" },
  { ticker: "SPG",   name: "Simon Property Group",    sector: "Real Estate" },
  { ticker: "O",     name: "Realty Income",           sector: "Real Estate" },
  { ticker: "VICI",  name: "VICI Properties",         sector: "Real Estate" },
  { ticker: "EQR",   name: "Equity Residential",      sector: "Real Estate" },
  { ticker: "AVB",   name: "AvalonBay Communities",   sector: "Real Estate" },
  { ticker: "DLR",   name: "Digital Realty",          sector: "Real Estate" },
  { ticker: "PSA",   name: "Public Storage",          sector: "Real Estate" },
  { ticker: "WELL",  name: "Welltower",               sector: "Real Estate" },
  { ticker: "VTR",   name: "Ventas",                  sector: "Real Estate" },
  { ticker: "NNN",   name: "NNN REIT",                sector: "Real Estate" },
  { ticker: "WY",    name: "Weyerhaeuser",            sector: "Real Estate" },

  // Utilities
  { ticker: "NEE",   name: "NextEra Energy",          sector: "Utilities" },
  { ticker: "DUK",   name: "Duke Energy",             sector: "Utilities" },
  { ticker: "SO",    name: "Southern Company",        sector: "Utilities" },
  { ticker: "D",     name: "Dominion Energy",         sector: "Utilities" },
  { ticker: "AEP",   name: "American Electric Power", sector: "Utilities" },
  { ticker: "EXC",   name: "Exelon",                  sector: "Utilities" },
  { ticker: "XEL",   name: "Xcel Energy",             sector: "Utilities" },
  { ticker: "SRE",   name: "Sempra",                  sector: "Utilities" },
  { ticker: "ED",    name: "Consolidated Edison",     sector: "Utilities" },
  { ticker: "WEC",   name: "WEC Energy",              sector: "Utilities" },
  { ticker: "ES",    name: "Eversource Energy",       sector: "Utilities" },
  { ticker: "ETR",   name: "Entergy",                 sector: "Utilities" },
  { ticker: "PPL",   name: "PPL Corp",                sector: "Utilities" },
  { ticker: "FE",    name: "FirstEnergy",             sector: "Utilities" },
  { ticker: "AES",   name: "AES Corp",                sector: "Utilities" },
  { ticker: "PCG",   name: "PG&E",                    sector: "Utilities" },
  { ticker: "EIX",   name: "Edison International",    sector: "Utilities" },
  { ticker: "CEG",   name: "Constellation Energy",    sector: "Utilities" },
  { ticker: "VST",   name: "Vistra",                  sector: "Utilities" },
];

export type WatchlistMode = "custom" | "top50" | "top100" | "sp500";

export interface WatchlistConfig {
  mode: WatchlistMode;
  enabledSectors: string[];
  maxPerSector: number;       // 0 = all
  batchSize: number;          // stocks per cron run
  currentBatchIndex: number;  // for rotation
}

export const DEFAULT_CONFIG: WatchlistConfig = {
  mode: "custom",
  enabledSectors: ["Technology", "Financials", "Healthcare", "Consumer Discretionary", "Energy", "Industrials"],
  maxPerSector: 5,
  batchSize: 50,
  currentBatchIndex: 0,
};

export function buildWatchlist(config: WatchlistConfig): StockEntry[] {
  if (config.mode === "top50") {
    return SP500.slice(0, 50);
  }
  if (config.mode === "top100") {
    return SP500.slice(0, 100);
  }
  if (config.mode === "sp500") {
    return SP500;
  }
  // custom mode
  return config.enabledSectors.flatMap((sector) => {
    const stocks = SP500.filter((s) => s.sector === sector);
    return config.maxPerSector > 0 ? stocks.slice(0, config.maxPerSector) : stocks;
  });
}

export function getBatch(watchlist: StockEntry[], batchSize: number, index: number): StockEntry[] {
  if (watchlist.length <= batchSize) return watchlist;
  const start = (index * batchSize) % watchlist.length;
  const end = start + batchSize;
  if (end <= watchlist.length) return watchlist.slice(start, end);
  // wrap around
  return [...watchlist.slice(start), ...watchlist.slice(0, end - watchlist.length)];
}
