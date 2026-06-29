// myapp service worker
// 1) 설치 가능(PWA) 요건 충족  2) 알림(local push)을 표시하는 주체

const CACHE = "myapp-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./config.js",
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

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// 페이지에서 보낸 메시지로 알림을 띄운다 (예약/지연 포함)
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "notify") {
    const delay = Math.max(0, data.delay || 0);
    const show = () =>
      self.registration.showNotification(data.title || "myapp", {
        body: data.body || "",
        icon: "./icons/icon-192.png",
        badge: "./icons/icon-192.png",
        tag: "myapp-local",
      });
    // 주의: iOS에서는 앱이 백그라운드/종료 상태이면 이 타이머가 동작하지 않을 수 있음
    event.waitUntil(delay ? new Promise((r) => setTimeout(() => show().then(r), delay)) : show());
  }
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
