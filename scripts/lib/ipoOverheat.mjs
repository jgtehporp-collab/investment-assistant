// IPO 시장 과열 신호: IPO ETF의 3개월 수익률을 시장포트폴리오 3개월 수익률과 비교한
// 상대강도(%p)를 메인지표로, ±5%p 밴드로 과열/중립/위험회피를 판정 + 1주 전 대비 추이.
// 미국: Renaissance IPO ETF(IPO) vs S&P500(^GSPC) — 보조지표로 변동성 비율까지 포함.
// 국내: 현대 UNICORN 포스트IPO 액티브(476000) vs 코스피지수 — KRX가 종목별 기간조회를
//   지원하지 않고 일자별 전체 스냅샷만 주기 때문에, 필요한 4개 시점(오늘/1주전/각각의
//   3개월전)만 점 조회하는 방식. 변동성 보조지표는 전체 구간 일별 스냅샷이 추가로
//   수십 회 더 필요해 비용 대비 실익이 낮아 국내 쪽은 생략.

import { fetchJson } from "./dateKst.mjs";

const IPO_SYMBOL = "IPO"; // Renaissance IPO ETF
const MARKET_SYMBOL = "^GSPC"; // S&P500 (시장포트폴리오)
const OVERHEAT_BAND_PP = 5; // ±5%p
const KR_ETF_CODE = "476000"; // 현대 UNICORN 포스트IPO 액티브
const KRX_BASE = "https://data-dbg.krx.co.kr/svc/apis/etp";

/** Yahoo Finance에서 일봉 종가 시계열을 가져옴. 오름차순(과거->최신) [{date:"YYYYMMDD", close:number}] */
async function fetchYahooCloses(symbol, range = "9mo") {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const data = await fetchJson(url, `IPO과열신호 ${symbol}`, { headers: { "User-Agent": "Mozilla/5.0" } });
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`[IPO과열신호 ${symbol}] 데이터 없음`);
  const ts = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const rows = [];
  for (let i = 0; i < ts.length; i++) {
    if (closes[i] == null) continue;
    const d = new Date(ts[i] * 1000);
    const dateStr = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    rows.push({ date: dateStr, close: closes[i] });
  }
  return rows;
}

/** targetDateStr(YYYYMMDD) 이하 날짜 중 가장 최근 종가 항목 */
function findCloseOnOrBefore(series, targetDateStr) {
  let found = null;
  for (const row of series) {
    if (row.date <= targetDateStr) found = row;
    else break;
  }
  return found;
}

function shiftYyyymmdd(dateStr, monthsDelta) {
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(4, 6));
  const d = Number(dateStr.slice(6, 8));
  const shifted = new Date(Date.UTC(y, m - 1 + monthsDelta, d));
  return `${shifted.getUTCFullYear()}${String(shifted.getUTCMonth() + 1).padStart(2, "0")}${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

/** asOfDateStr 기준 최근 종가 대비 monthsBack개월 전 종가 대비 수익률(%). 데이터 부족하면 null. */
function pctReturnAsOf(series, asOfDateStr, monthsBack) {
  const latest = findCloseOnOrBefore(series, asOfDateStr);
  const base = findCloseOnOrBefore(series, shiftYyyymmdd(asOfDateStr, -monthsBack));
  if (!latest || !base || !base.close) return null;
  return ((latest.close - base.close) / base.close) * 100;
}

/** fromDateStr~toDateStr 구간 일간 수익률의 표준편차(%, 모집단 기준) */
function dailyReturnStdDev(series, fromDateStr, toDateStr) {
  const window = series.filter((r) => r.date >= fromDateStr && r.date <= toDateStr);
  if (window.length < 5) return null;
  const rets = [];
  for (let i = 1; i < window.length; i++) {
    rets.push(((window[i].close - window[i - 1].close) / window[i - 1].close) * 100);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  return Math.sqrt(variance);
}

function classifyZone(relStrengthPp) {
  if (relStrengthPp === null) return "판단불가";
  if (relStrengthPp >= OVERHEAT_BAND_PP) return "시장과열";
  if (relStrengthPp <= -OVERHEAT_BAND_PP) return "위험회피";
  return "중립";
}

/** today(KST Date, 사용은 날짜만)을 기준으로 미국 IPO 시장 과열 신호를 계산 */
export async function buildUsIpoOverheatSignal(today) {
  const [ipoSeries, mktSeries] = await Promise.all([fetchYahooCloses(IPO_SYMBOL), fetchYahooCloses(MARKET_SYMBOL)]);
  const todayStr = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, "0")}${String(today.getUTCDate()).padStart(2, "0")}`;
  const weekAgoStr = (() => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 7));
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  })();

  const ipo3mNow = pctReturnAsOf(ipoSeries, todayStr, 3);
  const mkt3mNow = pctReturnAsOf(mktSeries, todayStr, 3);
  const relNow = ipo3mNow !== null && mkt3mNow !== null ? ipo3mNow - mkt3mNow : null;

  const ipo3mWeekAgo = pctReturnAsOf(ipoSeries, weekAgoStr, 3);
  const mkt3mWeekAgo = pctReturnAsOf(mktSeries, weekAgoStr, 3);
  const relWeekAgo = ipo3mWeekAgo !== null && mkt3mWeekAgo !== null ? ipo3mWeekAgo - mkt3mWeekAgo : null;

  const trendPp = relNow !== null && relWeekAgo !== null ? relNow - relWeekAgo : null;

  const threeMonthsAgoStr = shiftYyyymmdd(todayStr, -3);
  const ipoVol = dailyReturnStdDev(ipoSeries, threeMonthsAgoStr, todayStr);
  const mktVol = dailyReturnStdDev(mktSeries, threeMonthsAgoStr, todayStr);
  const volRatio = ipoVol !== null && mktVol !== null && mktVol !== 0 ? ipoVol / mktVol : null;

  return {
    zone: classifyZone(relNow),
    relStrengthPp: relNow,
    trendPp,
    ipo3mReturn: ipo3mNow,
    mkt3mReturn: mkt3mNow,
    volRatio,
  };
}

function toYyyymmddFromDate(d) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

function shiftDaysYyyymmdd(dateStr, deltaDays) {
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(4, 6));
  const d = Number(dateStr.slice(6, 8));
  const shifted = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return toYyyymmddFromDate(shifted);
}

/** 코스피지수 종가 시계열(오름차순) — data.go.kr는 기간조회를 지원해 한 번에 가져올 수 있음 */
async function fetchKospiCloses(dataGoKrKey, fromDateStr, toDateStr) {
  const url =
    `https://apis.data.go.kr/1160100/service/GetMarketIndexInfoService/getStockMarketIndex?serviceKey=${dataGoKrKey}` +
    `&numOfRows=200&pageNo=1&resultType=json&beginBasDt=${fromDateStr}&endBasDt=${toDateStr}&idxNm=%EC%BD%94%EC%8A%A4%ED%94%BC`;
  const data = await fetchJson(url, "IPO과열신호 코스피지수");
  const items = data?.response?.body?.items?.item;
  const list = Array.isArray(items) ? items : items ? [items] : [];
  return list
    .map((it) => ({ date: it.basDt, close: Number(it.clpr) }))
    .filter((r) => Number.isFinite(r.close))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** targetDateStr 당일에 476000 데이터가 없으면(휴장 등) 최대 maxLookbackDays일 전까지 하루씩 거슬러 조회 */
async function fetchKrEtfCloseNear(krxApiKey, targetDateStr, maxLookbackDays = 10) {
  let cursor = targetDateStr;
  for (let i = 0; i <= maxLookbackDays; i++) {
    const url = `${KRX_BASE}/etf_bydd_trd?AUTH_KEY=${krxApiKey}&basDd=${cursor}`;
    const data = await fetchJson(url, `IPO과열신호 UNICORN ${cursor}`);
    if (data?.respCode) throw new Error(`[IPO과열신호 UNICORN] ${data.respCode} ${data.respMsg}`);
    const row = (data.OutBlock_1 || []).find((r) => r.ISU_CD === KR_ETF_CODE);
    if (row) return { date: cursor, close: Number(row.TDD_CLSPRC) };
    cursor = shiftDaysYyyymmdd(cursor, -1);
  }
  return null;
}

/** today(KST Date)를 기준으로 국내 IPO 시장 과열 신호(현대 UNICORN 포스트IPO 액티브 vs 코스피)를 계산 */
export async function buildKrIpoOverheatSignal(dataGoKrKey, krxApiKey, today) {
  const todayStr = toYyyymmddFromDate(today);
  const weekAgoStr = shiftDaysYyyymmdd(todayStr, -7);
  const targetDates = [todayStr, shiftYyyymmdd(todayStr, -3), weekAgoStr, shiftYyyymmdd(weekAgoStr, -3)];
  const kospiFrom = shiftDaysYyyymmdd(targetDates.reduce((a, b) => (a < b ? a : b)), -10);

  const [etfPoints, kospiSeries] = await Promise.all([
    Promise.all(targetDates.map((d) => fetchKrEtfCloseNear(krxApiKey, d))),
    fetchKospiCloses(dataGoKrKey, kospiFrom, todayStr),
  ]);
  const [etfToday, etfToday3mAgo, etfWeekAgo, etfWeekAgo3mAgo] = etfPoints;

  function ret(latest, base) {
    if (!latest || !base || !base.close) return null;
    return ((latest.close - base.close) / base.close) * 100;
  }
  const kospiToday = findCloseOnOrBefore(kospiSeries, todayStr);
  const kospiToday3mAgo = findCloseOnOrBefore(kospiSeries, shiftYyyymmdd(todayStr, -3));
  const kospiWeekAgo = findCloseOnOrBefore(kospiSeries, weekAgoStr);
  const kospiWeekAgo3mAgo = findCloseOnOrBefore(kospiSeries, shiftYyyymmdd(weekAgoStr, -3));

  const etf3mNow = ret(etfToday, etfToday3mAgo);
  const mkt3mNow = ret(kospiToday, kospiToday3mAgo);
  const relNow = etf3mNow !== null && mkt3mNow !== null ? etf3mNow - mkt3mNow : null;

  const etf3mWeekAgo = ret(etfWeekAgo, etfWeekAgo3mAgo);
  const mkt3mWeekAgo = ret(kospiWeekAgo, kospiWeekAgo3mAgo);
  const relWeekAgo = etf3mWeekAgo !== null && mkt3mWeekAgo !== null ? etf3mWeekAgo - mkt3mWeekAgo : null;

  const trendPp = relNow !== null && relWeekAgo !== null ? relNow - relWeekAgo : null;

  return {
    zone: classifyZone(relNow),
    relStrengthPp: relNow,
    trendPp,
    ipo3mReturn: etf3mNow,
    mkt3mReturn: mkt3mNow,
  };
}
