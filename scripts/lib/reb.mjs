// 한국부동산원 R-ONE Open API (주간 통계) 유틸.
import { fetchJson } from "./dateKst.mjs";

const BASE = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do";

export const REB_STATBL = {
  매매가격지수: "T244183132827305",
  전세가격지수: "T247713133046872",
  매매수급동향: "T248163133074619",
  전세수급동향: "T245423133086632",
};

export const REB_REGION_CLS = {
  수도권: 50002,
  지방권: 50003,
};

/** 특정 통계표(STATBL_ID)의 특정 지역(CLS_ID) 주간 시계열 전체를 [{date, value}] (날짜 오름차순)로 가져옴 */
export async function fetchRebWeeklySeries(statblId, clsId, key, label) {
  const url = `${BASE}?STATBL_ID=${statblId}&DTACYCLE_CD=WK&CLS_ID=${clsId}&KEY=${key}&Type=json&pIndex=1&pSize=1000`;
  const data = await fetchJson(url, label);
  if (!data.SttsApiTblData) {
    throw new Error(`[${label}] R-ONE 응답 이상: ${JSON.stringify(data).slice(0, 200)}`);
  }
  const rows = data.SttsApiTblData[1].row;
  return rows.map((r) => ({ date: r.WRTTIME_DESC, value: Number(r.DTA_VAL) })).sort((a, b) => (a.date < b.date ? -1 : 1));
}
