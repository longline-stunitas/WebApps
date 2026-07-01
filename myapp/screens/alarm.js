// 알림 화면 — 구 "걸음수" 화면에서 걸음수/셀룰러/충전 제외.
// 실시간 시계 · 정시 알림 토글 · 가변(시/분 뒤) 알림.
import { get, set } from "../lib/store.js";
import { el, setStatus, fmtRemain, fmtTime, confirmDialog } from "../lib/ui.js";
import { isPushEnabled, enablePush, addReminder, listReminders, cancelReminder } from "../lib/push.js";

export const title = "알림";

const PICKER_KEY = "alarmPickerHM"; // 마지막 선택 시간/분 기억 { h, m } — 특정 시각이 아니라 "지금으로부터" 걸리는 시간(듀레이션)
const DURATIONS_KEY = "alarmDurations"; // { reminderId: minutes } — 서버는 fire_at만 갖고 있어 대기중 항목 표기용 원래 분값을 기기에 따로 기억해둔다.
// 아래쪽은 "이력"이 아니라 "선택(바로가기)" 섹션이다 — 예전 상단 프리셋 버튼(5/10/15/30/60분)을 대신함.
// "추가"로 새 시간값을 예약할 때마다 그 분값을 여기 등록해두고(이미 있으면 중복 등록 안 함),
// "설정"을 누르면 그 분값으로 즉시 다시 예약한다. "취소"한 항목은 여기 남기지 않는다.
const SELECTIONS_KEY = "alarmSelections"; // [minutes, ...] 중복 없는 분값 목록

function saveDuration(id, minutes) {
  const map = get(DURATIONS_KEY, {});
  map[id] = minutes;
  set(DURATIONS_KEY, map);
}
function getDuration(id) {
  return get(DURATIONS_KEY, {})[id];
}
// "1시간 10분" 형태로 — 시간이 0이면 분만 표기.
function durationLabel(minutes) {
  const total = Math.max(0, Math.round(minutes || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m}분`;
  if (m <= 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}
// 대기중인 알림에도 없는 id는 기억해둘 필요 없음 — reload마다 정리.
function pruneDurations(ids) {
  const map = get(DURATIONS_KEY, {});
  const keep = new Set(ids);
  let changed = false;
  for (const k of Object.keys(map)) {
    if (!keep.has(k)) { delete map[k]; changed = true; }
  }
  if (changed) set(DURATIONS_KEY, map);
}

function getSelections() {
  return get(SELECTIONS_KEY, []);
}
// 이미 있는 분값이면 추가하지 않는다(선택 섹션은 분값 기준 중복 없음).
function ensureSelection(minutes) {
  const list = getSelections();
  if (!list.includes(minutes)) {
    list.push(minutes);
    set(SELECTIONS_KEY, list);
  }
}
function removeSelection(minutes) {
  set(SELECTIONS_KEY, getSelections().filter((m) => m !== minutes));
}

export function mount(root) {
  let reminders = [];
  let pushOn = false;
  let pollTimer = null;
  let tickTimer = null;

  // ── DOM ──
  const clock = el("div", { className: "clock" }, "—");

  // 알림 켜기 (구독 전)
  const enableBtn = el("button", {
    className: "btn-primary",
    textContent: "🔔 알림 켜기",
    onclick: async () => {
      setStatus("권한 요청 중…");
      const r = await enablePush();
      setStatus(r.message);
      if (r.ok) { pushOn = true; await reload(); renderControls(); }
    },
  });

  // 정시 알림 토글 — 별도 줄 없이 "추가" 옆에 배치(리스트 영역을 넓게 확보).
  const hourlyBtn = el("button", { className: "btn-line", textContent: "정시", onclick: toggleHourly });

  // 가변 알림 추가 — 앱(STBlankProject)의 "가변 시간" 버튼처럼 가까운 예약의 종료 시각/남은시간을 표시.
  const variableBtn = el("button", { className: "btn-line", textContent: "시간", onclick: openPicker });
  const pickerBtn = el("button", { className: "btn-line", textContent: "추가", onclick: openPicker });

  const listEl = el("ul", { className: "reminders" });

  const controls = el("div", { hidden: true }, [
    el("div", { className: "row" }, [
      variableBtn,
      el("div", { className: "row-btns" }, [pickerBtn, hourlyBtn]),
    ]),
    listEl,
  ]);

  root.appendChild(clock);
  root.appendChild(enableBtn);
  root.appendChild(controls);

  // ── 동작 ──
  // 같은 시간값(분)이라도 대기중인 알림은 여러 개가 동시에 돌아갈 수 있어야 하므로
  // 중복 방지를 하지 않는다(STBlankProject 원본과 동일). 대신 아래쪽 "선택" 섹션에는
  // 그 분값을 등록해둔다(이미 있으면 중복 등록 안 함 — ensureSelection).
  async function addOnce(minutes, label) {
    if (!minutes || minutes <= 0) return setStatus("분을 올바르게 입력하세요.");
    try {
      const res = await addReminder({ type: "once", minutes, title: label, body: `${minutes}분 뒤 알림입니다.` });
      if (res && res.id) saveDuration(res.id, minutes);
      ensureSelection(minutes);
      setStatus(`${minutes}분 뒤로 예약되었습니다.`);
      await reload();
    } catch (e) {
      setStatus("예약 실패: " + e.message);
    }
  }

  const WHEEL_ITEM_H = 40; // 아래 CSS .wheel-item height와 반드시 일치해야 함

  // UIPickerView 느낌의 세로 스크롤 휠 — CSS scroll-snap으로 구현(네이티브 <select>/커스텀
  // 시트보다 훨씬 "피커"답게 보이도록). count개 숫자를 세로로 나열, 스크롤해서 가운데(강조줄)에
  // 오는 값이 선택값이 된다.
  function buildWheel(count, initial) {
    const col = el("div", { className: "wheel-col" });
    const items = [];
    for (let i = 0; i < count; i++) {
      const it = el("div", { className: "wheel-item", textContent: String(i) });
      items.push(it);
      col.appendChild(it);
    }
    const state = { value: initial };
    function sync() {
      const idx = Math.min(count - 1, Math.max(0, Math.round(col.scrollTop / WHEEL_ITEM_H)));
      state.value = idx;
      items.forEach((it, i) => it.classList.toggle("active", i === idx));
    }
    col.addEventListener("scroll", sync);
    return { col, state, init: () => { col.scrollTop = initial * WHEEL_ITEM_H; sync(); } };
  }

  // STBlankProject 가변알림의 "추가" 버튼과 동일한 흐름: 시/분 피커(듀레이션 — 특정 시각이 아니라
  // "지금으로부터 몇 시간 몇 분 뒤")로 값을 고르면 addOnce로 예약한다(리스트는 아래쪽 listEl 그대로 사용).
  function openPicker() {
    const last = get(PICKER_KEY, { h: 0, m: 5 });
    const hourWheel = buildWheel(24, last.h);
    const minuteWheel = buildWheel(60, last.m);

    const okBtn = el("button", { className: "btn-line", textContent: "확인" });
    const cancelBtn = el("button", { className: "btn-line", textContent: "취소" });
    const card = el("div", { className: "modal-card" }, [
      el("h3", { className: "modal-title" }, "가변 알림 추가"),
      el("p", { className: "hint" }, "지금으로부터 몇 시간 몇 분 뒤에 울릴지 선택하세요."),
      el("div", { className: "wheel-picker" }, [
        el("div", { className: "wheel-highlight" }),
        hourWheel.col,
        el("div", { className: "wheel-unit" }, "시간"),
        minuteWheel.col,
        el("div", { className: "wheel-unit" }, "분"),
      ]),
      el("div", { className: "att-actions" }, [cancelBtn, okBtn]),
    ]);
    const layer = el("div", { className: "modal" }, [card]);
    const close = () => layer.remove();
    cancelBtn.onclick = close;
    layer.onclick = (e) => { if (e.target === layer) close(); };
    okBtn.onclick = () => {
      const h = hourWheel.state.value;
      const m = minuteWheel.state.value;
      const minutes = h * 60 + m;
      if (!minutes || minutes <= 0) return setStatus("시간을 올바르게 선택하세요.");
      set(PICKER_KEY, { h, m });
      close();
      addOnce(minutes, "가변 알림");
    };
    document.body.appendChild(layer);
    // 스크롤 위치 계산은 실제로 DOM에 붙어 레이아웃이 잡힌 뒤에야 의미가 있음.
    hourWheel.init();
    minuteWheel.init();
  }

  async function toggleHourly() {
    const existing = reminders.find((r) => r.recurrence === "hourly");
    try {
      if (existing) {
        await cancelReminder(existing.id);
        setStatus("정시 알림을 껐습니다.");
      } else {
        await addReminder({ type: "hourly", title: "정시 알림", body: "지금은 정시입니다!" });
        setStatus("정시 알림을 켰습니다.");
      }
      await reload();
    } catch (e) {
      setStatus("실패: " + e.message);
    }
  }

  // "취소"는 서버에서 완전 삭제하고 그걸로 끝 — 아래쪽 선택 섹션은 건드리지 않는다.
  async function cancelAlarm(r) {
    const ok = await confirmDialog("이 알림을 취소하시겠습니까?", { okText: "예", cancelText: "아니오", danger: true });
    if (!ok) return;
    try { await cancelReminder(r.id); } catch {}
    await reload();
  }

  // 선택 섹션에서 "삭제" — 그 분값을 바로가기 목록에서만 없앤다(현재 대기중인 같은 분값의
  // 알림이 있어도 그건 그대로 둠 — 바로가기만 지우는 것).
  async function deleteSelection(minutes) {
    const ok = await confirmDialog("이 알림을 삭제하시겠습니까?", { okText: "예", cancelText: "아니오", danger: true });
    if (!ok) return;
    removeSelection(minutes);
    renderList();
  }

  async function reload() {
    reminders = await listReminders();
    pruneDurations(reminders.map((r) => r.id));
    renderHourly();
    renderList();
  }

  function renderHourly() {
    const on = reminders.some((r) => r.recurrence === "hourly");
    hourlyBtn.classList.toggle("on", on);
  }

  // 대기중(취소만 가능)은 종료 시각 + 남은시간을 2줄로 표시(실시간 갱신), 아래쪽 "선택" 섹션
  // (분값 오름차순)은 "알림(N분)" 한 줄 + "설정"(그 분값으로 즉시 재예약)/"삭제"(바로가기 제거).
  function renderList() {
    listEl.innerHTML = "";
    const now = Date.now();
    const active = reminders.filter((r) => r.recurrence !== "hourly" && r.fire_at > now)
      .sort((a, b) => a.fire_at - b.fire_at);
    const selections = getSelections().slice().sort((a, b) => a - b);
    if (!active.length && !selections.length) {
      listEl.appendChild(el("li", { className: "empty" }, "예약된 알림이 없습니다."));
      return;
    }
    for (const r of active) {
      const prefixSpan = el("span", {}, `알림(${durationLabel(getDuration(r.id))}) 종료: ${fmtTime(r.fire_at)}`);
      // el()은 Object.assign으로 props를 적용하므로 "data-*"는 실제 속성으로 반영되지 않음(getAttribute로 못 읽힘) — setAttribute로 직접 설정.
      const remainSpan = el("span", { className: "remain" });
      remainSpan.setAttribute("data-fire", String(r.fire_at));
      const li = el("li", {}, [
        el("span", { className: "rmd-text" }, [prefixSpan, remainSpan]),
        el("div", { className: "rmd-actions" }, [
          el("button", { className: "cancel", textContent: "취소", onclick: () => cancelAlarm(r) }),
        ]),
      ]);
      listEl.appendChild(li);
    }
    for (const minutes of selections) {
      const li = el("li", {}, [
        el("span", { className: "rmd-text" }, `알림(${durationLabel(minutes)})`),
        el("div", { className: "rmd-actions" }, [
          el("button", { className: "reset", textContent: "설정", onclick: () => addOnce(minutes, "가변 알림") }),
          el("button", { className: "cancel", textContent: "삭제", onclick: () => deleteSelection(minutes) }),
        ]),
      ]);
      listEl.appendChild(li);
    }
    updateRemains();
  }

  // 매초: 시계 + 대기중 항목의 남은시간(remain) + "시간" 버튼을 갱신.
  function updateClock() {
    clock.textContent = new Date().toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "medium" });
  }
  function updateRemains() {
    const now = Date.now();
    listEl.querySelectorAll(".remain").forEach((span) => {
      const fire = Number(span.getAttribute("data-fire"));
      const left = fire - now;
      if (left <= 0) {
        span.textContent = "· 완료됨";
        span.classList.add("done");
      } else {
        span.textContent = `· 남은시간: ${fmtRemain(left)}`;
        span.classList.remove("done");
      }
    });
    updateVariableBtn();
  }

  // "시간" 버튼에 가장 가까운 대기중 알림의 종료 시각 + 남은시간을 표시(앱의 동적 라벨과 동일 — 리스트 항목과 같은 포맷).
  function updateVariableBtn() {
    const now = Date.now();
    const pending = reminders.filter((r) => r.recurrence !== "hourly" && r.fire_at > now);
    if (!pending.length) { variableBtn.textContent = "시간"; return; }
    const nearest = pending.reduce((a, b) => (a.fire_at < b.fire_at ? a : b));
    variableBtn.textContent = `${fmtTime(nearest.fire_at)} · 남은 ${fmtRemain(nearest.fire_at - now)}`;
  }

  function renderControls() {
    enableBtn.hidden = pushOn;
    controls.hidden = !pushOn;
  }

  // ── 초기화 ──
  updateClock();
  tickTimer = setInterval(() => { updateClock(); updateRemains(); }, 1000);

  (async () => {
    pushOn = await isPushEnabled();
    renderControls();
    if (pushOn) {
      await reload();
      // 서버 발송으로 사라진 항목 반영 위해 10초마다 동기화
      pollTimer = setInterval(reload, 10000);
    }
  })();

  return {
    unmount() {
      clearInterval(tickTimer);
      if (pollTimer) clearInterval(pollTimer);
      setStatus("");
    },
  };
}
