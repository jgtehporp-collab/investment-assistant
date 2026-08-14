"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Quote } from "@/lib/types";

function formatNumber(n: number) {
  return n.toLocaleString("ko-KR");
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const params = query ? `?q=${encodeURIComponent(query)}` : "";
    fetch(`/api/quotes${params}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => setQuotes(data.quotes))
      .catch((e) => {
        if (e.name !== "AbortError") throw e;
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">주가 조회</h1>
        <p className="mt-2 text-black/60 dark:text-white/60">
          종목명 또는 종목코드로 검색하세요. (1분마다 시세가 갱신되는 샘플 데이터입니다)
        </p>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="예: 삼성전자, 005930"
        className="w-full max-w-sm rounded-md border border-black/15 dark:border-white/15 bg-white dark:bg-white/5 px-3 py-2 text-sm outline-none focus:border-black/40 dark:focus:border-white/40"
      />

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/[.03] dark:bg-white/[.05] text-left">
            <tr>
              <th className="px-4 py-3 font-medium">종목</th>
              <th className="px-4 py-3 font-medium text-right">현재가</th>
              <th className="px-4 py-3 font-medium text-right">등락</th>
              <th className="px-4 py-3 font-medium text-right">거래량</th>
              <th className="px-4 py-3 font-medium text-right">시가총액</th>
            </tr>
          </thead>
          <tbody>
            {!loading && quotes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-black/50 dark:text-white/50">
                  검색 결과가 없습니다.
                </td>
              </tr>
            )}
            {quotes.map((q) => {
              const positive = q.changeAmount >= 0;
              return (
                <tr key={q.symbol} className="border-t border-black/5 dark:border-white/5">
                  <td className="px-4 py-3">
                    <Link href={`/financials?symbol=${q.symbol}`} className="hover:underline">
                      <span className="font-medium">{q.name}</span>{" "}
                      <span className="text-black/40 dark:text-white/40">{q.symbol}</span>
                      <span className="ml-2 rounded bg-black/5 dark:bg-white/10 px-1.5 py-0.5 text-xs">
                        {q.market}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(q.price)}원</td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${
                      positive ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"
                    }`}
                  >
                    {positive ? "+" : ""}
                    {formatNumber(q.changeAmount)} ({positive ? "+" : ""}
                    {q.changeRate.toFixed(2)}%)
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(q.volume)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNumber(Math.round(q.marketCap / 100_000_000))}억원
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
