// 금주 트래커 — 마신 날만 기록(무기록=금주). 기록/달력/통계 3탭.
import { get, set, remove } from "../lib/store.js";
import { el, confirmDialog, selectSheet } from "../lib/ui.js";
import {
  DRINK_TYPES, fmtDate, currentStreak, longestStreak, formatStreakDays,
  calendarCells, dayStatus, monthSummary, yearMonthlyBars, yearsSummary, typeTotalsForYear, typeTotalsForMonth,
} from "../lib/sobrietyStats.js";

export const title = "금주";

const START_KEY = "sobriety_start";
const DRINKS_KEY = "sobriety_drinks";

function describeItems(items) {
  if (!items || !items.length) return "";
  return items.map((it) => {
    const unit = DRINK_TYPES.find((t) => t.type === it.type)?.unit || "";
    return `${it.type} ${it.count}${unit}`;
  }).join(", ");
}

export function mount(root) {
  let start = get(START_KEY, null);
  let drinks = get(DRINKS_KEY, {});
  let tab = "log"; // "log" | "cal" | "stats"
  let calDate = new Date();
  let statsYear = new Date().getFullYear();
  let selectedMonth0 = null; // 통계 탭에서 클릭으로 펼친 월(0-indexed), null이면 접힘

  const container = el("div", { className: "sob-root" });
  root.appendChild(container);

  const saveDrinks = () => set(DRINKS_KEY, drinks);
  const today = () => new Date();

  function ensureStart() {
    const dateInput = el("input", { type: "date", value: fmtDate(today()) });
    const okBtn = el("button", {
      className: "btn-primary", textContent: "시작",
      onclick: () => {
        if (!dateInput.value) return;
        start = dateInput.value;
        set(START_KEY, start);
        render();
      },
    });
    const card = el("div", { className: "modal-card" }, [
      el("h3", { className: "modal-title" }, "금주 시작일을 알려주세요"),
      el("p", { className: "hint" }, "이 날짜부터 오늘까지를 기준으로 연속 금주일수·통계를 계산합니다."),
      dateInput,
      el("div", { className: "att-actions" }, [okBtn]),
    ]);
    container.appendChild(el("div", { className: "modal" }, [card]));
  }

  function openStartEditModal() {
    const dateInput = el("input", { type: "date", value: start });
    const close = () => layer.remove();
    const saveBtn = el("button", {
      className: "btn-primary", textContent: "저장",
      onclick: () => {
        if (!dateInput.value) return;
        start = dateInput.value;
        set(START_KEY, start);
        close();
        render();
      },
    });
    const cancelBtn = el("button", { className: "btn-line", textContent: "취소", onclick: close });
    const resetBtn = el("button", {
      className: "btn-line danger", textContent: "데이터 초기화",
      onclick: async () => { close(); await resetAll(); },
    });
    const card = el("div", { className: "modal-card" }, [
      el("h3", { className: "modal-title" }, "금주 시작일 변경"),
      el("p", { className: "hint" }, "이 날짜부터 오늘까지를 기준으로 연속 금주일수·통계를 다시 계산합니다."),
      dateInput,
      el("div", { className: "att-actions" }, [resetBtn, cancelBtn, saveBtn]),
    ]);
    const layer = el("div", { className: "modal" }, [card]);
    layer.onclick = (e) => { if (e.target === layer) close(); };
    document.body.appendChild(layer);
  }

  function openLogModal(dateKey) {
    const existing = drinks[dateKey];
    const counts = {};
    for (const { type } of DRINK_TYPES) counts[type] = existing ? (existing.items.find((i) => i.type === type)?.count || 0) : 0;

    const dateInput = el("input", { type: "date", value: dateKey });
    const rows = DRINK_TYPES.map(({ type, unit }) => {
      const span = el("span", {}, `${counts[type]}${unit}`);
      const dec = el("button", { className: "mini", textContent: "−", onclick: () => { if (counts[type] > 0) { counts[type]--; span.textContent = `${counts[type]}${unit}`; } } });
      const inc = el("button", { className: "mini", textContent: "＋", onclick: () => { counts[type]++; span.textContent = `${counts[type]}${unit}`; } });
      return el("div", { className: "sob-row" }, [
        el("span", { className: "sob-type" }, type),
        el("div", { className: "yt-stepper" }, [dec, span, inc]),
      ]);
    });

    const close = () => layer.remove();
    const saveBtn = el("button", {
      className: "btn-line", textContent: "저장",
      onclick: () => {
        const newKey = dateInput.value || dateKey;
        const items = DRINK_TYPES.filter(({ type }) => counts[type] > 0).map(({ type }) => ({ type, count: counts[type] }));
        if (newKey !== dateKey) delete drinks[dateKey];
        if (items.length) drinks[newKey] = { items };
        else delete drinks[newKey];
        saveDrinks();
        close();
        render();
      },
    });
    const cancelBtn = el("button", { className: "btn-line", textContent: "취소", onclick: close });
    const delBtn = existing ? el("button", { className: "btn-line danger", textContent: "삭제", onclick: async () => {
      const ok = await confirmDialog(`${dateKey} 기록을 삭제할까요?`, { okText: "삭제", danger: true });
      if (!ok) return;
      delete drinks[dateKey];
      saveDrinks();
      close();
      render();
    } }) : null;
    const card = el("div", { className: "modal-card" }, [
      el("h3", { className: "modal-title" }, "음주 기록"),
      dateInput,
      ...rows,
      el("div", { className: "att-actions" }, [delBtn, cancelBtn, saveBtn].filter(Boolean)),
    ]);
    const layer = el("div", { className: "modal" }, [card]);
    layer.onclick = (e) => { if (e.target === layer) close(); };
    document.body.appendChild(layer);
  }

  async function deleteLog(key) {
    const ok = await confirmDialog(`${key} 기록을 삭제할까요?`, { okText: "삭제", danger: true });
    if (!ok) return;
    delete drinks[key];
    saveDrinks();
    render();
  }

  async function resetAll() {
    const ok = await confirmDialog(
      "금주 시작일과 모든 음주 기록을 완전히 초기화할까요? 되돌릴 수 없습니다.",
      { okText: "초기화", danger: true },
    );
    if (!ok) return;
    remove(START_KEY);
    remove(DRINKS_KEY);
    start = null;
    drinks = {};
    render();
  }

  function buildSummary() {
    const now = today();
    const streak = currentStreak(drinks, start, now);
    const longest = longestStreak(drinks, start, now);
    const thisMonth = monthSummary(drinks, now.getFullYear(), now.getMonth(), start, now);
    return el("div", { className: "sob-summary" }, [
      el("div", { className: "sob-stat big" }, [el("div", { className: "sob-num" }, formatStreakDays(streak)), el("div", { className: "sob-label" }, "연속 금주일")]),
      el("div", { className: "sob-stat" }, [el("div", { className: "sob-num" }, formatStreakDays(longest)), el("div", { className: "sob-label" }, "최장 기록")]),
      el("div", { className: "sob-stat" }, [el("div", { className: "sob-num" }, thisMonth.soberRate != null ? `${thisMonth.soberRate}%` : "-"), el("div", { className: "sob-label" }, "이번달 금주율")]),
    ]);
  }

  function buildTabs() {
    const mk = (key, label) => el("button", {
      className: "btn-line" + (tab === key ? " on" : ""),
      textContent: label,
      onclick: () => { tab = key; render(); },
    });
    return el("div", { className: "row-btns sob-tabs" }, [mk("log", "기록"), mk("cal", "달력"), mk("stats", "통계")]);
  }

  function buildLogTab() {
    const wrap = el("div", { className: "sob-tab" });
    const todayKey = fmtDate(today());
    const todayRec = drinks[todayKey];
    wrap.appendChild(el("p", { className: "hint" }, todayRec ? `오늘 기록: ${describeItems(todayRec.items)}` : "오늘은 아직 금주 중입니다 🙂"));
    wrap.appendChild(el("button", { className: "btn-primary", textContent: "술 마셨어요", onclick: () => openLogModal(todayKey) }));

    const listEl = el("div", { className: "wv-list" });
    const keys = Object.keys(drinks).sort().reverse().slice(0, 14);
    if (!keys.length) {
      listEl.appendChild(el("div", { className: "empty" }, "아직 기록이 없습니다."));
    } else {
      keys.forEach((key) => {
        const rec = drinks[key];
        const openBtn = el("button", { className: "wv-open", onclick: () => openLogModal(key) }, [
          el("span", { className: "menu-label" }, key),
          el("span", { className: "menu-desc" }, describeItems(rec.items)),
        ]);
        const ctrls = el("div", { className: "wv-ctrls" }, [
          el("button", { className: "mini danger", textContent: "삭제", onclick: () => deleteLog(key) }),
        ]);
        listEl.appendChild(el("div", { className: "wv-item" }, [openBtn, ctrls]));
      });
    }
    wrap.appendChild(listEl);
    return wrap;
  }

  function buildCalTab() {
    const wrap = el("div", { className: "sob-tab" });
    const year = calDate.getFullYear(), month0 = calDate.getMonth();
    wrap.appendChild(el("div", { className: "row-btns sob-cal-header" }, [
      el("button", { className: "mini", textContent: "◀", onclick: () => { calDate = new Date(year, month0 - 1, 1); render(); } }),
      el("span", { className: "sob-cal-title" }, `${year}년 ${month0 + 1}월`),
      el("button", { className: "mini", textContent: "▶", onclick: () => { calDate = new Date(year, month0 + 1, 1); render(); } }),
    ]));

    const grid = el("div", { className: "sob-cal-grid" });
    ["일", "월", "화", "수", "목", "금", "토"].forEach((d) => grid.appendChild(el("div", { className: "sob-cal-dow" }, d)));
    const { leadingBlanks, days } = calendarCells(year, month0);
    for (let i = 0; i < leadingBlanks; i++) grid.appendChild(el("div", { className: "sob-cal-cell empty" }));
    const now = today();
    days.forEach((key) => {
      const status = dayStatus(drinks, key, start, now);
      const dayNum = Number(key.slice(-2));
      const cell = el("div", {
        className: `sob-cal-cell ${status}`,
        onclick: () => { if (status !== "future") openLogModal(key); },
      }, [el("span", { className: "sob-cal-daynum" }, String(dayNum))]);
      if (status === "today") cell.appendChild(el("span", { className: "sob-cal-todaytag" }, "오늘"));
      grid.appendChild(cell);
    });
    wrap.appendChild(grid);
    wrap.appendChild(el("div", { className: "sob-legend" }, [
      el("span", { className: "sob-legend-item" }, [el("span", { className: "sob-dot drink" }), " 마심"]),
      el("span", { className: "sob-legend-item" }, [el("span", { className: "sob-dot sober" }), " 금주"]),
    ]));
    return wrap;
  }

  function buildStatsTab() {
    const wrap = el("div", { className: "sob-tab" });
    const years = yearsSummary(drinks, start, today());

    wrap.appendChild(el("button", {
      className: "btn-line",
      textContent: `${statsYear}년 ▾`,
      onclick: async () => {
        const picked = await selectSheet("연도 선택", [{ items: years.map((y) => ({ value: y.year, label: `${y.year}년` })) }], statsYear);
        if (picked != null) { statsYear = picked; selectedMonth0 = null; render(); }
      },
    }));

    const bars = yearMonthlyBars(drinks, statsYear, start, today());
    const maxDrink = Math.max(1, ...bars.map((b) => b.drinkingDays));
    wrap.appendChild(el("p", { className: "hint" }, "월별 음주일수(막대가 높을수록 많이 마심)"));
    const barsEl = el("div", { className: "sob-bars" });
    bars.forEach((b) => {
      const h = b.trackedDays ? Math.round((b.drinkingDays / maxDrink) * 100) : 0;
      barsEl.appendChild(el("div", {
        className: "sob-bar-col" + (selectedMonth0 === b.month0 ? " selected" : ""),
        onclick: () => { selectedMonth0 = selectedMonth0 === b.month0 ? null : b.month0; render(); },
      }, [
        el("div", { className: "sob-bar-track" }, [el("div", { className: "sob-bar-fill", style: `height:${h}%` })]),
        el("div", { className: "sob-bar-label" }, String(b.month0 + 1)),
      ]));
    });
    wrap.appendChild(barsEl);

    const totals = selectedMonth0 != null
      ? typeTotalsForMonth(drinks, statsYear, selectedMonth0)
      : typeTotalsForYear(drinks, statsYear);
    const totalAll = Object.values(totals).reduce((a, b) => a + b, 0);
    const totalsLabel = selectedMonth0 != null ? `${statsYear}년 ${selectedMonth0 + 1}월 종류별 섭취량` : `${statsYear}년 종류별 섭취량`;
    wrap.appendChild(el("div", { className: "sob-start-row" }, [
      el("span", { className: "hint" }, totalsLabel),
      selectedMonth0 != null ? el("button", { className: "mini", textContent: "연도 전체 보기", onclick: () => { selectedMonth0 = null; render(); } }) : null,
    ].filter(Boolean)));
    const typeBars = el("div", { className: "sob-type-bars" });
    DRINK_TYPES.forEach(({ type, unit }) => {
      const n = totals[type] || 0;
      const pct = totalAll ? Math.round((n / totalAll) * 100) : 0;
      typeBars.appendChild(el("div", { className: "sob-type-row" }, [
        el("span", { className: "sob-type" }, type),
        el("div", { className: "sob-type-track" }, [el("div", { className: "sob-type-fill", style: `width:${pct}%` })]),
        el("span", { className: "sob-type-num" }, `${n}${unit}`),
      ]));
    });
    wrap.appendChild(typeBars);

    wrap.appendChild(el("p", { className: "hint" }, "연도별 비교"));
    const table = el("div", { className: "sob-year-table" });
    years.forEach((y) => {
      table.appendChild(el("div", { className: "sob-year-row" }, [
        el("span", {}, `${y.year}년`),
        el("span", {}, `음주 ${y.drinkingDays}일`),
        el("span", {}, y.soberRate != null ? `금주율 ${y.soberRate}%` : "-"),
      ]));
    });
    wrap.appendChild(table);

    return wrap;
  }

  function render() {
    container.innerHTML = "";
    if (!start) { ensureStart(); return; }
    container.appendChild(el("div", { className: "sob-start-row" }, [
      el("span", { className: "hint" }, `시작일: ${start}`),
      el("button", { className: "mini", textContent: "변경", onclick: openStartEditModal }),
    ]));
    container.appendChild(buildSummary());
    container.appendChild(buildTabs());
    if (tab === "log") container.appendChild(buildLogTab());
    else if (tab === "cal") container.appendChild(buildCalTab());
    else container.appendChild(buildStatsTab());
  }

  render();
  return { unmount() {} };
}
