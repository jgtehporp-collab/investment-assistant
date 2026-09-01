#!/usr/bin/env node
// 매일 개장전 리포트: 예탁금/신용잔고/코스피·코스닥 거래대금/미 10년물 국채금리/삼전닉스비중
// 계산 후 텔레그램으로 직접 전송까지 수행 (MCP 커넥터 불필요).
// 필요 환경변수: DATA_GO_KR_KEY (URL-encoded), FRED_API_KEY, KRX_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

import { nowKst, toYyyymmdd, addMonths, isWeekend, isHoliday, fetchJson, sendTelegramMessage } from "./lib/dateKst.mjs";

const DATA_GO_KR_KEY = process.env.DATA_GO_KR_KEY;
const FRED_API_KEY = process.env.FRED_API_KEY;
const KRX_API_KEY = process.env.KRX_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!DATA_GO_KR_KEY || !FRED_API_KEY || !KRX_API_KEY || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error("DATA_GO_KR_KEY / FRED_API_KEY / KRX_API_KEY / TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 환경변수가 필요합니다.");
  process.exit(1);
}

/** data.go.kr 일별 통계 오퍼레이션 공통 조회: beginBasDt~endBasDt 구간의 [{date, value}] (날짜 내림차순) */
async function fetchDailySeries({ baseUrl, operation, field, extraParams = "", begin, end, label }) {
  const url =
    `${baseUrl}/${operation}?serviceKey=${DATA_GO_KR_KEY}&numOfRows=200&pageNo=1&resultType=json` +
    `&beginBasDt=${toYyyymmdd(begin)}&endBasDt=${toYyyymmdd(end)}${extraParams}`;
  const data = await fetchJson(url, label);
  const items = data?.response?.body?.items?.item;
  const list = Array.isArray(items) ? items : items ? [items] : [];
  return list
    .map((it) => ({ date: it.basDt, value: Number(it[field]) }))
    .filter((r) => Number.isFinite(r.value))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

async function fetchFredDaily(seriesId, begin, end, label) {
  const fmt = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const url =
    `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}` +
    `&file_type=json&sort_order=desc&observation_start=${fmt(begin)}&observation_end=${fmt(end)}`;
  const data = await fetchJson(url, label);
  return (data.observations || [])
    .filter((o) => o.value !== ".")
    .map((o) => ({ date: o.date.replaceAll("-", ""), value: Number(o.value) }));
}

/** KRX Open API에서 특정 영업일의 유가증권(코스피) 전종목 시세를 가져옴 */
async function fetchKrxKospiSnapshot(dateStr) {
  const url = `https://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd?AUTH_KEY=${KRX_API_KEY}&basDd=${dateStr}`;
  const data = await fetchJson(url, `삼전닉스비중 KRX ${dateStr}`);
  return data.OutBlock_1 || [];
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** kospiDates(YYYYMMDD 목록)에 대해 삼성전자(005930)+SK하이닉스(000660) 합산 시가총액 시리즈를 구함 */
async function fetchSamsungHynixCombinedCapSeries(kospiDates) {
  const rows = await mapWithConcurrency(kospiDates, 3, async (date) => {
    try {
      const snapshot = await fetchKrxKospiSnapshot(date);
      const samsung = snapshot.find((r) => r.ISU_CD === "005930");
      const hynix = snapshot.find((r) => r.ISU_CD === "000660");
      if (!samsung || !hynix) return null;
      return { date, value: Number(samsung.MKTCAP) + Number(hynix.MKTCAP) };
    } catch {
      return null; // 개별 날짜 실패는 건너뜀 (3개월평균 계산에 큰 영향 없음)
    }
  });
  return rows.filter(Boolean);
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

async function buildMetric({ baseUrl, operation, field, extraParams, begin, end, label }) {
  const series = await fetchDailySeries({ baseUrl, operation, field, extraParams, begin, end, label });
  if (series.length === 0) throw new Error(`[${label}] 데이터 없음: ${operation}${extraParams}`);
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

  const [deposit, credit, kospi, kosdaq, kospiMktCap] = await Promise.all([
    buildMetric({ baseUrl: KOFIA_BASE, operation: "getSecuritiesMarketTotalCapitalInfo", field: "invrDpsgAmt", begin, end: today, label: "예탁금" }),
    buildMetric({ baseUrl: KOFIA_BASE, operation: "getGrantingOfCreditBalanceInfo", field: "crdTrFingWhl", begin, end: today, label: "신용잔고" }),
    buildMetric({ baseUrl: INDEX_BASE, operation: "getStockMarketIndex", field: "trPrc", extraParams: "&idxNm=%EC%BD%94%EC%8A%A4%ED%94%BC", begin, end: today, label: "코스피거래대금" }),
    buildMetric({ baseUrl: INDEX_BASE, operation: "getStockMarketIndex", field: "trPrc", extraParams: "&idxNm=%EC%BD%94%EC%8A%A4%EB%8B%A5", begin, end: today, label: "코스닥거래대금" }),
    buildMetric({ baseUrl: INDEX_BASE, operation: "getStockMarketIndex", field: "lstgMrktTotAmt", extraParams: "&idxNm=%EC%BD%94%EC%8A%A4%ED%94%BC", begin, end: today, label: "코스피시가총액" }),
  ]);

  const samsungHynixSeries = await fetchSamsungHynixCombinedCapSeries(kospiMktCap.series.map((r) => r.date));
  const samjeonNixRatio = buildRatioMetric(samsungHynixSeries, kospiMktCap.series);

  const fredSeries = await fetchFredDaily("DGS10", addMonths(today, -1), today, "미국채10년");
  if (fredSeries.length === 0) throw new Error("[미국채10년] FRED 데이터 없음");
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
미 10년물 국채금리 ${us10y.value.toFixed(2)}%(전일비 ${fmtPctP(us10yDayChangePp)})
삼전닉스비중 : ${samjeonNixRatio.value.toFixed(1)}%(전일대비 ${fmtPctP(samjeonNixRatio.dayChangePp)}, 3개월평균비 ${fmtPctP(samjeonNixRatio.avg3mChangePp)})`;

  console.log(message);
  await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, message);
  console.log("SENT: telegram");
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
