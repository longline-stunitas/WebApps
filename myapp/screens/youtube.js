// 유튜브 강좌 타이틀리스트 — 원본 VideoRecord 화면을 PWA로 재현.
// 재생목록 관리 + worker 프록시 영상 로드 + 증분 새로고침 + 정렬 + 영상별 상태(중요/시청횟수/메모/NEW).
import { get, set, remove } from "../lib/store.js";
import { el, setStatus, confirmDialog, selectSheet } from "../lib/ui.js";
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
  { key: "duration", label: "시간순" },
  { key: "durationDesc", label: "시간역순" },
  { key: "title", label: "제목순" },
  { key: "memo", label: "메모 먼저" },
];

// 정렬 드롭다운의 '이동' 동작(일회성). 값은 '__' 접두어로 정렬키와 구분.
const SORT_MOVES = [
  { key: "__top", label: "↑ 맨 위로" },
  { key: "__bottom", label: "↓ 맨 아래로" },
  { key: "__recent", label: "● 최근 본 곳" },
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
    duration: it.duration ?? base.duration ?? null,   // ISO8601 (예: PT5M30S)
    published: it.published ?? base.published ?? null, // 영상 게시일 ISO8601
    important: base.important ?? false,
    showCount: base.showCount ?? 0,
    memo: base.memo ?? "",
    createDate: base.createDate ?? null, // 값 있으면 NEW
    lastShowTime: base.lastShowTime ?? null,
  };
}

// 재생 불가(private/deleted) 영상 방어 필터 — 썸네일 없음/제목이 Private·Deleted면 숨김
function isPlayable(v) {
  return !!v.thumbnail && v.title !== "Private video" && v.title !== "Deleted video";
}

// ISO8601 날짜 → "YYYY.MM.DD"
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

// ISO8601 duration → "H:MM:SS" / "M:SS"
function fmtDuration(iso) {
  if (!iso) return "";
  const m = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "";
  const h = +(m[1] || 0), mi = +(m[2] || 0), s = +(m[3] || 0);
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(mi)}:${pad(s)}` : `${mi}:${pad(s)}`;
}

// ISO8601 duration → 총 초. 없으면 -1.
function durationSec(iso) {
  if (!iso) return -1;
  const m = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return -1;
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

// 시간 비교: 길이 없는 항목은 항상 뒤로
function durCompare(x, y, desc) {
  const sx = durationSec(x.duration), sy = durationSec(y.duration);
  if (sx < 0 && sy < 0) return 0;
  if (sx < 0) return 1;
  if (sy < 0) return -1;
  return desc ? sy - sx : sx - sy;
}

// 표시용 정렬(저장 순서는 바꾸지 않음)
function sortVideos(items, kind) {
  const a = items.slice();
  switch (kind) {
    case "reverse": return a.reverse();
    case "important": return a.sort((x, y) => (y.important ? 1 : 0) - (x.important ? 1 : 0));
    case "viewCount": return a.sort((x, y) => y.showCount - x.showCount);
    case "duration": return a.sort((x, y) => durCompare(x, y, false));     // 짧은 영상 먼저
    case "durationDesc": return a.sort((x, y) => durCompare(x, y, true));  // 긴 영상 먼저
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
  let editingId = null;       // 재생목록 폼이 편집 중인 id
  let returnToEditId = null;  // 신규 모드에서 취소 시 되돌아갈 편집 대상 id

  // ── 재생목록 추가/편집 모달(팝업) ──
  const mTitle = el("input", { type: "text", placeholder: "재생목록 제목" });
  const mId = el("input", { type: "text", placeholder: "재생목록 ID (PL... 형식)" });
  const mHeading = el("h3", { className: "modal-title" }, "재생목록 추가");
  const mSave = el("button", { className: "btn-line", textContent: "저장", onclick: onSavePlaylist });
  const mCancel = el("button", { className: "btn-line", textContent: "취소", onclick: onCancel });
  const mNew = el("button", { className: "btn-line", textContent: "＋ 새 재생목록 추가", onclick: () => { returnToEditId = editingId; setModalMode(null); } });
  const mClearNew = el("button", { className: "btn-line", textContent: "이 목록 NEW 모두 지우기", onclick: clearAllNew });
  const mDelete = el("button", { className: "btn-line danger", textContent: "이 재생목록 삭제", onclick: onDeletePlaylist });
  const modalCard = el("div", { className: "modal-card" }, [
    mHeading, mTitle, mId,
    el("div", { className: "att-actions" }, [mCancel, mSave]),
    mNew, mClearNew, mDelete,
  ]);
  const modal = el("div", {
    className: "modal", hidden: true,
    onclick: (e) => { if (e.target === modal) closeModal(); }, // 바깥(딤) 탭 시 닫기
  }, [modalCard]);

  // editP가 있으면 편집 모드, 없으면(null) 신규 추가 모드. (한 모달 안에서 전환)
  function setModalMode(editP) {
    if (editP) {
      editingId = editP.id;
      mHeading.textContent = "재생목록 편집";
      mSave.textContent = "수정 적용";
      mTitle.value = editP.title;
      mId.value = editP.id;
    } else {
      editingId = null;
      mHeading.textContent = "재생목록 추가";
      mSave.textContent = "저장";
      mTitle.value = "";
      mId.value = "";
    }
    const editing = !!editP;
    mNew.hidden = !editing;       // 신규 추가로 전환(편집 중일 때만)
    mClearNew.hidden = !editing;  // NEW 일괄 해제(편집 중일 때만)
    mDelete.hidden = !editing;    // 삭제(편집 중일 때만)
    mTitle.focus();
  }
  // 목록편집 진입: 현재 선택 목록이 있으면 편집, 없으면 신규 추가로 연다.
  function openModal() {
    returnToEditId = null;
    const p = playlists.find((x) => x.id === currentId);
    setModalMode(p || null);
    modal.hidden = false;
  }
  // 취소: 신규 모드로 전환해온 경우 편집 모드로 복귀, 아니면 닫기.
  function onCancel() {
    if (returnToEditId) {
      const p = playlists.find((x) => x.id === returnToEditId);
      returnToEditId = null;
      if (p) { setModalMode(p); return; }
    }
    closeModal();
  }
  function closeModal() { returnToEditId = null; modal.hidden = true; }

  // 현재(편집 중) 재생목록의 모든 영상 NEW 표시 일괄 해제
  async function clearAllNew() {
    if (!editingId) return;
    const d = get(vidKey(editingId), null);
    if (!d || !d.items || !d.items.length) return setStatus("영상이 없습니다.");
    if (!(await confirmDialog("이 목록의 NEW 표시를 모두 지울까요?"))) return;
    let changed = 0;
    for (const v of d.items) if (v.createDate) { v.createDate = null; changed++; }
    set(vidKey(editingId), d);
    if (editingId === currentId) data = d;
    closeModal();
    renderSelect();
    renderList();
    setStatus(changed ? `NEW 표시 ${changed}개를 지웠습니다.` : "지울 NEW가 없습니다.");
  }

  // ── 상단: 재생목록 선택 + 정렬 (커스텀 선택 시트 — iOS 기본 select 대체) ──
  const plBtn = el("button", { className: "yt-picker pl", onclick: openPlaylistSheet });
  const sortBtn = el("button", { className: "mini yt-sortbtn", onclick: openSortSheet });

  async function openPlaylistSheet() {
    if (!playlists.length) return setStatus("재생목록을 추가하세요.");
    const groups = [{ items: playlists.map((p) => ({ value: p.id, label: optionText(p) })) }];
    const v = await selectSheet("재생목록 선택", groups, currentId);
    if (v) selectPlaylist(v);
  }
  function renderSortBtn() {
    const s = SORTS.find((x) => x.key === sortKind);
    sortBtn.textContent = "정렬: " + (s ? s.label : "기본순");
  }
  async function openSortSheet() {
    const groups = [
      { label: "정렬", items: SORTS.map((s) => ({ value: s.key, label: s.label })) },
      { label: "이동", items: SORT_MOVES.map((m) => ({ value: m.key, label: m.label })) },
    ];
    const v = await selectSheet("정렬 / 이동", groups, sortKind);
    if (!v) return;
    if (v.startsWith("__")) { doMove(v); return; }
    sortKind = v;
    set(SORT_KEY, sortKind);
    renderSortBtn();
    renderList();
  }
  function doMove(kind) {
    if (kind === "__recent") return scrollToRecent();
    // scrollTop 직접 설정(iOS 호환, 부드러움은 CSS scroll-behavior). 맨 위는 정확히 최상단.
    if (kind === "__top") root.scrollTop = 0;
    if (kind === "__bottom") root.scrollTop = root.scrollHeight;
  }

  const editBtn = el("button", { className: "mini", textContent: "목록편집", onclick: openModal });
  const refreshBtn = el("button", { className: "mini", textContent: "↻ 갱신",
    onclick: async () => { if (currentId && await confirmDialog("현재 재생목록을 갱신할까요?")) loadVideos(currentId, true); } });
  const allBtn = el("button", { className: "mini", textContent: "⟳ 전체갱신",
    onclick: async () => { if (await confirmDialog("등록된 모든 재생목록을 갱신할까요?\n개수가 많으면 시간이 걸립니다.")) refreshAll(); } });
  const thumbBtn = el("button", { className: "mini", onclick: toggleThumb });

  const topRow = el("div", { className: "yt-top" }, [plBtn]);
  const toolRow = el("div", { className: "yt-tools" }, [editBtn, refreshBtn, allBtn, thumbBtn, sortBtn]);

  const summaryEl = el("div", { className: "yt-summary" });
  const listEl = el("div", { className: "yt-list" });

  // 상단(제목·재생목록·툴바·요약)은 고정, 그 아래 영상 리스트만 스크롤
  root.appendChild(el("div", { className: "yt-sticky" }, [
    el("h3", { className: "sec" }, "재생목록 / 영상"),
    topRow, toolRow, summaryEl,
  ]));
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
  async function onDeletePlaylist() {
    if (!editingId) return;
    if (!(await confirmDialog("이 재생목록을 삭제할까요?", { okText: "삭제", danger: true }))) return;
    playlists = playlists.filter((x) => x.id !== editingId);
    remove(vidKey(editingId));
    savePlaylists(playlists);
    currentId = playlists[0]?.id || null;
    set(LAST_KEY, currentId);
    closeModal();
    renderSelect();
    loadVideos(currentId, false);
    setStatus("재생목록을 삭제했습니다.");
  }

  function toggleThumb() {
    showThumb = !showThumb;
    set(THUMB_KEY, showThumb);
    thumbBtn.textContent = showThumb ? "썸네일 끄기" : "썸네일 켜기";
    renderList();
  }

  // 재생목록 옵션 텍스트: 갱신(NEW)된 목록은 🔴 + "NEW n"으로 구분.
  // (iOS의 <select>는 옵션 글자 색 지정이 막혀 있어, 빨간 점 이모지로 강조)
  function optionText(p) {
    const d = get(vidKey(p.id), null);
    if (!d || !d.items) return p.title;
    let s = ` [${d.items.length}]`;
    if (d.hiddenCount) s += ` 감춤${d.hiddenCount}`;
    const n = d.items.filter((v) => v.createDate).length;
    const prefix = n ? "🔴 " : "";
    if (n) s += ` NEW ${n}`;
    return prefix + p.title + s;
  }
  function renderSelect() {
    if (!playlists.length) { currentId = null; plBtn.textContent = "재생목록을 추가하세요"; return; }
    if (!currentId || !playlists.some((x) => x.id === currentId)) currentId = playlists[0].id;
    const p = playlists.find((x) => x.id === currentId);
    plBtn.textContent = p ? optionText(p) : "재생목록 선택";
  }

  function selectPlaylist(id) {
    if (!id) return;
    currentId = id;
    expandedId = null;
    set(LAST_KEY, id);
    renderSelect(); // 선택 버튼 텍스트 갱신
    loadVideos(id, false);
  }

  // ── 영상 로드 (증분 갱신) ──
  // API 조회 + 기존 상태 보존 병합 + 저장. { d, newCount } 반환. (렌더는 호출측에서)
  async function fetchAndStore(id) {
    const cached = get(vidKey(id), null);
    const prevItems = (cached && cached.items) || [];
    const stateMap = new Map(prevItems.map((v) => [v.videoId, v]));
    const isFirst = prevItems.length === 0;

    const res = await fetchYoutubePlaylist(id);
    const fresh = [], existing = [];
    for (const it of res.items || []) {
      const old = stateMap.get(it.videoId);
      if (old) existing.push(normVideo(it, old)); // 기존: 상태 보존
      else fresh.push(normVideo(it, { createDate: isFirst ? null : nowISO() })); // 신규: NEW
    }
    // 새로 올라온 영상(신규)을 맨 위로. 최초 로드는 NEW 없이 그대로 저장.
    // private/deleted는 방어적으로 한 번 더 거른다(worker가 이미 제외하지만 안전).
    const merged = (isFirst ? fresh : [...fresh, ...existing]).filter(isPlayable);
    const newCount = merged.filter((v) => v.createDate).length;
    const d = { items: merged, hiddenCount: res.hiddenCount || 0, ts: Date.now(), lastShowVideoId: cached?.lastShowVideoId || null };
    set(vidKey(id), d);
    return { d, newCount };
  }

  async function loadVideos(id, force) {
    if (!id) { data = null; renderList(); return; }
    const cached = get(vidKey(id), null);
    // 원본과 동일: 재생목록 선택 시엔 로컬 저장본만 표시하고 API는 호출하지 않는다.
    // API 조회·저장은 '↻ 갱신'(현재 목록) / '⟳ 전체갱신'으로만 수행.
    // 진입·선택 시 마지막 본 영상으로 자동 스크롤(중앙).
    if (!force) {
      data = cached;
      // 기존 캐시에 남아있는 private/deleted를 즉시 정리(이전 버전에서 저장된 것)
      if (data && data.items) {
        const filtered = data.items.filter(isPlayable);
        if (filtered.length !== data.items.length) { data.items = filtered; set(vidKey(id), data); }
      }
      renderList();
      scrollToRecent(true);
      return;
    }

    listEl.innerHTML = "";
    listEl.appendChild(el("div", { className: "empty" }, "불러오는 중…"));
    try {
      const { d, newCount } = await fetchAndStore(id);
      data = d;
      renderSelect(); // 재생목록 NEW/개수 표시 갱신
      renderList();
      setStatus(`${d.items.length}개 영상${d.hiddenCount ? ` (숨김 ${d.hiddenCount})` : ""}${newCount ? ` · 신규 ${newCount}` : ""}`);
    } catch (e) {
      data = cached || null;
      renderList(e.message);
      setStatus("로드 실패: " + e.message);
    }
  }

  // 전체 갱신: 모든 재생목록을 순회 조회. 각 목록의 신규 영상이 NEWn으로 표시된다.
  async function refreshAll() {
    if (!playlists.length) return setStatus("재생목록이 없습니다.");
    const total = playlists.length;

    // 화면 중앙에 진행 상황 표시(현재 갱신 중인 재생목록 + 진행바)
    const countEl = el("div", { className: "yt-progress-count" }, "");
    const nameEl = el("div", { className: "yt-progress-name" }, "");
    const fillEl = el("div", { className: "yt-progress-fill" });
    summaryEl.textContent = "";
    listEl.innerHTML = "";
    listEl.appendChild(el("div", { className: "yt-progress" }, [
      countEl, nameEl, el("div", { className: "yt-progress-bar" }, [fillEl]),
    ]));

    let done = 0, totalNew = 0, failed = 0;
    for (const p of playlists) {
      done++;
      countEl.textContent = `전체 갱신 중…  ${done} / ${total}`;
      nameEl.textContent = p.title;
      fillEl.style.width = Math.round((done / total) * 100) + "%";
      setStatus(`전체 갱신 중… (${done}/${total})`);
      await new Promise((r) => requestAnimationFrame(r)); // 화면 갱신 보장
      try { const { newCount } = await fetchAndStore(p.id); totalNew += newCount; }
      catch { failed++; }
    }
    data = currentId ? get(vidKey(currentId), null) : null;
    renderSelect();
    renderList();
    setStatus(`전체 갱신 완료 · 신규 ${totalNew}개${failed ? ` · 실패 ${failed}` : ""}`);
  }

  // ── 영상별 동작 ──
  function persist() { if (currentId && data) set(vidKey(currentId), data); }

  // 영상에 손대면 '최근 본 곳'을 그 영상으로 (재생·횟수·중요·메모 공통)
  function touch(v) { if (data) data.lastShowVideoId = v.videoId; }

  // 유튜브 앱이 있으면 앱으로 바로 열어 인앱 빈 화면을 피하고, 없으면 웹으로 폴백.
  function openYoutube(videoId) {
    const fallback = setTimeout(() => {
      cleanup();
      window.open(`https://www.youtube.com/watch?v=${videoId}`, "_blank");
    }, 800);
    const cleanup = () => { clearTimeout(fallback); document.removeEventListener("visibilitychange", onHide); };
    const onHide = () => { if (document.hidden) cleanup(); }; // 앱으로 전환되면 폴백 취소
    document.addEventListener("visibilitychange", onHide);
    window.location.href = `youtube://watch?v=${videoId}`;
  }

  function play(v) {
    v.showCount += 1;
    v.lastShowTime = nowISO();
    v.createDate = null; // 재생하면 NEW 해제
    touch(v);
    persist();
    renderList();
    openYoutube(v.videoId);
  }
  function changeCount(v, delta) {
    v.showCount = Math.max(0, v.showCount + delta);
    touch(v);
    persist();
    renderList();
  }
  function toggleImportant(v) {
    v.important = !v.important;
    touch(v);
    persist();
    renderList();
  }
  function saveMemo(v, text) {
    v.memo = text.trim();
    touch(v);
    persist();
    setStatus("메모를 저장했습니다.");
    renderList(); // 메모 표시 갱신(펼침 유지)
  }

  // 마지막 본 영상을 화면 중앙으로. silent=true면 안내 메시지 없음(자동 스크롤용).
  function scrollToRecent(silent) {
    const node = listEl.querySelector(".yt-card.recent");
    if (node) requestAnimationFrame(() => node.scrollIntoView({ block: "center", behavior: "smooth" }));
    else if (!silent) setStatus("최근 본 영상이 없습니다.");
  }

  // ── 렌더 ──
  // 영상 총 개수 / 신규 / 숨김 요약
  function renderSummary() {
    const items = (data && data.items) || [];
    if (!currentId || !items.length) { summaryEl.textContent = ""; return; }
    const n = items.filter((v) => v.createDate).length;
    summaryEl.textContent = `총 ${items.length}개`
      + (n ? ` · 신규 ${n}` : "")
      + (data.hiddenCount ? ` · 숨김 ${data.hiddenCount}` : "");
  }

  function renderList(errMsg) {
    renderSummary();
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
      const head = el("button", {
        className: "yt-head",
        onclick: () => {
          if (v.createDate) { v.createDate = null; persist(); } // 누르면 NEW 해제 + 재생목록 NEW수 반영
          expandedId = expandedId === v.videoId ? null : v.videoId;
          renderSelect();
          renderList();
        },
      });

      if (showThumb && v.thumbnail) head.appendChild(el("img", { className: "yt-thumb", src: v.thumbnail, loading: "lazy", alt: "" }));

      // 썸네일 오른쪽(상단): 제목 + 영상시간 · 등록일.
      const body = el("div", { className: "yt-body" }, [el("span", { className: "yt-vtitle" }, v.title)]);
      const dur = fmtDuration(v.duration);
      const date = fmtDate(v.published);
      const meta1 = [dur, date].filter(Boolean).join("  ·  ");
      if (meta1) body.appendChild(el("span", { className: "yt-time" }, meta1));
      head.appendChild(body);

      const card = el("div", { className: "yt-card" + (isRecent ? " recent" : "") }, [head]);

      // 썸네일 아래(전체 너비): NEW·최근·별표·N회 + 메모. 내용 없으면 영역 자체를 안 만든다.
      const meta = [];
      if (v.createDate) meta.push(el("span", { className: "badge new" }, "NEW"));
      if (isRecent) meta.push(el("span", { className: "badge recent" }, "최근"));
      if (v.important) meta.push(el("span", { className: "badge imp" }, "★"));
      if (v.showCount > 0) meta.push(el("span", { className: "badge cnt" }, `${v.showCount}회`));
      const foot = el("div", { className: "yt-foot" });
      if (meta.length) foot.appendChild(el("div", { className: "yt-meta" }, meta));
      if (v.memo) foot.appendChild(el("div", { className: "yt-memo-view" }, v.memo));
      if (foot.childNodes.length) card.appendChild(foot);

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
  renderSortBtn();
  renderSelect();
  loadVideos(currentId, false);

  return { unmount() { setStatus(""); } };
}
