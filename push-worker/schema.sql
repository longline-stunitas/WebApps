-- 구독(기기) 정보: Web Push 발송에 필요한 키
CREATE TABLE IF NOT EXISTS subscriptions (
  endpoint   TEXT PRIMARY KEY,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- 예약 알림
--   recurrence = NULL  → 1회성 ("N분 뒤")
--   recurrence = 'hourly' → 매 정시 반복
CREATE TABLE IF NOT EXISTS reminders (
  id         TEXT PRIMARY KEY,
  endpoint   TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  fire_at    INTEGER NOT NULL,   -- 다음 발송 시각 (epoch ms)
  recurrence TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reminders_fire ON reminders(fire_at);
CREATE INDEX IF NOT EXISTS idx_reminders_endpoint ON reminders(endpoint);

-- 키움 REST API OAuth 토큰 캐시 (env: 'real' | 'mock', 1행씩)
CREATE TABLE IF NOT EXISTS kiwoom_tokens (
  env          TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  expires_at   INTEGER NOT NULL   -- epoch ms
);
