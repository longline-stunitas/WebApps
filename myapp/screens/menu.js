// 메인 메뉴 — 화면 선택 리스트 + 첫 화면 설정(★).
import { get, set } from "../lib/store.js";
import { el, navigate } from "../lib/ui.js";

export const title = "myapp";

export const MENU = [
  { key: "alarm", label: "알림", desc: "시계 · 정시/가변 알림 · 출석시간" },
  { key: "webview", label: "Webview Test", desc: "URL 북마크 열기" },
  { key: "youtube", label: "유튜브 강좌 타이틀리스트", desc: "재생목록 영상 제목 보기/재생" },
];

export function mount(root) {
  function draw() {
    root.innerHTML = "";
    const firstView = get("firstViewInfo", "none");

    const hint = el("p", { className: "hint" }, "항목을 누르면 이동합니다. ★ 는 앱을 켜면 처음 뜨는 화면입니다.");
    root.appendChild(hint);

    const list = el("div", { className: "menu-list" });
    for (const m of MENU) {
      const isFirst = firstView === m.key;

      const go = el("button", {
        className: "menu-go",
        onclick: () => navigate(m.key),
      }, [
        el("span", { className: "menu-label" }, m.label),
        el("span", { className: "menu-desc" }, m.desc),
      ]);

      const star = el("button", {
        className: "menu-star" + (isFirst ? " on" : ""),
        textContent: isFirst ? "★" : "☆",
        title: "첫 화면으로 설정/해제",
        onclick: () => {
          const cur = get("firstViewInfo", "none");
          set("firstViewInfo", cur === m.key ? "none" : m.key);
          draw();
        },
      });

      list.appendChild(el("div", { className: "menu-item" }, [go, star]));
    }
    root.appendChild(list);

    // 배포 버전 표시 — 폰에서 이 숫자로 반영 여부를 확인.
    const ver = (window.PUSH_CONFIG && window.PUSH_CONFIG.APP_VERSION) || "?";
    root.appendChild(el("p", { className: "ver-tag" }, `버전 ${ver}`));
  }

  draw();
  return {};
}
