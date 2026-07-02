// 메인 메뉴 — 화면 선택 리스트 + 첫 화면 설정(★) + 데이터 백업/복원.
import { get, set } from "../lib/store.js";
import { el, navigate, confirmDialog, setStatus } from "../lib/ui.js";
import { exportJSON, importJSON, backupFilename } from "../lib/backup.js";

export const title = "myapp";

export const MENU = [
  { key: "alarm", label: "알림", desc: "시계 · 정시/가변 알림 · 출석시간" },
  { key: "webview", label: "Webview Test", desc: "URL 북마크 열기" },
  { key: "youtube", label: "유튜브 강좌 타이틀리스트", desc: "재생목록 영상 제목 보기/재생" },
  { key: "baduk", label: "바둑", desc: "강좌 트리 + 기보 기록/재생" },
  { key: "sobriety", label: "금주", desc: "일별 기록 + 월별/년별 통계" },
];

// 백업/복원 모달 — 내보내기(공유/다운로드/복사) + 가져오기(파일/붙여넣기 후 복원).
function openBackup() {
  const json = exportJSON();
  const fname = backupFilename();

  // ── 내보내기 ──
  const ta = el("textarea", { className: "backup-text", value: json, readOnly: true, rows: 6 });

  const shareBtn = el("button", {
    className: "btn-line",
    textContent: "파일로 내보내기",
    onclick: async () => {
      const file = new File([json], fname, { type: "application/json" });
      // iOS PWA: 공유 시트로 파일 앱/메모 등에 저장. 미지원이면 다운로드.
      // title/text를 같이 넘기면 일부 공유 대상(메모 등)이 파일과 별개로 텍스트 항목을 하나 더 만듦 — file만 전달.
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); return; } catch { /* 취소 등 */ }
      }
      const url = URL.createObjectURL(file);
      const a = el("a", { href: url, download: fname });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });

  const copyBtn = el("button", {
    className: "btn-line",
    textContent: "복사",
    onclick: async () => {
      try { await navigator.clipboard.writeText(json); copyBtn.textContent = "복사됨 ✓"; }
      catch { ta.select(); document.execCommand && document.execCommand("copy"); copyBtn.textContent = "복사됨 ✓"; }
      setTimeout(() => (copyBtn.textContent = "복사"), 1500);
    },
  });

  // ── 가져오기 ──
  const importTa = el("textarea", { className: "backup-text", placeholder: "백업 파일을 고르거나 JSON을 붙여넣기…", rows: 4 });
  const fileInput = el("input", {
    type: "file",
    accept: "application/json,.json",
    className: "backup-file",
    onchange: (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { importTa.value = String(r.result || ""); };
      r.readAsText(f);
    },
  });

  const restoreBtn = el("button", {
    className: "btn-line danger",
    textContent: "이 데이터로 복원(덮어쓰기)",
    onclick: async () => {
      const text = importTa.value.trim();
      if (!text) { setStatus("복원할 내용이 없습니다."); return; }
      const ok = await confirmDialog("현재 데이터를 백업 내용으로 덮어씁니다. 계속할까요?", { okText: "복원", danger: true });
      if (!ok) return;
      const res = importJSON(text, "replace");
      if (!res.ok) { setStatus(res.message); return; }
      // 모든 화면이 새 localStorage를 다시 읽도록 새로고침.
      location.reload();
    },
  });

  const card = el("div", { className: "modal-card backup" }, [
    el("h3", { className: "modal-title" }, "데이터 백업 / 복원"),
    el("p", { className: "hint" }, "이 기기 localStorage에만 저장됩니다. 앱 삭제·기기 변경 전 꼭 내보내 두세요."),

    el("div", { className: "backup-sec" }, [
      el("div", { className: "backup-h" }, "내보내기"),
      ta,
      el("div", { className: "att-actions" }, [copyBtn, shareBtn]),
    ]),

    el("div", { className: "backup-sec" }, [
      el("div", { className: "backup-h" }, "가져오기 / 복원"),
      fileInput,
      importTa,
      el("div", { className: "att-actions" }, [restoreBtn]),
    ]),

    el("div", { className: "att-actions" }, [
      el("button", { className: "btn-line", textContent: "닫기", onclick: () => layer.remove() }),
    ]),
  ]);
  const layer = el("div", { className: "modal" }, [card]);
  layer.onclick = (e) => { if (e.target === layer) layer.remove(); };
  document.body.appendChild(layer);
}

export function mount(root) {
  function draw() {
    root.innerHTML = "";
    const firstView = get("firstViewInfo", "none");

    const hint = el("p", { className: "hint" }, "항목을 누르면 이동합니다. ★ 는 앱을 켜면 처음 뜨는 화면입니다.");
    root.appendChild(hint);

    const list = el("div", { className: "menu-list" });
    for (const m of MENU) {
      const isFirst = firstView === m.key;

      const go = el("button", {
        className: "menu-go",
        onclick: () => navigate(m.key),
      }, [
        el("span", { className: "menu-label" }, m.label),
        el("span", { className: "menu-desc" }, m.desc),
      ]);

      const star = el("button", {
        className: "menu-star" + (isFirst ? " on" : ""),
        textContent: isFirst ? "★" : "☆",
        title: "첫 화면으로 설정/해제",
        onclick: () => {
          const cur = get("firstViewInfo", "none");
          set("firstViewInfo", cur === m.key ? "none" : m.key);
          draw();
        },
      });

      list.appendChild(el("div", { className: "menu-item" }, [go, star]));
    }
    root.appendChild(list);

    root.appendChild(el("button", { className: "menu-backup", textContent: "데이터 백업 / 복원", onclick: openBackup }));
  }

  draw();
  return {};
}
