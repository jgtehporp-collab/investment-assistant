#!/usr/bin/env node
// 주간 주택시장 동향 리포트: 한국부동산원(R-ONE) 가격지수/심리지수 + 국토교통부 실거래가 거래량(추정)
// 이미지 1장으로 만들어 텔레그램 사진으로 전송.
// 필요 환경변수: DATA_GO_KR_KEY (URL-encoded, 국토교통부 실거래가에도 동일 키 사용),
//               REB_KEY (한국부동산원 R-ONE), TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { nowKst, toIsoDate, sendTelegramPhoto } from "./lib/dateKst.mjs";
import { fetchRebWeeklySeries, REB_STATBL, REB_REGION_CLS } from "./lib/reb.mjs";
import { fetchMonthDealDays, CAPITAL_LAWD_CODES, REGIONAL_LAWD_CODES } from "./lib/molit.mjs";
import { recordObservations, getMultiplier } from "./lib/volume-estimate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = join(__dirname, "..", "data", "realestate-volume-history.json");

const DATA_GO_KR_KEY = process.env.DATA_GO_KR_KEY;
const REB_KEY = process.env.REB_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!DATA_GO_KR_KEY || !REB_KEY || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error("DATA_GO_KR_KEY / REB_KEY / TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 환경변수가 필요합니다.");
  process.exit(1);
}

function addDaysIso(iso, delta) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function fmtIdx(v) {
  return v.toFixed(2);
}
function wowIdx(cur, prev) {
  if (prev === undefined) return "";
  const diff = cur - prev;
  const sign = diff >= 0 ? "+" : "";
  const cls = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  return `<span class="wow ${cls}">${sign}${diff.toFixed(2)}</span>`;
}
function wowVol(cur, prev) {
  if (prev === undefined || prev === 0) return "";
  const pct = ((cur - prev) / prev) * 100;
  const sign = pct >= 0 ? "+" : "";
  const cls = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  return `<span class="wow ${cls}">${sign}${pct.toFixed(1)}%</span>`;
}
function fmtDaily(weeklyTotal) {
  return Math.round(weeklyTotal / 7).toLocaleString();
}

async function main() {
  const today = nowKst();
  const todayIso = toIsoDate(today);

  const rebSeries = {};
  for (const [name, statbl] of Object.entries(REB_STATBL)) {
    for (const [region, cls] of Object.entries(REB_REGION_CLS)) {
      const series = await fetchRebWeeklySeries(statbl, cls, REB_KEY, `${name}-${region}`);
      rebSeries[`${name}_${region}`] = series.filter((r) => r.date <= todayIso);
    }
  }

  const dateLabels = rebSeries["매매가격지수_수도권"].map((r) => r.date).slice(-8);
  const asOfLabel = dateLabels.at(-1);

  const monthsNeeded = new Set();
  for (const d of dateLabels) {
    monthsNeeded.add(d.slice(0, 7).replace("-", ""));
    monthsNeeded.add(addDaysIso(d, 6).slice(0, 7).replace("-", ""));
  }

  const dealsByMonth = { capital: {}, regional: {} };
  for (const ym of monthsNeeded) {
    dealsByMonth.capital[ym] = await fetchMonthDealDays(CAPITAL_LAWD_CODES, ym, DATA_GO_KR_KEY, "거래량수도권");
    dealsByMonth.regional[ym] = await fetchMonthDealDays(REGIONAL_LAWD_CODES, ym, DATA_GO_KR_KEY, "거래량지방권");
  }

  function countInWeek(group, weekStart) {
    const weekEnd = addDaysIso(weekStart, 6);
    let count = 0;
    for (const ym of monthsNeeded) {
      const y = Number(ym.slice(0, 4));
      const m = Number(ym.slice(4, 6));
      const codeMap = dealsByMonth[group][ym];
      for (const days of Object.values(codeMap)) {
        for (const day of days) {
          const iso = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          if (iso >= weekStart && iso <= weekEnd) count++;
        }
      }
    }
    return count;
  }

  const volumeTable = dateLabels.map((weekStart) => ({
    week: weekStart,
    capital: countInWeek("capital", weekStart),
    regional: countInWeek("regional", weekStart),
  }));

  const monthlyVolume = [...monthsNeeded].sort().map((ym) => {
    let capital = 0;
    let regional = 0;
    for (const days of Object.values(dealsByMonth.capital[ym])) capital += days.length;
    for (const days of Object.values(dealsByMonth.regional[ym])) regional += days.length;
    return { ym, capital, regional };
  });

  // 신고지연 보정 배수 적용 + 관측 기록
  const history = JSON.parse(readFileSync(HISTORY_PATH, "utf-8"));
  function weeksElapsed(weekLabel) {
    const a = new Date(weekLabel + "T00:00:00Z");
    const b = new Date(asOfLabel + "T00:00:00Z");
    return Math.round((b - a) / (7 * 86400000));
  }
  const weeksElapsedByWeek = {};
  for (const row of volumeTable) weeksElapsedByWeek[row.week] = weeksElapsed(row.week);
  recordObservations(history, "수도권", volumeTable.map((r) => ({ week: r.week, count: r.capital })), weeksElapsedByWeek);
  recordObservations(history, "지방권", volumeTable.map((r) => ({ week: r.week, count: r.regional })), weeksElapsedByWeek);
  const volumeTableEnriched = volumeTable.map((row) => {
    const elapsed = weeksElapsedByWeek[row.week];
    const capMult = getMultiplier(history, "수도권", elapsed);
    const regMult = getMultiplier(history, "지방권", elapsed);
    return {
      week: row.week,
      capitalRaw: row.capital,
      capitalEst: Math.round(row.capital * capMult.value),
      regionalRaw: row.regional,
      regionalEst: Math.round(row.regional * regMult.value),
    };
  });
  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));

  // ── HTML 생성 ──
  const WK_LABELS = dateLabels.map((d) => {
    const [, m, dd] = d.split("-");
    return `${Number(m)}/${Number(dd)}`;
  });

  function buildIndexTable(title, capitalSeries, regionalSeries) {
    const last8c = capitalSeries.slice(-8);
    const last8r = regionalSeries.slice(-8);
    const rowsCapital = last8c.map((r, i) => `<td>${fmtIdx(r.value)}${wowIdx(r.value, last8c[i - 1]?.value)}</td>`).join("");
    const rowsRegional = last8r.map((r, i) => `<td>${fmtIdx(r.value)}${wowIdx(r.value, last8r[i - 1]?.value)}</td>`).join("");
    return `
    <table class="wktbl">
      <thead><tr><th>${title}</th>${WK_LABELS.map((w) => `<th>${w}</th>`).join("")}</tr></thead>
      <tbody>
        <tr><td class="rowlabel">수도권</td>${rowsCapital}</tr>
        <tr><td class="rowlabel">지방권</td>${rowsRegional}</tr>
      </tbody>
    </table>`;
  }

  function buildVolumeTable() {
    const rows = volumeTableEnriched;
    const capitalCells = rows
      .map((r, i) => `<td>${fmtDaily(r.capitalEst)}${wowVol(r.capitalEst, rows[i - 1]?.capitalEst)}<div class="rawnote">(원시 일평균 ${fmtDaily(r.capitalRaw)})</div></td>`)
      .join("");
    const regionalCells = rows
      .map((r, i) => `<td>${fmtDaily(r.regionalEst)}${wowVol(r.regionalEst, rows[i - 1]?.regionalEst)}<div class="rawnote">(원시 일평균 ${fmtDaily(r.regionalRaw)})</div></td>`)
      .join("");
    return `
    <table class="wktbl">
      <thead><tr><th>아파트 매매 일평균 거래량(건, 추정치)</th>${WK_LABELS.map((w) => `<th>${w}</th>`).join("")}</tr></thead>
      <tbody>
        <tr><td class="rowlabel">수도권</td>${capitalCells}</tr>
        <tr><td class="rowlabel">지방권</td>${regionalCells}</tr>
      </tbody>
    </table>
    <p class="note">※ 계약일 기준. 최근 몇 주는 신고 지연을 감안한 배수를 적용한 추정치(현재는 임시 배수 — 관측 데이터가 쌓이면 점차 실측 배수로 교체됨). 괄호 안은 보정 전 원시 신고 건수의 일평균.</p>`;
  }

  function chartSection(id, title, capitalSeries, regionalSeries) {
    const c3y = capitalSeries.slice(-156);
    const r3y = regionalSeries.slice(-156);
    return `
    <div class="chartwrap">
      <div class="charttitle">${title} · 최근 3개년</div>
      <canvas id="${id}" width="892" height="260"></canvas>
      <div class="legend"><span class="dot capital"></span>수도권 <span class="dot regional"></span>지방권</div>
    </div>
    <script>
      window.__chartData = window.__chartData || {};
      window.__chartData["${id}"] = { capital: ${JSON.stringify(c3y.map((r) => r.value))}, regional: ${JSON.stringify(r3y.map((r) => r.value))}, dates: ${JSON.stringify(c3y.map((r) => r.date))} };
    </script>`;
  }

  function monthlyVolumeChartSection() {
    const labels = monthlyVolume.map((r) => `${Number(r.ym.slice(4, 6))}월`);
    return `
    <div class="chartwrap">
      <div class="charttitle">월간 거래량(원시) · 최근 3개월</div>
      <canvas id="monthlyVolume" width="892" height="240"></canvas>
      <div class="legend"><span class="dot capital"></span>수도권 <span class="dot regional"></span>지방권</div>
      <p class="note">※ 원시 신고 건수 기준(보정 미적용) — 최근월은 신고 지연으로 낮게 나올 수 있음</p>
    </div>
    <script>
      window.__barData = { labels: ${JSON.stringify(labels)}, capital: ${JSON.stringify(monthlyVolume.map((r) => r.capital))}, regional: ${JSON.stringify(monthlyVolume.map((r) => r.regional))} };
    </script>`;
  }

  const metrics = [
    { key: "매매가격지수", title: "아파트 매매가격지수" },
    { key: "전세가격지수", title: "아파트 전세가격지수" },
    { key: "매매수급동향", title: "매매수급동향(심리지수)" },
    { key: "전세수급동향", title: "전세수급동향(심리지수)" },
  ];
  function combinedSection(sectionTitle, subMetrics) {
    const body = subMetrics
      .map((m) => {
        const capital = rebSeries[`${m.key}_수도권`];
        const regional = rebSeries[`${m.key}_지방권`];
        return `<h3>${m.title}</h3>${buildIndexTable(m.title, capital, regional)}${chartSection(m.key, m.title, capital, regional)}`;
      })
      .join("<hr class='divider'>");
    return `<div class="section"><h2>${sectionTitle}</h2>${body}</div>`;
  }
  const sections =
    combinedSection("아파트 가격지수(매매·전세)", [metrics[0], metrics[1]]) +
    combinedSection("수급동향(심리지수, 매매·전세)", [metrics[2], metrics[3]]);

  const asOfDisplay = `${asOfLabel.replace(/-/g, ".")}(월)`;

  const SHARED_STYLE = `
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Noto Sans KR','Malgun Gothic',sans-serif;background:#EEF1F8;color:#151A2E;width:960px;}
  .wrap{padding:32px 34px 40px;}
  .masthead{background:linear-gradient(115deg,#0E1A66 0%,#1D46D6 60%,#2F74F0 100%);color:#fff;padding:26px 34px;}
  .mast-title{font-size:28px;font-weight:800;}
  .mast-sub{font-size:15px;color:#C7D2FF;margin-top:5px;}
  .section{background:#fff;border:1px solid #DEE4F0;border-radius:14px;padding:22px 24px;margin-bottom:22px;}
  .section h2{font-size:19px;font-weight:700;margin-bottom:14px;color:#141F63;}
  .section h3{font-size:15px;font-weight:700;margin:10px 0 10px;color:#2E56E6;}
  .divider{border:none;border-top:1px solid #EBEFF7;margin:20px 0;}
  table.wktbl{width:100%;border-collapse:collapse;font-size:14px;}
  table.wktbl th, table.wktbl td{border-bottom:1px solid #EBEFF7;padding:8px 6px;text-align:center;}
  table.wktbl th{color:#6B7488;font-weight:600;font-size:13px;}
  table.wktbl th:first-child, table.wktbl td.rowlabel{text-align:left;font-weight:700;color:#151A2E;}
  .wow{display:block;font-size:12px;font-weight:700;margin-top:2px;}
  .wow.up{color:#E23B37;} .wow.down{color:#1C6FD6;} .wow.flat{color:#6B7488;}
  .note{font-size:12.5px;color:#6B7488;margin-top:10px;}
  .rawnote{font-size:11px;color:#9AA3B2;font-weight:500;margin-top:1px;}
  .chartwrap{margin-top:18px;}
  .charttitle{font-size:14px;font-weight:700;color:#141F63;margin-bottom:8px;}
  .legend{font-size:12.5px;color:#6B7488;margin-top:6px;}
  .dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin:0 5px 0 12px;vertical-align:middle;}
  .dot.capital{background:#2E56E6;} .dot.regional{background:#E23B37;}
  .foot{font-size:12px;color:#6B7488;padding:8px 4px 0;line-height:1.7;}`;

  const SHARED_SCRIPT = `
function drawChart(id) {
  const d = window.__chartData[id];
  const canvas = document.getElementById(id);
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, padTop = 12, padBottom = 34, padLeft = 52, padRight = 16;
  const plotH = H - padTop - padBottom;
  const all = d.capital.concat(d.regional);
  const min = Math.min(...all), max = Math.max(...all);
  const n = d.capital.length;
  function xy(i, v) {
    const x = padLeft + (i / (n - 1)) * (W - padLeft - padRight);
    const y = padTop + plotH - ((v - min) / (max - min || 1)) * plotH;
    return [x, y];
  }
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = '#EBEFF7'; ctx.lineWidth = 1;
  ctx.fillStyle = '#6B7488';
  ctx.font = '11px "Noto Sans KR", sans-serif';
  ctx.textAlign = 'right';
  for (let g = 0; g <= 4; g++) {
    const y = padTop + (g / 4) * plotH;
    const val = max - (g / 4) * (max - min);
    ctx.beginPath(); ctx.moveTo(padLeft, y); ctx.lineTo(W - padRight, y); ctx.stroke();
    ctx.fillText(val.toFixed(1), padLeft - 8, y + 3);
  }
  function drawLine(series, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    series.forEach((v, i) => { const [x, y] = xy(i, v); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.stroke();
  }
  drawLine(d.capital, '#2E56E6');
  drawLine(d.regional, '#E23B37');
  ctx.textAlign = 'center';
  ctx.strokeStyle = '#DEE4F0';
  const tickCount = 9;
  const tickIdx = Array.from({ length: tickCount }, (_, k) => Math.round((k / (tickCount - 1)) * (n - 1)));
  [...new Set(tickIdx)].forEach((i) => {
    const [x] = xy(i, d.capital[i]);
    const label = d.dates[i].slice(0, 7).replace('-', '/');
    ctx.beginPath(); ctx.moveTo(x, padTop + plotH); ctx.lineTo(x, padTop + plotH + 5); ctx.stroke();
    ctx.fillText(label, x, padTop + plotH + 18);
  });
}
function drawBarChart() {
  const d = window.__barData;
  const canvas = document.getElementById('monthlyVolume');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, padTop = 12, padBottom = 34, padLeft = 52, padRight = 16;
  const plotH = H - padTop - padBottom;
  const max = Math.max(...d.capital, ...d.regional);
  const n = d.labels.length;
  const groupW = (W - padLeft - padRight) / n;
  const barW = groupW * 0.28;
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = '#EBEFF7'; ctx.lineWidth = 1;
  ctx.fillStyle = '#6B7488';
  ctx.font = '12px "Noto Sans KR", sans-serif';
  ctx.textAlign = 'right';
  for (let g = 0; g <= 4; g++) {
    const y = padTop + (g / 4) * plotH;
    const val = max - (g / 4) * max;
    ctx.beginPath(); ctx.moveTo(padLeft, y); ctx.lineTo(W - padRight, y); ctx.stroke();
    ctx.fillText(Math.round(val).toLocaleString(), padLeft - 8, y + 4);
  }
  ctx.textAlign = 'center';
  for (let i = 0; i < n; i++) {
    const cx = padLeft + groupW * (i + 0.5);
    const capH = (d.capital[i] / max) * plotH;
    const regH = (d.regional[i] / max) * plotH;
    ctx.fillStyle = '#2E56E6';
    ctx.fillRect(cx - barW - 3, padTop + plotH - capH, barW, capH);
    ctx.fillStyle = '#E23B37';
    ctx.fillRect(cx + 3, padTop + plotH - regH, barW, regH);
    ctx.fillStyle = '#6B7488';
    ctx.fillText(d.labels[i], cx, padTop + plotH + 20);
  }
}
if (window.__chartData) Object.keys(window.__chartData).forEach(drawChart);
if (window.__barData) drawBarChart();
window.__renderReady = true;`;

  function buildPage(sectionTitle, bodyHtml) {
    return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><style>${SHARED_STYLE}</style></head>
<body>
  <div class="masthead">
    <div class="mast-title">주간 주택시장 동향</div>
    <div class="mast-sub">${asOfDisplay} 기준 · ${sectionTitle}</div>
  </div>
  <div class="wrap">
    ${bodyHtml}
    <div class="foot">자료: 한국부동산원 부동산통계정보시스템(R-ONE), 국토교통부 실거래가공개시스템</div>
  </div>
<script>${SHARED_SCRIPT}</script>
</body></html>`;
  }

  const pages = [
    { caption: `1/3 ${asOfDisplay} 아파트 가격지수(매매·전세)`, html: buildPage("아파트 가격지수", combinedSection("아파트 가격지수(매매·전세)", [metrics[0], metrics[1]])) },
    { caption: `2/3 ${asOfDisplay} 수급동향(심리지수)`, html: buildPage("수급동향(심리지수)", combinedSection("수급동향(심리지수, 매매·전세)", [metrics[2], metrics[3]])) },
    {
      caption: `3/3 ${asOfDisplay} 아파트 매매 거래량`,
      html: buildPage("아파트 매매 거래량", `<div class="section"><h2>아파트 매매 거래량</h2>${buildVolumeTable()}${monthlyVolumeChartSection()}</div>`),
    },
  ];

  const tmpDir = mkdtempSync(join(tmpdir(), "realestate-"));
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true });
  for (let i = 0; i < pages.length; i++) {
    const htmlPath = join(tmpDir, `page${i}.html`);
    const pngPath = join(tmpDir, `page${i}.png`);
    writeFileSync(htmlPath, pages[i].html);
    const page = await browser.newPage({ viewport: { width: 960, height: 800 }, deviceScaleFactor: 2 });
    await page.goto(`file://${htmlPath}`);
    await page.waitForFunction("window.__renderReady === true", { timeout: 10000 });
    await page.screenshot({ path: pngPath, fullPage: true });
    await page.close();
    await sendTelegramPhoto(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, pngPath, pages[i].caption);
    console.log(`SENT: telegram photo ${i + 1}/${pages.length}`);
  }
  await browser.close();
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
