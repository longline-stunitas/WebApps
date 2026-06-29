# myapp

순수 HTML/CSS/JS로 만든 Hello World **PWA**.
아이폰 홈 화면 설치 + 로컬 알림(local notification)을 지원합니다.

## 파일 구조

| 파일 / 폴더             | 역할                                              |
| ----------------------- | ------------------------------------------------- |
| `index.html`            | 마크업 / 진입점 (manifest·apple-touch-icon 링크)  |
| `style.css`             | 스타일                                            |
| `script.js`             | 동작 + 서비스워커 등록 + 알림 요청/전송           |
| `manifest.json`         | PWA 설치 정보 (이름, 아이콘, standalone 표시)     |
| `sw.js`                 | 서비스워커 — 설치 요건 충족 + 알림 표시 주체       |
| `icons/`                | PWA / 애플 터치 아이콘 (PNG)                       |

## 로컬 개발 실행

```bash
cd myapp
python3 -m http.server 8000   # → http://localhost:8000
```

`localhost`는 보안 컨텍스트로 취급되어 서비스워커·알림이 PC에서는 동작합니다.

## 📱 아이폰에 설치 + 로컬 알림 (중요)

iOS는 웹 알림에 제약이 있어 아래 조건을 **모두** 만족해야 알림이 동작합니다.

1. **iOS 16.4 이상** (그 이하는 웹 푸시/알림 미지원).
2. **HTTPS로 접속**해야 함. 아이폰에서 PC의 `localhost`는 열 수 없으므로 다음 중 하나가 필요합니다.
   - 터널: `npx localtunnel --port 8000` 또는 `cloudflared tunnel --url http://localhost:8000` → 발급된 `https://...` 주소로 접속
   - 또는 GitHub Pages / Netlify / Vercel 등 HTTPS 호스팅에 배포
3. **Safari로 접속 → 공유 버튼 → "홈 화면에 추가"** 로 설치.
4. 홈 화면 아이콘으로 **앱을 실행한 상태**에서 "로컬 알림 보내기" 버튼 → 권한 허용.
   - ⚠️ Safari 탭에서는 알림 권한을 받을 수 없습니다. **반드시 홈 화면에 추가된 앱(standalone)** 에서만 가능합니다.

## 업데이트 반영

서비스워커는 **네트워크 우선(network-first)** 으로 동작합니다. 온라인이면 항상 최신 파일을 받고 캐시를 갱신하며, 오프라인이면 캐시로 폴백합니다.

- 화면/로직 수정 → push 후 아이폰에서 **앱을 닫았다 다시 열면 반영**됩니다. (재설치·캐시버전 수동 변경 불필요)
- 단, **manifest(앱 이름·아이콘·start_url) 변경**은 홈 화면에 다시 추가해야 반영됩니다.

## 🔔 예약 알림 (앱 종료 상태에서도 수신)

"N분 뒤" / "매 정시" 알림을 등록하면, 앱을 완전히 종료해도 정해진 시각에 알림이 옵니다.
이는 서버(Cloudflare Worker)가 표준 **Web Push**로 보내기 때문입니다.

- 앱 쪽: `enable-push`로 권한+구독 → 예약 등록/취소 (`script.js`, `config.js`)
- 서버 쪽: `push-worker/` (Cloudflare Worker, 무료). 배포·키 설정은 `push-worker/README.md` 참고.
- **사용 전 `config.js`의 `WORKER_URL`을 배포된 Worker 주소로 채워야 합니다.**

### iOS 한계

- 정밀도는 **분 단위**이고 iOS 푸시는 best-effort라 저전력 모드 등에서 몇 분 지연될 수 있습니다(알람용 X, 리마인더용 O).
- 권한은 **홈 화면에 추가한 standalone 앱**에서만 받을 수 있습니다(Safari 탭 불가).
