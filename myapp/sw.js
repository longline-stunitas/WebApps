// myapp service worker
// 1) 설치 가능(PWA) 요건 충족  2) 서버 푸시 알림 표시  3) network-first 캐싱

const CACHE = "myapp-v58";
const IMG_CACHE = "myapp-thumbs"; // 유튜브 썸네일 — 앱 버전과 무관하게 유지(네트워크 최소화)
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./config.js",
  "./app.js",
  "./lib/store.js",
  "./lib/ui.js",
  "./lib/push.js",
  "./lib/backup.js",
  "./lib/badukBoard.js",
  "./lib/sobrietyStats.js",
  "./lib/kiwoom.js",
  "./lib/kiwoomFormat.js",
  "./screens/menu.js",
  "./screens/alarm.js",
  "./screens/webview.js",
  "./screens/youtube.js",
  "./screens/baduk.js",
  "./screens/sobriety.js",
  "./screens/kiwoom.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  // GitHub Pages가 max-age=600 캐시 헤더를 붙이므로 cache:"reload"로 브라우저 HTTP 캐시를 우회해야
  // addAll이 진짜 새 배포 내용을 받아온다(안 그러면 최근 10분 내 방문 이력이 있는 파일은 옛 내용 그대로 프리캐시됨).
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" }))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== IMG_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 네트워크 우선(network-first): 온라인이면 항상 최신을 받고 캐시를 갱신,
// 오프라인이면 캐시로 폴백. → 화면 수정이 앱 재실행만으로 즉시 반영됨.
// cache:"no-cache"로 브라우저 HTTP 캐시(GitHub Pages max-age=600)를 건너뛰고 매번 서버에 조건부 요청
// (If-None-Match)을 실제로 보낸다 — 안 그러면 fetch()가 "네트워크 우선"인 척하면서도 실은
// 로컬 HTTP 캐시가 아직 안 만료된 파일을 그대로 반환해, 파일별로 갱신 여부가 들쭉날쭉해진다
// (config.js만 새로 받아져 버전은 올라갔는데 다른 화면 js는 옛 내용인 버그의 원인).
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 유튜브 썸네일: cache-first — 한 번 받으면 캐시에서 제공해 네트워크 트래픽 최소화.
  if (url.hostname === "i.ytimg.com") {
    event.respondWith(
      caches.open(IMG_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
          return res;
        } catch (e) {
          return hit || Response.error();
        }
      })
    );
    return;
  }

  // 동일 출처 GET만 처리 (Worker API 등 교차 출처 요청은 그대로 통과)
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(req, { cache: "no-cache" });
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
