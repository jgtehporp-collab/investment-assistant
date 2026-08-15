#!/usr/bin/env node
// 증시 일정 F/up 대상 조회 도구.
// - "이번 주 첫 영업일"이면: 지난 7일과 날짜범위가 겹치는 pending 항목을 weekly로 출력
// - "이번 달 마지막 영업일"이면: 이번 달과 날짜범위가 겹치는 pending 항목을 monthly로 출력
// 실제 뉴스 검색/요약/카톡전송/상태갱신은 이 스크립트를 호출하는 에이전트가 수행함.
// 필요 환경변수: DATA_GO_KR_KEY (URL-encoded)
// 사용법: node scripts/schedule-followup.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  nowKst,
  toIsoDate,
  fromIsoDate,
  isFirstBusinessDayOfWeek,
  isLastBusinessDayOfMonth,
} from "./lib/dateKst.mjs";

const DATA_GO_KR_KEY = process.env.DATA_GO_KR_KEY;
if (!DATA_GO_KR_KEY) {
  console.error("DATA_GO_KR_KEY 환경변수가 필요합니다.");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEDULE_PATH = join(__dirname, "..", "data", "market-schedule.json");

function rangesOverlap(aFrom, aTo, bFrom, bTo) {
  return aFrom <= bTo && bFrom <= aTo;
}

function addDaysIso(iso, delta) {
  return toIsoDate(new Date(fromIsoDate(iso).getTime() + delta * 86400000));
}

async function main() {
  const today = nowKst();
  const todayIso = toIsoDate(today);

  const raw = readFileSync(SCHEDULE_PATH, "utf-8");
  const schedule = JSON.parse(raw);
  const pending = schedule.items.filter((it) => it.status === "pending" && it.date_from && it.date_to);

  const weekly = (await isFirstBusinessDayOfWeek(DATA_GO_KR_KEY, today))
    ? pending.filter((it) => rangesOverlap(it.date_from, it.date_to, addDaysIso(todayIso, -7), todayIso))
    : [];

  const monthStart = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const monthly = (await isLastBusinessDayOfMonth(DATA_GO_KR_KEY, today))
    ? pending.filter((it) => rangesOverlap(it.date_from, it.date_to, monthStart, todayIso))
    : [];

  if (weekly.length === 0 && monthly.length === 0) {
    console.log("SKIP: no target items today");
    return;
  }

  console.log(
    JSON.stringify(
      {
        today: todayIso,
        weekly_followup_items: weekly,
        monthly_no_result_items: monthly,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
