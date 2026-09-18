// 아파트 거래량 신고지연 보정 유틸.
// 계약 후 최대 30일까지 신고가 이어지므로, 최근 몇 주는 원시 집계값이 최종값보다 낮게 나온다.
// 초기에는 관찰 1개 사례(2026-09-07 주, 원본 리포트 대비 약 2.1배)를 앵커로 삼은 임시 배수 곡선을 쓰고,
// data/realestate-volume-history.json에 주차별 관측치를 쌓아서, 충분히 모이면(주차당 4회 이상) 그
// 실측 배수로 점진적으로 교체한다.

export const INITIAL_MULTIPLIER_CURVE = {
  0: 2.1, // 방금 끝난 주(신고 거의 안 됨) - 2026-09-07 관찰치 기준 임시값
  1: 1.5,
  2: 1.25,
  3: 1.1,
  4: 1.03,
};
const SETTLED_MULTIPLIER = 1.0; // 5주 이상 지나면 거의 다 신고된 것으로 간주
const MIN_SAMPLES_TO_CALIBRATE = 4; // 이 정도 관측치가 쌓이면 실측 배수로 교체

function roughMultiplier(weeksElapsed) {
  if (weeksElapsed in INITIAL_MULTIPLIER_CURVE) return INITIAL_MULTIPLIER_CURVE[weeksElapsed];
  return SETTLED_MULTIPLIER;
}

/**
 * history: { [group]: { [weekLabel]: { [weeksElapsed]: rawCount } } } 형태로 계속 누적되는 관측 기록.
 * 같은 주(weekLabel)를 매주 다시 조회하면서 weeksElapsed(0,1,2,...)별로 그 시점의 원시값을 기록해둔다.
 */
export function recordObservations(history, group, volumeRows, weeksElapsedByWeek) {
  history[group] = history[group] || {};
  for (const row of volumeRows) {
    const weekLabel = row.week;
    const elapsed = weeksElapsedByWeek[weekLabel];
    history[group][weekLabel] = history[group][weekLabel] || {};
    history[group][weekLabel][elapsed] = row.count;
  }
}

/** 실측 배수 계산: 각 weeksElapsed 구간에서 "그 시점 값 / 최종 정착값(5주+ 관측치)" 비율의 평균을 구함 */
function calibrateFromHistory(historyForGroup) {
  const samplesByElapsed = {};
  for (const observations of Object.values(historyForGroup)) {
    const settledEntry = Object.entries(observations).find(([elapsed]) => Number(elapsed) >= 5);
    if (!settledEntry) continue; // 아직 정착 안 된(5주 안 지난) 주는 기준값이 없어서 스킵
    const settledValue = settledEntry[1];
    if (!settledValue) continue;
    for (const [elapsed, value] of Object.entries(observations)) {
      const e = Number(elapsed);
      if (e >= 5) continue;
      samplesByElapsed[e] = samplesByElapsed[e] || [];
      samplesByElapsed[e].push(settledValue / value);
    }
  }
  const calibrated = {};
  for (const [elapsed, ratios] of Object.entries(samplesByElapsed)) {
    if (ratios.length >= MIN_SAMPLES_TO_CALIBRATE) {
      calibrated[elapsed] = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    }
  }
  return calibrated;
}

/** group(수도권/지방권)별로, 실측 배수가 있으면 그걸 쓰고 없으면 임시 곡선을 씀 */
export function getMultiplier(history, group, weeksElapsed) {
  const calibrated = history[group] ? calibrateFromHistory(history[group]) : {};
  if (weeksElapsed in calibrated) return { value: calibrated[weeksElapsed], source: "실측" };
  return { value: roughMultiplier(weeksElapsed), source: "임시" };
}
