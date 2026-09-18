// 시군구별 totalCount(가벼운 조회, numOfRows=1)만 써서 월별 합계를 구하는 유틸.
import { fetchJson } from "./dateKst.mjs";
import capitalRegional from "./lawd-region-codes.json" with { type: "json" };

const BASE = "http://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev";

export const CAPITAL_LAWD_CODES = capitalRegional.capital;
export const REGIONAL_LAWD_CODES = capitalRegional.regional;

async function fetchMonthTotalCount(lawdCd, yyyymm, serviceKey, label) {
  const url = `${BASE}?serviceKey=${serviceKey}&LAWD_CD=${lawdCd}&DEAL_YMD=${yyyymm}&numOfRows=1&pageNo=1&_type=json`;
  const data = await fetchJson(url, `${label} ${lawdCd} ${yyyymm}`);
  return Number(data?.response?.body?.totalCount || 0);
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

/** codes 전체의 yyyymm 한 달치 totalCount 합계 (가벼운 조회). 실패한 시군구가 있으면
 * (진짜 0건인지 API 실패인지 구분이 안 되므로) throw해서 호출부가 이 달을 다시 시도하게 함. */
export async function fetchMonthGroupTotal(codes, yyyymm, serviceKey, label) {
  let failed = 0;
  const results = await mapWithConcurrency(codes, 3, async (code) => {
    try {
      return await fetchMonthTotalCount(code, yyyymm, serviceKey, label);
    } catch {
      failed++;
      return null;
    }
  });
  if (failed > 0) {
    throw new Error(`[${label} ${yyyymm}] ${failed}/${codes.length}개 시군구 조회 실패 - 이 달은 재시도 필요`);
  }
  return results.reduce((a, b) => a + b, 0);
}
