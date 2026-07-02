// 바둑판 상태머신 + 캔버스 렌더링. 화면(screens/baduk.js)의 UI 와이어링과 분리.
// 참고: longline70.dothome.co.kr/baduk.js의 캡처(축내기)/자살수 규칙(checkRemoveStoneDatas)을
// 단순화해 포팅함 — 변화도(참고도)/기호/손뺌/확대 등은 v1에서 제외, 순차 기록·재생만 지원.

export const STONECOLOR = { BLACK: 0, WHITE: 1 };
const EMPTY = -1;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const HOSHI_19 = [4, 10, 16]; // 1-indexed 좌표(4·10·16선 교차) — 19줄 표준 화점

function getGroup(board, size, x, y, color) {
  const visited = new Set();
  const stones = [];
  let hasLiberty = false;
  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    const key = `${cx},${cy}`;
    if (visited.has(key)) continue;
    visited.add(key);
    stones.push([cx, cy]);
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      if (board[nx][ny] === color) stack.push([nx, ny]);
      else if (board[nx][ny] === EMPTY) hasLiberty = true;
    }
  }
  return { stones, hasLiberty };
}

// board를 직접 변형(place + 상대 사석 제거)한다. 자살수면 되돌리고 실패를 반환.
function tryPlace(board, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return { ok: false, reason: "range" };
  if (board[x][y] !== EMPTY) return { ok: false, reason: "occupied" };
  const opponent = color === STONECOLOR.BLACK ? STONECOLOR.WHITE : STONECOLOR.BLACK;
  board[x][y] = color;
  const captured = [];
  for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
    if (board[nx][ny] === opponent) {
      const group = getGroup(board, size, nx, ny, opponent);
      if (!group.hasLiberty) {
        for (const [gx, gy] of group.stones) {
          board[gx][gy] = EMPTY;
          captured.push({ gridX: gx + 1, gridY: gy + 1 });
        }
      }
    }
  }
  if (captured.length === 0) {
    const myGroup = getGroup(board, size, x, y, color);
    if (!myGroup.hasLiberty) {
      board[x][y] = EMPTY;
      return { ok: false, reason: "suicide" };
    }
  }
  return { ok: true, captured };
}

export function createBadukBoard(boardData, boardSize = 19) {
  if (!Array.isArray(boardData.stoneDatas)) boardData.stoneDatas = [];
  let currentIndex = boardData.stoneDatas.length - 1;

  // stoneDatas[0..index]를 순서대로 재생해 그 시점의 보드 배열을 만든다.
  // 매번 처음부터 재구성 — 19x19에 수백 수 정도까지는 성능상 문제없고, 증분 상태를 관리하는 것보다 훨씬 단순/안전.
  function boardAt(index) {
    const board = Array.from({ length: boardSize }, () => Array(boardSize).fill(EMPTY));
    for (let i = 0; i <= index; i++) {
      const sd = boardData.stoneDatas[i];
      if (!sd) continue;
      board[sd.gridX - 1][sd.gridY - 1] = sd.color;
      if (Array.isArray(sd.removeStoneDatas)) {
        for (const r of sd.removeStoneDatas) board[r.gridX - 1][r.gridY - 1] = EMPTY;
      }
    }
    return board;
  }

  function isLastStone() { return currentIndex === boardData.stoneDatas.length - 1; }

  function nextColor() {
    if (currentIndex < 0) return STONECOLOR.BLACK;
    return boardData.stoneDatas[currentIndex].color === STONECOLOR.BLACK ? STONECOLOR.WHITE : STONECOLOR.BLACK;
  }

  // 마지막 수 상태에서만 새 수를 둘 수 있다(변화도 없이 순차 기록만 지원 — v1 범위).
  function placeStone(gridX, gridY) {
    if (!isLastStone()) return { ok: false, reason: "notLast" };
    const board = boardAt(currentIndex);
    const color = nextColor();
    const result = tryPlace(board, boardSize, gridX - 1, gridY - 1, color);
    if (!result.ok) return result;
    const stoneData = { gridX, gridY, color };
    if (result.captured.length) stoneData.removeStoneDatas = result.captured;
    boardData.stoneDatas.push(stoneData);
    currentIndex = boardData.stoneDatas.length - 1;
    return { ok: true };
  }

  function undo() {
    if (!boardData.stoneDatas.length) return;
    boardData.stoneDatas.pop();
    if (currentIndex > boardData.stoneDatas.length - 1) currentIndex = boardData.stoneDatas.length - 1;
  }

  function first() { currentIndex = -1; return currentIndex; }
  function last() { currentIndex = boardData.stoneDatas.length - 1; return currentIndex; }
  function prev() { if (currentIndex >= 0) currentIndex--; return currentIndex; }
  function next() { if (currentIndex < boardData.stoneDatas.length - 1) currentIndex++; return currentIndex; }
  function currentStoneData() { return currentIndex >= 0 ? boardData.stoneDatas[currentIndex] : null; }

  function draw(canvas) {
    const size = boardSize;
    const cell = canvas.width / (size + 1);
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f4ecd9";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 격자
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    for (let i = 1; i <= size; i++) {
      const p = i * cell;
      ctx.beginPath(); ctx.moveTo(cell, p); ctx.lineTo(size * cell, p); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p, cell); ctx.lineTo(p, size * cell); ctx.stroke();
    }
    // 화점(19줄 기준)
    if (size === 19) {
      ctx.fillStyle = "#333";
      for (const hx of HOSHI_19) for (const hy of HOSHI_19) {
        ctx.beginPath();
        ctx.arc(hx * cell, hy * cell, cell * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 현재 인덱스까지 재생된 돌 + 그 위 수 번호
    const board = boardAt(currentIndex);
    const stoneRadius = cell * 0.46;
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        const color = board[x][y];
        if (color === EMPTY) continue;
        const px = (x + 1) * cell, py = (y + 1) * cell;
        ctx.beginPath();
        ctx.arc(px, py, stoneRadius, 0, Math.PI * 2);
        ctx.fillStyle = color === STONECOLOR.BLACK ? "#111" : "#f5f5f5";
        ctx.fill();
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    // 수 번호(잡히지 않고 현재 남아있는 돌만) — 1부터 순서대로
    ctx.font = `${Math.max(9, Math.floor(cell * 0.4))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= currentIndex; i++) {
      const sd = boardData.stoneDatas[i];
      if (!sd) continue;
      if (board[sd.gridX - 1][sd.gridY - 1] !== sd.color) continue; // 이후 잡힌 돌이면 번호 생략
      const px = sd.gridX * cell, py = sd.gridY * cell;
      ctx.fillStyle = sd.color === STONECOLOR.BLACK ? "#fff" : "#111";
      ctx.fillText(String(i + 1), px, py);
    }
    // 마지막으로 둔 수 표시(빨간 테두리)
    if (currentIndex >= 0) {
      const sd = boardData.stoneDatas[currentIndex];
      if (board[sd.gridX - 1][sd.gridY - 1] === sd.color) {
        ctx.beginPath();
        ctx.arc(sd.gridX * cell, sd.gridY * cell, stoneRadius * 0.35, 0, Math.PI * 2);
        ctx.strokeStyle = "#e33";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  // 캔버스 픽셀 좌표 → (gridX, gridY) 1-indexed. 범위 밖/격자에서 너무 먼 클릭은 null.
  function pointToGrid(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const cell = canvas.width / (boardSize + 1);
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (clientX - rect.left) * scaleX;
    const py = (clientY - rect.top) * scaleY;
    const gx = Math.round(px / cell);
    const gy = Math.round(py / cell);
    if (gx < 1 || gx > boardSize || gy < 1 || gy > boardSize) return null;
    if (Math.abs(px - gx * cell) > cell * 0.42 || Math.abs(py - gy * cell) > cell * 0.42) return null;
    return { gridX: gx, gridY: gy };
  }

  return {
    get currentIndex() { return currentIndex; },
    get stoneCount() { return boardData.stoneDatas.length; },
    isLastStone, placeStone, undo, first, last, prev, next,
    currentStoneData, draw, pointToGrid, boardSize,
  };
}
