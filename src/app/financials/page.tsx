"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { FinancialIndicators, Quote } from "@/lib/types";

function formatNumber(n: number) {
  return n.toLocaleString("ko-KR");
}

const INDICATOR_ROWS: {
  key: keyof FinancialIndicators;
  label: string;
  suffix?: string;
  format?: (v: number) => string;
}[] = [
  { key: "per", label: "PER (주가수익비율)", suffix: "배" },
  { key: "pbr", label: "PBR (주가순자산비율)", suffix: "배" },
  { key: "roe", label: "ROE (자기자본이익률)", suffix: "%" },
  { key: "eps", label: "EPS (주당순이익)", suffix: "원", format: formatNumber },
  { key: "bps", label: "BPS (주당순자산)", suffix: "원", format: formatNumber },
  { key: "dividendYield", label: "배당수익률", suffix: "%" },
  { key: "debtRatio", label: "부채비율", suffix: "%" },
];

function FinancialsContent() {
  const searchParams = useSearchParams();
  const [symbolList, setSymbolList] = useState<{ symbol: string; name: string }[]>([]);
  const [symbol, setSymbol] = useState(searchParams.get("symbol") ?? "");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [indicators, setIndicators] = useState<FinancialIndicators | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/quotes")
      .then((res) => res.json())
      .then((data) => {
        const list = data.quotes.map((q: Quote) => ({ symbol: q.symbol, name: q.name }));
        setSymbolList(list);
        if (!symbol && list.length > 0) setSymbol(list[0].symbol);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!symbol) return;
    fetch(`/api/financials/${symbol}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "조회 실패");
        return res.json();
      })
      .then((data) => {
        setQuote(data.quote);
        setIndicators(data.indicators);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [symbol]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">재무 분석</h1>
        <p className="mt-2 text-black/60 dark:text-white/60">
          종목을 선택하면 핵심 재무지표를 확인할 수 있습니다.
        </p>
      </div>

      <select
        value={symbol}
        onChange={(e) => setSymbol(e.target.value)}
        className="w-full max-w-sm rounded-md border border-black/15 dark:border-white/15 bg-white dark:bg-white/5 px-3 py-2 text-sm outline-none focus:border-black/40 dark:focus:border-white/40"
      >
        {symbolList.map((s) => (
          <option key={s.symbol} value={s.symbol}>
            {s.name} ({s.symbol})
          </option>
        ))}
      </select>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {quote && indicators && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg border border-black/10 dark:border-white/10 p-4 bg-white dark:bg-white/[.03]">
            <p className="text-sm text-black/50 dark:text-white/50">현재가</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatNumber(quote.price)}원
            </p>
            <p
              className={`mt-1 text-sm tabular-nums ${
                quote.changeAmount >= 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-blue-600 dark:text-blue-400"
              }`}
            >
              {quote.changeAmount >= 0 ? "+" : ""}
              {formatNumber(quote.changeAmount)} ({quote.changeAmount >= 0 ? "+" : ""}
              {quote.changeRate.toFixed(2)}%)
            </p>
            <p className="mt-3 text-xs text-black/40 dark:text-white/40">
              기준연도: {indicators.fiscalYear}
            </p>
          </div>

          <div className="rounded-lg border border-black/10 dark:border-white/10 divide-y divide-black/5 dark:divide-white/5 bg-white dark:bg-white/[.03]">
            {INDICATOR_ROWS.map((row) => {
              const raw = indicators[row.key];
              const value =
                raw === null
                  ? "N/A"
                  : row.format
                  ? row.format(raw as number)
                  : (raw as number).toString();
              return (
                <div key={row.key} className="flex justify-between px-4 py-2.5 text-sm">
                  <span className="text-black/60 dark:text-white/60">{row.label}</span>
                  <span className="tabular-nums font-medium">
                    {value}
                    {raw !== null ? row.suffix : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FinancialsPage() {
  return (
    <Suspense fallback={null}>
      <FinancialsContent />
    </Suspense>
  );
}
