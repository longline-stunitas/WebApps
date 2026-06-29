# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 저장소 성격

이 저장소(`WebApps`)는 **여러 개의 독립적인 웹앱을 모아 두는 컨테이너**입니다.
각 웹앱은 루트 바로 아래에 **자체 폴더 단위로 따로 관리**됩니다. (예: `myapp/`)

- 단위 프로젝트별로 폴더가 곧 하나의 앱이며, 서로 의존하지 않는 것을 기본 전제로 합니다.
- 빌드/실행/테스트 명령은 **각 앱 폴더 내부에서** 수행합니다. 루트에는 공통 빌드 시스템이 없습니다.
- 새 앱을 추가할 때는 루트 아래에 새 폴더를 만들고, 그 안에 해당 앱의 README와 실행 방법을 둡니다.

## 앱 목록

| 폴더     | 스택                          | 실행                                          |
| -------- | ----------------------------- | --------------------------------------------- |
| `myapp/` | 순수 HTML/CSS/JS **PWA**      | `cd myapp && python3 -m http.server 8000`     |

> 새 앱을 추가하면 이 표에 한 줄 추가하세요.

`myapp`은 아이폰 홈 화면 설치 + 알림을 목표로 한 PWA입니다. iOS 제약(16.4+, HTTPS 필수, 홈 화면 추가한 standalone 앱에서만 알림 권한 가능)은 `myapp/README.md`에 정리되어 있습니다. 알림 관련 작업 시 그 문서를 먼저 확인하세요.

### push-worker (myapp 백엔드)

`push-worker/`는 정적 앱이 아니라 **Cloudflare Worker**입니다 (GitHub Pages가 아닌 Cloudflare에 별도 배포). 앱이 종료된 상태에서도 예약 알림을 보내기 위한 백엔드로, 표준 Web Push + VAPID + D1 + cron(매 1분)으로 동작합니다. 자세한 배포·구조는 `push-worker/README.md` 참고.

- 앱(`myapp`)과의 연결: `myapp/config.js`의 `WORKER_URL`(Worker 주소) + `VAPID_PUBLIC_KEY`(공개키).
- **VAPID 개인키는 절대 커밋 금지** — Cloudflare secret(`wrangler secret put VAPID_PRIVATE_KEY`)으로만 보관.
- `push-worker/node_modules`, `.wrangler`는 gitignore 처리됨. GitHub Pages 배포 artifact에는 영향 없음(커밋된 소스만 업로드되고 Worker 소스는 페이지로 링크되지 않음).

## 규칙

- **앱 간 코드 공유 금지(기본):** 각 폴더는 독립적으로 동작해야 합니다. 공유가 필요해지면 먼저 사용자와 구조를 상의하세요.
- **AI 도구 파일은 커밋 금지:** `.serena/`, `.claude/`, `CLAUDE.local.md`, `.mcp.json` 등은 `.gitignore`로 제외되어 있습니다. `CLAUDE.md`(이 파일) 자체는 커밋 대상입니다.
- **의존성/빌드 산출물:** `node_modules/`, `dist/`, `build/`, `.next/` 등은 어느 하위 폴더에 있든 `.gitignore`로 제외됩니다.

## 배포 (GitHub Pages)

- `main`에 push하면 `.github/workflows/pages.yml`이 저장소 루트 전체를 GitHub Pages로 자동 배포합니다. (워크플로가 Pages를 자동 활성화 — 수동 설정 불필요)
- 공개 주소: `https://longline-stunitas.github.io/WebApps/` (루트는 앱 목록 랜딩 페이지)
- 각 앱은 하위 경로로 서빙됩니다: 예) `myapp/` → `https://longline-stunitas.github.io/WebApps/myapp/`
- **하위 경로 서빙 전제:** 모든 앱은 자산을 **상대경로**로 참조해야 합니다(`./...`). 절대경로(`/...`)는 `WebApps/` 프리픽스 때문에 깨집니다. PWA의 `manifest.json`(`start_url`, `scope`)과 서비스워커 등록 경로도 상대경로로 유지하세요.

## 스택별 참고

- 순수 HTML/CSS/JS 앱은 빌드 단계가 없습니다. ES 모듈이나 `fetch`를 쓰면 `file://`에서 막히므로 로컬 HTTP 서버(`python3 -m http.server`)로 실행하세요.
- npm 기반 앱(Vite/Next 등)을 추가할 경우, 의존성 설치·실행·테스트는 모두 그 앱 폴더 안에서 진행합니다.
