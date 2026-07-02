// 바둑 강좌 기록 — 강좌를 폴더 트리로 정리하고, 각 강좌는 바둑판에 수순+수별 설명을 기록/재생한다.
// v1 범위: 돌 놓기(자동 흑백 교대) + 캡처/자살수 규칙 + 수순 이동 + 수별 설명글.
// 변화도(참고도)/기호·문자 오버레이/손뺌/사분면 확대는 제외(추후 논의).
import { get, set, remove } from "../lib/store.js";
import { el, setStatus, confirmDialog } from "../lib/ui.js";
import { createBadukBoard, STONECOLOR } from "../lib/badukBoard.js";

export const title = "바둑";

const MENU_KEY = "baduk_menu";
const boardKey = (id) => `baduk_board_${id}`;

function loadMenu() { return get(MENU_KEY, { nextID: 1, datas: [] }); }
function saveMenu(menu) { set(MENU_KEY, menu); }
function loadBoard(id) { return get(boardKey(id), { stoneDatas: [] }); }
function saveBoard(id, boardData) { set(boardKey(id), boardData); }

function childrenAtPath(menu, path) {
  let arr = menu.datas;
  for (const id of path) {
    const node = arr.find((n) => n.id === id);
    if (!node) return arr;
    arr = node.children;
  }
  return arr;
}

function collectLessonIds(node, out) {
  if (node.type === "lesson") out.push(node.id);
  else if (Array.isArray(node.children)) node.children.forEach((c) => collectLessonIds(c, out));
}

export function mount(root) {
  let menu = loadMenu();
  let path = []; // 폴더 id 경로(드릴다운)
  let view = "tree"; // "tree" | "board"
  let openId = null;
  let board = null;
  let editMode = false;

  const container = el("div", { className: "baduk-root" });
  root.appendChild(container);

  // ── 이름 입력 모달(추가/이름변경 공용) ──
  function promptName(initial, onFolder, onLesson) {
    const nameInput = el("input", { type: "text", placeholder: "이름", value: initial || "" });
    const buttons = [];
    if (onFolder) buttons.push(el("button", { className: "btn-line", textContent: "폴더로 저장", onclick: () => { const v = nameInput.value.trim(); if (!v) return setStatus("이름을 입력하세요."); onFolder(v); close(); } }));
    if (onLesson) buttons.push(el("button", { className: "btn-line", textContent: onFolder ? "강좌로 저장" : "저장", onclick: () => { const v = nameInput.value.trim(); if (!v) return setStatus("이름을 입력하세요."); onLesson(v); close(); } }));
    const cancelBtn = el("button", { className: "btn-line", textContent: "취소", onclick: () => close() });
    const card = el("div", { className: "modal-card" }, [
      el("h3", { className: "modal-title" }, initial ? "이름 변경" : "추가"),
      nameInput,
      el("div", { className: "att-actions" }, [cancelBtn, ...buttons]),
    ]);
    const layer = el("div", { className: "modal" }, [card]);
    const close = () => layer.remove();
    layer.onclick = (e) => { if (e.target === layer) close(); };
    document.body.appendChild(layer);
    nameInput.focus();
  }

  function addNode(type, name) {
    const list = childrenAtPath(menu, path);
    const node = { id: menu.nextID++, type, name, children: [] };
    list.push(node);
    if (type === "lesson") saveBoard(node.id, { stoneDatas: [] });
    saveMenu(menu);
    renderTree();
  }

  function renameNode(node) {
    promptName(node.name, null, (v) => { node.name = v; saveMenu(menu); renderTree(); });
  }

  async function deleteNode(list, idx) {
    const node = list[idx];
    const msg = node.type === "folder" ? `'${node.name}' 폴더와 그 안의 모든 강좌를 삭제할까요?` : `'${node.name}' 강좌를 삭제할까요?`;
    const ok = await confirmDialog(msg, { okText: "삭제", danger: true });
    if (!ok) return;
    const lessonIds = [];
    collectLessonIds(node, lessonIds);
    lessonIds.forEach((id) => remove(boardKey(id)));
    list.splice(idx, 1);
    saveMenu(menu);
    renderTree();
  }

  function moveNode(list, idx, dir) {
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    saveMenu(menu);
    renderTree();
  }

  function renderTree() {
    container.innerHTML = "";
    view = "tree";

    // breadcrumb
    const crumb = el("div", { className: "baduk-crumb" });
    const rootCrumb = el("span", { className: "crumb-item", textContent: "바둑", onclick: () => { path = []; renderTree(); } });
    crumb.appendChild(rootCrumb);
    let walk = menu.datas;
    path.forEach((id, i) => {
      const node = walk.find((n) => n.id === id);
      crumb.appendChild(el("span", {}, " > "));
      crumb.appendChild(el("span", {
        className: "crumb-item",
        textContent: node ? node.name : "?",
        onclick: () => { path = path.slice(0, i + 1); renderTree(); },
      }));
      if (node) walk = node.children;
    });
    container.appendChild(crumb);

    const addBar = el("div", { className: "row-btns baduk-addbar" }, [
      el("button", { className: "btn-line", textContent: "+ 폴더", onclick: () => promptName(null, (v) => addNode("folder", v), null) }),
      el("button", { className: "btn-line", textContent: "+ 강좌", onclick: () => promptName(null, null, (v) => addNode("lesson", v)) }),
    ]);
    container.appendChild(addBar);

    const list = childrenAtPath(menu, path);
    const listEl = el("div", { className: "wv-list" });
    if (!list.length) {
      listEl.appendChild(el("div", { className: "empty" }, "항목이 없습니다. 위 버튼으로 추가하세요."));
    } else {
      list.forEach((node, idx) => {
        const openBtn = el("button", {
          className: "wv-open",
          onclick: () => {
            if (node.type === "folder") { path = [...path, node.id]; renderTree(); }
            else openBoard(node.id);
          },
        }, [
          el("span", { className: "menu-label" }, (node.type === "folder" ? "📁 " : "🎬 ") + node.name),
          el("span", { className: "menu-desc" }, node.type === "folder" ? `${node.children.length}개 항목` : "강좌 기록"),
        ]);
        const ctrls = el("div", { className: "wv-ctrls" }, [
          el("button", { className: "mini", textContent: "↑", onclick: () => moveNode(list, idx, -1) }),
          el("button", { className: "mini", textContent: "↓", onclick: () => moveNode(list, idx, 1) }),
          el("button", { className: "mini", textContent: "이름변경", onclick: () => renameNode(node) }),
          el("button", { className: "mini danger", textContent: "삭제", onclick: () => deleteNode(list, idx) }),
        ]);
        listEl.appendChild(el("div", { className: "wv-item" }, [openBtn, ctrls]));
      });
    }
    container.appendChild(listEl);
  }

  // ── 보드 뷰 ──
  function openBoard(id) {
    openId = id;
    editMode = false;
    view = "board";
    renderBoard();
  }

  function findNodeById(id, datas = menu.datas) {
    for (const n of datas) {
      if (n.id === id) return n;
      if (n.children) { const f = findNodeById(id, n.children); if (f) return f; }
    }
    return null;
  }

  function renderBoard() {
    container.innerHTML = "";
    const node = findNodeById(openId);
    const boardData = loadBoard(openId);
    board = createBadukBoard(boardData);

    const backBtn = el("button", { className: "btn-line", textContent: "◀ 목록", onclick: () => { view = "tree"; renderTree(); } });
    const editBtn = el("button", { className: "btn-line", textContent: editMode ? "편집 종료" : "편집", onclick: () => { editMode = !editMode; renderBoard(); } });
    const header = el("div", { className: "row-btns baduk-board-header" }, [backBtn, el("h3", { className: "sec" }, node ? node.name : "강좌"), editBtn]);
    container.appendChild(header);

    const canvasWrap = el("div", { className: "baduk-canvas-wrap" });
    const canvas = el("canvas", { className: "baduk-canvas" });
    canvasWrap.appendChild(canvas);
    container.appendChild(canvasWrap);

    const cssSize = Math.min((root.clientWidth || 360) - 24, 480);
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);

    const firstBtn = el("button", { className: "mini", textContent: "|◀", onclick: () => { board.first(); redraw(); } });
    const prevBtn = el("button", { className: "mini", textContent: "◀", onclick: () => { board.prev(); redraw(); } });
    const nextBtn = el("button", { className: "mini", textContent: "▶", onclick: () => { board.next(); redraw(); } });
    const lastBtn = el("button", { className: "mini", textContent: "▶|", onclick: () => { board.last(); redraw(); } });
    const undoBtn = el("button", { className: "mini danger", textContent: "되돌리기", hidden: !editMode, onclick: () => { board.undo(); saveBoard(openId, boardData); redraw(); } });
    const navRow = el("div", { className: "row-btns baduk-nav" }, [firstBtn, prevBtn, nextBtn, lastBtn, undoBtn]);
    container.appendChild(navRow);

    const scription = el("textarea", { className: "baduk-scription", placeholder: "이 수에 대한 설명…", rows: 4, readOnly: !editMode });
    scription.addEventListener("input", () => {
      const sd = board.currentStoneData();
      if (!sd) return;
      sd.scription = scription.value;
      saveBoard(openId, boardData);
    });
    container.appendChild(scription);

    canvas.addEventListener("click", (e) => {
      if (!editMode) return;
      const pt = board.pointToGrid(canvas, e.clientX, e.clientY);
      if (!pt) return;
      const result = board.placeStone(pt.gridX, pt.gridY);
      if (!result.ok) {
        const msg = result.reason === "notLast" ? "마지막 수 위치에서만 돌을 놓을 수 있습니다."
          : result.reason === "occupied" ? "이미 돌이 있습니다."
          : result.reason === "suicide" ? "자살수는 둘 수 없습니다."
          : "돌을 놓을 수 없습니다.";
        setStatus(msg);
        return;
      }
      saveBoard(openId, boardData);
      redraw();
    });

    function redraw() {
      board.draw(canvas);
      const sd = board.currentStoneData();
      scription.value = sd ? sd.scription || "" : "";
      scription.readOnly = !editMode || !sd;
      undoBtn.hidden = !editMode;
    }
    redraw();
  }

  renderTree();
  return { unmount() { setStatus(""); } };
}
