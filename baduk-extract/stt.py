"""강의 음성을 받아써서 stt.json 으로 저장. Apple Silicon 은 mlx-whisper, 그 외(Windows 등)는 faster-whisper.

사용법: python stt.py <음성 또는 영상 파일> <작업폴더>/stt.json [모델이름]
"""
import json
import platform
import sys

PROMPT = '바둑 화점정석 강의. 화점, 날일자, 눈목자, 붙임, 젖힘, 뻗음, 호구, 끊음, 단수, 축, 장문, 선수, 후수, 함정수, 흑, 백.'

if len(sys.argv) < 3:
    raise SystemExit(__doc__)
audio, out = sys.argv[1], sys.argv[2]
model = sys.argv[3] if len(sys.argv) > 3 else 'large-v3-turbo'

if sys.platform == 'darwin' and platform.machine() == 'arm64':
    import mlx_whisper
    result = mlx_whisper.transcribe(audio, path_or_hf_repo=f'mlx-community/whisper-{model}', language='ko',
                                    initial_prompt=PROMPT, condition_on_previous_text=False)
    segments = [(x['start'], x['end'], x['text']) for x in result['segments']]
else:
    from faster_whisper import WhisperModel
    # GPU(CUDA) 설정 없이도 돌아가도록 CPU 기본
    whisper = WhisperModel(model, device='cpu', compute_type='int8')
    found, _ = whisper.transcribe(audio, language='ko', initial_prompt=PROMPT,
                                  condition_on_previous_text=False)
    segments = [(x.start, x.end, x.text) for x in found]

with open(out, 'w', encoding='utf-8') as f:
    json.dump([{'s': s, 'e': e, 't': t.strip()} for s, e, t in segments], f, ensure_ascii=False)
print('segments', len(segments))
