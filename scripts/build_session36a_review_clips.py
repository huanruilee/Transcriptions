#!/usr/bin/env python3
"""Build only the 30 reader-review excerpts; no source audio is written/copied.

Reversible: remove only files enumerated by manifest.clips and manifest.json.
The manifest records exact argv and PCM slice indices to replay each encoding.
"""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_HASH = 'sha256:24c177f3a2806c7a298dde94cf4a91ad0158b0887169269e70a429463d0f23b0'
EXPECTED_IDS = 'p1-v1 p1-v3 p4-v4 p4-v5 p6-v5 p7-v1 p7-v2 p9-v2 p12-v2 p12-v3 p13-v5 p14-v1 p15-v2 p16-v1 p18-v3 p18-v4 p18-v5 p20-v4 p22-v4 p24-v2 p24-v3 p24-v4 p25-v4 p25-v5 p27-v4 p28-v2 p29-v1 p29-v7 p29-v10 p29-v11'.split()
SOURCE = 'tmp/session36a-quality/source_36A.mp3'
OUTPUT = 'courses/入中論善顯密意疏/publications/audio_36A_review'


def digest(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()


def run(argv, data=None):
    return subprocess.run(argv, input=data, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, check=True, cwd=ROOT).stdout


def main():
    alignment_bytes = (ROOT / 'reviews/evidence/session36a-quality/audio-alignment.json').read_bytes()
    reference_bytes = (ROOT / 'reviews/evidence/session36a-quality/audio-source.json').read_bytes()
    alignment, reference = json.loads(alignment_bytes), json.loads(reference_bytes)
    source = (ROOT / SOURCE).read_bytes()
    if not (digest(source) == alignment['audioSha256'] == reference['sha256'] == EXPECTED_HASH):
        raise ValueError('Official source digest mismatch')
    selected = [x for x in alignment['items'] if x['id'] in alignment['representativeSampleIds']
                or x['status'] == 'listening-review-required']
    if (len(alignment['items']) != 176 or len(alignment['representativeSampleIds']) != 16
            or sum(x['status'] == 'listening-review-required' for x in alignment['items']) != 17
            or [x['id'] for x in selected] != EXPECTED_IDS):
        raise ValueError('Review inventory changed; requires a new bounded selection')
    # Full sequential decode avoids all MP3 header-based input seeking estimates.
    decode = ['ffmpeg', '-v', 'error', '-i', SOURCE, '-map', '0:a:0',
              '-ac', '1', '-ar', '16000', '-f', 's16le', 'pipe:1']
    pcm = run(decode)
    if len(pcm) != 113867130:
        raise ValueError(f'Unexpected decoded sample bytes: {len(pcm)}')
    duration = len(pcm) / 32000
    output = ROOT / OUTPUT
    output.mkdir(parents=True, exist_ok=True)
    allowed = {'manifest.json', *(f'{key}.mp3' for key in EXPECTED_IDS)}
    if any(p.name not in allowed for p in output.iterdir()):
        raise ValueError('Unexpected output files; refusing to overwrite unrelated data')
    manifest = {
        'schema': 'session36a-review-clips/v1',
        'scope': '30 selected reader acceptance excerpts; not human listening certification',
        'sourcePath': SOURCE, 'sourceUrl': reference['url'], 'sourceSha256': EXPECTED_HASH,
        'sourceReferenceDigest': digest(reference_bytes), 'alignmentDigest': digest(alignment_bytes),
        'sourceDuration': duration, 'decodedPcmBytes': len(pcm), 'pcmSampleRate': 16000,
        'pcmChannels': 1, 'pcmBytesPerSample': 2, 'decodeCommand': decode,
        'paddingSeconds': 1, 'clips': {},
    }
    for item in selected:
        start, end = max(0, item['start'] - 1), min(duration, item['end'] + 1)
        if not 0 <= start <= item['start'] < item['end'] <= end <= duration:
            raise ValueError(f'Invalid source interval: {item["id"]}')
        first, last = round(start * 16000), round(end * 16000)
        filename = item['id'] + '.mp3'
        target = f'{OUTPUT}/{filename}'
        command = ['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', '16000',
                   '-ac', '1', '-i', 'pipe:0', '-map_metadata', '-1', '-c:a', 'libmp3lame',
                   '-b:a', '64k', '-ar', '16000', '-ac', '1', '-write_xing', '1', target]
        run(command, pcm[first * 2:last * 2])
        probe_command = ['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', target]
        probe = json.loads(run(probe_command))
        clip_duration = float(probe['format']['duration'])
        if not end - start <= clip_duration < end - start + 0.15:
            raise ValueError(f'Encoded duration mismatch: {filename}')
        clip = (ROOT / target).read_bytes()
        manifest['clips'][item['id']] = {
            'filename': filename, 'sourceStart': start, 'sourceEnd': end,
            'entryStart': item['start'], 'entryEnd': item['end'],
            'entryClipStart': item['start'] - start, 'entryClipEnd': item['end'] - start,
            'clipDuration': clip_duration, 'sha256': digest(clip), 'bytes': len(clip),
            'sourceSha256': EXPECTED_HASH, 'pcmFirstSample': first, 'pcmEndSampleExclusive': last,
            'ffmpegCommand': command, 'ffprobeCommand': probe_command,
        }
    manifest['totalClipBytes'] = sum(c['bytes'] for c in manifest['clips'].values())
    encoded = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
    if manifest['totalClipBytes'] + len(encoded) >= 6_000_000:
        raise ValueError('Review upload exceeds 6 MB bound')
    (output / 'manifest.json').write_bytes(encoded)
    print(json.dumps({'clips': len(selected), 'clipBytes': manifest['totalClipBytes'],
                      'manifestBytes': len(encoded), 'totalBytes': manifest['totalClipBytes'] + len(encoded)}))


if __name__ == '__main__':
    main()
