#!/usr/bin/env python3
"""一次性 CUDA 推論；不啟動伺服器、不下載模型，stdout 輸出真實詞級時間戳。"""
import argparse
import hashlib
import json
from pathlib import Path
import time
from lib.asr_diagnostics import coverage_audit, experiment_options, plan_chunks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-path', required=True, type=Path)
    parser.add_argument('--audio', required=True, type=Path)
    parser.add_argument('--prompt-file', required=True, type=Path)
    parser.add_argument('--compute-type', choices=['int8', 'float16'], default='int8')
    parser.add_argument('--vad', type=int, default=900)
    parser.add_argument('--variant', choices=['control', 'repeat_1', 'no_vad', 'no_words', 'fallback'], default='control')
    parser.add_argument('--partition', choices=['none', 'silence'], default='none')
    parser.add_argument('--prompt-mode', choices=['context', 'none'], default='context')
    args = parser.parse_args()
    if not args.model_path.is_dir() or not (args.model_path / 'model.bin').is_file():
        parser.error('必須使用既有完整 CTranslate2 模型快取')
    from faster_whisper import WhisperModel
    import faster_whisper
    import ctranslate2
    model = WhisperModel(str(args.model_path), device='cuda', compute_type=args.compute_type,
                         local_files_only=True)
    started = time.monotonic()
    prompt = args.prompt_file.read_text(encoding='utf-8') if args.prompt_mode == 'context' else None
    options = experiment_options(args.variant)
    from faster_whisper.audio import decode_audio
    from faster_whisper.vad import get_speech_timestamps, VadOptions
    audio = decode_audio(str(args.audio), sampling_rate=16000)
    duration = len(audio) / 16000
    speech = [{'start': row['start'] / 16000, 'end': row['end'] / 16000} for row in
              get_speech_timestamps(audio, VadOptions(min_silence_duration_ms=500, speech_pad_ms=0))]
    chunks = plan_chunks(duration, speech) if args.partition == 'silence' else [{'start': 0, 'end': duration}]
    result = []
    for chunk in chunks:
        offset = round(chunk['start'] * 16000) / 16000
        source = audio[round(chunk['start'] * 16000):round(chunk['end'] * 16000)] if args.partition == 'silence' else str(args.audio)
        segments, info = model.transcribe(source, language='zh', **options, initial_prompt=prompt,
            vad_parameters={'min_silence_duration_ms': args.vad, 'speech_pad_ms': 400})
        for segment in segments:
            result.append({'start': offset + segment.start, 'end': offset + segment.end, 'text': segment.text,
                           'diagnostics': {**{key: getattr(segment, key, None) for key in
                                           ['seek', 'avg_logprob', 'no_speech_prob', 'compression_ratio', 'temperature']},
                                           'input_chunk_start': offset},
                           'words': [{'start': offset + word.start, 'end': offset + word.end, 'word': word.word,
                                      'probability': word.probability} for word in segment.words or []]})
    with (args.model_path / 'model.bin').open('rb') as stream:
        digest = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
        weights = digest.hexdigest()
    try:
        audit = coverage_audit(speech, result, duration)
    except ValueError as error:
        # 原始解碼證據必須保留；不夾限錯誤時間或將無效時間包裝為正常覆蓋。
        audit = {'status': 'INVALID_ASR_TIMESTAMPS', 'reason': str(error),
                 'publication_accepted': False}
    payload = {'duration': duration, 'segments': result, 'speech_activity': speech, 'input_chunks': chunks,
               'coverage_audit': audit,
               'elapsed_seconds': round(time.monotonic() - started, 3),
               'provenance': {'model_path': str(args.model_path), 'weights_sha256': weights,
                              'compute_type': args.compute_type, 'device': 'cuda',
                              'faster_whisper': faster_whisper.__version__, 'ctranslate2': ctranslate2.__version__,
                              **options, 'variant': args.variant, 'vad_ms': args.vad,
                              'partition': args.partition,
                              'prompt_mode': args.prompt_mode,
                              'runner_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                              'audit_vad': 'faster-whisper bundled Silero; separate pass; silence=500ms,pad=0',
                              'initial_prompt': prompt,
                              'audio_sha256': hashlib.sha256(args.audio.read_bytes()).hexdigest()}}
    print(json.dumps(payload, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
