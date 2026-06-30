// Webview Test — URL 북마크 매니저(추가/편집/삭제/순서변경).
// 추가·편집은 팝업(모달). 항목 선택 시 새 탭(폰은 인앱 사파리)으로 열기.
import { get, set, uid } from "../lib/store.js";
import { el, setStatus, confirmDialog } from "../lib/ui.js";

export const title = "Webview Test";

const KEY = "webViewTest_apps"; // [{ identifier, title, urlString }]

function load() { return get(KEY, []); }
function save(items) { set(KEY, items); }

function normalizeUrl(u) {
  const s = (u || "").trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : "https://" + s;
}

export function mount(root) {
  let items = load();
  let editingId = null; // 모달이 편집 중인 항목 id (null = 신규)

  // ── 추가/편집 모달(팝업) ──
  const titleInput = el("input", { type: "text", placeholder: "타이틀" });
  const urlInput = el("input", { type: "url", placeholder: "https://example.com", inputMode: "url" });
  const mHeading = el("h3", { className: "modal-title" }, "북마크 추가");
  const mSave = el("button", { className: "btn-line", textContent: "저장", onclick: onSave });
  const mCancel = el("button", { className: "btn-line", textContent: "취소", onclick: closeModal });
  const modalCard = el("div", { className: "modal-card" }, [
    mHeading, titleInput, urlInput,
    el("div", { className: "att-actions" }, [mCancel, mSave]),
  ]);
  const modal = el("div", {
    className: "modal", hidden: true,
    onclick: (e) => { if (e.target === modal) closeModal(); },
  }, [modalCard]);

  function openModal(it) {
    if (it) {
      editingId = it.identifier;
      mHeading.textContent = "북마크 편집";
      mSave.textContent = "수정 적용";
      titleInput.value = it.title || "";
      urlInput.value = it.urlString || "";
    } else {
      editingId = null;
      mHeading.textContent = "북마크 추가";
      mSave.textContent = "저장";
      titleInput.value = "";
      urlInput.value = "";
    }
    modal.hidden = false;
    titleInput.focus();
  }
  function closeModal() { modal.hidden = true; }

  // ── 헤더: "북마크" + ＋추가 버튼 ──
  const addBtn = el("button", { className: "mini", textContent: "＋ 추가", onclick: () => openModal(null) });
  const header = el("div", { className: "wv-header" }, [el("h3", { className: "sec" }, "북마크"), addBtn]);

  const listEl = el("div", { className: "wv-list" });

  root.appendChild(header);
  root.appendChild(listEl);
  root.appendChild(modal);

  function onSave() {
    const t = titleInput.value.trim();
    const u = normalizeUrl(urlInput.value);
    if (!t) return setStatus("타이틀을 입력하세요.");
    if (!u) return setStatus("URL을 입력하세요.");
    if (editingId) {
      const it = items.find((x) => x.identifier === editingId);
      if (it) { it.title = t; it.urlString = u; }
    } else {
      items.push({ identifier: uid(), title: t, urlString: u });
    }
    save(items);
    closeModal();
    render();
    setStatus("저장되었습니다.");
  }

  async function remove(id) {
    const it = items.find((x) => x.identifier === id);
    if (!(await confirmDialog(`'${it?.title || "이 북마크"}'를 삭제할까요?`, { okText: "삭제", danger: true }))) return;
    items = items.filter((x) => x.identifier !== id);
    save(items);
    render();
  }

  function move(idx, dir) {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    [items[idx], items[j]] = [items[j], items[idx]];
    save(items);
    render();
  }

  function open(it) {
    if (!it.urlString) return;
    window.open(it.urlString, "_blank", "noopener");
  }

  // ── 앱 안에서 iframe으로 열기 (전체화면 오버레이 + 하단 바) ──
  // 외부 사이트는 cross-origin이라 현재 URL/제목/이전이동이 제한됨(가능하면 읽고, 안 되면 폴백).
  function frameCurrentUrl(iframe, fallback) {
    try { return iframe.contentWindow.location.href; } catch { return fallback; }
  }
  function frameAutoTitle(iframe, url) {
    try { const t = iframe.contentDocument && iframe.contentDocument.title; if (t) return t; } catch {}
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "북마크"; }
  }
  function openFrame(it) {
    if (!it.urlString) return;
    const startUrl = it.urlString;
    const iframe = el("iframe", { className: "wv-frame", src: startUrl });
    // iframe 전체화면이 하단 상태줄을 가리므로, 오버레이 안에 직접 토스트로 알림.
    function frameToast(msg) {
      const t = el("div", { className: "wv-frame-toast", textContent: msg });
      overlay.appendChild(t);
      setTimeout(() => t.remove(), 1600);
    }
    const addBtn = el("button", { className: "btn-line", textContent: "＋ 즐겨찾기", onclick: () => {
      const url = frameCurrentUrl(iframe, startUrl);
      if (items.some((x) => x.urlString === url)) { frameToast("이미 추가된 페이지입니다"); return; }
      const title = frameAutoTitle(iframe, url);
      items.push({ identifier: uid(), title, urlString: url }); // 제목은 자동
      save(items);
      render();
      frameToast(`✓ '${title}' 즐겨찾기에 추가됨`);
    } });
    // iframe 뒤로가기는 탭 전체 history를 공유해 불안정(부모 앱 영향)하므로,
    // history를 건드리지 않고 '처음 연 주소로 다시 로드'한다. 외부 사이트에서도 안전.
    const homeBtn = el("button", { className: "btn-line", textContent: "↻ 처음으로", onclick: () => {
      iframe.src = startUrl;
      frameToast("처음 페이지로 돌아왔습니다.");
    } });
    const closeBtn = el("button", { className: "btn-line", textContent: "닫기", onclick: () => overlay.remove() });
    const overlay = el("div", { className: "wv-frame-overlay" }, [
      iframe,
      el("div", { className: "wv-frame-bar" }, [addBtn, homeBtn, closeBtn]),
    ]);
    document.body.appendChild(overlay);
  }

  function render() {
    listEl.innerHTML = "";
    if (!items.length) {
      listEl.appendChild(el("div", { className: "empty" }, "북마크가 없습니다. 위 ‘＋ 추가’로 등록하세요."));
      return;
    }
    items.forEach((it, idx) => {
      const open_ = el("button", {
        className: "wv-open",
        onclick: () => open(it),
      }, [
        el("span", { className: "menu-label" }, it.title || "(제목 없음)"),
        el("span", { className: "menu-desc" }, it.urlString || ""),
      ]);
      // 위치변경·편집·삭제: 타이틀 라인 오른쪽 끝
      const ctrls = el("div", { className: "wv-ctrls" }, [
        el("button", { className: "mini", textContent: "↑", title: "위로", onclick: () => move(idx, -1) }),
        el("button", { className: "mini", textContent: "↓", title: "아래로", onclick: () => move(idx, 1) }),
        el("button", { className: "mini", textContent: "편집", onclick: () => openModal(it) }),
        el("button", { className: "mini danger", textContent: "삭제", onclick: () => remove(it.identifier) }),
        el("button", { className: "mini", textContent: "iframe", title: "앱 안에서 열기", onclick: () => openFrame(it) }),
      ]);
      listEl.appendChild(el("div", { className: "wv-item" }, [open_, ctrls]));
    });
  }

  render();
  return { unmount() { setStatus(""); } };
}
