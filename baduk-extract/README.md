# baduk-extract

유튜브 바둑 강의 영상에서 **수순을 뽑아 강사의 해설에 시간순으로 매핑**하는 도구 (웹앱 아님, 로컬 Python 스크립트).

## Windows 실행 (PowerShell, 저장소 루트에서 시작)

Python 3.10~3.12 권장. ffmpeg 는 필요 없음.

```powershell
cd baduk-extract
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
mkdir work

$URL = "https://www.youtube.com/watch?v=bz67s5mESSY"   # 화점정석 #4
.\.venv\Scripts\yt-dlp -f "bv*[height=720][ext=mp4]" -o "work/v.%(ext)s" $URL
.\.venv\Scripts\yt-dlp -f "ba" -o "work/a.%(ext)s" $URL

# 받아쓰기 (첫 실행 때 모델 약 1.6GB 다운로드, CPU 라 시간이 걸림)
.\.venv\Scripts\python stt.py (Get-Item work\a.*).FullName work\stt.json
# 수순 추출 + 해설 매핑
.\.venv\Scripts\python timeline.py work\v.mp4 work
```

macOS 는 `.venv/bin/python` 을 쓰면 되고, Apple Silicon 에서는 `mlx-whisper` 가 설치된다.

## 결과물 (`work/`, git 제외)

- `timeline.md` : 해설 문장 + 그 구간의 수순
- `timeline.json` : `events`(시각 `t`, `kind` = move / back / change, 그 시점의 361칸 `board`) + `speech`(`s`, `e`, `t`)

`board` 는 위(19선)에서 아래로, 왼쪽(A)에서 오른쪽(T)으로 읽은 문자열이다.

## 테스트 결과 (2026-11-25, macOS, 화점정석 #4, 17분)

| 항목 | 결과 |
| --- | --- |
| 해설 문장 구간 | 369 (mlx-whisper large-v3-turbo) |
| 돌 놓기 / 되돌리기 / 판 변경 | move 사건 262 (돌 270개) / 163 / 44 |
| 놓은 순서를 추정한 돌 | 16 |
| 수 번호를 못 붙인 돌 | 56 |

- 1:10, 6:40, 12:30 세 장면은 원본 화면과 돌 위치가 일치 (전수 대조는 안 함).
- Windows 의 `faster-whisper` 는 받아쓰기 결과(문장 구간 수, 단어)가 위와 다를 수 있다.

## 알아둘 점 / 남은 일

1. `board.py` 의 격자 좌표는 이 영상 화면(1280x720)에 맞춰 고정. 화면 배치가 다른 영상은 다시 잡아야 한다.
2. 영상은 첫 화면에 흑 1(C18)이 이미 놓여 있다. `timeline.py` 가 이 값을 **하드코딩**(`c18`)하므로 다른 영상에는 수정이 필요하다.
3. 수 번호는 화면 숫자를 읽은 것이 아니라 놓은 순서로 계산. '판 변경' 뒤에는 번호가 끊길 수 있다. 돌 번호를 직접 인식하면 번호 복원과 순서 검증이 가능할 것으로 보인다.
4. 받아쓰기 오류(흑→흙, 백→100, 우상귀→우산기). 용어 교정표가 필요하며 숫자 100은 문맥 판단 필요.
5. 해설은 돌을 놓은 시각이 속한 문장에 붙는다. 말과 동작의 시차는 보정하지 않는다.
6. 다음 단계 후보: `myapp` 바둑 화면에서 유튜브 재생과 바둑판·해설 동기화. 먼저 로컬 시험 화면으로 싱크 확인.

## 주의

영상·음성·받아쓰기 결과는 강사의 저작물이다. **커밋하지 말 것** (이 저장소는 GitHub Pages 로 전체가 배포된다). 개인 분석용으로만 사용한다.
