#!/usr/bin/env bash
# myapp-push Worker 실시간 로그 보기 (Ctrl+C 로 종료)
# 사용법: ./logs.sh
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/push-worker"
cd "$DIR"

echo "📡 myapp-push Worker 로그 스트리밍... (Ctrl+C 종료)"
echo "   cron(매 1분) 발송, 구독/예약 API 요청이 여기 실시간으로 찍힙니다."
echo

exec npx wrangler tail --format pretty "$@"
