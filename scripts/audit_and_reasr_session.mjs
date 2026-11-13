#!/usr/bin/env node
/**
 * scripts/audit_and_reasr_session.mjs
 *
 * 1. 掃描指定講次 JSON 中的「固定搭配名相殘缺／疑似 ASR 掉字」句段。
 * 2. 將相鄰疑慮句合併為連續音訊視窗，透過 GX10 Whisper 服務進行「無提示 vs. 領域提示」局部高精重辨識。
 * 3. 比對重辨識結果：
 *    - recovered_by_reasr：帶領域 prompt 後成功找回漏字
 *    - confirmed_omission_needs_editorial_bracket：重辨識仍未出現該字（疑似現場口誤或極輕音），建議人工覆聽並決定是否加註〔補字〕
 *
 * 用法：
 *   node scripts/audit_and_reasr_session.mjs --source=courses/菩薩就是這樣成佛/sessions/session_25.json
 *   node scripts/audit_and_reasr_session.mjs --source=... --dry-run
 *   node scripts/audit_and_reasr_session.mjs --source=... --output=reviews/evidence/dharma_term_audit/pusa_25.json
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditSessionDharmaTerms, buildReAsrWindows } from './lib/dharmaTermAudit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const eq = arg.indexOf('=');
    if (eq === -1) return [arg, 'true'];
    return [arg.slice(0, eq), arg.slice(eq + 1)];
  }),
);

const sourceArg = args.get('--source');
if (!sourceArg) {
  console.error('用法: node scripts/audit_and_reasr_session.mjs --source=<session.json> [--remote-host=100.113.144.100] [--padding=2.0] [--output=...] [--dry-run]');
  process.exit(1);
}

const sourcePath = path.resolve(ROOT, sourceArg);
const remoteHost = args.get('--remote-host') || '100.113.144.100';
const paddingSeconds = Number(args.get('--padding') || 2.0);
const dryRun = args.get('--dry-run') === 'true';
const outputArg = args.get('--output');
const outputPath = outputArg ? path.resolve(ROOT, outputArg) : null;

const session = JSON.parse(readFileSync(sourcePath, 'utf8'));
const findings = auditSessionDharmaTerms(session);
const windows = buildReAsrWindows(findings, { paddingSeconds });

console.log(`=== 教理名相殘缺／ASR 掉字稽核 ===`);
console.log(`檔案: ${path.relative(ROOT, sourcePath)}`);
console.log(`講次: ${session.title ?? session.sessionId ?? '(unknown)'}`);
console.log(`偵測到疑慮句數: ${findings.length} 句，合併為 ${windows.length} 個局部重辨識視窗`);

for (const w of windows) {
  console.log(`\n[${w.windowId}] ${w.clipStart}s ~ ${w.clipEnd}s (${w.clipDuration}s) | 句 ID: ${w.sentenceIds.join(', ')}`);
  for (const it of w.items) {
    console.log(`  - ${it.sentenceId} (${it.start}s–${it.end}s): ${it.text}`);
    for (const f of it.findings) {
      console.log(`    · [${f.ruleId}] (${f.severity}) ${f.reason}${f.suggestedTerm ? ` → 建議檢查: ${f.suggestedTerm}` : ''}`);
    }
  }
  console.log(`  · 領域 Prompt: ${w.prompt}`);
}

let reAsrResults = [];

if (!dryRun && windows.length > 0) {
  const youtubeUrl = session.youtubeUrl
    || (session.youtubeVideoId ? `https://www.youtube.com/watch?v=${session.youtubeVideoId}` : null);
  if (!youtubeUrl) {
    throw new Error('講次 JSON 缺少 youtubeUrl / youtubeVideoId，無法從遠端下載音訊進行局部重辨識');
  }

  console.log(`\n正在連線 ${remoteHost} 下載音訊並執行「無提示 vs. 領域提示」局部重辨識...`);
  const remoteScript = String.raw`
import json, pathlib, subprocess, sys, tempfile

payload = json.load(sys.stdin)
yt_dlp = '/home/henry/.local/bin/yt-dlp'

def transcribe(wav_path, prompt=""):
    cmd = [
        'curl', '--max-time', '60', '-sS', '-X', 'POST',
        'http://127.0.0.1:8010/v1/audio/transcriptions',
        '-F', f'file=@{wav_path}',
        '-F', 'model=whisper-1',
        '-F', 'language=zh',
        '-F', 'response_format=verbose_json',
    ]
    if prompt:
        cmd += ['-F', f'prompt={prompt}']
    raw = subprocess.check_output(cmd, text=True)
    return json.loads(raw)

with tempfile.TemporaryDirectory(prefix='dharma-reasr-') as td:
    work = pathlib.Path(td)
    audio = work / 'source.m4a'
    subprocess.run([
        yt_dlp, '--no-update', '--force-overwrites', '--no-playlist',
        '-f', 'bestaudio[ext=m4a]/bestaudio',
        '-o', str(audio),
        payload['youtubeUrl'],
    ], check=True, capture_output=True)

    results = []
    for win in payload['windows']:
        clip = work / f"{win['windowId']}.wav"
        subprocess.run([
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
            '-ss', str(win['clipStart']),
            '-t', str(win['clipDuration']),
            '-i', str(audio),
            '-ac', '1', '-ar', '16000', str(clip),
        ], check=True)
        raw_res = transcribe(clip, prompt='')
        guided_res = transcribe(clip, prompt=win['prompt'])
        results.append({
            'windowId': win['windowId'],
            'clipStart': win['clipStart'],
            'clipEnd': win['clipEnd'],
            'rawSegments': [
                {'start': round(win['clipStart'] + s['start'], 2), 'end': round(win['clipStart'] + s['end'], 2), 'text': s['text']}
                for s in raw_res.get('segments', [])
            ],
            'rawText': ''.join(s.get('text', '') for s in raw_res.get('segments', [])),
            'guidedSegments': [
                {'start': round(win['clipStart'] + s['start'], 2), 'end': round(win['clipStart'] + s['end'], 2), 'text': s['text']}
                for s in guided_res.get('segments', [])
            ],
            'guidedText': ''.join(s.get('text', '') for s in guided_res.get('segments', [])),
        })
    print(json.dumps({'results': results}, ensure_ascii=False))
`;

  const encoded = Buffer.from(remoteScript).toString('base64');
  const stdout = execFileSync(
    'ssh',
    [remoteHost, `python3 -c "import base64;exec(base64.b64decode('${encoded}'))"`],
    {
      input: JSON.stringify({
        youtubeUrl,
        windows: windows.map((w) => ({
          windowId: w.windowId,
          clipStart: w.clipStart,
          clipEnd: w.clipEnd,
          clipDuration: w.clipDuration,
          prompt: w.prompt,
        })),
      }),
      encoding: 'utf8',
      timeout: 300000,
      maxBuffer: 16_000_000,
    },
  );

  const parsed = JSON.parse(stdout);
  reAsrResults = parsed.results.map((r) => {
    const win = windows.find((w) => w.windowId === r.windowId);
    const recoveredTerms = (win?.expectedTerms ?? []).filter((term) => r.guidedText.includes(term));
    const missingTerms = (win?.expectedTerms ?? []).filter((term) => !r.guidedText.includes(term));
    const status = recoveredTerms.length > 0 && missingTerms.length === 0
      ? 'recovered_by_reasr'
      : 'partially_recovered_or_confirmed_omission';
    return {
      ...r,
      sentenceIds: win?.sentenceIds ?? [],
      originalTexts: win?.originalTexts ?? [],
      expectedTerms: win?.expectedTerms ?? [],
      recoveredTerms,
      missingTerms,
      status,
    };
  });

  console.log(`\n=== 局部重辨識比對結果 ===`);
  for (const r of reAsrResults) {
    console.log(`\n[${r.windowId}] ${r.clipStart}s ~ ${r.clipEnd}s | 狀態: ${r.status}`);
    for (const orig of r.originalTexts) {
      console.log(`  原稿 (${orig.id}): ${orig.text}`);
    }
    console.log(`  無提示重辨識: ${r.rawText}`);
    console.log(`  領域提示重辨識:`);
    for (const seg of r.guidedSegments) {
      console.log(`    [${seg.start}s–${seg.end}s] ${seg.text}`);
    }
    if (r.recoveredTerms.length > 0) {
      console.log(`  ✅ 重辨識已找回名相: ${r.recoveredTerms.join('、')}`);
    }
  }
}

const report = {
  source: path.relative(ROOT, sourcePath),
  sessionId: session.sessionId ?? null,
  title: session.title ?? null,
  findingsCount: findings.length,
  windowsCount: windows.length,
  windows: windows.map(({ items, ...rest }) => rest),
  reAsrResults,
};

if (outputPath) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\n已輸出稽核報告至: ${path.relative(ROOT, outputPath)}`);
}
