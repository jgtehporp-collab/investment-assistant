// 주1회(첫영업일) 과매도(RSI14<=30) 스크리너: 코스피/코스닥 시총 1조원 이상 또는 시총순위 300위 이내
// 종목 중 RSI(14, Wilder's smoothing)가 낮은 순 상위 10종목.
// 코스피는 KRX Open API(stk_bydd_trd)로 동작. 코스닥(ksq_bydd_trd)은 KRX_API_KEY에 해당 데이터셋
// 권한이 있어야 동작 — 없으면 이 함수가 바로 에러를 던지니, 호출부에서 market별로 try/catch할 것.

import { addDays, toYyyymmdd, isWeekend, fetchHolidaysForMonth, fetchJson } from "./dateKst.mjs";

const KRX_BASE = "https://data-dbg.krx.co.kr/svc/apis/sto";
const KRX_OP_BY_MARKET = { KOSPI: "stk_bydd_trd", KOSDAQ: "ksq_bydd_trd" };

async function fetchKrxSnapshot(market, krxApiKey, dateStr) {
  const op = KRX_OP_BY_MARKET[market];
  const url = `${KRX_BASE}/${op}?AUTH_KEY=${krxApiKey}&basDd=${dateStr}`;
  const data = await fetchJson(url, `RSI스크리너 ${market} ${dateStr}`);
  if (data?.respCode) throw new Error(`[RSI스크리너 ${market}] ${data.respCode} ${data.respMsg}`);
  return data.OutBlock_1 || [];
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** beforeDate(KST Date) 전날부터 거슬러 올라가며 영업일 count개를 오름차순(과거->최신)으로 반환 */
export async function getRecentTradingDays(dataGoKrKey, beforeDate, count) {
  const holidayCache = new Map();
  async function getHolidaySet(year, month) {
    const key = `${year}-${month}`;
    if (!holidayCache.has(key)) {
      const list = await fetchHolidaysForMonth(dataGoKrKey, year, month);
      holidayCache.set(key, new Set(list));
    }
    return holidayCache.get(key);
  }
  const dates = [];
  let cursor = addDays(beforeDate, -1);
  let guard = 0;
  while (dates.length < count) {
    if (guard++ > count * 4) throw new Error("[RSI스크리너] 영업일 탐색 범위 초과");
    if (!isWeekend(cursor)) {
      const hset = await getHolidaySet(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1);
      if (!hset.has(Number(toYyyymmdd(cursor)))) dates.unshift(toYyyymmdd(cursor));
    }
    cursor = addDays(cursor, -1);
  }
  return dates;
}

/** closesAscending(과거->최신, 최소 15개)로 RSI(14, Wilder's smoothing) 계산. 부족하면 null. */
export function computeRsi14(closesAscending) {
  if (closesAscending.length < 15) return null;
  const changes = [];
  for (let i = 1; i < closesAscending.length; i++) changes.push(closesAscending[i] - closesAscending[i - 1]);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < 14; i++) {
    const c = changes[i];
    avgGain += c > 0 ? c : 0;
    avgLoss += c < 0 ? -c : 0;
  }
  avgGain /= 14;
  avgLoss /= 14;
  for (let i = 14; i < changes.length; i++) {
    const c = changes[i];
    avgGain = (avgGain * 13 + (c > 0 ? c : 0)) / 14;
    avgLoss = (avgLoss * 13 + (c < 0 ? -c : 0)) / 14;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * market("KOSPI"|"KOSDAQ")의 과매도(RSI14<=rsiThreshold) 상위 maxResults종목.
 * 대상 유니버스: 시총 marketCapFloor 이상 OR 시총순위 topRankFloor 이내.
 * tradingDates: getRecentTradingDays로 얻은 오름차순(과거->최신) 영업일 목록(>=15개 권장 >=20).
 */
export async function buildOversoldList({
  market,
  krxApiKey,
  tradingDates,
  marketCapFloor = 1e12,
  topRankFloor = 300,
  rsiThreshold = 30,
  maxResults = 10,
}) {
  const snapshots = await mapWithConcurrency(tradingDates, 3, (d) => fetchKrxSnapshot(market, krxApiKey, d));
  const byCode = new Map();
  tradingDates.forEach((date, idx) => {
    for (const row of snapshots[idx]) {
      const code = row.ISU_CD;
      if (!byCode.has(code)) byCode.set(code, { name: row.ISU_NM, closes: [], latestMktCap: null, latestFlucRt: null });
      const entry = byCode.get(code);
      const close = Number(row.TDD_CLSPRC);
      if (Number.isFinite(close)) entry.closes.push(close);
      if (idx === tradingDates.length - 1) {
        entry.latestMktCap = Number(row.MKTCAP);
        entry.latestFlucRt = Number(row.FLUC_RT);
      }
    }
  });

  const latestList = [...byCode.entries()].filter(([, v]) => Number.isFinite(v.latestMktCap));
  latestList.sort((a, b) => b[1].latestMktCap - a[1].latestMktCap);
  const universe = new Set();
  latestList.forEach(([code, v], rank) => {
    if (v.latestMktCap >= marketCapFloor || rank < topRankFloor) universe.add(code);
  });

  const results = [];
  for (const code of universe) {
    const v = byCode.get(code);
    const rsi = computeRsi14(v.closes);
    if (rsi !== null && rsi <= rsiThreshold) {
      results.push({ code, name: v.name, rsi, mktCap: v.latestMktCap, flucRt: v.latestFlucRt });
    }
  }
  results.sort((a, b) => a.rsi - b.rsi);
  return results.slice(0, maxResults);
}
