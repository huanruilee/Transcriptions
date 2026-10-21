#!/usr/bin/env python3
"""本機既有 Qwen3-ASR HF 權重的隔離實測；時間僅為輸入切片邊界。"""
import argparse
import hashlib
import json
from pathlib import Path
import time

from lib.asr_diagnostics import plan_chunks


def sha(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-path', required=True, type=Path)
    parser.add_argument('--input-dir', required=True, type=Path)
    parser.add_argument('--whisper-results', required=True, type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    args = parser.parse_args()
    import torch
    import transformers
    import soundfile as sf
    from transformers import AutoProcessor, AutoModelForMultimodalLM
    processor = AutoProcessor.from_pretrained(args.model_path, local_files_only=True)
    model = AutoModelForMultimodalLM.from_pretrained(args.model_path, local_files_only=True,
                dtype=torch.bfloat16, device_map='cuda', attn_implementation='sdpa').eval()
    weights = {p.name: sha(p) for p in sorted(args.model_path.glob('*.safetensors'))}
    if not weights:
        raise ValueError('缺少本機完整權重')
    args.output_dir.mkdir(parents=True, exist_ok=True)
    for clip in ['development', 'heldout_dialogue', 'heldout_recitation']:
        audio_path = args.input_dir / (clip + '.wav')
        audio, rate = sf.read(audio_path, dtype='float32')
        if rate != 16000 or audio.ndim != 1:
            raise ValueError('必須使用固定 16kHz 單聲道切片')
        duration = len(audio) / rate
        whisper = json.loads((args.whisper_results / f'large-v3-{clip}-control.json').read_text())
        if whisper['provenance']['audio_sha256'] != sha(audio_path):
            raise ValueError('語音活動證據與音訊雜湊不符')
        chunks = plan_chunks(duration, whisper['speech_activity'])
        rows = []
        started = time.monotonic()
        for index, bounds in enumerate(chunks):
            left, right = round(bounds['start'] * rate), round(bounds['end'] * rate)
            inputs = processor.apply_transcription_request(audio[left:right], language='Chinese').to(model.device, model.dtype)
            with torch.inference_mode():
                output = model.generate(**inputs, max_new_tokens=1024, do_sample=False)
            generated = output[:, inputs['input_ids'].shape[1]:]
            text = processor.decode(generated, return_format='transcription_only')[0]
            rows.append(dict(bounds, text=text, words=[], input_samples=[left, right],
                             generated_tokens=int(generated.shape[1]),
                             token_limit_reached=bool(generated.shape[1] >= 1024),
                             timing_basis='INPUT_CHUNK_BOUNDS_NOT_WORD_ALIGNMENT'))
            print(f'{clip}: {index + 1}/{len(chunks)}', flush=True)
        data = {'duration': duration, 'segments': rows, 'elapsed_seconds': time.monotonic() - started,
                'provenance': {'audio_sha256': sha(audio_path), 'model_path': str(args.model_path),
                               'weights_sha256': weights, 'config_sha256': sha(args.model_path / 'config.json'),
                               'torch': torch.__version__, 'transformers': transformers.__version__,
                               'device': torch.cuda.get_device_name(), 'dtype': 'bfloat16',
                               'attention': 'sdpa', 'context_prompt': None, 'language': 'Chinese',
                               'variant': 'silence_partition_15_25s', 'max_new_tokens': 1024,
                               'do_sample': False, 'publication_accepted': False}}
        (args.output_dir / f'qwen3-asr-{clip}-silence_partition.json').write_text(
            json.dumps(data, ensure_ascii=False), encoding='utf-8')


if __name__ == '__main__':
    main()
