// 푸시 설정값 — 배포 후 WORKER_URL을 실제 주소로 채우세요.
window.PUSH_CONFIG = {
  // Cloudflare Worker 주소 (예: https://myapp-push.<your-subdomain>.workers.dev)
  // `wrangler deploy` 출력에 표시되는 주소를 그대로 넣으면 됩니다. 끝에 슬래시(/) 없이.
  WORKER_URL: "https://myapp-push.longline-stunitas.workers.dev",

  // VAPID 공개키 (브라우저 구독용 — 공개되어도 되는 값)
  VAPID_PUBLIC_KEY:
    "BJstt43ik_X2g59-2DSFG5sWijz5f9oAXFnZn8nFSpgjFxssPrv4B1wBKy_D8CGybFPtU1BhpqzXKFDPfTB3PYk",

  // 배포 버전 — 메뉴 화면 하단에 표시. 배포(코드 변경)할 때마다 sw.js의 CACHE와 함께 올린다.
  // 폰에서 이 숫자가 바뀌면 새 버전이 반영된 것.
  APP_VERSION: "v56",
};
