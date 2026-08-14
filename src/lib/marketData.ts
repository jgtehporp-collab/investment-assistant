import type { FinancialIndicators, Market, NewsItem, Quote } from "./types";

interface StockSeed {
  symbol: string;
  name: string;
  market: Market;
  basePrice: number;
  baseVolume: number;
  marketCap: number;
  eps: number;
  bps: number;
  dividendYield: number;
  debtRatio: number;
}

/**
 * This module is the app's only data source and is intentionally mocked —
 * there is no free, key-less, ToS-safe live feed for KRX prices/DART filings.
 * Swap `STOCKS`/`NEWS_SEED` below for calls to a real provider (e.g. 한국투자증권
 * Open API, DART OpenAPI, 공공데이터포털) once API keys are available; every
 * page reads through the functions in this file, so that's the only place
 * that needs to change.
 */
const STOCKS: StockSeed[] = [
  { symbol: "005930", name: "삼성전자", market: "KOSPI", basePrice: 71500, baseVolume: 13_500_000, marketCap: 426_800_000_000_000, eps: 4200, bps: 58000, dividendYield: 2.1, debtRatio: 27.4 },
  { symbol: "000660", name: "SK하이닉스", market: "KOSPI", basePrice: 189200, baseVolume: 4_200_000, marketCap: 137_700_000_000_000, eps: 12800, bps: 98500, dividendYield: 0.6, debtRatio: 41.2 },
  { symbol: "035420", name: "NAVER", market: "KOSPI", basePrice: 198500, baseVolume: 780_000, marketCap: 32_600_000_000_000, eps: 6100, bps: 89200, dividendYield: 0.5, debtRatio: 33.8 },
  { symbol: "035720", name: "카카오", market: "KOSPI", basePrice: 41200, baseVolume: 2_100_000, marketCap: 18_300_000_000_000, eps: 820, bps: 24500, dividendYield: 0.2, debtRatio: 45.6 },
  { symbol: "373220", name: "LG에너지솔루션", market: "KOSPI", basePrice: 372000, baseVolume: 310_000, marketCap: 87_000_000_000_000, eps: 3900, bps: 112000, dividendYield: 0.3, debtRatio: 58.9 },
  { symbol: "005380", name: "현대차", market: "KOSPI", basePrice: 245500, baseVolume: 620_000, marketCap: 51_400_000_000_000, eps: 38200, bps: 312000, dividendYield: 4.8, debtRatio: 178.2 },
  { symbol: "005490", name: "POSCO홀딩스", market: "KOSPI", basePrice: 389000, baseVolume: 280_000, marketCap: 32_900_000_000_000, eps: 21500, bps: 452000, dividendYield: 2.6, debtRatio: 62.1 },
  { symbol: "207940", name: "삼성바이오로직스", market: "KOSPI", basePrice: 812000, baseVolume: 95_000, marketCap: 57_800_000_000_000, eps: 8900, bps: 71000, dividendYield: 0.0, debtRatio: 22.5 },
  { symbol: "247540", name: "에코프로비엠", market: "KOSDAQ", basePrice: 156300, baseVolume: 450_000, marketCap: 15_100_000_000_000, eps: -1200, bps: 28900, dividendYield: 0.0, debtRatio: 89.4 },
  { symbol: "091990", name: "셀트리온헬스케어", market: "KOSDAQ", basePrice: 68200, baseVolume: 890_000, marketCap: 8_900_000_000_000, eps: 1450, bps: 21300, dividendYield: 0.0, debtRatio: 31.7 },
];

const NEWS_SEED: Omit<NewsItem, "id" | "publishedAt">[] = [
  { symbol: "005930", category: "공시", title: "삼성전자, 자기주식 소각 결정 공시", source: "전자공시시스템", summary: "이사회 결의를 통해 보통주 자기주식 일부를 소각하기로 결정했다고 공시했습니다. 주주환원 정책의 일환으로 해석됩니다.", url: "#" },
  { symbol: "005930", category: "뉴스", title: "삼성전자, 차세대 파운드리 공정 양산 돌입", source: "경제신문", summary: "2나노 공정 기반 신규 라인 가동을 시작하며 파운드리 경쟁력 강화에 나섰습니다.", url: "#" },
  { symbol: "000660", category: "뉴스", title: "SK하이닉스, HBM 공급 계약 확대", source: "IT데일리", summary: "주요 AI 반도체 고객사와의 HBM 공급 물량 확대 계약을 체결했다고 밝혔습니다.", url: "#" },
  { symbol: "035420", category: "공시", title: "NAVER, 분기 배당 결정", source: "전자공시시스템", summary: "이사회에서 분기 배당금 지급을 결의했다고 공시했습니다.", url: "#" },
  { symbol: "035720", category: "뉴스", title: "카카오, 신규 AI 서비스 출시 예고", source: "IT데일리", summary: "자체 개발 생성형 AI 모델을 활용한 신규 서비스를 하반기 출시할 예정이라고 밝혔습니다.", url: "#" },
  { symbol: "373220", category: "뉴스", title: "LG에너지솔루션, 북미 배터리 공장 증설", source: "경제신문", summary: "북미 합작 공장의 생산 능력을 추가로 확충하기로 했다고 발표했습니다.", url: "#" },
  { symbol: "005380", category: "공시", title: "현대차, 대규모 자사주 매입 공시", source: "전자공시시스템", summary: "주주가치 제고를 위해 대규모 자사주 매입 계획을 공시했습니다.", url: "#" },
  { symbol: null, category: "뉴스", title: "코스피, 외국인 순매수에 강세 마감", source: "증권신문", summary: "외국인 투자자의 순매수세가 이어지며 코스피 지수가 상승 마감했습니다.", url: "#" },
  { symbol: null, category: "뉴스", title: "한국은행, 기준금리 동결 결정", source: "경제신문", summary: "한국은행 금융통화위원회가 기준금리를 현 수준에서 동결하기로 결정했습니다.", url: "#" },
  { symbol: "247540", category: "뉴스", title: "에코프로비엠, 양극재 수주 물량 감소 우려", source: "증권신문", summary: "전방 산업 수요 둔화로 일부 고객사의 수주 물량이 조정될 수 있다는 전망이 나왔습니다.", url: "#" },
];

function seededRandom(seed: string, salt: number): number {
  let hash = 0;
  const input = `${seed}-${salt}`;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return (Math.abs(hash) % 10000) / 10000;
}

/** Deterministic-ish jitter keyed off the current minute, so a quote looks "live" without external calls. */
function jitterFactor(symbol: string): number {
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const r = seededRandom(symbol, minuteBucket);
  return 1 + (r - 0.5) * 0.02;
}

export function listQuotes(query?: string): Quote[] {
  const filtered = query
    ? STOCKS.filter(
        (s) => s.name.includes(query) || s.symbol.includes(query)
      )
    : STOCKS;
  return filtered.map(toQuote);
}

export function getQuote(symbol: string): Quote | null {
  const stock = STOCKS.find((s) => s.symbol === symbol);
  return stock ? toQuote(stock) : null;
}

function toQuote(stock: StockSeed): Quote {
  const price = Math.round(stock.basePrice * jitterFactor(stock.symbol));
  const changeAmount = price - stock.basePrice;
  const changeRate = (changeAmount / stock.basePrice) * 100;
  const volumeFactor = 0.85 + seededRandom(stock.symbol, Math.floor(Date.now() / 60_000) + 1) * 0.3;
  return {
    symbol: stock.symbol,
    name: stock.name,
    market: stock.market,
    price,
    changeAmount,
    changeRate,
    volume: Math.round(stock.baseVolume * volumeFactor),
    marketCap: stock.marketCap,
    updatedAt: new Date().toISOString(),
  };
}

export function getFinancialIndicators(symbol: string): FinancialIndicators | null {
  const stock = STOCKS.find((s) => s.symbol === symbol);
  if (!stock) return null;
  const quote = toQuote(stock);
  return {
    symbol: stock.symbol,
    per: stock.eps > 0 ? Number((quote.price / stock.eps).toFixed(2)) : null,
    pbr: Number((quote.price / stock.bps).toFixed(2)),
    roe: Number(((stock.eps / stock.bps) * 100).toFixed(2)),
    eps: stock.eps,
    bps: stock.bps,
    dividendYield: stock.dividendYield,
    debtRatio: stock.debtRatio,
    fiscalYear: "2025 (추정)",
  };
}

export function listNews(symbol?: string): NewsItem[] {
  const now = Date.now();
  const items = NEWS_SEED.map((n, i) => ({
    ...n,
    id: `news-${i}`,
    publishedAt: new Date(now - i * 3 * 60 * 60 * 1000).toISOString(),
  }));
  return symbol ? items.filter((n) => n.symbol === symbol) : items;
}

export function listAllSymbols(): { symbol: string; name: string }[] {
  return STOCKS.map((s) => ({ symbol: s.symbol, name: s.name }));
}
