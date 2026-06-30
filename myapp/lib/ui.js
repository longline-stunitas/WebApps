// 공통 UI 헬퍼 — 상태표시줄, 화면 이동, DOM 생성.

export function setStatus(msg) {
  const node = document.getElementById("status");
  if (node) node.textContent = msg || "";
}

export function navigate(name) {
  location.hash = "#/" + name;
}

// el("button", { className, textContent, onclick }, [children])
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

// 남은 시간(ms) → "MM:SS" 또는 "HH:MM:SS"
export function fmtRemain(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function fmtTime(epochMs) {
  return new Date(epochMs).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

// 확인 레이어. Promise<boolean> 반환(확인=true / 취소·바깥탭=false).
// opts: { okText, cancelText, danger }
export function confirmDialog(message, opts = {}) {
  return new Promise((resolve) => {
    const okBtn = el("button", { className: "btn-line" + (opts.danger ? " danger" : ""), textContent: opts.okText || "확인" });
    const cancelBtn = el("button", { className: "btn-line", textContent: opts.cancelText || "취소" });
    const card = el("div", { className: "modal-card" }, [
      el("p", { className: "confirm-msg" }, message),
      el("div", { className: "att-actions" }, [cancelBtn, okBtn]),
    ]);
    const layer = el("div", { className: "modal confirm" }, [card]);
    const close = (val) => { layer.remove(); resolve(val); };
    okBtn.onclick = () => close(true);
    cancelBtn.onclick = () => close(false);
    layer.onclick = (e) => { if (e.target === layer) close(false); };
    document.body.appendChild(layer);
  });
}
