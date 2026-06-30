// 알림 화면 — 구 "걸음수" 화면에서 걸음수/셀룰러/충전 제외.
// 실시간 시계 · 정시 알림 토글 · 가변(N분 뒤) 알림 + 프리셋 · 출석시간 저장.
import { get, set } from "../lib/store.js";
import { el, setStatus, fmtRemain, fmtTime } from "../lib/ui.js";
import { isPushEnabled, enablePush, addReminder, listReminders, cancelReminder } from "../lib/push.js";

export const title = "알림";

const PRESETS = [5, 10, 15, 30, 60];
const ATT_KEY = "attendanceData";

// ── 출석/입실 시간 ──
function loadAttendance() {
  return get(ATT_KEY, { attendanceTime: null, launchTime: null });
}
function isToday(d) {
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
function initAttendance() {
  // 날짜가 바뀌면(오늘이 아니면) 출석 기록 초기화 — 하루 단위
  const a = loadAttendance();
  if (a.attendanceTime && !isToday(new Date(a.attendanceTime))) {
    set(ATT_KEY, { attendanceTime: null, launchTime: null });
  }
}
function saveAttendance() {
  const a = loadAttendance();
  const now = new Date().toISOString();
  if (!a.attendanceTime) a.attendanceTime = now; // 첫번째시간(하루 최초, 고정)
  else a.launchTime = now;                        // 이후시간(누를 때마다 갱신)
  set(ATT_KEY, a);
}
function clearAttendance() {
  set(ATT_KEY, { attendanceTime: null, launchTime: null });
}
function attText(iso) {
  return iso ? new Date(iso).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "medium" }) : "없음";
}

export function mount(root) {
  initAttendance();

  let reminders = [];
  let pushOn = false;
  let pollTimer = null;
  let tickTimer = null;

  // ── DOM ──
  const clock = el("div", { className: "clock" }, "—");

  // 출석
  const attFirst = el("span", {}, "없음");
  const attLater = el("span", {}, "없음");
  const attBox = el("div", { className: "att-box" }, [
    el("div", { className: "att-row" }, [el("b", {}, "첫번째시간"), attFirst]),
    el("div", { className: "att-row" }, [el("b", {}, "이후시간"), attLater]),
    el("div", { className: "att-actions" }, [
      el("button", { className: "btn-line", textContent: "시간저장", onclick: () => { saveAttendance(); refreshAtt(); setStatus("시간이 저장되었습니다."); } }),
      el("button", { className: "btn-line danger", textContent: "데이터 지움", onclick: () => { clearAttendance(); refreshAtt(); setStatus("출석 데이터를 삭제하였습니다."); } }),
    ]),
  ]);
  function refreshAtt() {
    const a = loadAttendance();
    attFirst.textContent = attText(a.attendanceTime);
    attLater.textContent = attText(a.launchTime);
  }

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
  const presetRow = el("div", { className: "preset-row" },
    PRESETS.map((m) => el("button", { className: "preset", textContent: `${m}분`, onclick: () => addOnce(m, "타임 알람") }))
  );

  const listEl = el("ul", { className: "reminders" });

  const controls = el("div", { hidden: true }, [
    hourlyBtn,
    el("div", { className: "row" }, [minutesInput, el("span", {}, "분 뒤"), addBtn]),
    presetRow,
    listEl,
  ]);

  root.appendChild(clock);
  root.appendChild(el("h3", { className: "sec" }, "출석 시간"));
  root.appendChild(attBox);
  root.appendChild(el("h3", { className: "sec" }, "예약 알림"));
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
  refreshAtt();
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
