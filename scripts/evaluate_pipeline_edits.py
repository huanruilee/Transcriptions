#!/usr/bin/env python3
"""固定切片上的模型／校對比較與待聽核套件；不將發布稿冒充已聽核參考。"""
import argparse
import html
import json
from pathlib import Path
import subprocess
import time
import types

from lib.guarded_edits import canonical_text
from lib.pipeline_evaluation import compare_runs, cer
from evaluate_pipeline_v2 import dump, digest, text_of, ROOT, COURSE


def verified_reference(review):
    items = review.get('items', [])
    return bool(items) and all(item.get('status') == 'APPROVED' and item.get('audioChecked') is True
                               and item.get('reviewer', '').strip() for item in items)


def write_review(out, clips, golden, outputs):
    items, sections = [], []
    for clip in clips:
        for row in golden:
            if not (clip['start'] <= row['start'] and row['end'] <= clip['end']):
                continue
            item = {'id': row['id'], 'clip': clip['id'], 'start': row['start'], 'end': row['end'],
                    'publishedText': row['text'], 'status': 'PENDING', 'audioChecked': False,
                    'reviewer': '', 'audio_sha256': digest(out.parent / 'inputs' / f"{clip['id']}.wav")}
            items.append(item)
            samples = []
            for model, result in outputs[clip['id']].items():
                nearby = [s['text'] for s in result['segments']
                          if s['end'] > row['start'] - clip['start'] and s['start'] < row['end'] - clip['start']]
                samples.append(f'<p><b>{html.escape(model)}</b>：{html.escape(canonical_text("".join(nearby)))}</p>')
            start, end = row['start'] - clip['start'], row['end'] - clip['start']
            sections.append(f'<section><h2>{html.escape(row["id"])} · {row["start"]}–{row["end"]} 秒</h2>'
                            f'<audio controls preload="none" src="../inputs/{clip["id"]}.wav#t={start},{end}"></audio>'
                            f'<p><b>已發布參考，待聽核</b>：{html.escape(row["text"])}</p>'
                            + ''.join(samples) + '</section>')
    review = {'status': 'PENDING_AUDIO_REVIEW', 'verified': False, 'items': items}
    dump(out / 'reference_review.json', review)
    page = ('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>36A 參考稿聽核</title>'
            '<style>body{max-width:980px;margin:2rem auto;font:18px/1.7 sans-serif}section{border-top:1px solid #aaa;padding:1rem}audio{width:100%}</style>'
            '<h1>36A 參考稿聽核</h1><p>所有項目均待聽核。ASR 一致不等於音訊真值；此頁沒有自動核准功能。'
            '請對照錄音保留重複、自我修正與實詞，將核定結果另存並記錄核對者。</p>' + ''.join(sections) + '</html>')
    (out / 'reference_review.html').write_text(page, encoding='utf-8')
    return review


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-dir', type=Path, required=True)
    args = parser.parse_args()
    run = args.run_dir.resolve()
    sandbox = (ROOT / 'tmp/pipeline_v2/36A').resolve()
    if sandbox not in run.parents:
        parser.error('必須使用 36A 沙盒子目錄')
    import batch_convert_all as pipeline
    manifest_path = ROOT / 'tests/fixtures/pipelineV2Evaluation.json'
    fixture = json.loads(manifest_path.read_text())
    clips = fixture['clips']
    out = run / 'evaluation'
    out.mkdir(parents=True, exist_ok=True)
    gold_path = COURSE / 'verbatim/verbatim_36A.json'
    gold = json.loads(gold_path.read_text())
    golden = [s for group in gold['paragraphs'].values() for s in group]
    protected = json.loads((ROOT / 'reports/pipeline_v2/2026-10-21-36A-cer.json').read_text())['manifest']['protected_before']
    for path, expected in protected.items():
        if digest(ROOT / path) != expected:
            raise RuntimeError('已發布檔案與起點雜湊不符')
    code_paths = ['scripts/batch_convert_all.py', 'scripts/build_verbatim_track.py',
                  'scripts/lib/guarded_edits.py', 'scripts/lib/source_alignment.py',
                  'scripts/lib/session_prompt.py', 'scripts/lib/pipeline_evaluation.py',
                  'scripts/benchmark_whisper_isolated.py', 'scripts/evaluate_pipeline_edits.py',
                  'scripts/requirements-pipeline-v2.txt']
    provenance = {'created_at': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
                  'code_sha256': {name: digest(ROOT / name) for name in code_paths},
                  'fixture_sha256': digest(manifest_path), 'reference_sha256': digest(gold_path),
                  'referenceStatus': fixture['referenceStatus'], 'publication_accepted': False}
    dump(out / 'provenance.json', provenance)
    baseline_sha = subprocess.check_output(['git', 'rev-parse', '44a23af'], cwd=ROOT, text=True).strip()
    source = subprocess.check_output(['git', 'show', f'{baseline_sha}:scripts/batch_convert_all.py'], cwd=ROOT, text=True)
    baseline = types.ModuleType('immutable_baseline')
    baseline.__file__ = str(ROOT / 'scripts/batch_convert_all.py')
    exec(compile(source, baseline.__file__, 'exec'), baseline.__dict__)
    audio_map, session_map = pipeline.load_audio_map(), pipeline.load_course_session_map()
    context, _ = baseline.get_session_source_text('36A', session_map)
    outputs, results = {}, []
    for clip in clips:
        audio = run / 'inputs' / f"{clip['id']}.wav"
        reference = text_of([s for s in golden if clip['start'] <= s['start'] and s['end'] <= clip['end']])
        old_rows = None
        if clip['id'] == 'development':
            cached = ROOT / 'tmp/pipeline_v2/36A/runtime-validation/final-benchmark/baseline/03_proofread.json'
            prior = json.loads((ROOT / 'reports/pipeline_v2/2026-10-21-36A-cer.json').read_text())
            if (cached.exists() and digest(audio) == prior['manifest']['audio_sha256']
                    and digest(cached) == prior['artifact_sha256']['final-benchmark/baseline/03_proofread.json']):
                old_rows = json.loads(cached.read_text())
        if old_rows is None:
            raw, duration = baseline.step1_asr_transcribe('36A', audio)
            if abs(duration - (clip['end'] - clip['start'])) > .1:
                raise ValueError('音訊時長與固定切片範圍不符')
            dump(out / clip['id'] / 'baseline_asr.json', {'segments': raw, 'duration': duration})
            old_rows = baseline.step3_llm_proofread(baseline.step2_pre_polish(raw), '36A', context)
        dump(out / clip['id'] / 'baseline_proofread.json', old_rows)
        old_text = canonical_text(text_of(old_rows))
        outputs[clip['id']] = {}
        prior_asr = ROOT / 'tmp/pipeline_v2/36A/runtime-validation/final-benchmark/vad_900/01_asr.json'
        model_names = ['turbo', 'large-v3']
        if clip['id'] == 'development' and prior_asr.exists():
            previous = json.loads((ROOT / 'reports/pipeline_v2/2026-10-21-36A-cer.json').read_text())
            if (digest(audio) == previous['manifest']['audio_sha256'] and digest(prior_asr)
                    == previous['artifact_sha256']['final-benchmark/vad_900/01_asr.json']):
                model_names.insert(0, 'service-replay')
        for model in model_names:
            raw_path = run / 'isolated' / f"{model}-{clip['id']}.json"
            if model == 'service-replay':
                replay = json.loads(prior_asr.read_text())
                replay['provenance'] = {'audio_sha256': digest(audio), 'mode': '相同 ASR 輸出重播以隔離後處理差異',
                                        'source_sha256': digest(prior_asr), 'word_timestamps': False}
                dump(raw_path, replay)
            actual = pipeline.load_asr_result(raw_path, audio)
            if abs(actual['duration'] - (clip['end'] - clip['start'])) > .1:
                raise ValueError('獨立 ASR 時長與切片範圍不符')
            outputs[clip['id']][model] = actual
            destination = out / clip['id'] / model
            pipeline.process_single_session('36A', audio_map, session_map=session_map,
                                             audio_path=audio, asr_json=raw_path, output_dir=destination)
            data = json.loads((destination / 'verbatim_36A.json').read_text())
            rows = [s for group in data['paragraphs'].values() for s in group]
            metric = compare_runs(reference, old_text, text_of(rows))
            metric.update(clip=clip['id'], split=clip['split'], model=model,
                          numeric_target_met=metric.pop('target_met'), publication_accepted=False,
                          referenceStatus=fixture['referenceStatus'],
                          raw_cer=cer(reference, canonical_text(text_of(actual['segments']))),
                          review_needed=sum(bool(s.get('reviewNeeded')) for s in rows),
                          applied_edits=sum(e['applied'] for s in rows for e in s.get('editAudit', [])),
                          rejected_edits=sum(not e['applied'] for s in rows for e in s.get('editAudit', [])),
                          raw_sha256=digest(raw_path), audio_sha256=digest(audio))
            results.append(metric)
            dump(out / 'cer_report.json', {'provenance': provenance, 'results': results})
            print('CER', json.dumps(metric, ensure_ascii=False), flush=True)
    review = write_review(out, clips, golden, outputs)
    provenance.update(reference_verified=verified_reference(review), baseline_sha=baseline_sha,
                      protected_unchanged=all(digest(ROOT / name) == expected for name, expected in protected.items()))
    if not provenance['protected_unchanged']:
        raise RuntimeError('已發布檔案被修改')
    dump(out / 'provenance.json', provenance)
    dump(out / 'cer_report.json', {'provenance': provenance, 'results': results})


if __name__ == '__main__':
    main()
