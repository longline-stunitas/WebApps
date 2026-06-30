// localStorage 헬퍼 — 모든 영속 상태를 JSON으로 저장/복원.
// (iOS PWA에서 UserDefaults 대체. 키-값 단순 매핑)

export function get(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function set(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function remove(key) {
  localStorage.removeItem(key);
}

export function uid() {
  if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
