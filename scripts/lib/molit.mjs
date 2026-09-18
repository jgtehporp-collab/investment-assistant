// 국토교통부 아파트 매매 실거래가 상세 자료 API 유틸 (거래량 집계용).
import { fetchJson } from "./dateKst.mjs";
import capitalRegional from "./lawd-region-codes.json" with { type: "json" };

const BASE = "http://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev";

export const CAPITAL_LAWD_CODES = capitalRegional.capital;
export const REGIONAL_LAWD_CODES = capitalRegional.regional;

/** 특정 시군구(lawdCd)·특정 계약월(yyyymm)의 계약일(dealDay) 목록을 가져옴. 페이지네이션 처리 포함. */
async function fetchDealDaysForCode(lawdCd, yyyymm, serviceKey, label) {
  const pageSize = 500;
  let page = 1;
  let total = Infinity;
  const days = [];
  while ((page - 1) * pageSize < total) {
    const url =
      `${BASE}?serviceKey=${serviceKey}&LAWD_CD=${lawdCd}&DEAL_YMD=${yyyymm}` +
      `&numOfRows=${pageSize}&pageNo=${page}&_type=json`;
    const data = await fetchJson(url, `${label} ${lawdCd}`);
    const body = data?.response?.body;
    if (!body) throw new Error(`[${label} ${lawdCd}] 응답 이상: ${JSON.stringify(data).slice(0, 200)}`);
    total = Number(body.totalCount || 0);
    const items = body.items?.item;
    const list = Array.isArray(items) ? items : items ? [items] : [];
    for (const it of list) days.push(Number(it.dealDay));
    page += 1;
  }
  return days;
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

/**
 * codes(시군구 코드 배열)에 대해 yyyymm(YYYYMM) 한 달치 계약일 목록을 전부 모아서 반환.
 * { [lawdCd]: number[] (dealDay 목록) } 형태.
 */
export async function fetchMonthDealDays(codes, yyyymm, serviceKey, label) {
  const results = await mapWithConcurrency(codes, 3, async (code) => {
    try {
      return await fetchDealDaysForCode(code, yyyymm, serviceKey, label);
    } catch {
      return []; // 개별 시군구 실패는 건너뜀 (전체 합계에 미미한 영향)
    }
  });
  const map = {};
  codes.forEach((code, i) => {
    map[code] = results[i];
  });
  return map;
}
