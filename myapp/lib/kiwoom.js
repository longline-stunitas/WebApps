// 키움증권 REST API 시세 조회 (읽기 전용). 서버: push-worker (Cloudflare). 설정은 config.js의 window.PUSH_CONFIG.
// 매매(주문)는 지원하지 않음 — 시세/일봉 조회만.

const cfg = window.PUSH_CONFIG || {};
const API = (cfg.WORKER_URL || "").replace(/\/$/, "");

async function get(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) {
    if (res.status === 503) {
      throw new Error("키움 API 키가 worker에 설정되지 않았습니다. (wrangler secret put KIWOOM_APPKEY/KIWOOM_SECRETKEY)");
    }
    if (res.status === 429) throw new Error("요청이 너무 잦습니다. 잠시 후 다시 시도하세요.");
    let detail = "";
    try {
      const e = await res.json();
      detail = e.error || "";
    } catch {}
    throw new Error(detail || `조회 실패 (${res.status})`);
  }
  return res.json();
}

// { code, name, price, change, changePct, prevClose, volume, updatedAt }
export function fetchQuote(code) {
  return get(`/api/kiwoom/quote?code=${encodeURIComponent(code)}`);
}

// { code, candles: [{date, close, changePct}] } (오래된 날짜부터)
export function fetchDaily(code, count = 30) {
  return get(`/api/kiwoom/daily?code=${encodeURIComponent(code)}&count=${count}`);
}
