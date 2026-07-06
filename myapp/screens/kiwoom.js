// 주식 시세 — 키움증권 REST API 연동, 읽기 전용(조회만, 매매 불가).
// 관심종목 워치리스트(localStorage) + 시세 카드 + 선택 종목 일봉 막대차트.
import { get, set } from "../lib/store.js";
import { el, toast, confirmDialog } from "../lib/ui.js";
import { fetchQuote, fetchDaily } from "../lib/kiwoom.js";
import { fmtPrice, fmtChange } from "../lib/kiwoomFormat.js";

export const title = "주식 시세";

const WATCHLIST_KEY = "kiwoom_watchlist"; // [{code, name}]
const POLL_MS = 30_000;

export function mount(root) {
  let watchlist = get(WATCHLIST_KEY, []);
  const quotes = new Map(); // code -> quote | { error }
  let selectedCode = watchlist[0]?.code || null;
  let dailyCandles = null; // 화면 상태로만 유지(localStorage에 캐싱 안 함 — 시세는 곧 stale해짐)

  const container = el("div", { className: "kw-root" });
  root.appendChild(container);

  const saveWatchlist = () => set(WATCHLIST_KEY, watchlist);

  async function loadQuote(code) {
    try {
      const q = await fetchQuote(code);
      quotes.set(code, q);
      const entry = watchlist.find((w) => w.code === code);
      if (entry && q.name && entry.name !== q.name) {
        entry.name = q.name;
        saveWatchlist();
      }
    } catch (e) {
      quotes.set(code, { error: e.message }); // 이 종목만 에러 표시, 나머지는 정상 진행
    }
  }

  async function loadDaily(code) {
    dailyCandles = null;
    render();
    try {
      const { candles } = await fetchDaily(code, 30);
      dailyCandles = candles;
    } catch (e) {
      dailyCandles = { error: e.message };
    }
    render();
  }

  async function refreshAll() {
    if (document.hidden || !watchlist.length) return;
    await Promise.all(watchlist.map((w) => loadQuote(w.code)));
    render();
  }

  function addCode(raw) {
    const code = raw.trim();
    if (!/^\d{6}$/.test(code)) { toast("6자리 종목코드를 입력하세요."); return; }
    if (watchlist.some((w) => w.code === code)) { toast("이미 추가된 종목입니다."); return; }
    watchlist.push({ code, name: "" });
    saveWatchlist();
    selectedCode = code;
    render();
    loadQuote(code).then(render);
    loadDaily(code);
  }

  async function removeCode(code) {
    const entry = watchlist.find((w) => w.code === code);
    const ok = await confirmDialog(`'${entry?.name || code}'를 관심종목에서 삭제할까요?`, { okText: "삭제", danger: true });
    if (!ok) return;
    watchlist = watchlist.filter((w) => w.code !== code);
    quotes.delete(code);
    saveWatchlist();
    if (selectedCode === code) {
      selectedCode = watchlist[0]?.code || null;
      dailyCandles = null;
      if (selectedCode) loadDaily(selectedCode);
    }
    render();
  }

  function selectCode(code) {
    if (selectedCode === code) return;
    selectedCode = code;
    render();
    loadDaily(code);
  }

  function buildAddRow() {
    const input = el("input", {
      type: "text",
      inputMode: "numeric",
      maxLength: 6,
      placeholder: "종목코드 (6자리, 예: 005930)",
      className: "kw-add-input",
    });
    const addBtn = el("button", { className: "mini", textContent: "추가", onclick: () => { addCode(input.value); input.value = ""; } });
    return el("div", { className: "kw-add-row" }, [input, addBtn]);
  }

  function buildCard(w) {
    const q = quotes.get(w.code);
    let body;
    if (!q) {
      body = el("span", { className: "kw-loading" }, "조회 중…");
    } else if (q.error) {
      body = el("span", { className: "kw-error" }, q.error);
    } else {
      const chg = fmtChange(q.change, q.changePct);
      body = el("div", { className: "kw-card-main" }, [
        el("span", { className: "kw-price" }, fmtPrice(q.price)),
        el("span", { className: `kw-change ${chg.cls}` }, chg.text),
      ]);
    }
    const open = el("button", { className: "kw-open", onclick: () => selectCode(w.code) }, [
      el("span", { className: "menu-label" }, w.name || w.code),
      el("span", { className: "menu-desc" }, w.name ? w.code : ""),
      body,
    ]);
    const del = el("button", { className: "mini danger", textContent: "삭제", onclick: () => removeCode(w.code) });
    return el("div", { className: "wv-item kw-card" + (selectedCode === w.code ? " selected" : "") }, [
      open,
      el("div", { className: "wv-ctrls" }, [del]),
    ]);
  }

  function buildChart() {
    if (!dailyCandles) return el("p", { className: "hint" }, "차트 불러오는 중…");
    if (dailyCandles.error) return el("p", { className: "hint" }, dailyCandles.error);
    if (!dailyCandles.length) return el("p", { className: "hint" }, "일봉 데이터가 없습니다.");
    const closes = dailyCandles.map((c) => c.close).filter((n) => !Number.isNaN(n));
    const min = Math.min(...closes), max = Math.max(...closes);
    const range = max - min || 1;
    const bars = el("div", { className: "sob-bars kw-chart" });
    dailyCandles.forEach((c) => {
      const h = Math.round(((c.close - min) / range) * 100);
      bars.appendChild(el("div", { className: "sob-bar-col" }, [
        el("div", { className: "sob-bar-track" }, [el("div", { className: "sob-bar-fill kw-bar-fill", style: `height:${h}%` })]),
        el("div", { className: "sob-bar-label" }, (c.date || "").slice(-2)),
      ]));
    });
    return bars;
  }

  function render() {
    container.innerHTML = "";
    container.appendChild(el("p", { className: "hint" }, "관심종목의 시세/일봉을 조회합니다 (읽기 전용, 매매 불가)."));
    container.appendChild(buildAddRow());

    const listEl = el("div", { className: "wv-list" });
    if (!watchlist.length) {
      listEl.appendChild(el("div", { className: "empty" }, "종목을 추가하세요."));
    } else {
      watchlist.forEach((w) => listEl.appendChild(buildCard(w)));
    }
    container.appendChild(listEl);

    if (selectedCode) {
      container.appendChild(el("h3", { className: "sec" }, "일봉 (최근 30일)"));
      container.appendChild(buildChart());
    }

    container.appendChild(el("button", { className: "btn-line", textContent: "새로고침", onclick: refreshAll }));
  }

  render();
  refreshAll();
  if (selectedCode) loadDaily(selectedCode);

  // 화면 열려있는 동안만 폴링, 백그라운드일 땐 refreshAll 안에서 스킵
  const pollTimer = setInterval(refreshAll, POLL_MS);

  return {
    unmount() {
      clearInterval(pollTimer);
    },
  };
}
