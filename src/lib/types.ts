export type Market = "KOSPI" | "KOSDAQ";

export interface Quote {
  symbol: string;
  name: string;
  market: Market;
  price: number;
  changeAmount: number;
  changeRate: number;
  volume: number;
  marketCap: number;
  updatedAt: string;
}

export interface FinancialIndicators {
  symbol: string;
  per: number | null;
  pbr: number | null;
  roe: number | null;
  eps: number;
  bps: number;
  dividendYield: number;
  debtRatio: number;
  fiscalYear: string;
}

export interface NewsItem {
  id: string;
  symbol: string | null;
  category: "뉴스" | "공시";
  title: string;
  source: string;
  publishedAt: string;
  summary: string;
  url: string;
}

export interface PortfolioHolding {
  id: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
}
