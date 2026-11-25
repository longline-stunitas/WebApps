"""영상 프레임에서 바둑판 상태를 읽는 부분 + 바둑 규칙(따냄)."""
import cv2
import numpy as np

# 19x19 격자의 좌우/상하 끝선 픽셀 좌표 (1280x720, '쉬운바둑' 화점정석 #4 화면 기준)
X0, X1, Y0, Y1 = 62, 742, 19, 700

XS = [X0 + (X1 - X0) * i / 18 for i in range(19)]
YS = [Y0 + (Y1 - Y0) * i / 18 for i in range(19)]
_yy, _xx = np.mgrid[-18:19, -18:19]
_r = np.hypot(_xx, _yy)
RING = (_r >= 9) & (_r <= 15)  # 돌의 수순 번호를 피해 고리 영역만 샘플링


def read_board(img):
    """프레임 1장 -> 361글자 문자열 ('B', 'W', '.')"""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    pad = cv2.copyMakeBorder(hsv, 20, 20, 20, 20, cv2.BORDER_REPLICATE)
    res = []
    for y in YS:
        for x in XS:
            top, left = int(round(y)) + 2, int(round(x)) + 2
            p = pad[top:top + 37, left:left + 37][RING]
            s, v = p[:, 1].astype(int), p[:, 2].astype(int)
            black = (v < 85).mean()
            white = ((s < 55) & (v > 130)).mean()
            res.append('B' if black > 0.65 else 'W' if white > 0.60 else '.')
    return ''.join(res)


def read_states(video):
    """초당 약 10장을 읽고, 2번 연속 같게 읽힌 상태만 [(초, 판)] 으로 반환."""
    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        raise SystemExit(f'영상을 열 수 없음: {video}')
    fps = cap.get(cv2.CAP_PROP_FPS)
    step = max(1, round(fps / 10))
    states, prev, cnt, start, n = [], None, 0, 0, 0
    while True:
        if not cap.grab():
            break
        if n % step == 0:
            img = cap.retrieve()[1]
            if n == 0 and img.shape[:2] != (720, 1280):
                raise SystemExit(f'1280x720 영상이 필요함 (현재 {img.shape[1]}x{img.shape[0]})')
            s = read_board(img)
            if s == prev:
                cnt += 1
            else:
                prev, cnt, start = s, 1, n / fps
            if cnt == 2 and (not states or states[-1][1] != s):
                states.append((start, s))
        n += 1
    return states


def neighbors(i):
    y, x = divmod(i, 19)
    for a, b in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
        if 0 <= a < 19 and 0 <= b < 19:
            yield a * 19 + b


def group(bd, i):
    g, stack, liberty = {i}, [i], False
    while stack:
        for n in neighbors(stack.pop()):
            if bd[n] == '.':
                liberty = True
            elif bd[n] == bd[i] and n not in g:
                g.add(n)
                stack.append(n)
    return g, liberty


def play(bd, i, color):
    """i 에 color 돌을 놓고 상대의 죽은 돌을 들어낸 판."""
    b = list(bd)
    b[i] = color
    for n in neighbors(i):
        if b[n] not in ('.', color):
            g, liberty = group(b, n)
            if not liberty:
                for k in g:
                    b[k] = '.'
    return ''.join(b)


def name(i):
    y, x = divmod(i, 19)
    return 'ABCDEFGHJKLMNOPQRST'[x] + str(19 - y)
