#!/usr/bin/env python3
"""以同一音訊切片重跑舊版與新版，輸出可稽核 CER（不接觸正式檔案）。"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time
import types

from lib.pipeline_evaluation import compare_runs, cer

ROOT = Path(__file__).resolve().parent.parent
COURSE = ROOT / 'courses' / '入中論善顯密意疏'


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def text_of(rows):
    return ''.join(s['text'] for s in rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--audio', required=True, type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    parser.add_argument('--start', type=float, default=0, help='原始音檔中的切片起點')
    parser.add_argument('--end', required=True, type=float, help='原始音檔中的切片終點')
    parser.add_argument('--baseline-ref', default='44a23af')
    parser.add_argument('--vad', type=int, nargs='+', default=[600, 900, 1200])
    args = parser.parse_args()
    out = args.output_dir.resolve()
    sandbox = (ROOT / 'tmp/pipeline_v2/36A').resolve()
    if out != sandbox and sandbox not in out.parents:
        parser.error('輸出必須位於 tmp/pipeline_v2/36A/')
    if args.start < 0 or args.end <= args.start:
        parser.error('無效的音訊時間範圍')
    import requests
    import opencc
    import batch_convert_all as candidate
    converter = opencc.OpenCC('s2twp')
    golden_path = COURSE / 'verbatim/verbatim_36A.json'
    gold = json.loads(golden_path.read_text())
    rows = [s for group in gold['paragraphs'].values() for s in group]
    if any(s['start'] < boundary < s['end'] for s in rows for boundary in [args.start, args.end]):
        parser.error('切片邊界不得切斷黃金樣本句子')
    selected = [s for s in rows if s['start'] >= args.start and s['end'] <= args.end]
    if not selected:
        parser.error('切片內沒有完整黃金樣本句子')
    protected = [COURSE / folder / name for folder, names in {
        'verbatim': ['verbatim_36A.json', 'verbatim_36B.json'],
        'publications': ['lecture_36A_study_guide.md', 'lecture_36B_study_guide.md',
                         'lecture_36A_study_guide.html', 'lecture_36B_study_guide.html'],
        'sessions': ['session_36A.json', 'session_36B.json'],
    }.items() for name in names]
    before = {str(p.relative_to(ROOT)): digest(p) for p in protected}
    out.mkdir(parents=True, exist_ok=True)
    reference = text_of(selected)
    dump(out / 'reference.json', selected)
    baseline_sha = subprocess.check_output(['git', 'rev-parse', args.baseline_ref], cwd=ROOT, text=True).strip()
    old_source = subprocess.check_output(['git', 'show', f'{baseline_sha}:scripts/batch_convert_all.py'], cwd=ROOT, text=True)
    baseline = types.ModuleType('pipeline_baseline')
    baseline.__file__ = str(ROOT / 'scripts/batch_convert_all.py')
    exec(compile(old_source, baseline.__file__, 'exec'), baseline.__dict__)
    health_url = candidate.WHISPER_GPU_URL.replace('/v1/audio/transcriptions', '/health')
    health = requests.get(health_url, timeout=10).json()
    models_url = candidate.VLLM_FALLBACK_URL.replace('/chat/completions', '/models')
    models = requests.get(models_url, timeout=10).json()
    manifest = {
        'created_at': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
        'baseline_sha': baseline_sha,
        'candidate_head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'candidate_code_sha256': {name: digest(ROOT / name) for name in (
            'scripts/batch_convert_all.py', 'scripts/build_verbatim_track.py',
            'scripts/lib/session_prompt.py', 'scripts/lib/pipeline_evaluation.py',
            'scripts/evaluate_pipeline_v2.py',
            'courses/入中論善顯密意疏/learned_corrections.json')},
        'audio_sha256': digest(args.audio), 'golden_sha256': digest(golden_path),
        'clip_start': args.start, 'clip_end': args.end, 'golden_sentences': len(selected),
        'whisper_health': health, 'llm_models': models,
        'scope': '切片評估，不代表全講驗收',
        'normalization': 'NFC、小寫、移除空白與標點；保留所有實詞、重複及語氣詞；假說以 OpenCC s2twp 轉正體',
        'protected_before': before,
    }
    dump(out / 'manifest.json', manifest)
    audio_map, session_map = candidate.load_audio_map(), candidate.load_course_session_map()
    old_context, _ = baseline.get_session_source_text('36A', session_map)
    raw, duration = baseline.step1_asr_transcribe('36A', args.audio)
    dump(out / 'baseline/01_asr.json', {'segments': raw, 'duration': duration})
    pre = baseline.step2_pre_polish(raw)
    dump(out / 'baseline/02_prepolished.json', pre)
    old = baseline.step3_llm_proofread(pre, '36A', source_text=old_context)
    dump(out / 'baseline/03_proofread.json', old)
    old_text = converter.convert(text_of(old))
    evaluations = []
    for vad in args.vad:
        candidate.VAD_MIN_SILENCE_MS = vad
        run_dir = out / f'vad_{vad}'
        candidate.process_single_session('36A', audio_map, session_map=session_map,
                                         audio_path=args.audio, output_dir=run_dir)
        payload = json.loads((run_dir / 'verbatim_36A.json').read_text())
        generated = [s for group in payload['paragraphs'].values() for s in group]
        raw_new = json.loads((run_dir / '01_asr.json').read_text())['segments']
        metrics = compare_runs(reference, old_text, text_of(generated))
        metrics.update(vad_requested=vad, review_needed=sum(bool(s.get('reviewNeeded')) for s in generated),
                       asr_baseline=cer(reference, converter.convert(text_of(raw))),
                       asr_candidate=cer(reference, converter.convert(text_of(raw_new))))
        evaluations.append(metrics)
        dump(out / 'cer_report.json', {'manifest': manifest, 'runs': evaluations})
        print('CER', json.dumps(metrics, ensure_ascii=False), flush=True)
    after = {str(p.relative_to(ROOT)): digest(p) for p in protected}
    manifest['protected_after'] = after
    manifest['protected_unchanged'] = before == after
    if before != after:
        raise RuntimeError('黃金樣本保護檢查失敗')
    dump(out / 'manifest.json', manifest)
    dump(out / 'cer_report.json', {'manifest': manifest, 'runs': evaluations})


if __name__ == '__main__':
    main()
