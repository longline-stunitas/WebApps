// 알림 화면 — 구 "걸음수" 화면에서 걸음수/셀룰러/충전 제외.
// 실시간 시계 · 정시 알림 토글 · 가변(N분 뒤) 알림 + 프리셋.
import { get, set } from "../lib/store.js";
import { el, setStatus, fmtRemain, fmtTime } from "../lib/ui.js";
import { isPushEnabled, enablePush, addReminder, listReminders, cancelReminder } from "../lib/push.js";

export const title = "알림";

const PRESETS = [5, 10, 15, 30, 60];
const PICKER_KEY = "alarmPickerTime"; // 마지막 선택 시:분:초 기억 (STBlankProject 가변알림과 동일한 방식)
const DURATIONS_KEY = "alarmDurations"; // { reminderId: minutes } — 서버는 fire_at만 갖고 있어 "재설정"용 원래 분값을 기기에 따로 기억해둔다.

function saveDuration(id, minutes) {
  const map = get(DURATIONS_KEY, {});
  map[id] = minutes;
  set(DURATIONS_KEY, map);
}
function getDuration(id) {
  return get(DURATIONS_KEY, {})[id];
}
// 서버 목록에 더 이상 없는 id는 기억해둘 필요 없음 — reload마다 정리.
function pruneDurations(ids) {
  const map = get(DURATIONS_KEY, {});
  const keep = new Set(ids);
  let changed = false;
  for (const k of Object.keys(map)) {
    if (!keep.has(k)) { delete map[k]; changed = true; }
  }
  if (changed) set(DURATIONS_KEY, map);
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

  // 가변 알림 추가 — 앱(STBlankProject)의 "가변 시간" 버튼처럼 가까운 예약의 남은시간을 표시.
  const variableBtn = el("button", { className: "btn-line", textContent: "가변 시간", onclick: openPicker });
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
  async function addOnce(minutes, label) {
    if (!minutes || minutes <= 0) return setStatus("분을 올바르게 입력하세요.");
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
    await addOnce(minutes, r.title);
  }

  // STBlankProject 가변알림의 "추가" 버튼과 동일한 흐름: 시:분:초 피커로 값을 고르면
  // 그 값을 목표 시각까지 남은 시간으로 환산해 addOnce로 예약한다(리스트는 아래쪽 listEl 그대로 사용).
  function openPicker() {
    const timeInput = el("input", { type: "time", step: "1", value: get(PICKER_KEY, "00:05:00") });
    const okBtn = el("button", { className: "btn-line", textContent: "확인" });
    const cancelBtn = el("button", { className: "btn-line", textContent: "취소" });
    const card = el("div", { className: "modal-card" }, [
      el("h3", { className: "modal-title" }, "가변 알림 추가"),
      timeInput,
      el("div", { className: "att-actions" }, [cancelBtn, okBtn]),
    ]);
    const layer = el("div", { className: "modal" }, [card]);
    const close = () => layer.remove();
    cancelBtn.onclick = close;
    layer.onclick = (e) => { if (e.target === layer) close(); };
    okBtn.onclick = () => {
      const parts = (timeInput.value || "").split(":").map(Number);
      const [h = 0, m = 0, s = 0] = parts;
      const minutes = h * 60 + m + s / 60;
      if (!minutes || minutes <= 0) return setStatus("시간을 올바르게 선택하세요.");
      set(PICKER_KEY, timeInput.value);
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

  async function cancel(id) {
    await cancelReminder(id);
    await reload();
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

  function renderList() {
    listEl.innerHTML = "";
    const once = reminders.filter((r) => r.recurrence !== "hourly").sort((a, b) => a.fire_at - b.fire_at);
    if (!once.length) {
      listEl.appendChild(el("li", { className: "empty" }, "예약된 알림이 없습니다."));
      return;
    }
    for (const r of once) {
      const expired = r.fire_at <= Date.now();
      // el()은 Object.assign으로 props를 적용하므로 "data-*"는 실제 속성으로 반영되지 않음(getAttribute로 못 읽힘) — setAttribute로 직접 설정.
      const remainSpan = el("span", { className: "remain" });
      remainSpan.setAttribute("data-fire", String(r.fire_at));
      // 앱의 셀과 동일한 상태 규칙: 대기중엔 "취소"만 동작(재설정 비활성), 완료되면 "재설정"이 켜지고 "삭제"로 바뀜.
      const resetBtn = el("button", { className: "reset", textContent: "재설정", disabled: !expired, onclick: () => resetAlarm(r) });
      const actionBtn = el("button", { className: "cancel", textContent: expired ? "삭제" : "취소", onclick: () => cancel(r.id) });
      const li = el("li", {}, [
        el("span", { className: "rmd-text" }, [
          el("b", {}, r.title || "알림"),
          el("span", { className: "rmd-when" }, ` ${fmtTime(r.fire_at)}`),
          remainSpan,
        ]),
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
      const fire = Number(span.getAttribute("data-fire"));
      const left = fire - now;
      const expired = left <= 0;
      if (expired) {
        span.textContent = " · 완료됨";
        span.classList.add("done");
      } else {
        span.textContent = ` · 남은 ${fmtRemain(left)}`;
        span.classList.remove("done");
      }
      const resetBtn = li.querySelector(".reset");
      const actionBtn = li.querySelector(".cancel");
      if (resetBtn) resetBtn.disabled = !expired;
      if (actionBtn) actionBtn.textContent = expired ? "삭제" : "취소";
    });
    updateVariableBtn();
  }

  // "가변 시간" 버튼에 가장 가까운 대기중 알림의 남은시간을 표시(앱의 동적 라벨과 동일).
  function updateVariableBtn() {
    const now = Date.now();
    const pending = reminders.filter((r) => r.recurrence !== "hourly" && r.fire_at > now);
    if (!pending.length) { variableBtn.textContent = "가변 시간"; return; }
    const nearest = pending.reduce((a, b) => (a.fire_at < b.fire_at ? a : b));
    variableBtn.textContent = `가변 ${fmtRemain(nearest.fire_at - now)} 남음`;
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
