// 금주 트래커 순수 계산 로직 — localStorage 접근 없이 데이터를 인자로 받는다(테스트하기 쉽게).
// drinksMap: { "YYYY-MM-DD": { items: [{type, count}], memo? } }
// startDate/today: "YYYY-MM-DD" 문자열 또는 Date. 월(month)은 항상 0-indexed(JS Date 관례).

export const DRINK_TYPES = [
  { type: "소주 360ml", unit: "병" },
  { type: "소주 640ml", unit: "병" },
  { type: "맥주 355ml", unit: "캔" },
  { type: "맥주 500ml", unit: "캔" },
  { type: "맥주 740ml", unit: "캔" },
  { type: "막걸리", unit: "병" },
  { type: "양주", unit: "잔" },
];

export function fmtDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toDate(v) { return v instanceof Date ? v : parseDateKey(v); }
function midnight(d) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

export function currentStreak(drinksMap, startDate, today) {
  const start = midnight(toDate(startDate));
  let d = midnight(toDate(today));
  if (drinksMap[fmtDate(d)]) return 0; // 오늘 마셨으면 즉시 0
  d = addDays(d, -1); // 오늘은 아직 안 지났으니 카운트에서 제외, 어제부터 계산
  let streak = 0;
  while (d >= start) {
    if (drinksMap[fmtDate(d)]) break;
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

// 365일 넘어가면 "N년 M일"로 표기(윤년 등 달력 오차는 무시 — 개인용 대략치).
export function formatStreakDays(days) {
  if (days >= 365) {
    const years = Math.floor(days / 365);
    const rest = days % 365;
    return rest > 0 ? `${years}년 ${rest}일` : `${years}년`;
  }
  return `${days}일`;
}

export function longestStreak(drinksMap, startDate, today) {
  const end = addDays(midnight(toDate(today)), -1); // 오늘은 아직 안 지나서 최장기록 계산에서 제외
  let d = midnight(toDate(startDate));
  let longest = 0, cur = 0;
  while (d <= end) {
    if (drinksMap[fmtDate(d)]) cur = 0;
    else { cur++; if (cur > longest) longest = cur; }
    d = addDays(d, 1);
  }
  return longest;
}

// 캘린더 그리드용: 그 달 1일의 요일만큼 앞에 빈 칸, 그 뒤로 실제 날짜 key 배열.
export function calendarCells(year, month0) {
  const first = new Date(year, month0, 1);
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const leadingBlanks = first.getDay();
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) days.push(fmtDate(new Date(year, month0, d)));
  return { leadingBlanks, days };
}

// "before"(추적 시작 전) | "future"(오늘 이후) | "drink"(마심) | "sober"(금주)
export function dayStatus(drinksMap, key, startDate, today) {
  const d = parseDateKey(key);
  const start = midnight(toDate(startDate));
  const end = midnight(toDate(today));
  if (d < start) return "before";
  if (d > end) return "future";
  return drinksMap[key] ? "drink" : "sober";
}

function emptyTotals() {
  const t = {};
  for (const { type } of DRINK_TYPES) t[type] = 0;
  return t;
}
function addTotals(t, items) {
  for (const it of items || []) t[it.type] = (t[it.type] || 0) + (it.count || 0);
}

export function monthSummary(drinksMap, year, month0, startDate, today) {
  const { days } = calendarCells(year, month0);
  const start = midnight(toDate(startDate));
  const end = midnight(toDate(today));
  let trackedDays = 0, drinkingDays = 0;
  const totalsByType = emptyTotals();
  for (const key of days) {
    const d = parseDateKey(key);
    if (d < start || d > end) continue;
    trackedDays++;
    const rec = drinksMap[key];
    if (rec) { drinkingDays++; addTotals(totalsByType, rec.items); }
  }
  const soberDays = trackedDays - drinkingDays;
  const soberRate = trackedDays > 0 ? Math.round((soberDays / trackedDays) * 100) : null;
  return { trackedDays, drinkingDays, soberDays, soberRate, totalsByType };
}

export function yearMonthlyBars(drinksMap, year, startDate, today) {
  const bars = [];
  for (let m = 0; m < 12; m++) {
    const s = monthSummary(drinksMap, year, m, startDate, today);
    bars.push({ month0: m, ...s });
  }
  return bars;
}

export function yearsSummary(drinksMap, startDate, today) {
  const start = midnight(toDate(startDate));
  const end = midnight(toDate(today));
  const out = [];
  for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
    const bars = yearMonthlyBars(drinksMap, y, startDate, today);
    const trackedDays = bars.reduce((a, b) => a + b.trackedDays, 0);
    const drinkingDays = bars.reduce((a, b) => a + b.drinkingDays, 0);
    const soberRate = trackedDays > 0 ? Math.round(((trackedDays - drinkingDays) / trackedDays) * 100) : null;
    out.push({ year: y, trackedDays, drinkingDays, soberRate });
  }
  return out.reverse(); // 최신 연도 먼저
}

export function typeTotalsForYear(drinksMap, year) {
  const totals = emptyTotals();
  for (const key of Object.keys(drinksMap)) {
    if (!key.startsWith(String(year))) continue;
    addTotals(totals, drinksMap[key].items);
  }
  return totals;
}

export function typeTotalsForMonth(drinksMap, year, month0) {
  const totals = emptyTotals();
  const prefix = `${year}-${String(month0 + 1).padStart(2, "0")}`;
  for (const key of Object.keys(drinksMap)) {
    if (!key.startsWith(prefix)) continue;
    addTotals(totals, drinksMap[key].items);
  }
  return totals;
}
