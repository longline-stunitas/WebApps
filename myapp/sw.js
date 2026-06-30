// myapp service worker
// 1) 설치 가능(PWA) 요건 충족  2) 서버 푸시 알림 표시  3) network-first 캐싱

const CACHE = "myapp-v10";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./config.js",
  "./app.js",
  "./lib/store.js",
  "./lib/ui.js",
  "./lib/push.js",
  "./screens/menu.js",
  "./screens/alarm.js",
  "./screens/webview.js",
  "./screens/youtube.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 네트워크 우선(network-first): 온라인이면 항상 최신을 받고 캐시를 갱신,
// 오프라인이면 캐시로 폴백. → 화면 수정이 앱 재실행만으로 즉시 반영됨.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // 동일 출처 GET만 처리 (Worker API 등 교차 출처 요청은 그대로 통과)
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (e) {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") {
          const idx = await caches.match("./index.html");
          if (idx) return idx;
        }
        throw e;
      }
    })()
  );
});

// 서버(Cloudflare Worker)가 보낸 Web Push 수신 → 앱이 종료돼 있어도 동작
self.addEventListener("push", (event) => {
  let data = { title: "myapp", body: "" };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    if (event.data) data = { title: "myapp", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "myapp", {
      body: data.body || "",
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      data,
    })
  );
});

// 알림 클릭 시 앱으로 포커스
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      for (const c of cs) {
        if ("focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./index.html");
    })
  );
});
