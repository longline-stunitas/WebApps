// 라우터 + 부트스트랩. 해시 기반 라우팅(#/menu, #/alarm, #/webview, #/youtube).
// GitHub Pages 하위경로에서도 안전하도록 history API 대신 해시를 사용.
import { registerSW } from "./lib/push.js";
import { setStatus } from "./lib/ui.js";
import { get } from "./lib/store.js";
import * as menu from "./screens/menu.js";
import * as alarm from "./screens/alarm.js";
import * as webview from "./screens/webview.js";
import * as youtube from "./screens/youtube.js";

const screens = { menu, alarm, webview, youtube };

const appEl = document.getElementById("app");
const titleEl = document.getElementById("screen-title");
const backBtn = document.getElementById("back-btn");

let current = null; // 현재 화면의 { unmount } 핸들

function parseHash() {
  const h = location.hash.replace(/^#\/?/, "").trim();
  return h && screens[h] ? h : null;
}

function render() {
  const key = parseHash() || "menu";
  const screen = screens[key];

  if (current && typeof current.unmount === "function") current.unmount();
  appEl.innerHTML = "";
  setStatus("");

  titleEl.textContent = screen.title || "myapp";
  backBtn.hidden = key === "menu";
  appEl.classList.toggle("flush-top", key === "youtube"); // 유튜브는 상단 sticky를 위해 패딩 제거

  current = screen.mount(appEl) || {};
  appEl.scrollTop = 0;
}

// 배포 버전을 topbar에 항상 표시 — 폰에서 반영 여부 확인용.
const verEl = document.getElementById("app-ver");
if (verEl) verEl.textContent = (window.PUSH_CONFIG && window.PUSH_CONFIG.APP_VERSION) || "";

backBtn.addEventListener("click", () => { location.hash = "#/menu"; });
window.addEventListener("hashchange", render);

// iOS 핀치 줌 방지 (viewport·touch-action 보조)
document.addEventListener("gesturestart", (e) => e.preventDefault());

window.addEventListener("load", () => {
  // SW 등록은 백그라운드로 (첫 화면 렌더를 막지 않음). 푸시 사용 시 enablePush가 등록을 보장.
  registerSW().catch(() => {});

  // 해시 없이 처음 열렸을 때만 "첫 화면 설정" 적용
  if (!location.hash) {
    const first = get("firstViewInfo", "none");
    if (first && first !== "none" && screens[first]) {
      location.hash = "#/" + first; // hashchange → render
      return;
    }
  }
  render();
});
