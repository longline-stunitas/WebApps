// 알림 화면 — 구 "걸음수" 화면에서 걸음수/셀룰러/충전 제외.
// 실시간 시계 · 정시 알림 토글 · 가변(N분 뒤) 알림 + 프리셋.
import { get, set } from "../lib/store.js";
import { el, setStatus, fmtRemain, fmtTime } from "../lib/ui.js";
import { isPushEnabled, enablePush, addReminder, listReminders, cancelReminder } from "../lib/push.js";

export const title = "알림";

const PRESETS = [5, 10, 15, 30, 60];
const PICKER_KEY = "alarmPickerTime"; // 마지막 선택 시:분:초 기억 (STBlankProject 가변알림과 동일한 방식)

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

  // 정시 알림 토글
  const hourlyBtn = el("button", { className: "btn-line", textContent: "정시 알림", onclick: toggleHourly });

  // 가변 알림 추가
  const minutesInput = el("input", { type: "number", min: "1", value: "5", inputMode: "numeric" });
  const addBtn = el("button", { className: "btn-line", textContent: "예약", onclick: () => addOnce(parseInt(minutesInput.value, 10), "가변 알림") });
  const pickerBtn = el("button", { className: "btn-line", textContent: "추가", onclick: openPicker });
  const presetRow = el("div", { className: "preset-row" },
    PRESETS.map((m) => el("button", { className: "preset", textContent: `${m}분`, onclick: () => addOnce(m, "타임 알람") }))
  );

  const listEl = el("ul", { className: "reminders" });

  const controls = el("div", { hidden: true }, [
    hourlyBtn,
    el("div", { className: "row" }, [
      minutesInput,
      el("span", {}, "분 뒤"),
      el("div", { className: "row-btns" }, [addBtn, pickerBtn]),
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
      await addReminder({ type: "once", minutes, title: label, body: `${minutes}분 뒤 알림입니다.` });
      setStatus(`${minutes}분 뒤로 예약되었습니다.`);
      await reload();
    } catch (e) {
      setStatus("예약 실패: " + e.message);
    }
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
    renderHourly();
    renderList();
  }

  function renderHourly() {
    const on = reminders.some((r) => r.recurrence === "hourly");
    hourlyBtn.textContent = on ? "정시 알림 수신중 (끄기)" : "매 정시 알림 켜기";
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
      const remainSpan = el("span", { className: "remain", "data-fire": String(r.fire_at) });
      const li = el("li", {}, [
        el("span", { className: "rmd-text" }, [
          el("b", {}, r.title || "알림"),
          el("span", { className: "rmd-when" }, ` ${fmtTime(r.fire_at)}`),
          remainSpan,
        ]),
        el("button", { className: "cancel", textContent: "취소", onclick: () => cancel(r.id) }),
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
    listEl.querySelectorAll(".remain").forEach((span) => {
      const fire = Number(span.getAttribute("data-fire"));
      const left = fire - now;
      if (left <= 0) {
        span.textContent = " · 완료됨";
        span.classList.add("done");
      } else {
        span.textContent = ` · 남은 ${fmtRemain(left)}`;
        span.classList.remove("done");
      }
    });
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
