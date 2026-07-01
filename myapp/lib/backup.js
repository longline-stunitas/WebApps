// localStorage 전체 백업/복원 — iOS PWA는 동기화·자동백업이 없어 기기에만 데이터가 있다.
// 앱 삭제/기기 변경/데이터 초기화 전에 내보내고, 이후 가져와서 복원한다.

const FORMAT = "myapp-backup";

// 전체 localStorage를 JSON 문자열로. 값은 원본 문자열 그대로 보존(정확 복원).
export function exportJSON() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    data[k] = localStorage.getItem(k);
  }
  return JSON.stringify(
    { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), data },
    null,
    2,
  );
}

// 일자_시간_분까지만 넣어 매번 새 파일명이 되도록(같은 이름 중복 저장 시 "파일 2.json"처럼
// iOS가 임의로 번호를 붙이는 것을 피함). 초 단위까지는 불필요해 분까지만.
export function backupFilename() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `myapp_${stamp}.json`;
}

// JSON 문자열 → localStorage 복원. mode: "replace"(기존 전부 교체) | "merge"(겹치면 덮고 나머지 보존).
// 반환 { ok, message, count }.
export function importJSON(text, mode = "replace") {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, message: "JSON 형식이 아닙니다." };
  }
  if (!obj || obj.format !== FORMAT || typeof obj.data !== "object" || obj.data === null) {
    return { ok: false, message: "myapp 백업 파일이 아닙니다." };
  }
  const entries = Object.entries(obj.data).filter(([, v]) => typeof v === "string");
  if (!entries.length) return { ok: false, message: "복원할 항목이 없습니다." };
  if (mode === "replace") localStorage.clear();
  let count = 0;
  for (const [k, v] of entries) {
    localStorage.setItem(k, v);
    count++;
  }
  return { ok: true, message: `${count}개 항목 복원됨`, count };
}
