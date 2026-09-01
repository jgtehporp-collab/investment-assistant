// 한국투자증권(KIS) Open API 유틸 - 실전투자 계좌 잔고조회 전용.
import { fetchJson } from "./dateKst.mjs";

const KIS_BASE = "https://openapi.koreainvestment.com:9443";

export async function getKisAccessToken(appKey, appSecret, label) {
  const prefix = label ? `[${label}] ` : "";
  const data = await fetchJson(`${KIS_BASE}/oauth2/tokenP`, label, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret }),
  });
  if (!data?.access_token) throw new Error(`${prefix}KIS 토큰 발급 실패: ${JSON.stringify(data)}`);
  return data.access_token;
}

/** account: "12345678-01" 형식. 실전투자 전용(tr_id TTTC8434R). */
export async function getKisBalance(accessToken, appKey, appSecret, account, label) {
  const prefix = label ? `[${label}] ` : "";
  const [cano, acntPrdtCd] = account.split("-");
  const params = new URLSearchParams({
    CANO: cano,
    ACNT_PRDT_CD: acntPrdtCd,
    AFHR_FLPR_YN: "N",
    OFL_YN: "",
    INQR_DVSN: "02",
    UNPR_DVSN: "01",
    FUND_STTL_ICLD_YN: "N",
    FNCG_AMT_AUTO_RDPT_YN: "N",
    PRCS_DVSN: "01",
    CTX_AREA_FK100: "",
    CTX_AREA_NK100: "",
  });
  const url = `${KIS_BASE}/uapi/domestic-stock/v1/trading/inquire-balance?${params.toString()}`;
  const data = await fetchJson(url, label, {
    method: "GET",
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${accessToken}`,
      appkey: appKey,
      appsecret: appSecret,
      tr_id: "TTTC8434R",
      custtype: "P",
    },
  });
  if (data?.rt_cd !== "0") {
    throw new Error(`${prefix}KIS 잔고조회 실패: ${data?.msg1 || JSON.stringify(data)}`);
  }
  const holdings = (data.output1 || [])
    .filter((h) => Number(h.hldg_qty) > 0)
    .map((h) => ({
      name: h.prdt_name,
      code: h.pdno,
      qty: Number(h.hldg_qty),
      avgPrice: Number(h.pchs_avg_pric),
      curPrice: Number(h.prpr),
      evalAmt: Number(h.evlu_amt),
      profitRate: Number(h.evlu_pfls_rt),
    }))
    .sort((a, b) => b.evalAmt - a.evalAmt);
  const summary = data.output2?.[0] || {};
  return {
    holdings,
    deposit: Number(summary.dnca_tot_amt || 0),
    totalEval: Number(summary.tot_evlu_amt || 0),
    totalPurchase: Number(summary.pchs_amt_smtl_amt || 0),
    totalProfit: Number(summary.evlu_pfls_smtl_amt || 0),
  };
}
