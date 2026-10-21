#!/usr/bin/env python3
"""彙整固定音檔的單因子實測；保留參考稿待聽核及探索集狀態。"""
import argparse
import hashlib
import json
from pathlib import Path
import time

from lib.asr_diagnostics import error_breakdown, text_risk_flags
from lib.guarded_edits import canonical_text

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-dir', type=Path, required=True)
    parser.add_argument('--proofread', action='store_true', help='將分段候選接回現行校對與逐字輸出，僅寫沙盒')
    parser.add_argument('--proofread-filter', default='', help='僅執行名稱含此字串的候選；其他列仍保留原始評估')
    args = parser.parse_args()
    run = args.run_dir.resolve()
    if (ROOT / 'tmp/pipeline_v2/36A').resolve() not in run.parents:
        parser.error('必須使用 36A 沙盒子目錄')
    fixture_path = ROOT / 'tests/fixtures/pipelineV2Evaluation.json'
    fixture = json.loads(fixture_path.read_text())
    if args.proofread:
        import requests
        import batch_convert_all as pipeline
        # 連線失敗屬未執行，不可把逐句 fallback 的輸出當作成功校對實測。
        requests.get(pipeline.VLLM_FALLBACK_URL.replace('/chat/completions', '/models'), timeout=8).raise_for_status()
    reference_path = ROOT / 'courses/入中論善顯密意疏/verbatim/verbatim_36A.json'
    golden = json.loads(reference_path.read_text())
    sentences = [s for group in golden['paragraphs'].values() for s in group]
    protected = json.loads((ROOT / 'reports/pipeline_v2/2026-10-21-36A-cer.json').read_text())['manifest']['protected_before']
    if any(digest(ROOT / name) != expected for name, expected in protected.items()):
        raise ValueError('已發布樣本與起點不符')
    results, tasks, failures = [], [], []
    for clip in fixture['clips']:
        audio = run / 'inputs' / (clip['id'] + '.wav')
        audio_hash = digest(audio)
        reference = ''.join(s['text'] for s in sentences
                            if clip['start'] <= s['start'] and s['end'] <= clip['end'])
        candidates = []
        for path in sorted((run / 'isolated').glob(f"*-{clip['id']}-*.json")):
            try:
                data = json.loads(path.read_text())
            except json.JSONDecodeError:
                failures.append({'artifact': path.name, 'reason': '未產生有效 JSON，保留失敗檔案與重跑證據'})
                continue
            if data['provenance']['audio_sha256'] != audio_hash:
                raise ValueError('ASR 與音訊雜湊不符')
            if abs(data['duration'] - (clip['end'] - clip['start'])) > .1:
                raise ValueError('ASR 音訊時長不符')
            text = canonical_text(''.join(s['text'] for s in data['segments']))
            row = {'name': path.stem, 'clip': clip['id'], 'evaluation_role': 'EXPLORATORY_PREVIOUS_HOLDOUT' if
                   clip['split'] == 'holdout' else 'DEVELOPMENT', 'metric_stage': 'RAW_ASR_BEFORE_PROOFREADING',
                   'metric': error_breakdown(reference, text), 'elapsed_seconds': data['elapsed_seconds'],
                   'coverage_audit': data.get('coverage_audit'), 'provenance': data['provenance'],
                   'artifact_sha256': digest(path), 'publication_accepted': False}
            row['text_risk_flags'] = text_risk_flags(text, data['provenance'].get('initial_prompt'))
            if (args.proofread and path.stem.endswith(('silence_partition', 'silence_no_prompt'))
                    and args.proofread_filter in path.stem):
                import batch_convert_all as pipeline
                from build_verbatim_track import FORBIDDEN_HOMOPHONES
                destination = run / 'proofread' / path.stem
                pipeline.process_single_session('36A', pipeline.load_audio_map(),
                    session_map=pipeline.load_course_session_map(), audio_path=audio,
                    asr_json=path, output_dir=destination)
                output_path = destination / 'verbatim_36A.json'
                output = json.loads(output_path.read_text())
                texts = [s['text'] for group in output['paragraphs'].values() for s in group]
                spoken = ''.join(texts)
                row['proofread'] = {'metric': error_breakdown(reference, spoken),
                                    'artifact_sha256': digest(output_path),
                                    'traditional_only': canonical_text(spoken) == spoken,
                                    'forbidden_homophones': FORBIDDEN_HOMOPHONES.findall(spoken),
                                    'publication_accepted': False}
            results.append(row)
            candidates.append({'model': path.stem, 'text': text})
        # 可匯入標註工具的原始任務資料；不建立假核准或假講者標籤。
        tasks.append({'data': {'audio': str(audio), 'audio_sha256': audio_hash,
                              'clip': clip['id'], 'published_reference': reference,
                              'reference_status': fixture['referenceStatus'], 'candidates': candidates},
                      'annotations': []})
    if any(digest(ROOT / name) != expected for name, expected in protected.items()):
        raise ValueError('實測後已發布樣本被修改')
    report = {'created_at': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'results': results, 'failed_runs': failures,
              'reference_verified': False, 'publication_accepted': False,
              'reference_sha256': digest(reference_path), 'fixture_sha256': digest(fixture_path),
              'code_sha256': {name: digest(ROOT / name) for name in
                              ['scripts/benchmark_whisper_isolated.py', 'scripts/benchmark_qwen_asr_isolated.py', 'scripts/lib/asr_diagnostics.py',
                               'scripts/lib/pipeline_evaluation.py', 'scripts/evaluate_asr_diagnostics.py']},
              'protected_unchanged': True,
              'limitations': ['既有保留段本輪用於探索，不再視為未見驗收集',
                             'VAD 為同版 Silero 的獨立執行，不是第二個獨立聲學模型',
                             '時間覆蓋不能證明文字完整；詞級與句級覆蓋不可直接互比',
                             '模型與切片策略、prompt 不同；跨模型比較不能拆解為模型單獨效應',
                             '部分 GPU 工作並行，elapsed_seconds 不作模型速度排名',
                             'CER 參考仍是已發布稿，尚未人工逐段聽核']}
    for name, payload in [('diagnostics_report.json', report), ('annotation_tasks.json', tasks)]:
        (run / name).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'runs': len(results), 'protected_unchanged': True}, ensure_ascii=False))


if __name__ == '__main__':
    main()
