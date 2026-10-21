#!/usr/bin/env python3
"""一次性 CUDA 推論；不啟動伺服器、不下載模型，stdout 輸出真實詞級時間戳。"""
import argparse
import hashlib
import json
from pathlib import Path
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-path', required=True, type=Path)
    parser.add_argument('--audio', required=True, type=Path)
    parser.add_argument('--prompt-file', required=True, type=Path)
    parser.add_argument('--compute-type', choices=['int8', 'float16'], default='int8')
    parser.add_argument('--vad', type=int, default=900)
    args = parser.parse_args()
    if not args.model_path.is_dir() or not (args.model_path / 'model.bin').is_file():
        parser.error('必須使用既有完整 CTranslate2 模型快取')
    from faster_whisper import WhisperModel
    import faster_whisper
    import ctranslate2
    model = WhisperModel(str(args.model_path), device='cuda', compute_type=args.compute_type,
                         local_files_only=True)
    started = time.monotonic()
    prompt = args.prompt_file.read_text(encoding='utf-8')
    segments, info = model.transcribe(str(args.audio), language='zh', beam_size=5,
        patience=1.2, repetition_penalty=1.08, condition_on_previous_text=False,
        temperature=0.0, initial_prompt=prompt, word_timestamps=True, vad_filter=True,
        vad_parameters={'min_silence_duration_ms': args.vad, 'speech_pad_ms': 400})
    result = []
    for segment in segments:
        result.append({'start': segment.start, 'end': segment.end, 'text': segment.text,
                       'words': [{'start': word.start, 'end': word.end, 'word': word.word,
                                  'probability': word.probability} for word in segment.words or []]})
    with (args.model_path / 'model.bin').open('rb') as stream:
        digest = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
        weights = digest.hexdigest()
    payload = {'duration': info.duration, 'segments': result,
               'elapsed_seconds': round(time.monotonic() - started, 3),
               'provenance': {'model_path': str(args.model_path), 'weights_sha256': weights,
                              'compute_type': args.compute_type, 'device': 'cuda',
                              'faster_whisper': faster_whisper.__version__, 'ctranslate2': ctranslate2.__version__,
                              'word_timestamps': True, 'condition_on_previous_text': False,
                              'beam_size': 5, 'temperature': 0.0, 'vad_ms': args.vad,
                              'initial_prompt': prompt,
                              'audio_sha256': hashlib.sha256(args.audio.read_bytes()).hexdigest()}}
    print(json.dumps(payload, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
