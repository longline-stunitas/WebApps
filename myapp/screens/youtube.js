// 유튜브 강좌 타이틀리스트 — 원본 VideoRecord 화면을 PWA로 재현.
// 재생목록 관리 + worker 프록시 영상 로드 + 증분 새로고침 + 정렬 + 영상별 상태(중요/시청횟수/메모/NEW).
import { get, set, remove } from "../lib/store.js";
import { el, setStatus } from "../lib/ui.js";
import { fetchYoutubePlaylist } from "../lib/push.js";

export const title = "유튜브 강좌";

const PL_KEY = "yt_playlists";    // [{ id, title }]
const LAST_KEY = "yt_lastPlaylist";
const THUMB_KEY = "yt_showThumb";
const SORT_KEY = "yt_sort";
const SEED_KEY = "yt_seeded";     // 시드 1회 적용 플래그
const vidKey = (id) => "yt_videos_" + id; // { items, hiddenCount, ts, lastShowVideoId }

// 최초 1회 기본 재생목록 — 원본 앱(STBlankProject)의 "쉬운바둑" 채널 목록.
// 재생목록 ID는 공개 정보라 코드에 둬도 안전(API 키와 다름).
const SEED_PLAYLISTS = [
  { title: "[쉬운바둑] 포석강의/초반50수", id: "PLtblfdKPIVK76hvoaDDS_Fi5sL3kE1WbR" },
  { title: "[쉬운바둑] 행마와맥", id: "PLtblfdKPIVK4W_y8SMJ8jqDFtEyGfpzVQ" },
  { title: "[쉬운바둑] 실전에 잘 나오는 전투수법", id: "PLtblfdKPIVK7qMgBFhDutCiFps4QhvN7s" },
  { title: "[쉬운바둑] 절대 두면 안되는 하수의 행마", id: "PLtblfdKPIVK5SRFWOXgdRR9vLgVfWvBni" },
  { title: "[쉬운바둑] 실전에 꼭 나오는 (엑기스)", id: "PLtblfdKPIVK7kL1GLGF6YZW3bUEq8fbC-" },
  { title: "[쉬운바둑] 실전행마", id: "PLtblfdKPIVK7gYgFTc5k3RS50rZ0BZLNy" },
  { title: "[쉬운바둑] 유단자로 가는 중반전투", id: "PLtblfdKPIVK5pVwzQjRfniQcdQf5bz9KZ" },
  { title: "[쉬운바둑] 바둑의기술", id: "PLtblfdKPIVK5I5hafEEh5RrHcTC-87Qjl" },
  { title: "[쉬운바둑] 실전사활", id: "PLtblfdKPIVK63ynq5H3bXw7gGKyJZ-eXZ" },
  { title: "[쉬운바둑] 인공지능(Ai)과 함께", id: "PLtblfdKPIVK5_pdlIMM72sC0j_3kpEEME" },
  { title: "[쉬운바둑] 화점정석 최신판(AI)", id: "PLtblfdKPIVK6QzQ05wvvY0shunyDOek64" },
  { title: "[쉬운바둑] 화점정석", id: "PLtblfdKPIVK75RXuj8G_GPPtVOzoQolRl" },
  { title: "[쉬운바둑] 소목정석", id: "PLtblfdKPIVK6k6ndJT0dv9VKvDUd3FOP5" },
  { title: "[쉬운바둑] 외목정석", id: "PLtblfdKPIVK4PZYjHNqJoR77VhM5eKSM_" },
  { title: "[쉬운바둑] 끝내기강좌", id: "PLtblfdKPIVK56NvW9nNSO3Fu5FiLJFrNs" },
  { title: "[쉬운바둑] 후절수", id: "PLtblfdKPIVK5gpNZD5hvT3FzC0uAkt6GM" },
  { title: "[쉬운바둑] 귀곡사", id: "PLtblfdKPIVK7H7JVNzFHV-b7KeoozVsB3" },
  { title: "[쉬운바둑] 중,고급 바둑문제 모음", id: "PLtblfdKPIVK6euyXC4TOP_hPScHIHTTH9" },
  { title: "[쉬운바둑] 바둑문제 (딱 1문제씩)", id: "PLtblfdKPIVK7X5Z7gFC7ObOScyDvtSUWj" },
  { title: "[쉬운바둑] 집속의 수", id: "PLtblfdKPIVK7_7d8PmEKyoP5gRyJCuMXX" },
  { title: "[쉬운바둑] 벌어지는 일", id: "PLtblfdKPIVK4Mhy7M6KrfiYUIRCzYLCTX" },
  { title: "[쉬운바둑] 초급사활 (10~18급)", id: "PLtblfdKPIVK5v37A5UMQoO-ptEV5eIB1P" },
  { title: "[쉬운바둑] 중급사활 (3급~10급)", id: "PLtblfdKPIVK7o65yDV1xJzwnKFryg6j4R" },
  { title: "[쉬운바둑] 고급사활 (2급~4단)", id: "PLtblfdKPIVK7Y0hgqV-em7LNd64xDR-UO" },
  { title: "[쉬운바둑] 유단자사활 (타이젬3단이상)", id: "PLtblfdKPIVK7XpGMQTUJtOZHQjZ-MbycF" },
  { title: "[쉬운바둑] 됫박형 사활 한방에 끝!", id: "PLtblfdKPIVK5cK9PPtDexYsPrvkJZdr1h" },
  { title: "[쉬운바둑] 수상전", id: "PLtblfdKPIVK7EAfuPyor4WhKyHf7tJLL8" },
  { title: "[쉬운바둑] 귀삼수", id: "PLtblfdKPIVK7ApQfa33wsJBgLAaOMK_5k" },
  { title: "[쉬운바둑] 우리 5단 갑시다!", id: "PLtblfdKPIVK5gJeLEU59OOQeOe7u14gxP" },
  { title: "[쉬운바둑] 바둑강좌 (자석바둑판)", id: "PLtblfdKPIVK6sTpZgQzUd2oCblO6EQowh" },
  { title: "[쉬운바둑] 묘수풀이", id: "PLtblfdKPIVK4DjSw35HXo4JzcFNKHHP3g" },
  { title: "[쉬운바둑] 형세판단 배우기", id: "PLtblfdKPIVK6A0GVd4zahfq382EMpIitv" },
  { title: "[쉬운바둑] 쉬운바둑 추천영상 (이건 꼭 봐야 돼!)", id: "PLtblfdKPIVK4X2zZjdDrxidr3CzZRywHe" },
  { title: "[쉬운바둑] 함정수, 무리수", id: "PLtblfdKPIVK6lCvP0wjYKo7GCwae7RZ12" },
  { title: "[쉬운바둑] 하루 한판~", id: "PLtblfdKPIVK7KcK9Wq-OPx34MJ0wiV7KH" },
  { title: "[쉬운바둑] [사활, 수상전] 문제풀이", id: "PLtblfdKPIVK7zJZlQ9K914n8sJBcLmtkd" },
  { title: "[쉬운바둑] 1:1 개인레슨", id: "PLtblfdKPIVK6O7X3qQE0SHPRfv-mH1Evr" },
  { title: "[쉬운바둑] 프로대국 하이라이트", id: "PLtblfdKPIVK48dpPYlB3eEhoAEIKVQ5Pw" },
  { title: "[쉬운바둑] 기보복기/실시간/구독자질문", id: "PLtblfdKPIVK6UfdS34HLrkVahK_YBOspz" },
  { title: "[쉬운바둑] 바둑이야기 그리고 리뷰", id: "PLtblfdKPIVK7iYGdMPFQcSxjSbGqkyuU0" },
  { title: "[쉬운바둑] 바둑학원 강의영상", id: "PLtblfdKPIVK5WqoEaeCg-HmSS_tOTnfJ_" },
  { title: "[쉬운바둑] 법률방송 방영본", id: "PLtblfdKPIVK4dgu6Nagb9LHiIv_PJ9upG" },
  { title: "[쉬운바둑] 프로기보해설", id: "PLtblfdKPIVK6Hc9krpRCE_Y4S6-LDVcxD" },
];

const SORTS = [
  { key: "normal", label: "기본순" },
  { key: "reverse", label: "역순" },
  { key: "important", label: "중요 먼저" },
  { key: "viewCount", label: "많이 본 순" },
  { key: "title", label: "제목순" },
  { key: "memo", label: "메모 먼저" },
];

function loadPlaylists() {
  const p = get(PL_KEY, null);
  // 최초 실행(키 자체가 없음)일 때만 시드 적용.
  // 사용자가 모두 지운 경우([])는 SEED_KEY 플래그로 재시드를 막는다.
  if (p === null && !get(SEED_KEY, false)) {
    const seed = SEED_PLAYLISTS.slice();
    set(PL_KEY, seed);
    set(SEED_KEY, true);
    return seed;
  }
  return p || [];
}
function savePlaylists(p) { set(PL_KEY, p); }

function nowISO() { return new Date().toISOString(); }

// API 응답 항목 + 기존 사용자 상태 병합
function normVideo(it, base = {}) {
  return {
    videoId: it.videoId,
    title: it.title,
    thumbnail: it.thumbnail ?? null,
    position: it.position ?? null,
    important: base.important ?? false,
    showCount: base.showCount ?? 0,
    memo: base.memo ?? "",
    createDate: base.createDate ?? null, // 값 있으면 NEW
    lastShowTime: base.lastShowTime ?? null,
  };
}

// 표시용 정렬(저장 순서는 바꾸지 않음)
function sortVideos(items, kind) {
  const a = items.slice();
  switch (kind) {
    case "reverse": return a.reverse();
    case "important": return a.sort((x, y) => (y.important ? 1 : 0) - (x.important ? 1 : 0));
    case "viewCount": return a.sort((x, y) => y.showCount - x.showCount);
    case "title": return a.sort((x, y) => (x.title || "").localeCompare(y.title || "", "ko"));
    case "memo": return a.sort((x, y) => (y.memo ? 1 : 0) - (x.memo ? 1 : 0));
    default: return a; // normal
  }
}

export function mount(root) {
  let playlists = loadPlaylists();
  let currentId = get(LAST_KEY, null);
  let showThumb = get(THUMB_KEY, true);
  let sortKind = get(SORT_KEY, "normal");
  let data = null;        // 현재 재생목록의 { items, hiddenCount, ts, lastShowVideoId }
  let expandedId = null;  // 펼친 영상 videoId
  let editingId = null;   // 재생목록 폼이 편집 중인 id

  // ── 재생목록 추가/편집 모달(팝업) ──
  const mTitle = el("input", { type: "text", placeholder: "재생목록 제목" });
  const mId = el("input", { type: "text", placeholder: "재생목록 ID (PL... 형식)" });
  const mHeading = el("h3", { className: "modal-title" }, "재생목록 추가");
  const mSave = el("button", { className: "btn-line", textContent: "저장", onclick: onSavePlaylist });
  const mCancel = el("button", { className: "btn-line", textContent: "취소", onclick: closeModal });
  const modalCard = el("div", { className: "modal-card" }, [
    mHeading, mTitle, mId,
    el("div", { className: "att-actions" }, [mCancel, mSave]),
  ]);
  const modal = el("div", {
    className: "modal", hidden: true,
    onclick: (e) => { if (e.target === modal) closeModal(); }, // 바깥(딤) 탭 시 닫기
  }, [modalCard]);

  function openModal(editMode) {
    if (editMode) {
      const p = playlists.find((x) => x.id === currentId);
      if (!p) return setStatus("선택된 재생목록이 없습니다.");
      editingId = p.id;
      mHeading.textContent = "재생목록 편집";
      mSave.textContent = "수정 적용";
      mTitle.value = p.title;
      mId.value = p.id;
    } else {
      editingId = null;
      mHeading.textContent = "재생목록 추가";
      mSave.textContent = "저장";
      mTitle.value = "";
      mId.value = "";
    }
    modal.hidden = false;
    mTitle.focus();
  }
  function closeModal() { modal.hidden = true; }

  // ── 상단 툴바 ──
  const select = el("select", { className: "yt-select", onchange: () => selectPlaylist(select.value) });
  const sortSelect = el("select", { className: "yt-select sort",
    onchange: () => { sortKind = sortSelect.value; set(SORT_KEY, sortKind); renderList(); } });
  for (const s of SORTS) sortSelect.appendChild(el("option", { value: s.key, textContent: s.label }));
  sortSelect.value = sortKind;

  const addBtn = el("button", { className: "mini", textContent: "＋ 추가", onclick: () => openModal(false) });
  const refreshBtn = el("button", { className: "mini", textContent: "↻ 갱신", onclick: () => loadVideos(currentId, true) });
  const thumbBtn = el("button", { className: "mini", onclick: toggleThumb });
  const recentBtn = el("button", { className: "mini", textContent: "최근본곳", onclick: scrollToRecent });
  const editBtn = el("button", { className: "mini", textContent: "목록편집", onclick: () => openModal(true) });
  const delBtn = el("button", { className: "mini danger", textContent: "목록삭제", onclick: deleteCurrent });

  const topRow = el("div", { className: "yt-top" }, [select, sortSelect]);
  const toolRow = el("div", { className: "yt-tools" }, [addBtn, refreshBtn, thumbBtn, recentBtn, editBtn, delBtn]);

  const listEl = el("div", { className: "yt-list" });

  root.appendChild(el("h3", { className: "sec" }, "재생목록 / 영상"));
  root.appendChild(topRow);
  root.appendChild(toolRow);
  root.appendChild(listEl);
  root.appendChild(modal);

  // ── 재생목록 동작 ──
  function onSavePlaylist() {
    const t = mTitle.value.trim();
    const id = mId.value.trim();
    if (!t) return setStatus("제목을 입력하세요.");
    if (!id) return setStatus("재생목록 ID를 입력하세요.");
    if (editingId) {
      const p = playlists.find((x) => x.id === editingId);
      if (p) {
        if (p.id !== id) remove(vidKey(p.id)); // ID 변경 시 영상 캐시 무효화
        p.title = t; p.id = id;
      }
    } else {
      if (playlists.some((x) => x.id === id)) return setStatus("이미 있는 재생목록 ID입니다.");
      playlists.push({ id, title: t });
    }
    savePlaylists(playlists);
    closeModal();
    currentId = id;
    set(LAST_KEY, currentId);
    renderSelect();
    loadVideos(currentId, false);
    setStatus("저장되었습니다.");
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
    loadVideos(currentId, false);
    setStatus("삭제되었습니다.");
  }

  function toggleThumb() {
    showThumb = !showThumb;
    set(THUMB_KEY, showThumb);
    thumbBtn.textContent = showThumb ? "썸네일 끄기" : "썸네일 켜기";
    renderList();
  }

  function renderSelect() {
    select.innerHTML = "";
    if (!playlists.length) {
      select.appendChild(el("option", { value: "", textContent: "재생목록을 추가하세요" }));
      currentId = null;
      return;
    }
    for (const p of playlists) select.appendChild(el("option", { value: p.id, textContent: p.title }));
    if (!currentId || !playlists.some((x) => x.id === currentId)) currentId = playlists[0].id;
    select.value = currentId;
  }

  function selectPlaylist(id) {
    if (!id) return;
    currentId = id;
    expandedId = null;
    set(LAST_KEY, id);
    loadVideos(id, false);
  }

  // ── 영상 로드 (증분 갱신) ──
  async function loadVideos(id, force) {
    if (!id) { data = null; renderList(); return; }
    const cached = get(vidKey(id), null);
    // 원본과 동일: 재생목록 선택 시엔 로컬 저장본만 표시하고 API는 호출하지 않는다.
    // API 조회·저장은 상단 '↻ 갱신' 버튼(force=true)으로만 수행.
    if (!force) { data = cached; renderList(); return; }

    listEl.innerHTML = "";
    listEl.appendChild(el("div", { className: "empty" }, "불러오는 중…"));
    try {
      const prevItems = (cached && cached.items) || [];
      const stateMap = new Map(prevItems.map((v) => [v.videoId, v]));
      const isFirst = prevItems.length === 0;

      const res = await fetchYoutubePlaylist(id);
      const merged = (res.items || []).map((it) => {
        const old = stateMap.get(it.videoId);
        // 기존 항목: 사용자 상태 보존 / 신규(최초 로드 아님): NEW 표시
        return old ? normVideo(it, old) : normVideo(it, { createDate: isFirst ? null : nowISO() });
      });
      const newCount = merged.filter((v) => v.createDate).length;
      data = { items: merged, hiddenCount: res.hiddenCount || 0, ts: Date.now(), lastShowVideoId: cached?.lastShowVideoId || null };
      set(vidKey(id), data);
      renderList();
      setStatus(`${merged.length}개 영상${res.hiddenCount ? ` (숨김 ${res.hiddenCount})` : ""}${force && newCount ? ` · 신규 ${newCount}` : ""}`);
    } catch (e) {
      data = cached || null;
      renderList(e.message);
      setStatus("로드 실패: " + e.message);
    }
  }

  // ── 영상별 동작 ──
  function persist() { if (currentId && data) set(vidKey(currentId), data); }

  function play(v) {
    v.showCount += 1;
    v.lastShowTime = nowISO();
    v.createDate = null; // 재생하면 NEW 해제
    if (data) data.lastShowVideoId = v.videoId;
    persist();
    window.open(`https://www.youtube.com/watch?v=${v.videoId}`, "_blank", "noopener");
    renderList();
  }
  function changeCount(v, delta) {
    v.showCount = Math.max(0, v.showCount + delta);
    persist();
    renderList();
  }
  function toggleImportant(v) {
    v.important = !v.important;
    persist();
    renderList();
  }
  function saveMemo(v, text) {
    v.memo = text.trim();
    persist();
    setStatus("메모를 저장했습니다.");
  }

  function scrollToRecent() {
    const node = listEl.querySelector(".yt-card.recent");
    if (node) node.scrollIntoView({ block: "center", behavior: "smooth" });
    else setStatus("최근 본 영상이 없습니다.");
  }

  // ── 렌더 ──
  function renderList(errMsg) {
    listEl.innerHTML = "";
    if (errMsg) {
      listEl.appendChild(el("div", { className: "empty" }, "로드 실패: " + errMsg));
      return;
    }
    if (!currentId) {
      listEl.appendChild(el("div", { className: "empty" }, "위에서 재생목록(제목+ID)을 추가하세요."));
      return;
    }
    const items = (data && data.items) || [];
    if (!items.length) {
      listEl.appendChild(el("div", { className: "empty" }, "로컬에 저장된 영상이 없습니다. 상단 ‘↻ 갱신’을 눌러 불러오세요."));
      return;
    }
    const ordered = sortVideos(items, sortKind);
    const lastId = data?.lastShowVideoId;

    ordered.forEach((v) => {
      const isRecent = v.videoId === lastId;
      const head = el("button", { className: "yt-head", onclick: () => { expandedId = expandedId === v.videoId ? null : v.videoId; renderList(); } });

      if (showThumb && v.thumbnail) head.appendChild(el("img", { className: "yt-thumb", src: v.thumbnail, loading: "lazy", alt: "" }));

      const badges = el("span", { className: "yt-badges" }, [
        v.createDate ? el("span", { className: "badge new" }, "NEW") : null,
        v.important ? el("span", { className: "badge imp" }, "★") : null,
        isRecent ? el("span", { className: "badge recent" }, "최근") : null,
        v.showCount > 0 ? el("span", { className: "badge cnt" }, `${v.showCount}회`) : null,
      ]);
      head.appendChild(el("span", { className: "yt-vtitle" }, [el("span", {}, v.title), badges]));

      const card = el("div", { className: "yt-card" + (isRecent ? " recent" : "") }, [head]);

      if (expandedId === v.videoId) {
        const memo = el("textarea", { className: "yt-memo", placeholder: "메모…", value: v.memo || "", rows: 2 });
        card.appendChild(el("div", { className: "yt-edit" }, [
          el("div", { className: "yt-edit-row" }, [
            el("button", { className: "mini" + (v.important ? " on" : ""), textContent: v.important ? "★ 중요" : "☆ 중요", onclick: () => toggleImportant(v) }),
            el("div", { className: "yt-stepper" }, [
              el("button", { className: "mini", textContent: "−", onclick: () => changeCount(v, -1) }),
              el("span", {}, `${v.showCount}회`),
              el("button", { className: "mini", textContent: "＋", onclick: () => changeCount(v, 1) }),
            ]),
            el("button", { className: "mini play", textContent: "▶ 재생", onclick: () => play(v) }),
          ]),
          memo,
          el("button", { className: "mini", textContent: "메모 저장", onclick: () => saveMemo(v, memo.value) }),
        ]));
      }
      listEl.appendChild(card);
    });
  }

  // ── 초기화 ──
  thumbBtn.textContent = showThumb ? "썸네일 끄기" : "썸네일 켜기";
  renderSelect();
  loadVideos(currentId, false);

  return { unmount() { setStatus(""); } };
}
