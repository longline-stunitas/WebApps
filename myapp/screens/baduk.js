// 바둑 강좌 기록 — 준비 중. 구조/기능 범위는 사용자와 논의 후 채운다.
export const title = "바둑";

export function mount(root) {
  root.innerHTML = "";
  const p = document.createElement("p");
  p.className = "hint";
  p.textContent = "준비 중입니다. 강좌 트리 + 기보 기록 화면이 곧 추가됩니다.";
  root.appendChild(p);
  return {};
}
