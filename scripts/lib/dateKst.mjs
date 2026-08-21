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

/** 간헐적 네트워크 실패에 대비해 1회 재시도 (짧은 지연 후) */
export async function fetchJson(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      if (attempt === 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

/** 한국천문연구원 특일정보로 해당 (연,월)의 공휴일 locdate 목록(YYYYMMDD 숫자)을 가져옴 */
export async function fetchHolidaysForMonth(dataGoKrKey, year, month) {
  const m = String(month).padStart(2, "0");
  const url = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=${dataGoKrKey}&solYear=${year}&solMonth=${m}&_type=json&numOfRows=50`;
  const data = await fetchJson(url);
  const items = data?.response?.body?.items?.item;
  const list = Array.isArray(items) ? items : items ? [items] : [];
  return list.filter((it) => it.isHoliday === "Y").map((it) => Number(it.locdate));
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
