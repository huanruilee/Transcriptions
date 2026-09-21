import json
import pathlib
import shutil
import subprocess
import requests

source = pathlib.Path('/tmp/study-group-playlist-01.mp4')
workspace = pathlib.Path('/home/henry/.gx10/xiaofa/workspace/Transcriptions')
workspace.mkdir(parents=True, exist_ok=True)
mapped_source = workspace / 'study-group-playlist-01.mp4'
shutil.copyfile(source, mapped_source)

targets = {
    'seg-0503': (1224.04, 1227.0),
    'seg-0803': (1836.44, 1840.0),
    'seg-1340': (3317.11, 3320.5),
    'seg-2529': (6198.93, 6202.0),
    'seg-3503': (8470.39, 8473.8),
}
results = {}
for sid, (start, end) in targets.items():
    clip = workspace / f'{sid}.wav'
    subprocess.run([
        'ffmpeg', '-y', '-ss', str(max(0, start - 2)), '-to', str(end + 2),
        '-i', str(mapped_source), '-ar', '16000', '-ac', '1', str(clip)
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    response = requests.post('http://127.0.0.1:8010/v1/audio/transcriptions', data={
        'file': f'/workspace/{clip.name}', 'language': 'zh',
        'response_format': 'verbose_json', 'beam_size': '5', 'temperature': '0.0'
    }, timeout=900)
    response.raise_for_status()
    results[sid] = response.json()
    clip.unlink(missing_ok=True)

path = pathlib.Path('/home/henry/.gx10/tasks/study-group-content-playlist-01-remediation/output/acoustic_verification.json')
path.write_text(json.dumps({'engine': 'gx10-whisper-8010', 'targets': results}, ensure_ascii=False, indent=2) + '\n')
mapped_source.unlink(missing_ok=True)
source.unlink(missing_ok=True)
print(json.dumps({'targets': list(results), 'source_deleted': not source.exists(), 'mapped_source_deleted': not mapped_source.exists()}))
