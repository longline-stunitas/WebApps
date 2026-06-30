// 유튜브 강좌 타이틀리스트 — 재생목록 관리 + worker 프록시로 영상 제목 로드 + 재생.
// 재생목록(제목+ID)은 사용자가 직접 추가. 영상 목록은 YouTube Data API(worker secret 키)로 자동 로드.
import { get, set, remove } from "../lib/store.js";
import { el, setStatus } from "../lib/ui.js";
import { fetchYoutubePlaylist } from "../lib/push.js";

export const title = "유튜브 강좌";

const PL_KEY = "yt_playlists";    // [{ id, title }]
const LAST_KEY = "yt_lastPlaylist";
const THUMB_KEY = "yt_showThumb";
const vidKey = (id) => "yt_videos_" + id;

function loadPlaylists() { return get(PL_KEY, []); }
function savePlaylists(p) { set(PL_KEY, p); }

export function mount(root) {
  let playlists = loadPlaylists();
  let currentId = get(LAST_KEY, null);
  let showThumb = get(THUMB_KEY, true);

  // ── 재생목록 선택/관리 ──
  const select = el("select", { className: "yt-select", onchange: () => selectPlaylist(select.value) });
  const refreshBtn = el("button", { className: "mini", textContent: "↻ 새로고침", onclick: () => loadVideos(currentId, true) });
  const thumbBtn = el("button", { className: "mini", onclick: toggleThumb });
  const editBtn = el("button", { className: "mini", textContent: "편집", onclick: editCurrent });
  const delBtn = el("button", { className: "mini danger", textContent: "삭제", onclick: deleteCurrent });
  const topRow = el("div", { className: "yt-top" }, [select, refreshBtn, thumbBtn, editBtn, delBtn]);

  // 재생목록 추가/편집 폼
  const titleInput = el("input", { type: "text", placeholder: "재생목록 제목" });
  const idInput = el("input", { type: "text", placeholder: "재생목록 ID (PL... 형식)" });
  const formTitle = el("h3", { className: "sec" }, "재생목록 추가");
  const saveBtn = el("button", { className: "btn-line", textContent: "저장", onclick: onSavePlaylist });
  const resetBtn = el("button", { className: "btn-line", textContent: "비우기", onclick: resetForm });
  const form = el("div", { className: "wv-form" }, [
    titleInput, idInput,
    el("div", { className: "att-actions" }, [saveBtn, resetBtn]),
  ]);
  let editingId = null;

  const listEl = el("div", { className: "yt-list" });

  root.appendChild(formTitle);
  root.appendChild(form);
  root.appendChild(el("h3", { className: "sec" }, "재생목록 / 영상" ));
  root.appendChild(topRow);
  root.appendChild(listEl);

  // ── 재생목록 폼 ──
  function resetForm() {
    editingId = null;
    titleInput.value = "";
    idInput.value = "";
    formTitle.textContent = "재생목록 추가";
    saveBtn.textContent = "저장";
  }
  function onSavePlaylist() {
    const t = titleInput.value.trim();
    const id = idInput.value.trim();
    if (!t) return setStatus("제목을 입력하세요.");
    if (!id) return setStatus("재생목록 ID를 입력하세요.");
    if (editingId) {
      const p = playlists.find((x) => x.id === editingId);
      if (p) {
        // ID가 바뀌면 캐시 무효화
        if (p.id !== id) remove(vidKey(p.id));
        p.title = t; p.id = id;
      }
    } else {
      if (playlists.some((x) => x.id === id)) return setStatus("이미 있는 재생목록 ID입니다.");
      playlists.push({ id, title: t });
    }
    savePlaylists(playlists);
    resetForm();
    currentId = id;
    set(LAST_KEY, currentId);
    renderSelect();
    loadVideos(currentId, false);
    setStatus("저장되었습니다.");
  }
  function editCurrent() {
    const p = playlists.find((x) => x.id === currentId);
    if (!p) return setStatus("선택된 재생목록이 없습니다.");
    editingId = p.id;
    titleInput.value = p.title;
    idInput.value = p.id;
    formTitle.textContent = "재생목록 편집";
    saveBtn.textContent = "수정 적용";
  }
  function deleteCurrent() {
    const p = playlists.find((x) => x.id === currentId);
    if (!p) return setStatus("선택된 재생목록이 없습니다.");
    playlists = playlists.filter((x) => x.id !== p.id);
    remove(vidKey(p.id));
    savePlaylists(playlists);
    currentId = playlists[0]?.id || null;
    set(LAST_KEY, currentId);
    renderSelect();
    if (currentId) loadVideos(currentId, false); else listEl.innerHTML = "";
    setStatus("삭제되었습니다.");
  }

  function toggleThumb() {
    showThumb = !showThumb;
    set(THUMB_KEY, showThumb);
    thumbBtn.textContent = showThumb ? "썸네일 끄기" : "썸네일 켜기";
    renderVideos();
  }

  function renderSelect() {
    select.innerHTML = "";
    if (!playlists.length) {
      select.appendChild(el("option", { value: "", textContent: "재생목록을 추가하세요" }));
      currentId = null;
      return;
    }
    for (const p of playlists) {
      select.appendChild(el("option", { value: p.id, textContent: p.title }));
    }
    if (!currentId || !playlists.some((x) => x.id === currentId)) currentId = playlists[0].id;
    select.value = currentId;
  }

  function selectPlaylist(id) {
    if (!id) return;
    currentId = id;
    set(LAST_KEY, id);
    loadVideos(id, false);
  }

  // ── 영상 로드 ──
  let videos = [];
  async function loadVideos(id, force) {
    if (!id) { listEl.innerHTML = ""; return; }
    const cached = get(vidKey(id), null);
    if (cached && !force) {
      videos = cached.items || [];
      renderVideos();
      return;
    }
    listEl.innerHTML = "";
    listEl.appendChild(el("div", { className: "empty" }, "불러오는 중…"));
    try {
      const { items, hiddenCount } = await fetchYoutubePlaylist(id);
      videos = items || [];
      set(vidKey(id), { items: videos, hiddenCount, ts: Date.now() });
      renderVideos();
      setStatus(`${videos.length}개 영상${hiddenCount ? ` (숨김 ${hiddenCount})` : ""}`);
    } catch (e) {
      listEl.innerHTML = "";
      listEl.appendChild(el("div", { className: "empty" }, "로드 실패: " + e.message));
      setStatus("로드 실패: " + e.message);
    }
  }

  function renderVideos() {
    listEl.innerHTML = "";
    if (!videos.length) {
      listEl.appendChild(el("div", { className: "empty" }, "영상이 없습니다. 새로고침하거나 재생목록 ID를 확인하세요."));
      return;
    }
    videos.forEach((v, i) => {
      const children = [];
      if (showThumb && v.thumbnail) {
        children.push(el("img", { className: "yt-thumb", src: v.thumbnail, loading: "lazy", alt: "" }));
      }
      children.push(el("span", { className: "yt-vtitle" }, `${i + 1}. ${v.title}`));
      listEl.appendChild(el("button", {
        className: "yt-item",
        onclick: () => window.open(`https://www.youtube.com/watch?v=${v.videoId}`, "_blank", "noopener"),
      }, children));
    });
  }

  // ── 초기화 ──
  thumbBtn.textContent = showThumb ? "썸네일 끄기" : "썸네일 켜기";
  renderSelect();
  if (currentId) loadVideos(currentId, false);
  else listEl.appendChild(el("div", { className: "empty" }, "위에서 재생목록(제목+ID)을 추가하세요."));

  return { unmount() { setStatus(""); } };
}
