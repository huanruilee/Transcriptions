#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAudioEvidenceRequests } from './lib/transcriptProofreadingPipeline.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.split('=');
  return [key, rest.join('=')];
}));
const sourcePath = path.resolve(ROOT, args.get('--source') || 'courses/四念住/sessions/session_08.json');
const packetPath = path.resolve(ROOT, args.get('--packet')
  || 'reviews/evidence/transcript_proofreading/production/四念住/session_08.compact-review.json');
const outputPath = path.resolve(ROOT, args.get('--output')
  || 'reviews/evidence/transcript_proofreading/production/四念住/session_08.audio.json');
const remoteHost = args.get('--remote-host') || '100.113.144.100';
const paddingSeconds = Number(args.get('--padding-seconds') || 1.5);
for (const resolved of [sourcePath, packetPath, outputPath]) {
  if (!resolved.startsWith(`${ROOT}${path.sep}`)) throw new Error('repository paths must stay inside repository');
}

const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
const packet = JSON.parse(readFileSync(packetPath, 'utf8'));
const requests = buildAudioEvidenceRequests({ source, packet, paddingSeconds });
const remoteCode = String.raw`
import hashlib, json, pathlib, subprocess, sys, tempfile, urllib.request
payload = json.load(sys.stdin)
yt_dlp = '/home/henry/.local/bin/yt-dlp'
def read_url(url):
    with urllib.request.urlopen(url, timeout=15) as response:
        return response.read()
with tempfile.TemporaryDirectory(prefix='proofreading-source-') as temporary_directory:
    work = pathlib.Path(temporary_directory)
    audio = work / 'source.m4a'
    snippet = work / 'snippet.wav'
    if audio.exists():
        raise SystemExit('fresh source audio path unexpectedly exists')
    download_command = [yt_dlp,'--force-overwrites','--no-playlist','-f','bestaudio[ext=m4a]/bestaudio','-o',str(audio),payload['youtubeUrl']]
    subprocess.run(download_command, check=True, capture_output=True)
    if not audio.is_file():
        raise SystemExit('fresh source audio download is missing')
    health_raw = read_url('http://127.0.0.1:8010/health')
    models_raw = read_url('http://127.0.0.1:8010/v1/models')
    audio_hash = hashlib.sha256()
    with audio.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            audio_hash.update(chunk)
    runtime_hash = hashlib.sha256(health_raw + b'\n' + models_raw).hexdigest()
    metadata_raw = subprocess.run([yt_dlp,'--dump-single-json','--no-playlist',payload['youtubeUrl']], check=True, capture_output=True).stdout
    metadata = json.loads(metadata_raw)
    if metadata.get('id') != payload['youtubeVideoId']:
        raise SystemExit('download metadata video ID mismatch')
    audio_duration = float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(audio)], check=True, capture_output=True, text=True).stdout.strip())
    yt_dlp_version = subprocess.run([yt_dlp,'--version'], check=True, capture_output=True, text=True).stdout.strip()
    audio_size = audio.stat().st_size
    results = []
    for index, item in enumerate(payload['requests']):
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(item['snippetStart']),'-t',str(item['snippetDuration']),'-i',str(audio),'-ac','1','-ar','16000',str(snippet)], check=True)
        call = subprocess.run(['curl','--max-time','60','-sS','-X','POST','http://127.0.0.1:8010/v1/audio/transcriptions','-F','file=@'+str(snippet),'-F','model=whisper-1','-F','language=zh','-F','response_format=json'], check=True, capture_output=True)
        raw = call.stdout
        parsed = json.loads(raw)
        results.append({**item,'asrText':parsed.get('text',''),'rtf':parsed.get('rtf'),'serverElapsedSeconds':parsed.get('server_elapsed_s'),'rawResponseDigest':'sha256:'+hashlib.sha256(raw).hexdigest()})
        print('[audio] %d/%d' % (index + 1, len(payload['requests'])), file=sys.stderr, flush=True)
    output = {'audioSha256':'sha256:'+audio_hash.hexdigest(),'audioSize':audio_size,'runtimeFingerprint':'sha256:'+runtime_hash,'health':json.loads(health_raw),'models':json.loads(models_raw),'acquisition':{'method':'yt-dlp-fresh-download','freshDownload':True,'downloadCommand':download_command,'requestedUrl':payload['youtubeUrl'],'videoId':metadata.get('id'),'webpageUrl':metadata.get('webpage_url'),'extractor':metadata.get('extractor_key'),'title':metadata.get('title'),'sourceDuration':metadata.get('duration'),'audioDuration':audio_duration,'ytDlpVersion':yt_dlp_version,'metadataDigest':'sha256:'+hashlib.sha256(metadata_raw).hexdigest()},'items':results}
print(json.dumps(output, ensure_ascii=False))
`;
const encoded = Buffer.from(remoteCode).toString('base64');
const command = `python3 -c "import base64;exec(base64.b64decode('${encoded}'))"`;
const stdout = execFileSync('ssh', [remoteHost, command], {
  input: JSON.stringify({ requests,
    youtubeUrl: source.youtubeUrl, youtubeVideoId: source.youtubeVideoId || source.videoId }),
  encoding: 'utf8', timeout: 900000, maxBuffer: 16_000_000,
});
const remote = JSON.parse(stdout);
const expectedIds = requests.map((item) => item.id);
const actualIds = Array.isArray(remote.items) ? remote.items.map((item) => item.id) : [];
if (actualIds.length !== expectedIds.length
  || actualIds.some((id, index) => id !== expectedIds[index])) {
  throw new Error('remote audio evidence coverage mismatch');
}
const evidence = {
  schema: 'transcript-proofreading-audio-evidence/v1',
  sourceDigest: packet.sourceDigest,
  runId: packet.runId,
  youtubeVideoId: source.youtubeVideoId || source.videoId || null,
  youtubeUrl: source.youtubeUrl || null,
  remoteAudioPath: null,
  audioSha256: remote.audioSha256,
  audioSize: remote.audioSize,
  model: remote.health?.model || remote.models?.data?.[0]?.id || null,
  runtimeFingerprint: remote.runtimeFingerprint,
  acquisition: { ...remote.acquisition, downloadedAudioSha256: remote.audioSha256 },
  generatedAt: new Date().toISOString(),
  itemCount: remote.items.length,
  items: remote.items,
};
mkdirSync(path.dirname(outputPath), { recursive: true });
const temporary = `${outputPath}.tmp-${process.pid}`;
writeFileSync(temporary, `${JSON.stringify(evidence, null, 2)}\n`);
renameSync(temporary, outputPath);
console.log(JSON.stringify({ outputPath, itemCount: evidence.itemCount, audioSha256: evidence.audioSha256,
  runtimeFingerprint: evidence.runtimeFingerprint }, null, 2));
