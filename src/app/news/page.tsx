"use client";

import { useEffect, useState } from "react";
import type { NewsItem } from "@/lib/types";

function formatRelativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return "방금 전";
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [filter, setFilter] = useState<"전체" | "뉴스" | "공시">("전체");

  useEffect(() => {
    fetch("/api/news")
      .then((res) => res.json())
      .then((data) => setNews(data.news));
  }, []);

  const filtered = news.filter((n) => filter === "전체" || n.category === filter);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">뉴스·공시 요약</h1>
        <p className="mt-2 text-black/60 dark:text-white/60">
          종목 관련 최신 뉴스와 공시를 모아서 보여줍니다.
        </p>
      </div>

      <div className="flex gap-2">
        {(["전체", "뉴스", "공시"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              filter === c
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "border border-black/15 dark:border-white/15 text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <ul className="flex flex-col gap-3">
        {filtered.map((item) => (
          <li
            key={item.id}
            className="rounded-lg border border-black/10 dark:border-white/10 p-4 bg-white dark:bg-white/[.03]"
          >
            <div className="flex items-center gap-2 text-xs text-black/50 dark:text-white/50">
              <span
                className={`rounded px-1.5 py-0.5 font-medium ${
                  item.category === "공시"
                    ? "bg-violet-500/10 text-violet-700 dark:text-violet-300"
                    : "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                }`}
              >
                {item.category}
              </span>
              <span>{item.source}</span>
              <span>·</span>
              <span>{formatRelativeTime(item.publishedAt)}</span>
            </div>
            <h2 className="mt-2 font-medium">{item.title}</h2>
            <p className="mt-1 text-sm text-black/60 dark:text-white/60">{item.summary}</p>
          </li>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-black/50 dark:text-white/50 py-6">해당 항목이 없습니다.</p>
        )}
      </ul>
    </div>
  );
}
