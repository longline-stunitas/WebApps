import { buildPushHTTPRequest } from "@pushforge/builder";

const HOUR_MS = 3600_000;

// ── CORS ──
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });

// 매 정시(:00) 중 now 이후 가장 가까운 시각
const nextTopOfHour = (now) => (Math.floor(now / HOUR_MS) + 1) * HOUR_MS;

// ── 키움 REST API 프록시 (읽기 전용 시세 조회) ──
class KiwoomError extends Error {
  constructor(status, body) {
    super(body?.error || `kiwoom error ${status}`);
    this.status = status;
    this.body = body;
  }
}

// "YYYYMMDDHHMMSS"(KST 절대시각) → epoch ms. 한국은 서머타임 없음(UTC+9 고정).
function parseKiwoomTs(ts) {
  const y = +ts.slice(0, 4), mo = +ts.slice(4, 6), d = +ts.slice(6, 8);
  const h = +ts.slice(8, 10), mi = +ts.slice(10, 12), s = +ts.slice(12, 14);
  return Date.UTC(y, mo - 1, d, h - 9, mi, s);
}

// 캐시된 토큰이 있으면 재사용, 만료 5분 전이면 재발급(D1에 upsert)
async function getKiwoomToken(env) {
  const row = await env.DB.prepare(
    `SELECT access_token, expires_at FROM kiwoom_tokens WHERE env='real'`
  ).first();
  const now = Date.now();
  const SAFETY_MS = 5 * 60_000;
  if (row && row.expires_at - SAFETY_MS > now) return row.access_token;

  const r = await fetch("https://api.kiwoom.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: env.KIWOOM_APPKEY,
      secretkey: env.KIWOOM_SECRETKEY,
    }),
  });
  if (!r.ok) throw new KiwoomError(502, { error: "kiwoom auth failed", detail: await r.text().catch(() => "") });
  const data = await r.json();
  const expiresAt = parseKiwoomTs(data.expires_dt);
  await env.DB.prepare(
    `INSERT INTO kiwoom_tokens (env, access_token, expires_at) VALUES ('real', ?, ?)
     ON CONFLICT(env) DO UPDATE SET access_token=excluded.access_token, expires_at=excluded.expires_at`
  )
    .bind(data.token, expiresAt)
    .run();
  return data.token;
}

// 키움 TR 호출 공통 처리(토큰 획득/재발급 + 에러 매핑). apiId/헤더명·path는 devguide로 재확인 필요.
async function kiwoomCall(env, path, apiId, body) {
  if (!env.KIWOOM_APPKEY || !env.KIWOOM_SECRETKEY)
    throw new KiwoomError(503, { error: "KIWOOM_APPKEY/KIWOOM_SECRETKEY not configured" });

  let token;
  try {
    token = await getKiwoomToken(env);
  } catch (e) {
    if (e instanceof KiwoomError) throw e;
    throw new KiwoomError(502, { error: "kiwoom auth failed", detail: String(e?.message || e) });
  }

  const r = await fetch(`https://api.kiwoom.com${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      authorization: `Bearer ${token}`,
      "cont-yn": "N",
      "next-key": "",
      "api-id": apiId,
    },
    body: JSON.stringify(body),
  });

  if (r.status === 401) {
    // 캐시된 토큰이 실제로는 만료/무효 → 지우고 다음 호출에서 재발급되게 함
    await env.DB.prepare(`DELETE FROM kiwoom_tokens WHERE env='real'`).run();
    throw new KiwoomError(502, { error: "kiwoom auth expired, retry" });
  }
  if (r.status === 429) throw new KiwoomError(429, { error: "kiwoom rate limited, slow down" });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new KiwoomError(r.status >= 500 ? 502 : r.status, { error: `kiwoom ${r.status}`, detail });
  }
  return r.json();
}

// 원본 키움 필드명은 여기 안에만 존재 — devguide로 실제 필드명 확정되면 이 함수만 고치면 됨
function reshapeQuote(code, data) {
  const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));
  return {
    code,
    name: data.stk_nm ?? data.hts_kor_isnm ?? null,
    price: num(data.cur_prc ?? data.stck_prpr),
    change: num(data.pred_pre ?? data.prdy_vrss),
    changePct: num(data.flu_rt ?? data.prdy_ctrt),
    prevClose: num(data.pred_close_prc),
    volume: num(data.trde_qty ?? data.acml_vol),
    updatedAt: Date.now(),
  };
}

function reshapeDaily(code, data, count) {
  const rows = data.output ?? data.stk_dt_pole_chart_qry ?? data.items ?? [];
  const candles = rows
    .slice(0, count)
    .map((row) => ({
      date: row.dt ?? row.stck_bsop_date ?? null,
      close: Number(row.cur_prc ?? row.stck_clpr ?? 0),
      changePct: row.flu_rt !== undefined ? Number(row.flu_rt) : null,
    }))
    .reverse(); // 오래된 날짜부터
  return { code, candles };
}

export default {
  // ── HTTP API ──
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 구독 등록(업서트)
      if (path === "/api/subscribe" && request.method === "POST") {
        const sub = await request.json();
        if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth)
          return json({ error: "invalid subscription" }, 400);
        await env.DB.prepare(
          `INSERT INTO subscriptions (endpoint, p256dh, auth, created_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth`
        )
          .bind(sub.endpoint, sub.keys.p256dh, sub.keys.auth, Date.now())
          .run();
        return json({ ok: true });
      }

      // 예약 추가
      if (path === "/api/reminders" && request.method === "POST") {
        const b = await request.json();
        const { endpoint, type } = b;
        if (!endpoint) return json({ error: "endpoint required" }, 400);

        const now = Date.now();
        let fireAt, recurrence, title, body;

        if (type === "once") {
          const minutes = Number(b.minutes);
          if (!minutes || minutes <= 0) return json({ error: "minutes required" }, 400);
          // 분 경계(:00초)로 정렬 → cron(매 1분)이 도는 순간 발송된다.
          // 올림(ceil)으로 고정하면 now의 초 성분에 따라 최대 59초 가까이 더 밀릴 수 있어
          // (예: 20초에 1분 설정→1분40초 대기) 반올림(round)으로 가장 가까운 분 경계에 맞춘다.
          // now의 초가 30 초과면 사실상 1분을 뺀 셈이 되고(다음 경계가 더 가까움),
          // 30 이하면 기존과 동일하게 다음 경계로 올림된다 — 최대 초과 대기가 59초→약 30초로 줄어든다.
          fireAt = Math.round((now + minutes * 60_000) / 60_000) * 60_000;
          recurrence = null;
          title = b.title || "알림";
          body = b.body || `${minutes}분 전에 요청한 알림입니다.`;
        } else if (type === "hourly") {
          fireAt = nextTopOfHour(now);
          recurrence = "hourly";
          title = b.title || "정시 알림";
          body = b.body || "매 정시 알림입니다.";
        } else {
          return json({ error: "type must be 'once' or 'hourly'" }, 400);
        }

        const id = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO reminders (id, endpoint, title, body, fire_at, recurrence, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(id, endpoint, title, body, fireAt, recurrence, now)
          .run();
        return json({ ok: true, id, fireAt, recurrence });
      }

      // 예약 목록
      if (path === "/api/reminders" && request.method === "GET") {
        const endpoint = url.searchParams.get("endpoint");
        if (!endpoint) return json({ error: "endpoint required" }, 400);
        const { results } = await env.DB.prepare(
          `SELECT id, title, body, fire_at, recurrence FROM reminders
           WHERE endpoint = ? ORDER BY fire_at ASC`
        )
          .bind(endpoint)
          .all();
        return json({ reminders: results ?? [] });
      }

      // 예약 취소
      if (path === "/api/reminders" && request.method === "DELETE") {
        const id = url.searchParams.get("id");
        if (!id) return json({ error: "id required" }, 400);
        await env.DB.prepare(`DELETE FROM reminders WHERE id = ?`).bind(id).run();
        return json({ ok: true });
      }

      // 유튜브 재생목록 영상 목록 프록시 (API 키는 secret으로 숨김 — 클라이언트에 노출 안 함)
      if (path === "/api/youtube/playlist" && request.method === "GET") {
        const playlistId = url.searchParams.get("playlistId");
        if (!playlistId) return json({ error: "playlistId required" }, 400);
        if (!env.YOUTUBE_API_KEY) return json({ error: "YOUTUBE_API_KEY not configured" }, 503);

        const items = [];
        let pageToken = "";
        let hiddenCount = 0;
        do {
          const api = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
          api.searchParams.set("part", "snippet");
          api.searchParams.set("maxResults", "50");
          api.searchParams.set("playlistId", playlistId);
          api.searchParams.set("key", env.YOUTUBE_API_KEY);
          if (pageToken) api.searchParams.set("pageToken", pageToken);

          const r = await fetch(api.toString());
          if (!r.ok) {
            return json({ error: `youtube ${r.status}`, detail: await r.text().catch(() => "") }, r.status);
          }
          const data = await r.json();
          for (const it of data.items ?? []) {
            const sn = it.snippet ?? {};
            const vid = sn.resourceId?.videoId;
            const thumb = sn.thumbnails?.default?.url ?? null;
            const t = sn.title ?? "";
            // private/deleted: videoId 없음 / 썸네일 없음 / 제목이 Private·Deleted video
            // → 영상 리스트·NEW에서 제외하고 hiddenCount(감춤 수)만 증가
            if (!vid || !thumb || t === "Private video" || t === "Deleted video") {
              hiddenCount += 1;
              continue;
            }
            items.push({
              videoId: vid,
              title: t,
              thumbnail: thumb,
              position: sn.position ?? null,
            });
          }
          pageToken = data.nextPageToken ?? "";
        } while (pageToken);

        // 각 영상 길이(duration) + 게시일(publishedAt) 조회: videos.list (id 50개씩)
        const ids = items.map((it) => it.videoId);
        for (let i = 0; i < ids.length; i += 50) {
          const chunk = ids.slice(i, i + 50);
          const vurl = new URL("https://www.googleapis.com/youtube/v3/videos");
          vurl.searchParams.set("part", "contentDetails,snippet");
          vurl.searchParams.set("id", chunk.join(","));
          vurl.searchParams.set("key", env.YOUTUBE_API_KEY);
          const vr = await fetch(vurl.toString());
          if (!vr.ok) continue; // 부가정보 — 실패해도 목록은 그대로 반환
          const vd = await vr.json();
          const durMap = {}, pubMap = {};
          for (const v of vd.items ?? []) {
            durMap[v.id] = v.contentDetails?.duration ?? null;
            pubMap[v.id] = v.snippet?.publishedAt ?? null; // 영상 게시일
          }
          for (const it of items) {
            if (it.videoId in durMap) it.duration = durMap[it.videoId];
            if (it.videoId in pubMap) it.published = pubMap[it.videoId];
          }
        }

        return json({ items, hiddenCount });
      }

      // 키움 시세 조회 (읽기 전용, 앱키/시크릿은 secret으로 숨김)
      if (path === "/api/kiwoom/quote" && request.method === "GET") {
        const code = url.searchParams.get("code");
        if (!code || !/^\d{6}$/.test(code)) return json({ error: "code must be 6-digit KRX code" }, 400);
        try {
          // TR id "ka10001"·path "/api/dostk/stkinfo"는 devguide로 재확인 필요
          const data = await kiwoomCall(env, "/api/dostk/stkinfo", "ka10001", { stk_cd: code });
          return json(reshapeQuote(code, data));
        } catch (e) {
          if (e instanceof KiwoomError) return json(e.body, e.status);
          return json({ error: String(e?.message || e) }, 500);
        }
      }

      // 키움 일봉 조회 (읽기 전용)
      if (path === "/api/kiwoom/daily" && request.method === "GET") {
        const code = url.searchParams.get("code");
        if (!code || !/^\d{6}$/.test(code)) return json({ error: "code must be 6-digit KRX code" }, 400);
        const count = Math.min(Math.max(Number(url.searchParams.get("count")) || 30, 1), 100);
        try {
          // TR id "ka10081"·path "/api/dostk/chart"는 devguide로 재확인 필요
          const data = await kiwoomCall(env, "/api/dostk/chart", "ka10081", {
            stk_cd: code,
            base_dt: "",
            upd_stkpc_tp: "1",
          });
          return json(reshapeDaily(code, data, count));
        } catch (e) {
          if (e instanceof KiwoomError) return json(e.body, e.status);
          return json({ error: String(e?.message || e) }, 500);
        }
      }

      // 즉시 테스트 발송
      if (path === "/api/test" && request.method === "POST") {
        const { endpoint } = await request.json();
        if (!endpoint) return json({ error: "endpoint required" }, 400);
        const sub = await env.DB.prepare(`SELECT * FROM subscriptions WHERE endpoint = ?`)
          .bind(endpoint)
          .first();
        if (!sub) return json({ error: "subscription not found" }, 404);
        await sendPush(env, sub, { title: "테스트", body: "테스트 푸시입니다 👋" });
        return json({ ok: true });
      }

      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String(e?.message || e) }, 500);
    }
  },

  // ── 매 1분 cron: 도래한 예약 발송 ──
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runDue(env));
  },
};

async function runDue(env) {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.title, r.body, r.fire_at, r.recurrence,
            s.endpoint, s.p256dh, s.auth
     FROM reminders r
     JOIN subscriptions s ON s.endpoint = r.endpoint
     WHERE r.fire_at <= ?`
  )
    .bind(now)
    .all();

  for (const r of results ?? []) {
    let delivered = true;
    try {
      await sendPush(env, r, { title: r.title, body: r.body });
    } catch (e) {
      // 구독 만료(404/410)면 정리
      if (/\b(404|410)\b/.test(String(e?.message || e))) {
        await env.DB.prepare(`DELETE FROM subscriptions WHERE endpoint = ?`).bind(r.endpoint).run();
        await env.DB.prepare(`DELETE FROM reminders WHERE endpoint = ?`).bind(r.endpoint).run();
        delivered = false;
      }
    }
    if (!delivered) continue;

    if (r.recurrence === "hourly") {
      // 밀린 실행을 따라잡지 않도록 now 기준 다음 정시로 재설정
      await env.DB.prepare(`UPDATE reminders SET fire_at = ? WHERE id = ?`)
        .bind(nextTopOfHour(now), r.id)
        .run();
    } else {
      await env.DB.prepare(`DELETE FROM reminders WHERE id = ?`).bind(r.id).run();
    }
  }
}

async function sendPush(env, sub, payload) {
  const { endpoint, headers, body } = await buildPushHTTPRequest({
    privateJWK: JSON.parse(env.VAPID_PRIVATE_KEY),
    subscription: {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    },
    message: {
      payload,
      adminContact: env.VAPID_SUBJECT,
      options: { ttl: 3600, urgency: "high" },
    },
  });

  const res = await fetch(endpoint, { method: "POST", headers, body });
  if (!res.ok) {
    throw new Error(`push failed ${res.status} ${await res.text().catch(() => "")}`);
  }
}
