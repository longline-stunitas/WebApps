// 알림 화면 — 구 "걸음수" 화면에서 걸음수/셀룰러/충전 제외.
// 실시간 시계 · 정시 알림 토글 · 가변(N분 뒤) 알림 + 프리셋.
import { get, set } from "../lib/store.js";
import { el, setStatus, fmtRemain, fmtTime, confirmDialog } from "../lib/ui.js";
import { isPushEnabled, enablePush, addReminder, listReminders, cancelReminder } from "../lib/push.js";

export const title = "알림";

const PRESETS = [5, 10, 15, 30, 60];
const PICKER_KEY = "alarmPickerHM"; // 마지막 선택 시간/분 기억 { h, m } — 특정 시각이 아니라 "지금으로부터" 걸리는 시간(듀레이션)
const DURATIONS_KEY = "alarmDurations"; // { reminderId: minutes } — 서버는 fire_at만 갖고 있어 "재설정"용 원래 분값을 기기에 따로 기억해둔다.
// 서버는 취소=완전삭제만 지원(수정/soft-cancel API 없음). 앱(STBlankProject)처럼 "취소" 후에도
// 목록에 "취소됨"으로 남겨두려고, 취소된 항목만 기기에 따로 기억해뒀다가 서버 목록과 합쳐서 보여준다.
const CANCELLED_KEY = "alarmCancelled"; // [{ id, title, fire_at }]

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
// 서버 목록 + 취소 목록에 모두 없는 id는 기억해둘 필요 없음 — reload마다 정리.
function pruneDurations(ids) {
  const map = get(DURATIONS_KEY, {});
  const keep = new Set(ids);
  let changed = false;
  for (const k of Object.keys(map)) {
    if (!keep.has(k)) { delete map[k]; changed = true; }
  }
  if (changed) set(DURATIONS_KEY, map);
}

function getCancelledLedger() {
  return get(CANCELLED_KEY, []);
}
function addToCancelledLedger(r) {
  const list = getCancelledLedger().filter((c) => c.id !== r.id);
  list.push({ id: r.id, title: r.title, fire_at: r.fire_at });
  set(CANCELLED_KEY, list);
}
function removeFromCancelledLedger(id) {
  set(CANCELLED_KEY, getCancelledLedger().filter((c) => c.id !== id));
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
  const presetRow = el("div", { className: "preset-row" },
    PRESETS.map((m) => el("button", { className: "preset", textContent: `${m}분`, onclick: () => addOnce(m, "타임 알람") }))
  );

  const listEl = el("ul", { className: "reminders" });

  const controls = el("div", { hidden: true }, [
    el("div", { className: "row" }, [
      variableBtn,
      el("div", { className: "row-btns" }, [pickerBtn, hourlyBtn]),
    ]),
    presetRow,
    listEl,
  ]);

  root.appendChild(clock);
  root.appendChild(enableBtn);
  root.appendChild(controls);

  // ── 동작 ──
  // STBlankProject 자체엔 없는 동작이지만(같은 시간이어도 그냥 계속 쌓임), 대기중인 알림과
  // 설정한 분(duration)이 같으면 중복 추가를 막는다 — 같은 타이머를 여러 개 걸 이유가 없음.
  function findActiveDuplicate(minutes) {
    const now = Date.now();
    return reminders.find((r) => r.recurrence !== "hourly" && r.fire_at > now && getDuration(r.id) === minutes);
  }

  async function addOnce(minutes, label) {
    if (!minutes || minutes <= 0) return setStatus("분을 올바르게 입력하세요.");
    if (findActiveDuplicate(minutes)) return setStatus("이미 같은 시간으로 설정된 알림이 있습니다.");
    try {
      const res = await addReminder({ type: "once", minutes, title: label, body: `${minutes}분 뒤 알림입니다.` });
      if (res && res.id) saveDuration(res.id, minutes);
      setStatus(`${minutes}분 뒤로 예약되었습니다.`);
      await reload();
    } catch (e) {
      setStatus("예약 실패: " + e.message);
    }
  }

  // 앱의 "재설정"과 동일: 원래 예약했던 분(duration)을 그대로 재사용해 지금부터 다시 예약.
  // 서버는 항목을 수정하는 API가 없어(추가/삭제만) 기존 항목은 정리하고 새로 추가한다.
  async function resetAlarm(r) {
    const minutes = getDuration(r.id);
    if (!minutes) return setStatus("이 알림은 다시 설정할 수 없습니다.");
    try { await cancelReminder(r.id); } catch {}
    removeFromCancelledLedger(r.id);
    await addOnce(minutes, r.title);
  }

  // STBlankProject 가변알림의 "추가" 버튼과 동일한 흐름: 시/분 피커(듀레이션 — 특정 시각이 아니라
  // "지금으로부터 몇 시간 몇 분 뒤")로 값을 고르면 addOnce로 예약한다(리스트는 아래쪽 listEl 그대로 사용).
  function openPicker() {
    const last = get(PICKER_KEY, { h: 0, m: 5 });
    const hourSelect = el("select", {},
      Array.from({ length: 24 }, (_, h) => el("option", { value: String(h) }, `${h}시간`))
    );
    const minuteSelect = el("select", {},
      Array.from({ length: 60 }, (_, m) => el("option", { value: String(m) }, `${m}분`))
    );
    hourSelect.value = String(last.h);
    minuteSelect.value = String(last.m);
    const okBtn = el("button", { className: "btn-line", textContent: "확인" });
    const cancelBtn = el("button", { className: "btn-line", textContent: "취소" });
    const card = el("div", { className: "modal-card" }, [
      el("h3", { className: "modal-title" }, "가변 알림 추가"),
      el("p", { className: "hint" }, "지금으로부터 몇 시간 몇 분 뒤에 울릴지 선택하세요."),
      el("div", { className: "picker-row" }, [hourSelect, minuteSelect]),
      el("div", { className: "att-actions" }, [cancelBtn, okBtn]),
    ]);
    const layer = el("div", { className: "modal" }, [card]);
    const close = () => layer.remove();
    cancelBtn.onclick = close;
    layer.onclick = (e) => { if (e.target === layer) close(); };
    okBtn.onclick = () => {
      const h = Number(hourSelect.value);
      const m = Number(minuteSelect.value);
      const minutes = h * 60 + m;
      if (!minutes || minutes <= 0) return setStatus("시간을 올바르게 선택하세요.");
      set(PICKER_KEY, { h, m });
      close();
      addOnce(minutes, "가변 알림");
    };
    document.body.appendChild(layer);
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

  // "취소"는 서버에서 완전 삭제(예약 발송을 실제로 막기 위함)하되, 앱처럼 목록에는
  // "취소됨" 상태로 남겨서 나중에 "재설정"으로 다시 걸 수 있게 한다.
  async function cancelAlarm(r) {
    const ok = await confirmDialog("이 알림을 취소하시겠습니까?", { okText: "예", cancelText: "아니오", danger: true });
    if (!ok) return;
    try { await cancelReminder(r.id); } catch {}
    addToCancelledLedger(r);
    await reload();
  }

  // "삭제"는 목록에서 완전히 없앤다(취소됨/완료됨 상태에서만 노출).
  async function deleteAlarm(r) {
    const ok = await confirmDialog("이 알림을 삭제하시겠습니까?", { okText: "예", cancelText: "아니오", danger: true });
    if (!ok) return;
    removeFromCancelledLedger(r.id);
    try { await cancelReminder(r.id); } catch {}
    await reload();
  }

  async function reload() {
    reminders = await listReminders();
    const cancelledLedger = getCancelledLedger();
    pruneDurations([...reminders.map((r) => r.id), ...cancelledLedger.map((r) => r.id)]);
    renderHourly();
    renderList(cancelledLedger);
  }

  function renderHourly() {
    const on = reminders.some((r) => r.recurrence === "hourly");
    hourlyBtn.classList.toggle("on", on);
  }

  function renderList(cancelledLedger) {
    listEl.innerHTML = "";
    const now = Date.now();
    const once = reminders.filter((r) => r.recurrence !== "hourly").map((r) => ({ ...r, cancelled: false }));
    const cancelled = cancelledLedger.map((r) => ({ ...r, cancelled: true }));
    const all = [...once, ...cancelled];
    // 앱과 동일한 정렬 규칙: 대기중은 가까운 시각순(fire_at), 취소·완료는 설정했던 시간값(분)순.
    const active = all.filter((r) => !r.cancelled && r.fire_at > now).sort((a, b) => a.fire_at - b.fire_at);
    const finished = all.filter((r) => r.cancelled || r.fire_at <= now)
      .sort((a, b) => (getDuration(a.id) ?? Infinity) - (getDuration(b.id) ?? Infinity));
    const merged = [...active, ...finished];
    if (!merged.length) {
      listEl.appendChild(el("li", { className: "empty" }, "예약된 알림이 없습니다."));
      return;
    }
    for (const r of merged) {
      const finished = r.cancelled || r.fire_at <= Date.now();
      // 가변/타임 알람을 구분하지 않고, 설정했던 시간값(분)으로 표기 — 중복 방지 덕에 값 자체가 곧 식별자 역할을 함.
      const prefixSpan = el("span", {}, `알림(${durationLabel(getDuration(r.id))}) 종료: ${fmtTime(r.fire_at)} `);
      // el()은 Object.assign으로 props를 적용하므로 "data-*"는 실제 속성으로 반영되지 않음(getAttribute로 못 읽힘) — setAttribute로 직접 설정.
      const remainSpan = el("span", { className: "remain" });
      remainSpan.setAttribute("data-fire", String(r.fire_at));
      remainSpan.setAttribute("data-cancelled", r.cancelled ? "1" : "0");
      // 앱의 셀과 동일한 상태 규칙: 대기중엔 "취소"만 동작(재설정 비활성), 취소·완료되면 "재설정"이 켜지고 "삭제"로 바뀜.
      const resetBtn = el("button", { className: "reset", textContent: "재설정", disabled: !finished, onclick: () => resetAlarm(r) });
      const actionBtn = el("button", {
        className: "cancel",
        textContent: finished ? "삭제" : "취소",
        // 초 단위 updateRemains()가 텍스트/버튼 상태만 갱신하고 onclick은 다시 안 묶으므로,
        // 렌더링 시점의 finished를 캡처하지 않고 클릭 시점에 다시 판정한다.
        onclick: () => ((r.cancelled || r.fire_at <= Date.now()) ? deleteAlarm(r) : cancelAlarm(r)),
      });
      const li = el("li", {}, [
        el("span", { className: "rmd-text" }, [prefixSpan, remainSpan]),
        el("div", { className: "rmd-actions" }, [resetBtn, actionBtn]),
      ]);
      listEl.appendChild(li);
    }
    updateRemains();
  }

  // 매초: 시계 + 카운트다운(남은시간)만 클라이언트 계산
  function updateClock() {
    clock.textContent = new Date().toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "medium" });
  }
  function updateRemains() {
    const now = Date.now();
    listEl.querySelectorAll("li").forEach((li) => {
      const span = li.querySelector(".remain");
      if (!span) return;
      const cancelled = span.getAttribute("data-cancelled") === "1";
      const fire = Number(span.getAttribute("data-fire"));
      const left = fire - now;
      const finished = cancelled || left <= 0;
      if (cancelled) {
        span.textContent = "· 취소됨";
        span.classList.add("done");
      } else if (finished) {
        span.textContent = "· 완료됨";
        span.classList.add("done");
      } else {
        span.textContent = `· 남은시간: ${fmtRemain(left)}`;
        span.classList.remove("done");
      }
      const resetBtn = li.querySelector(".reset");
      const actionBtn = li.querySelector(".cancel");
      if (resetBtn) resetBtn.disabled = !finished;
      if (actionBtn) actionBtn.textContent = finished ? "삭제" : "취소";
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
