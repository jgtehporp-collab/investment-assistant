// KST 날짜/영업일 계산 공통 유틸. 이 파일이 다루는 Date 객체는 항상
// "UTC 필드 = KST 벽시계 값"이 되도록 시프트되어 있음 (getUTC* 로만 읽을 것).

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function nowKst() {
  if (process.env.TEST_TODAY) {
    // YYYYMMDD, 수동 테스트/백필용
    const s = process.env.TEST_TODAY;
    return new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))));
  }
  return new Date(Date.now() + KST_OFFSET_MS);
}

export function toYyyymmdd(d) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function toIsoDate(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function fromIsoDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(d, delta) {
  const copy = new Date(d.getTime());
  copy.setUTCDate(copy.getUTCDate() + delta);
  return copy;
}

export function addMonths(d, delta) {
  const copy = new Date(d.getTime());
  copy.setUTCMonth(copy.getUTCMonth() + delta);
  return copy;
}

export function isWeekend(d) {
  const w = d.getUTCDay();
  return w === 0 || w === 6;
}

/**
 * 간헐적 네트워크 실패에 대비해 재시도(기본 5회 시도, 지수 백오프: 1s, 2s, 4s, 8s).
 * 공공데이터포털(apis.data.go.kr)이 가끔 몇 초~몇십 초 단위로 끊기는 경우가 있어
 * 예전(3회, 500ms~1s)보다 더 길게 버티도록 늘림.
 * label을 주면 실패 시 어떤 호출이었는지 에러 메시지에 남김 (예: "[예탁금]").
 */
export async function fetchJson(url, label) {
  const maxAttempts = 5;
  const prefix = label ? `[${label}] ` : "";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${prefix}HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      if (attempt === maxAttempts - 1) {
        throw err.message?.startsWith(prefix) || !prefix ? err : new Error(`${prefix}${err.message}`, { cause: err });
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
}

/** 텔레그램 봇으로 메시지 전송 (4096자 제한에 맞춰 자동 분할). MCP 커넥터 없이 순수 HTTP 호출. */
export async function sendTelegramMessage(botToken, chatId, text) {
  const MAX_LEN = 4000;
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX_LEN) chunks.push(text.slice(i, i + MAX_LEN));
  for (const chunk of chunks) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ chat_id: chatId, text: chunk }),
    });
    if (!res.ok) throw new Error(`[텔레그램전송] HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (!data.ok) throw new Error(`[텔레그램전송] ${JSON.stringify(data)}`);
  }
}

/** 텔레그램 봇으로 사진 전송 (로컬 파일 경로). MCP 커넥터 없이 순수 HTTP 호출. */
export async function sendTelegramPhoto(botToken, chatId, filePath, caption) {
  const { readFileSync } = await import("node:fs");
  const buf = readFileSync(filePath);
  const form = new FormData();
  form.append("chat_id", chatId);
  if (caption) form.append("caption", caption);
  form.append("photo", new Blob([buf], { type: "image/png" }), "report.png");
  const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) throw new Error(`[텔레그램사진전송] HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (!data.ok) throw new Error(`[텔레그램사진전송] ${JSON.stringify(data)}`);
}

// apis.data.go.kr(공공데이터포털)이 간헐적으로 끊겨 "공휴일조회" 자체가 실패하면
// 영업일 판단이 안 돼서 전체 Routine이 멎어버림 — 이걸 막기 위한 수동 관리 백업표.
// 매년 1회(또는 새해 자동화 전) 다음 해 분을 추가해줄 것. 출처: 관공서의 공휴일에 관한 규정
// (대체공휴일 포함, 근로자의날/투표일처럼 법정공휴일이 아닌 날은 제외 — 실제 API와 동일 기준).
const STATIC_HOLIDAYS_FALLBACK = {
  2026: [
    20260101, 20260216, 20260217, 20260218, 20260301, 20260302, 20260505, 20260524, 20260525,
    20260606, 20260815, 20260817, 20260924, 20260925, 20260926, 20261003, 20261005, 20261009, 20261225,
  ],
};

/** 한국천문연구원 특일정보로 해당 (연,월)의 공휴일 locdate 목록(YYYYMMDD 숫자)을 가져옴.
 *  라이브 API가 재시도 끝에도 실패하면 STATIC_HOLIDAYS_FALLBACK으로 대체(해당 연도 없으면 에러 그대로 던짐). */
export async function fetchHolidaysForMonth(dataGoKrKey, year, month) {
  const m = String(month).padStart(2, "0");
  const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=${dataGoKrKey}&solYear=${year}&solMonth=${m}&_type=json&numOfRows=50`;
  try {
    const data = await fetchJson(url, "공휴일조회");
    const items = data?.response?.body?.items?.item;
    const list = Array.isArray(items) ? items : items ? [items] : [];
    return list.filter((it) => it.isHoliday === "Y").map((it) => Number(it.locdate));
  } catch (err) {
    const fallback = STATIC_HOLIDAYS_FALLBACK[year];
    if (!fallback) throw err;
    console.error(`[공휴일조회] 라이브 API 실패, ${year}년 정적 백업표로 대체: ${err.message}`);
    return fallback.filter((d) => Math.floor(d / 100) === year * 100 + Number(month));
  }
}

export async function isHoliday(dataGoKrKey, kstDate) {
  const holidays = await fetchHolidaysForMonth(dataGoKrKey, kstDate.getUTCFullYear(), kstDate.getUTCMonth() + 1);
  return holidays.includes(Number(toYyyymmdd(kstDate)));
}

export async function isBusinessDay(dataGoKrKey, kstDate) {
  if (isWeekend(kstDate)) return false;
  return !(await isHoliday(dataGoKrKey, kstDate));
}

/** kstDate가 그 주(월~일)의 첫 영업일인지: 이번 주 월요일부터 kstDate 전날까지 영업일이 하나도 없어야 함 */
export async function isFirstBusinessDayOfWeek(dataGoKrKey, kstDate) {
  if (!(await isBusinessDay(dataGoKrKey, kstDate))) return false;
  const dow = kstDate.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const monday = addDays(kstDate, -daysSinceMonday);
  for (let d = monday; d.getTime() < kstDate.getTime(); d = addDays(d, 1)) {
    if (await isBusinessDay(dataGoKrKey, d)) return false;
  }
  return true;
}

/** kstDate가 그 달의 마지막 영업일인지: kstDate 다음날부터 월말까지 영업일이 하나도 없어야 함 */
export async function isLastBusinessDayOfMonth(dataGoKrKey, kstDate) {
  if (!(await isBusinessDay(dataGoKrKey, kstDate))) return false;
  const lastOfMonth = new Date(Date.UTC(kstDate.getUTCFullYear(), kstDate.getUTCMonth() + 1, 0));
  for (let d = addDays(kstDate, 1); d.getTime() <= lastOfMonth.getTime(); d = addDays(d, 1)) {
    if (await isBusinessDay(dataGoKrKey, d)) return false;
  }
  return true;
}
