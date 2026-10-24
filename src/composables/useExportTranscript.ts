export interface TranscriptExportMeta {
  courseTitle: string;
  sessionId: string;
  sessionTitle: string;
  pageRange?: string;
  lastUpdated?: string;
  readerRebuiltAt?: string;
  transcriptStatus?: string;
  readerNotice?: string;
}

export interface TranscriptExportSentence {
  start?: number;
  start_time?: number;
  speaker?: string | null;
  text?: string;
}

export interface TranscriptExportParagraph {
  heading?: string | null;
  sentences?: TranscriptExportSentence[];
  verbatimSentences?: TranscriptExportSentence[];
}

export interface TranscriptExportOverview {
  mainPoints: string[];
  discussionTopics: string[];
  referenceViews: string[];
}

function formatTimestamp(value: unknown): string {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

export function formatTranscriptText(
  meta: TranscriptExportMeta,
  paragraphs: TranscriptExportParagraph[],
  overview?: TranscriptExportOverview | null,
): string {
  const lines = [
    `《${meta.courseTitle}》逐字稿`,
    '',
    `課程：${meta.courseTitle}`,
    `講次：${meta.sessionId}｜${meta.sessionTitle}`,
  ];

  if (meta.pageRange) lines.push(`底本頁碼：${meta.pageRange}`);
  if (meta.transcriptStatus) lines.push(`逐字稿狀態：${meta.transcriptStatus}`);
  if (meta.readerRebuiltAt) {
    lines.push(`重整版最後更新：${meta.readerRebuiltAt}`);
    if (meta.lastUpdated) lines.push(`底稿校正日期：${meta.lastUpdated}`);
  } else if (meta.lastUpdated) lines.push(`最後更新：${meta.lastUpdated}`);
  if (meta.readerNotice?.trim()) lines.push('', `閱讀提醒：${meta.readerNotice}`);
  if (overview) {
    lines.push('', '本講內容導讀', '');
    const groups: Array<[string, string[]]> = [
      ['主要內容', overview.mainPoints],
      ['討論議題', overview.discussionTopics],
      ['參考答案／觀點', overview.referenceViews],
    ];
    for (const [heading, items] of groups) {
      if (!items.length) continue;
      lines.push(heading, ...items.map((item) => `- ${item}`), '');
    }
  }

  lines.push('---', '');

  let sentenceCount = 0;
  for (const paragraph of paragraphs || []) {
    const sourceSentences =
      Array.isArray(paragraph.verbatimSentences) && paragraph.verbatimSentences.length > 0
        ? paragraph.verbatimSentences
        : paragraph.sentences || [];
    const sentences = sourceSentences.filter((sentence) => sentence.text?.trim());
    if (sentences.length === 0) continue;

    if (paragraph.heading?.trim()) {
      lines.push(paragraph.heading.trim(), '');
    }

    for (const sentence of sentences) {
      const start = sentence.start_time ?? sentence.start ?? 0;
      const speakerPrefix = sentence.speaker?.trim() ? `【${sentence.speaker.trim()}】` : '';
      lines.push(`[${formatTimestamp(start)}] ${speakerPrefix}${sentence.text!.trim()}`);
      sentenceCount += 1;
    }
    lines.push('');
  }

  if (sentenceCount === 0) {
    lines.push('（本講次目前沒有可下載的逐字稿內容）', '');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function buildTranscriptFilename(courseTitle: string, sessionId: string): string {
  const safeCourseTitle = courseTitle
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || '課程';
  const safeSessionId = sessionId.replace(/[\\/:*?"<>|]/g, '_').trim() || '未標示';
  return `${safeCourseTitle}_第${safeSessionId}講_逐字稿.txt`;
}

export function downloadTranscriptFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
