"use client";

import { useEffect, useMemo, useState } from "react";
import type { PortfolioHolding, Quote } from "@/lib/types";
import { useLocalStorage } from "@/lib/useLocalStorage";

function formatNumber(n: number) {
  return Math.round(n).toLocaleString("ko-KR");
}

export default function PortfolioPage() {
  const [holdings, setHoldings] = useLocalStorage<PortfolioHolding[]>("portfolio-holdings", []);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [symbolList, setSymbolList] = useState<{ symbol: string; name: string }[]>([]);

  const [form, setForm] = useState({ symbol: "", quantity: "", avgPrice: "" });

  useEffect(() => {
    fetch("/api/quotes")
      .then((res) => res.json())
      .then((data) => {
        setQuotes(data.quotes);
        const list = data.quotes.map((q: Quote) => ({ symbol: q.symbol, name: q.name }));
        setSymbolList(list);
        setForm((f) => ({ ...f, symbol: f.symbol || list[0]?.symbol || "" }));
      });
  }, []);

  const quoteBySymbol = useMemo(() => {
    const map = new Map<string, Quote>();
    quotes.forEach((q) => map.set(q.symbol, q));
    return map;
  }, [quotes]);

  const rows = holdings.map((h) => {
    const quote = quoteBySymbol.get(h.symbol);
    const currentPrice = quote?.price ?? h.avgPrice;
    const investedAmount = h.quantity * h.avgPrice;
    const evalAmount = h.quantity * currentPrice;
    const profitLoss = evalAmount - investedAmount;
    const returnRate = investedAmount === 0 ? 0 : (profitLoss / investedAmount) * 100;
    return { holding: h, quote, currentPrice, investedAmount, evalAmount, profitLoss, returnRate };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      invested: acc.invested + r.investedAmount,
      eval: acc.eval + r.evalAmount,
    }),
    { invested: 0, eval: 0 }
  );
  const totalProfitLoss = totals.eval - totals.invested;
  const totalReturnRate = totals.invested === 0 ? 0 : (totalProfitLoss / totals.invested) * 100;

  function addHolding(e: React.FormEvent) {
    e.preventDefault();
    const quantity = Number(form.quantity);
    const avgPrice = Number(form.avgPrice);
    if (!form.symbol || quantity <= 0 || avgPrice <= 0) return;
    setHoldings((prev) => [
      ...prev,
      { id: crypto.randomUUID(), symbol: form.symbol, quantity, avgPrice },
    ]);
    setForm((f) => ({ ...f, quantity: "", avgPrice: "" }));
  }

  function removeHolding(id: string) {
    setHoldings((prev) => prev.filter((h) => h.id !== id));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">포트폴리오</h1>
        <p className="mt-2 text-black/60 dark:text-white/60">
          보유 종목을 입력하면 평가금액과 수익률을 계산합니다. 입력한 정보는 이 브라우저에만 저장됩니다.
        </p>
      </div>

      <form
        onSubmit={addHolding}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 dark:border-white/10 p-4 bg-white dark:bg-white/[.03]"
      >
        <label className="flex flex-col gap-1 text-sm">
          종목
          <select
            value={form.symbol}
            onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
            className="rounded-md border border-black/15 dark:border-white/15 bg-white dark:bg-white/5 px-2 py-1.5 outline-none focus:border-black/40 dark:focus:border-white/40"
          >
            {symbolList.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.name} ({s.symbol})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          수량
          <input
            type="number"
            min="1"
            value={form.quantity}
            onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
            className="w-28 rounded-md border border-black/15 dark:border-white/15 bg-white dark:bg-white/5 px-2 py-1.5 outline-none focus:border-black/40 dark:focus:border-white/40"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          매입단가 (원)
          <input
            type="number"
            min="1"
            value={form.avgPrice}
            onChange={(e) => setForm((f) => ({ ...f, avgPrice: e.target.value }))}
            className="w-32 rounded-md border border-black/15 dark:border-white/15 bg-white dark:bg-white/5 px-2 py-1.5 outline-none focus:border-black/40 dark:focus:border-white/40"
            required
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-black text-white dark:bg-white dark:text-black px-4 py-1.5 text-sm font-medium"
        >
          추가
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/[.03] dark:bg-white/[.05] text-left">
            <tr>
              <th className="px-4 py-3 font-medium">종목</th>
              <th className="px-4 py-3 font-medium text-right">수량</th>
              <th className="px-4 py-3 font-medium text-right">매입단가</th>
              <th className="px-4 py-3 font-medium text-right">현재가</th>
              <th className="px-4 py-3 font-medium text-right">평가금액</th>
              <th className="px-4 py-3 font-medium text-right">평가손익</th>
              <th className="px-4 py-3 font-medium text-right">수익률</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-black/50 dark:text-white/50">
                  보유 종목을 추가해보세요.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.holding.id} className="border-t border-black/5 dark:border-white/5">
                <td className="px-4 py-3 font-medium">
                  {r.quote?.name ?? r.holding.symbol}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(r.holding.quantity)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(r.holding.avgPrice)}원</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(r.currentPrice)}원</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(r.evalAmount)}원</td>
                <td
                  className={`px-4 py-3 text-right tabular-nums ${
                    r.profitLoss >= 0 ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"
                  }`}
                >
                  {r.profitLoss >= 0 ? "+" : ""}
                  {formatNumber(r.profitLoss)}원
                </td>
                <td
                  className={`px-4 py-3 text-right tabular-nums ${
                    r.returnRate >= 0 ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"
                  }`}
                >
                  {r.returnRate >= 0 ? "+" : ""}
                  {r.returnRate.toFixed(2)}%
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => removeHolding(r.holding.id)}
                    className="text-black/40 hover:text-red-600 dark:text-white/40 dark:hover:text-red-400"
                    aria-label="삭제"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-black/10 dark:border-white/10 font-medium bg-black/[.02] dark:bg-white/[.03]">
                <td className="px-4 py-3" colSpan={4}>
                  합계
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(totals.eval)}원</td>
                <td
                  className={`px-4 py-3 text-right tabular-nums ${
                    totalProfitLoss >= 0 ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"
                  }`}
                >
                  {totalProfitLoss >= 0 ? "+" : ""}
                  {formatNumber(totalProfitLoss)}원
                </td>
                <td
                  className={`px-4 py-3 text-right tabular-nums ${
                    totalReturnRate >= 0 ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"
                  }`}
                >
                  {totalReturnRate >= 0 ? "+" : ""}
                  {totalReturnRate.toFixed(2)}%
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
