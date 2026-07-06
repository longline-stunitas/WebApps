// 키움 시세 표시용 순수 포맷팅 함수 — localStorage/DOM 접근 없이 값만 받아 계산(테스트하기 쉽게).

export function fmtPrice(n) {
  return n == null ? "-" : n.toLocaleString("ko-KR");
}

// 국내 관행: 상승=빨강(up), 하락=파랑(down), 보합=회색(flat) — 클래스는 style.css에서 색상 매핑
export function fmtChange(change, changePct) {
  if (change == null) return { text: "-", cls: "flat" };
  const cls = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const sign = change > 0 ? "+" : "";
  const pctText = changePct != null ? ` (${sign}${changePct.toFixed(2)}%)` : "";
  return { text: `${sign}${change.toLocaleString("ko-KR")}${pctText}`, cls };
}
