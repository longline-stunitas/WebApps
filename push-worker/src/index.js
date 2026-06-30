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
          // 분 경계(:00초)로 올림 정렬 → cron(매 1분)이 도는 바로 그 순간 발송된다.
          // now의 초 성분이 섞여 한 박자 더 밀리던 문제를 없애고, "최소 N분"은 보장한다.
          // (cron granularity가 1분이라 이게 달성 가능한 최선의 정확도)
          fireAt = Math.ceil((now + minutes * 60_000) / 60_000) * 60_000;
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

        // 각 영상 길이(duration) 조회: videos.list contentDetails (id 50개씩)
        const ids = items.map((it) => it.videoId);
        for (let i = 0; i < ids.length; i += 50) {
          const chunk = ids.slice(i, i + 50);
          const vurl = new URL("https://www.googleapis.com/youtube/v3/videos");
          vurl.searchParams.set("part", "contentDetails");
          vurl.searchParams.set("id", chunk.join(","));
          vurl.searchParams.set("key", env.YOUTUBE_API_KEY);
          const vr = await fetch(vurl.toString());
          if (!vr.ok) continue; // 길이는 부가정보 — 실패해도 목록은 그대로 반환
          const vd = await vr.json();
          const durMap = {};
          for (const v of vd.items ?? []) durMap[v.id] = v.contentDetails?.duration ?? null;
          for (const it of items) if (it.videoId in durMap) it.duration = durMap[it.videoId];
        }

        return json({ items, hiddenCount });
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
