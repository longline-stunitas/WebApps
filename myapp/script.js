const greeting = document.getElementById("greeting");
const cta = document.getElementById("cta");
const statusEl = document.getElementById("status");
const enableBtn = document.getElementById("enable-push");
const controls = document.getElementById("push-controls");
const minutesInput = document.getElementById("minutes");
const addOnceBtn = document.getElementById("add-once");
const addHourlyBtn = document.getElementById("add-hourly");
const listEl = document.getElementById("reminder-list");

const cfg = window.PUSH_CONFIG || {};
const API = (cfg.WORKER_URL || "").replace(/\/$/, "");

function setStatus(msg) {
  statusEl.textContent = msg;
}

// ── 카운터 (데모) ──
let count = 0;
cta.addEventListener("click", () => {
  count += 1;
  greeting.textContent = `Hello, World! (${count})`;
});

// ── 유틸: VAPID base64url → Uint8Array ──
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// ── 서비스워커 등록 ──
let swReg = null;
async function initSW() {
  if (!("serviceWorker" in navigator)) {
    setStatus("이 브라우저는 서비스워커를 지원하지 않습니다.");
    return;
  }
  swReg = await navigator.serviceWorker.register("sw.js");
  await navigator.serviceWorker.ready;

  // 이미 구독돼 있으면 컨트롤 표시 + 목록 로드
  const sub = await swReg.pushManager.getSubscription();
  if (sub) {
    showControls();
    loadReminders();
  }
}

function configOk() {
  if (!API || API.includes("PUT_WORKER_URL")) {
    setStatus("config.js의 WORKER_URL을 먼저 설정하세요.");
    return false;
  }
  return true;
}

function showControls() {
  controls.hidden = false;
  enableBtn.hidden = true;
}

async function currentEndpoint() {
  const sub = await swReg.pushManager.getSubscription();
  return sub ? sub.endpoint : null;
}

// ── 알림 켜기: 권한 + 구독 + 서버 등록 ──
async function enablePush() {
  if (!configOk()) return;
  if (!("Notification" in window) || !("PushManager" in window)) {
    setStatus("이 브라우저는 푸시를 지원하지 않습니다. (iOS는 16.4+ & 홈 화면 추가 필요)");
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    setStatus("알림 권한이 거부되었습니다. (iOS는 홈 화면에 추가한 앱에서만 가능)");
    return;
  }
  try {
    let sub = await swReg.pushManager.getSubscription();
    if (!sub) {
      sub = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(cfg.VAPID_PUBLIC_KEY),
      });
    }
    const res = await fetch(`${API}/api/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
    });
    if (!res.ok) throw new Error(await res.text());
    showControls();
    setStatus("알림이 켜졌습니다.");
    loadReminders();
  } catch (e) {
    setStatus("구독 실패: " + e.message);
  }
}

// ── 예약 추가 ──
async function addReminder(payload) {
  if (!configOk()) return;
  const endpoint = await currentEndpoint();
  if (!endpoint) return setStatus("먼저 알림을 켜세요.");
  const res = await fetch(`${API}/api/reminders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, ...payload }),
  });
  if (!res.ok) return setStatus("예약 실패: " + (await res.text()));
  setStatus("예약되었습니다.");
  loadReminders();
}

// ── 예약 목록 ──
async function loadReminders() {
  if (!configOk()) return;
  const endpoint = await currentEndpoint();
  if (!endpoint) return;
  const res = await fetch(`${API}/api/reminders?endpoint=${encodeURIComponent(endpoint)}`);
  if (!res.ok) return;
  const { reminders } = await res.json();
  renderReminders(reminders || []);
}

function renderReminders(reminders) {
  listEl.innerHTML = "";
  if (!reminders.length) {
    listEl.innerHTML = '<li class="empty">예약된 알림이 없습니다.</li>';
    return;
  }
  for (const r of reminders) {
    const when =
      r.recurrence === "hourly"
        ? "매 정시"
        : new Date(r.fire_at).toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" });
    const li = document.createElement("li");
    li.innerHTML = `<span>${when} · ${r.title}</span>`;
    const btn = document.createElement("button");
    btn.textContent = "취소";
    btn.className = "cancel";
    btn.addEventListener("click", () => cancelReminder(r.id));
    li.appendChild(btn);
    listEl.appendChild(li);
  }
}

async function cancelReminder(id) {
  const res = await fetch(`${API}/api/reminders?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (res.ok) loadReminders();
}

// ── 이벤트 바인딩 ──
enableBtn.addEventListener("click", enablePush);
addOnceBtn.addEventListener("click", () => {
  const m = parseInt(minutesInput.value, 10);
  if (!m || m <= 0) return setStatus("분을 올바르게 입력하세요.");
  addReminder({ type: "once", minutes: m });
});
addHourlyBtn.addEventListener("click", () => addReminder({ type: "hourly" }));

window.addEventListener("load", initSW);
