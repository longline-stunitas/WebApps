// Webview Test — URL 북마크 매니저(추가/편집/삭제/순서변경).
// 항목 선택 시 새 탭으로 열기. (iframe 임베드는 대부분 사이트가 차단하므로 새 탭이 안전)
import { get, set, uid } from "../lib/store.js";
import { el, setStatus } from "../lib/ui.js";

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
  let editingId = null; // 폼이 편집 중인 항목 id (null = 신규)

  const listEl = el("div", { className: "wv-list" });

  // 추가/편집 폼
  const titleInput = el("input", { type: "text", placeholder: "타이틀" });
  const urlInput = el("input", { type: "url", placeholder: "https://example.com", inputMode: "url" });
  const formTitle = el("h3", { className: "sec" }, "북마크 추가");
  const saveBtn = el("button", { className: "btn-line", textContent: "저장", onclick: onSave });
  const resetBtn = el("button", { className: "btn-line", textContent: "비우기", onclick: resetForm });
  const form = el("div", { className: "wv-form" }, [
    titleInput,
    urlInput,
    el("div", { className: "att-actions" }, [saveBtn, resetBtn]),
  ]);

  root.appendChild(formTitle);
  root.appendChild(form);
  root.appendChild(el("h3", { className: "sec" }, "북마크"));
  root.appendChild(listEl);

  function resetForm() {
    editingId = null;
    titleInput.value = "";
    urlInput.value = "";
    formTitle.textContent = "북마크 추가";
    saveBtn.textContent = "저장";
  }

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
    resetForm();
    render();
    setStatus("저장되었습니다.");
  }

  function edit(it) {
    editingId = it.identifier;
    titleInput.value = it.title || "";
    urlInput.value = it.urlString || "";
    formTitle.textContent = "북마크 편집";
    saveBtn.textContent = "수정 적용";
    titleInput.focus();
  }

  function remove(id) {
    items = items.filter((x) => x.identifier !== id);
    save(items);
    if (editingId === id) resetForm();
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

  function render() {
    listEl.innerHTML = "";
    if (!items.length) {
      listEl.appendChild(el("div", { className: "empty" }, "북마크가 없습니다. 위에서 추가하세요."));
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
      const ctrls = el("div", { className: "wv-ctrls" }, [
        el("button", { className: "mini", textContent: "↑", title: "위로", onclick: () => move(idx, -1) }),
        el("button", { className: "mini", textContent: "↓", title: "아래로", onclick: () => move(idx, 1) }),
        el("button", { className: "mini", textContent: "편집", onclick: () => edit(it) }),
        el("button", { className: "mini danger", textContent: "삭제", onclick: () => remove(it.identifier) }),
      ]);
      listEl.appendChild(el("div", { className: "wv-item" }, [open_, ctrls]));
    });
  }

  render();
  return { unmount() { setStatus(""); } };
}
