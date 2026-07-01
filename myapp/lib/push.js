// Web Push 구독 + 예약 알림 API + 유튜브 프록시 호출.
// 서버: push-worker (Cloudflare). 설정은 config.js의 window.PUSH_CONFIG.

const cfg = window.PUSH_CONFIG || {};
const API = (cfg.WORKER_URL || "").replace(/\/$/, "");

let swReg = null;

export function configOk() {
  return !!API && !API.includes("PUT_WORKER_URL");
}

export async function registerSW() {
  if (!("serviceWorker" in navigator)) return null;
  swReg = await navigator.serviceWorker.register("./sw.js");
  await navigator.serviceWorker.ready;
  return swReg;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function getSubscription() {
  // app.js가 registerSW()를 fire-and-forget으로 호출하므로, 화면이 이보다 먼저 마운트되면
  // swReg가 아직 null일 수 있다(특히 콜드 스타트 직후). 여기서 직접 기다려 레이스를 없앤다.
  if (!swReg) await registerSW();
  if (!swReg) return null;
  return swReg.pushManager.getSubscription();
}

export async function currentEndpoint() {
  const sub = await getSubscription();
  return sub ? sub.endpoint : null;
}

export async function isPushEnabled() {
  return !!(await getSubscription());
}

// 권한 요청 + 구독 + 서버 등록. { ok, message } 반환.
export async function enablePush() {
  if (!configOk()) return { ok: false, message: "config.js의 WORKER_URL을 먼저 설정하세요." };
  if (!("Notification" in window) || !("PushManager" in window)) {
    return { ok: false, message: "이 브라우저는 푸시를 지원하지 않습니다. (iOS는 16.4+ & 홈 화면 추가 필요)" };
  }
  if (!swReg) await registerSW();
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    return { ok: false, message: "알림 권한이 거부되었습니다. (iOS는 홈 화면에 추가한 앱에서만 가능)" };
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
    return { ok: true, message: "알림이 켜졌습니다." };
  } catch (e) {
    return { ok: false, message: "구독 실패: " + e.message };
  }
}

// 예약 추가. payload 예) { type:"once", minutes, title, body } | { type:"hourly" }
export async function addReminder(payload) {
  const endpoint = await currentEndpoint();
  if (!endpoint) throw new Error("먼저 알림을 켜세요.");
  const res = await fetch(`${API}/api/reminders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, ...payload }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listReminders() {
  const endpoint = await currentEndpoint();
  if (!endpoint) return [];
  const res = await fetch(`${API}/api/reminders?endpoint=${encodeURIComponent(endpoint)}`);
  if (!res.ok) return [];
  const { reminders } = await res.json();
  return reminders || [];
}

export async function cancelReminder(id) {
  const res = await fetch(`${API}/api/reminders?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  return res.ok;
}

// 유튜브 재생목록 영상 목록. { items, hiddenCount } 반환. (API 키는 worker secret)
export async function fetchYoutubePlaylist(playlistId) {
  const res = await fetch(`${API}/api/youtube/playlist?playlistId=${encodeURIComponent(playlistId)}`);
  if (!res.ok) {
    let detail = "";
    try {
      const e = await res.json();
      detail = e.error || "";
    } catch {}
    if (res.status === 503) throw new Error("유튜브 API 키가 worker에 설정되지 않았습니다. (wrangler secret put YOUTUBE_API_KEY)");
    throw new Error(detail || `로드 실패 (${res.status})`);
  }
  return res.json();
}
