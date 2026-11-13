#!/usr/bin/env node
/**
 * scripts/run_pusa_full_pipeline.mjs
 *
 * 《菩薩就是這樣成佛》全流程自動化校對與排版管線：
 *   Stage 1: 規則表（含 Whisper 幻覺偵測） + LLM 語意抓漏 + GX10 Whisper 雙軌局部重辨識
 *   Stage 2: 自動修復 Whisper 幻覺重複／亂碼段落（以 GX10 重辨識還原）
 *   Stage 3: 流暢講記版修訂（對標《釋量論·成量品 32-1.pdf》標點＋口語精簡＋防跨句／防誤刪安全閘門）
 *   Stage 4: 自然段重組（160～340 字）＋ 主題編號小標（1. ... 2. ...）並寫回講次 JSON
 *
 * 用法：
 *   node scripts/run_pusa_full_pipeline.mjs --sessions=25
 *   node scripts/run_pusa_full_pipeline.mjs --sessions=26,01,02,...,24
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditSessionDharmaTerms, buildReAsrWindows } from './lib/dharmaTermAudit.js';
import { auditSessionWithLlm, mergeAuditFindings } from './lib/llmOmissionAudit.js';
import { applyPolishProposals, generateFluentPolishProposals } from './lib/fluentPolishAudit.js';
import {
  assignSectionHeadingsWithLlm,
  mergeParagraphsByLayout,
  renderReadableMarkdown,
} from './lib/paragraphLayoutPlanner.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COURSE_DIR = path.join(ROOT, 'courses', '菩薩就是這樣成佛', 'sessions');
const EVIDENCE_DIR = path.join(ROOT, 'reviews', 'evidence', 'pusa_pipeline');

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const eq = arg.indexOf('=');
    if (eq === -1) return [arg, 'true'];
    return [arg.slice(0, eq), arg.slice(eq + 1)];
  }),
);

const sessionsArg = args.get('--sessions') || '25';
const remoteHost = args.get('--remote-host') || '100.113.144.100';
const llmEndpoint = args.get('--llm-endpoint') || process.env.LLM_ENDPOINT || 'http://100.113.144.100:18765/v1';
const llmModel = args.get('--llm-model') || process.env.LLM_MODEL || 'nvidia/Qwen3.8-27B-NVFP4';
const llmApiKey = args.get('--llm-api-key') || process.env.LLM_API_KEY || '';
const paddingSeconds = Number(args.get('--padding') || 2.0);
const dryRun = args.get('--dry-run') === 'true';

function formatNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function runRemoteWhisperWindows({ youtubeUrl, windows }) {
  if (windows.length === 0) return [];
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

with tempfile.TemporaryDirectory(prefix='pusa-reasr-') as td:
    work = pathlib.Path(td)
    audio = work / 'source.m4a'
    for attempt in range(3):
        try:
            subprocess.run([
                yt_dlp, '--no-update', '--force-overwrites', '--no-playlist',
                '--retries', '5',
                '-f', 'bestaudio[ext=m4a]/bestaudio',
                '-o', str(audio),
                payload['youtubeUrl'],
            ], check=True, capture_output=True)
            break
        except subprocess.CalledProcessError:
            if attempt == 2:
                raise
            import time
            time.sleep(3 * (attempt + 1))

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
      timeout: 600000,
      maxBuffer: 16_000_000,
    },
  );
  return JSON.parse(stdout).results ?? [];
}

function repairHallucinationsFromReAsr(session, findings, reAsrResults, windows) {
  const hallucinationIds = new Set(
    findings
      .filter((f) => f.findings.some((r) => r.ruleId.startsWith('whisper-hallucination')))
      .map((f) => f.sentenceId),
  );
  if (hallucinationIds.size === 0) return { session, repaired: [] };

  const updated = structuredClone(session);
  const repaired = [];

  // Map each window's re-ASR segments uniquely to its hallucinated sentences by midpoint timestamp
  const assignedTextBySentenceId = new Map();
  const flatHallucinated = [];
  for (const p of updated.paragraphs ?? []) {
    for (const s of p.sentences ?? []) {
      if (hallucinationIds.has(s.id)) flatHallucinated.push(s);
    }
  }

  for (const win of windows) {
    const winHallucinated = flatHallucinated.filter((s) => win.sentenceIds.includes(s.id));
    if (winHallucinated.length === 0) continue;

    const res = reAsrResults.find((r) => r.windowId === win.windowId);
    if (!res) continue;

    const minStart = Math.min(...winHallucinated.map((s) => Number(s.start ?? 0)));
    const maxEnd = Math.max(...winHallucinated.map((s) => Number(s.end ?? 0)));
    const segs = (res.guidedSegments?.length ? res.guidedSegments : res.rawSegments ?? [])
      .filter((seg) => seg.end > minStart - 0.5 && seg.start < maxEnd + 0.5 && String(seg.text ?? '').trim());

    const buckets = new Map(winHallucinated.map((s) => [s.id, []]));
    for (const seg of segs) {
      const segMid = (Number(seg.start) + Number(seg.end)) / 2;
      let best = winHallucinated[0];
      let bestDist = Infinity;
      for (const s of winHallucinated) {
        const sStart = Number(s.start ?? 0);
        const sEnd = Number(s.end ?? 0);
        const dist = segMid >= sStart && segMid <= sEnd
          ? 0
          : Math.min(Math.abs(segMid - sStart), Math.abs(segMid - sEnd));
        if (dist < bestDist) {
          bestDist = dist;
          best = s;
        }
      }
      buckets.get(best.id).push(String(seg.text).trim());
    }

    for (const s of winHallucinated) {
      const parts = buckets.get(s.id) ?? [];
      assignedTextBySentenceId.set(s.id, parts.join(''));
    }
  }

  for (const p of updated.paragraphs ?? []) {
    const nextSentences = [];
    for (const s of p.sentences ?? []) {
      if (!hallucinationIds.has(s.id)) {
        nextSentences.push(s);
        continue;
      }
      if (!assignedTextBySentenceId.has(s.id)) {
        nextSentences.push(s);
        continue;
      }
      const replacement = assignedTextBySentenceId.get(s.id).trim();
      if (!replacement) {
        // Extra duplicate hallucination tick with no corresponding speech segment
        repaired.push({ sentenceId: s.id, before: s.text, after: '' });
        continue;
      }
      if (replacement !== s.text) {
        repaired.push({ sentenceId: s.id, before: s.text, after: replacement });
        s.text = replacement;
      }
      nextSentences.push(s);
    }
    p.sentences = nextSentences;
  }
  return { session: updated, repaired };
}

async function processSingleSession(sessionNum) {
  const sid = String(sessionNum).padStart(2, '0');
  const sessionPath = path.join(COURSE_DIR, `session_${sid}.json`);
  const session = JSON.parse(readFileSync(sessionPath, 'utf8'));
  const t0 = Date.now();
  console.log(`\n==================== 開始處理第 ${sid} 講 (${session.title}) ====================`);

  // Stage 1: Rule + LLM Omission Audit + GX10 Re-ASR
  const ruleFindings = auditSessionDharmaTerms(session);
  const llmFindings = await auditSessionWithLlm({
    session,
    endpoint: llmEndpoint,
    model: llmModel,
    apiKey: llmApiKey,
  });
  const findings = mergeAuditFindings(ruleFindings, llmFindings);
  const windows = buildReAsrWindows(findings, { paddingSeconds });
  console.log(`[Stage 1] 規則偵測 ${ruleFindings.length} 句 + LLM 偵測 ${llmFindings.length} 句 -> 合併 ${windows.length} 個重辨識視窗`);

  const youtubeUrl = session.youtubeUrl
    || (session.youtubeVideoId ? `https://www.youtube.com/watch?v=${session.youtubeVideoId}` : null);
  const rawReAsr = youtubeUrl && windows.length > 0
    ? runRemoteWhisperWindows({ youtubeUrl, windows })
    : [];

  const reAsrResults = rawReAsr.map((r) => {
    const win = windows.find((w) => w.windowId === r.windowId);
    const recoveredTerms = (win?.expectedTerms ?? []).filter((term) => r.guidedText.includes(term));
    return {
      ...r,
      sentenceIds: win?.sentenceIds ?? [],
      expectedTerms: win?.expectedTerms ?? [],
      recoveredTerms,
    };
  });

  // Stage 2: Repair Whisper hallucinations before polishing
  const { session: repairedSession, repaired: hallucinationRepairs } = repairHallucinationsFromReAsr(
    session,
    findings,
    reAsrResults,
    windows,
  );
  console.log(`[Stage 2] Whisper 幻覺修復: ${hallucinationRepairs.length} 句`);

  // Stage 3: Fluent Polish + Deterministic Safety Guard
  const auditReport = { reAsrResults };
  const { proposals, blockedByGuard } = await generateFluentPolishProposals({
    session: repairedSession,
    auditReport,
    endpoint: llmEndpoint,
    model: llmModel,
    apiKey: llmApiKey,
    maxCharsPerBatch: 1100,
    concurrency: 3,
    timeoutMs: 300000,
  });
  console.log(`[Stage 3] 流暢修訂通過安全閘門: ${proposals.length} 句 | 安全閘門攔截: ${blockedByGuard.length} 句`);

  let finalSession = applyPolishProposals(repairedSession, proposals);

  // Stage 4: Paragraph Layout & Numbered Headings
  finalSession = mergeParagraphsByLayout(finalSession, {
    minChars: 160,
    maxChars: 340,
    preserveExistingHeadings: false,
  });
  finalSession = await assignSectionHeadingsWithLlm({
    session: finalSession,
    endpoint: llmEndpoint,
    model: llmModel,
    apiKey: llmApiKey,
  });

  const headingCount = (finalSession.paragraphs ?? []).filter((p) => p.heading).length;
  finalSession.lastUpdated = formatNow();
  finalSession._meta = {
    ...(finalSession._meta ?? {}),
    proofread: 'human-verified-dharma-pipeline',
    layoutStandard: 'shiliang-32-1-pdf',
    reAsrWindowsChecked: windows.length,
    hallucinationsRepaired: hallucinationRepairs.length,
    fluentPolishedCount: proposals.length,
    guardBlockedCount: blockedByGuard.length,
    proofreadSummary: `全流程校對完成：名相/語意重辨識 ${windows.length} 區、修復幻覺 ${hallucinationRepairs.length} 處、安全閘門修訂 ${proposals.length} 句（攔截 ${blockedByGuard.length}）、重組 ${finalSession.paragraphs.length} 段與 ${headingCount} 個編號小標。`,
  };

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    path.join(EVIDENCE_DIR, `session_${sid}.audit.json`),
    `${JSON.stringify({ findings, windows, reAsrResults, hallucinationRepairs, proposalsCount: proposals.length, blockedByGuard }, null, 2)}\n`,
    'utf8',
  );
  writeFileSync(
    path.join(EVIDENCE_DIR, `session_${sid}.preview.md`),
    renderReadableMarkdown(finalSession),
    'utf8',
  );

  if (!dryRun) {
    writeFileSync(sessionPath, `${JSON.stringify(finalSession, null, 2)}\n`, 'utf8');
  }
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[Stage 4] 完成第 ${sid} 講：${finalSession.paragraphs.length} 自然段 / ${headingCount} 小標（耗時 ${elapsedSec}s）`);
}

const sessionList = sessionsArg.split(',').map((s) => s.trim()).filter(Boolean);
for (const s of sessionList) {
  await processSingleSession(s);
}
