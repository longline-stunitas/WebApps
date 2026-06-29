# myapp-push (Cloudflare Worker)

myapp의 **예약 알림** 백엔드. 앱이 종료돼 있어도 정해진 시각에 Web Push를 보냅니다.

- HTTPS API: 구독 등록 / 예약 추가·조회·취소
- Cron(매 1분): 도래한 예약을 찾아 Web Push 발송 (1회성 / 매 정시 반복)
- 저장소: Cloudflare D1 (SQLite)
- 발송: [PushForge](https://github.com/draphy/pushforge) (표준 Web Push, VAPID)

전부 **Cloudflare 무료 플랜**으로 동작합니다.

---

## 배포 절차 (최초 1회)

> Cloudflare 계정(무료)이 필요합니다. 아래 명령은 `push-worker/` 폴더에서 실행하세요.
> 로그인은 브라우저가 열리므로, 터미널 프롬프트에서 `!` 를 붙여 직접 실행하시면 됩니다.

### 0) 의존성 설치

```bash
cd push-worker
npm install
```

### 1) Cloudflare 로그인

```bash
npx wrangler login
```

### 2) D1 데이터베이스 생성 + 스키마 적용

```bash
npx wrangler d1 create myapp-reminders
```

출력에 나오는 `database_id = "..."` 값을 **`wrangler.toml`의 `PUT_DATABASE_ID_HERE`** 자리에 붙여넣으세요. 그다음 스키마 생성:

```bash
npx wrangler d1 execute myapp-reminders --remote --file=./schema.sql
```

### 3) VAPID 개인키를 secret으로 등록

아래 명령을 실행하면 값 입력 프롬프트가 뜹니다. **VAPID 개인 JWK** 를 한 줄로 붙여넣으세요.

```bash
npx wrangler secret put VAPID_PRIVATE_KEY
```

> ⚠️ **개인 JWK는 절대 이 파일이나 git에 적지 마세요.** 키 쌍은 아래 "키 발급/재발급"으로 생성하고,
> 공개키만 `myapp/config.js`에 넣고, 개인 JWK는 위 `wrangler secret put` 프롬프트에만 붙여넣습니다.
> (개인키를 코드/문서에 남기면 공개 저장소에 노출됩니다.)

### 4) 배포

```bash
npx wrangler deploy
```

배포가 끝나면 `https://myapp-push.<your-subdomain>.workers.dev` 주소가 출력됩니다.
이 주소를 **`myapp/config.js`의 `WORKER_URL`** 에 채우고(끝 슬래시 없이) 커밋·push 하면 GitHub Pages 앱이 백엔드를 사용합니다.

---

## API

| 메서드 | 경로 | 설명 |
| ------ | ---- | ---- |
| POST | `/api/subscribe` | 구독 등록 (body: PushSubscription JSON) |
| POST | `/api/reminders` | 예약 추가 (`{endpoint, type:'once', minutes}` 또는 `{endpoint, type:'hourly'}`) |
| GET | `/api/reminders?endpoint=` | 예약 목록 |
| DELETE | `/api/reminders?id=` | 예약 취소 |
| POST | `/api/test` | 즉시 테스트 발송 (`{endpoint}`) |

## 키 재발급

VAPID 키를 새로 만들려면:

```bash
npx @pushforge/builder vapid
```

공개키 → `myapp/config.js`, 개인 JWK → `wrangler secret put VAPID_PRIVATE_KEY`. (키를 바꾸면 기존 구독은 모두 무효가 되어 재구독이 필요합니다.)

## 로컬 점검

```bash
npx wrangler dev          # 로컬 실행
npx wrangler tail         # 배포본 실시간 로그 (cron/발송 디버깅)
```
