#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  alignFullContextAsrEvidence,
  buildAudioEvidenceRequests,
} from './lib/transcriptProofreadingPipeline.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split('=');
  return [key, rest.join('=')];
}));
const sourcePath = path.resolve(ROOT, args.get('--source') || 'courses/四念住/sessions/session_08.json');
const packetPath = path.resolve(ROOT, args.get('--packet')
  || 'reviews/evidence/transcript_proofreading/production/四念住/session_08.compact-review.json');
const outputPath = path.resolve(ROOT, args.get('--output')
  || 'reviews/evidence/transcript_proofreading/production/四念住/session_08.full-context-asr.json');
const remoteHost = args.get('--remote-host') || '100.113.144.100';
const alignmentPaddingSeconds = Number(args.get('--alignment-padding-seconds') || 0.5);
const initialPrompt = args.get('--initial-prompt')
  || '四念住，身念住，受念住，心念住，法念住，奢摩他，毘缽舍那，阿羅漢，涅槃，貪瞋癡，無常、苦、空、無我，玅境長老。';
for (const resolved of [sourcePath, packetPath, outputPath]) {
  if (!resolved.startsWith(`${ROOT}${path.sep}`)) throw new Error('repository paths must stay inside repository');
}

const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
const packet = JSON.parse(readFileSync(packetPath, 'utf8'));
const requests = buildAudioEvidenceRequests({ source, packet, paddingSeconds: 0 });
const remoteCode = String.raw`
import hashlib, json, pathlib, subprocess, sys, tempfile, urllib.request
payload = json.load(sys.stdin)
yt_dlp = '/home/henry/.local/bin/yt-dlp'
def read_url(url):
    with urllib.request.urlopen(url, timeout=15) as response:
        return response.read()
with tempfile.TemporaryDirectory(prefix='proofreading-full-asr-') as temporary_directory:
    work = pathlib.Path(temporary_directory)
    audio = work / 'source.m4a'
    if audio.exists():
        raise SystemExit('fresh source audio path unexpectedly exists')
    download_command = [yt_dlp,'--force-overwrites','--no-playlist','-f','bestaudio[ext=m4a]/bestaudio','-o',str(audio),payload['youtubeUrl']]
    subprocess.run(download_command, check=True, capture_output=True)
    if not audio.is_file():
        raise SystemExit('fresh source audio download is missing')
    health_raw = read_url('http://127.0.0.1:8010/health')
    models_raw = read_url('http://127.0.0.1:8010/v1/models')
    audio_hash = hashlib.sha256(audio.read_bytes()).hexdigest()
    runtime_hash = hashlib.sha256(health_raw + b'\n' + models_raw).hexdigest()
    metadata_raw = subprocess.run([yt_dlp,'--dump-single-json','--no-playlist',payload['youtubeUrl']], check=True, capture_output=True).stdout
    metadata = json.loads(metadata_raw)
    if metadata.get('id') != payload['youtubeVideoId']:
        raise SystemExit('download metadata video ID mismatch')
    command = ['curl','--max-time','1200','-sS','-X','POST','http://127.0.0.1:8010/v1/audio/transcriptions',
      '-F','file=@'+str(audio),'-F','model=whisper-1','-F','language=zh','-F','response_format=verbose_json',
      '-F','beam_size=5','-F','condition_on_previous_text=true','-F','vad_filter=true',
      '-F','initial_prompt='+payload['initialPrompt']]
    raw = subprocess.run(command, check=True, capture_output=True).stdout
    parsed = json.loads(raw)
    output = {
      'audioSha256':'sha256:'+audio_hash,
      'audioSize':audio.stat().st_size,
      'runtimeFingerprint':'sha256:'+runtime_hash,
      'health':json.loads(health_raw),
      'models':json.loads(models_raw),
      'rawResponseDigest':'sha256:'+hashlib.sha256(raw).hexdigest(),
      'transcription':parsed,
      'acquisition':{
        'method':'yt-dlp-fresh-download','freshDownload':True,'downloadCommand':download_command,
        'requestedUrl':payload['youtubeUrl'],'videoId':metadata.get('id'),'webpageUrl':metadata.get('webpage_url'),
        'extractor':metadata.get('extractor_key'),'title':metadata.get('title'),'sourceDuration':metadata.get('duration'),
        'ytDlpVersion':subprocess.run([yt_dlp,'--version'],check=True,capture_output=True,text=True).stdout.strip(),
        'metadataDigest':'sha256:'+hashlib.sha256(metadata_raw).hexdigest()
      }
    }
print(json.dumps(output, ensure_ascii=False))
`;
const encoded = Buffer.from(remoteCode).toString('base64');
const command = `python3 -c "import base64;exec(base64.b64decode('${encoded}'))"`;
const stdout = execFileSync('ssh', [remoteHost, command], {
  input: JSON.stringify({
    youtubeUrl: source.youtubeUrl,
    youtubeVideoId: source.youtubeVideoId || source.videoId,
    initialPrompt,
  }),
  encoding: 'utf8', timeout: 1_500_000, maxBuffer: 64_000_000,
});
const remote = JSON.parse(stdout);
const segments = remote.transcription?.segments;
const items = alignFullContextAsrEvidence({
  requests, segments, paddingSeconds: alignmentPaddingSeconds,
}).map((item) => ({ ...item, rawResponseDigest: remote.rawResponseDigest }));
const artifact = {
  schema: 'transcript-proofreading-full-context-asr/v1',
  authority: 'advisory',
  sourceDigest: packet.sourceDigest,
  runId: packet.runId,
  youtubeVideoId: source.youtubeVideoId || source.videoId || null,
  youtubeUrl: source.youtubeUrl || null,
  audioSha256: remote.audioSha256,
  audioSize: remote.audioSize,
  model: remote.health?.model || remote.models?.data?.[0]?.id || null,
  runtimeFingerprint: remote.runtimeFingerprint,
  acquisition: { ...remote.acquisition, downloadedAudioSha256: remote.audioSha256 },
  transcription: {
    language: remote.transcription?.language ?? null,
    duration: remote.transcription?.duration ?? null,
    serverElapsedSeconds: remote.transcription?.server_elapsed_s ?? null,
    rtf: remote.transcription?.rtf ?? null,
    segmentCount: segments.length,
    rawResponseDigest: remote.rawResponseDigest,
    initialPrompt,
    promptDigest: `sha256:${createHash('sha256').update(initialPrompt).digest('hex')}`,
    segments,
  },
  alignmentPaddingSeconds,
  generatedAt: new Date().toISOString(),
  itemCount: items.length,
  items,
};
mkdirSync(path.dirname(outputPath), { recursive: true });
const temporary = `${outputPath}.tmp-${process.pid}`;
writeFileSync(temporary, `${JSON.stringify(artifact, null, 2)}\n`);
renameSync(temporary, outputPath);
console.log(JSON.stringify({
  outputPath, itemCount: artifact.itemCount,
  segmentCount: artifact.transcription.segmentCount,
  audioSha256: artifact.audioSha256,
  rtf: artifact.transcription.rtf,
}, null, 2));
