#!/usr/bin/env node
// 매일 개장전 리포트: 예탁금/신용잔고/코스피·코스닥 거래대금/미 10년물 국채금리
// 필요 환경변수: DATA_GO_KR_KEY (URL-encoded), FRED_API_KEY

import { nowKst, toYyyymmdd, addMonths, isWeekend, isHoliday, fetchJson } from "./lib/dateKst.mjs";

const DATA_GO_KR_KEY = process.env.DATA_GO_KR_KEY;
const FRED_API_KEY = process.env.FRED_API_KEY;

if (!DATA_GO_KR_KEY || !FRED_API_KEY) {
  console.error("DATA_GO_KR_KEY / FRED_API_KEY 환경변수가 필요합니다.");
  process.exit(1);
}

/** data.go.kr 일별 통계 오퍼레이션 공통 조회: beginBasDt~endBasDt 구간의 [{date, value}] (날짜 내림차순) */
async function fetchDailySeries({ baseUrl, operation, field, extraParams = "", begin, end }) {
  const url =
    `${baseUrl}/${operation}?serviceKey=${DATA_GO_KR_KEY}&numOfRows=200&pageNo=1&resultType=json` +
    `&beginBasDt=${toYyyymmdd(begin)}&endBasDt=${toYyyymmdd(end)}${extraParams}`;
  const data = await fetchJson(url);
  const items = data?.response?.body?.items?.item;
  const list = Array.isArray(items) ? items : items ? [items] : [];
  return list
    .map((it) => ({ date: it.basDt, value: Number(it[field]) }))
    .filter((r) => Number.isFinite(r.value))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

async function fetchFredDaily(seriesId, begin, end) {
  const fmt = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const url =
    `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}` +
    `&file_type=json&sort_order=desc&observation_start=${fmt(begin)}&observation_end=${fmt(end)}`;
  const data = await fetchJson(url);
  return (data.observations || [])
    .filter((o) => o.value !== ".")
    .map((o) => ({ date: o.date.replaceAll("-", ""), value: Number(o.value) }));
}

function threeMonthAvg(series, latestDateStr) {
  const y = Number(latestDateStr.slice(0, 4));
  const m = Number(latestDateStr.slice(4, 6));
  const d = Number(latestDateStr.slice(6, 8));
  const latest = new Date(Date.UTC(y, m - 1, d));
  const cutoff = addMonths(latest, -3);
  const cutoffStr = toYyyymmdd(cutoff);
  const inWindow = series.filter((r) => r.date >= cutoffStr && r.date <= latestDateStr);
  if (inWindow.length === 0) return null;
  return inWindow.reduce((sum, r) => sum + r.value, 0) / inWindow.length;
}

function pctChange(latest, base) {
  if (!base) return null;
  return ((latest - base) / base) * 100;
}

function fmtPct(v, digits = 1) {
  if (v === null || Number.isNaN(v)) return "N/A";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}

function fmtPctP(v, digits = 2) {
  if (v === null || Number.isNaN(v)) return "N/A";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%p`;
}

function fmtJo(v, digits = 1) {
  return `${(v / 1e12).toFixed(digits)}조`;
}

async function buildMetric({ baseUrl, operation, field, extraParams, begin, end }) {
  const series = await fetchDailySeries({ baseUrl, operation, field, extraParams, begin, end });
  if (series.length === 0) throw new Error(`데이터 없음: ${operation}${extraParams}`);
  const latest = series[0];
  const prev = series[1] ?? null;
  const avg3m = threeMonthAvg(series, latest.date);
  return {
    date: latest.date,
    value: latest.value,
    dayChangePct: prev ? pctChange(latest.value, prev.value) : null,
    avg3mChangePct: avg3m ? pctChange(latest.value, avg3m) : null,
    series,
  };
}

/** 이미 %인 두 값의 차이(퍼센트포인트). base가 없으면 null. */
function diffPp(latest, base) {
  if (base === null || base === undefined) return null;
  return latest - base;
}

/** 두 금액 시리즈(날짜 일치)로 비율(%) 시리즈를 만들고, 그 비율의 전일비/3개월평균비를 %p로 계산 */
function buildRatioMetric(numeratorSeries, denominatorSeries) {
  const denomByDate = new Map(denominatorSeries.map((r) => [r.date, r.value]));
  const ratioSeries = numeratorSeries
    .filter((r) => denomByDate.has(r.date) && denomByDate.get(r.date))
    .map((r) => ({ date: r.date, value: (r.value / denomByDate.get(r.date)) * 100 }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (ratioSeries.length === 0) throw new Error("예탁금 대비 신용잔고 비율 데이터 없음");
  const latest = ratioSeries[0];
  const prev = ratioSeries[1] ?? null;
  const avg3m = threeMonthAvg(ratioSeries, latest.date);
  return {
    value: latest.value,
    dayChangePp: prev ? diffPp(latest.value, prev.value) : null,
    avg3mChangePp: avg3m ? diffPp(latest.value, avg3m) : null,
  };
}

async function main() {
  const today = nowKst();
  if (isWeekend(today)) {
    console.log("SKIP: weekend");
    return;
  }
  if (await isHoliday(DATA_GO_KR_KEY, today)) {
    console.log("SKIP: holiday");
    return;
  }

  const begin = addMonths(today, -4);
  const KOFIA_BASE = "https://apis.data.go.kr/1160100/service/GetKofiaStatisticsInfoService";
  const INDEX_BASE = "https://apis.data.go.kr/1160100/service/GetMarketIndexInfoService";

  const [deposit, credit, kospi, kosdaq] = await Promise.all([
    buildMetric({ baseUrl: KOFIA_BASE, operation: "getSecuritiesMarketTotalCapitalInfo", field: "invrDpsgAmt", begin, end: today }),
    buildMetric({ baseUrl: KOFIA_BASE, operation: "getGrantingOfCreditBalanceInfo", field: "crdTrFingWhl", begin, end: today }),
    buildMetric({ baseUrl: INDEX_BASE, operation: "getStockMarketIndex", field: "trPrc", extraParams: "&idxNm=%EC%BD%94%EC%8A%A4%ED%94%BC", begin, end: today }),
    buildMetric({ baseUrl: INDEX_BASE, operation: "getStockMarketIndex", field: "trPrc", extraParams: "&idxNm=%EC%BD%94%EC%8A%A4%EB%8B%A5", begin, end: today }),
  ]);

  const fredSeries = await fetchFredDaily("DGS10", addMonths(today, -1), today);
  if (fredSeries.length === 0) throw new Error("FRED 데이터 없음");
  const us10y = fredSeries[0];
  const us10yPrev = fredSeries[1] ?? null;
  const us10yDayChangePp = us10yPrev ? us10y.value - us10yPrev.value : null;

  const ratio = buildRatioMetric(credit.series, deposit.series);

  const dateLabel = `${today.getUTCFullYear()}.${String(today.getUTCMonth() + 1).padStart(2, "0")}.${String(today.getUTCDate()).padStart(2, "0")}`;

  const message = `${dateLabel} 개장전 정보 말씀드립니다.

주식예탁금잔액 ${fmtJo(deposit.value)}(전일비 ${fmtPct(deposit.dayChangePct)}, 3개월평균비 ${fmtPct(deposit.avg3mChangePct)})
신용잔고잔액 ${fmtJo(credit.value)}(예탁금잔액대비 ${ratio.value.toFixed(1)}%[전일비 ${fmtPctP(ratio.dayChangePp)}, 3개월평균비 ${fmtPctP(ratio.avg3mChangePp)}], 전일비 ${fmtPct(credit.dayChangePct)}, 3개월평균비 ${fmtPct(credit.avg3mChangePct)})
코스피 일평균거래대금 ${fmtJo(kospi.value)}(전일비 ${fmtPct(kospi.dayChangePct)}, 3개월평균비 ${fmtPct(kospi.avg3mChangePct)})
코스닥 일평균거래대금 ${fmtJo(kosdaq.value)}(전일비 ${fmtPct(kosdaq.dayChangePct)}, 3개월평균비 ${fmtPct(kosdaq.avg3mChangePct)})
미 10년물 국채금리 ${us10y.value.toFixed(2)}%(전일비 ${fmtPctP(us10yDayChangePp)})`;

  console.log(message);
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
