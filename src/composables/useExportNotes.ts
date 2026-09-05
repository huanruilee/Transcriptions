export interface ExportMeta {
  courseTitle: string;
  sessionId: string;
  sessionTitle: string;
  pageRange?: string;
}

export interface CorrectionRecord {
  original: string;
  corrected: string;
  timestamp?: number;
  note?: string;
}

export function formatMarkdownNotes(
  meta: ExportMeta,
  corrections: Record<string, CorrectionRecord>,
  notes: Record<string, string>
): string {
  const dateStr = new Date().toISOString().split('T')[0];
  let md = `# 《${meta.courseTitle}》${meta.sessionTitle} 研讀筆記與校勘修訂\n\n`;
  md += `- **課程名稱**：${meta.courseTitle}\n`;
  md += `- **講次編號**：${meta.sessionId}\n`;
  if (meta.pageRange) {
    md += `- **底本頁碼**：${meta.pageRange}\n`;
  }
  md += `- **匯出時間**：${dateStr}\n\n`;
  md += `---\n\n`;

  // 一、 校勘修訂清單
  md += `## 一、 校勘修訂清單\n\n`;
  const corrKeys = Object.keys(corrections);
  if (corrKeys.length === 0) {
    md += `（本講次尚無校勘記錄）\n\n`;
  } else {
    corrKeys.forEach((key, i) => {
      const c = corrections[key];
      const timeStr = c.timestamp ? ` [${Math.floor(c.timestamp / 60)}:${Math.floor(c.timestamp % 60).toString().padStart(2, '0')}]` : '';
      md += `### ${i + 1}. 句子修訂${timeStr}\n`;
      md += `- **原始辨識**：${c.original}\n`;
      md += `- **校訂文字**：${c.corrected}\n`;
      if (c.note) {
        md += `- **校勘理由**：${c.note}\n`;
      }
      md += `\n`;
    });
  }

  // 二、 研讀心得與要點筆記
  md += `## 二、 研讀心得與要點筆記\n\n`;
  const noteKeys = Object.keys(notes);
  if (noteKeys.length === 0) {
    md += `（本講次尚無研讀筆記）\n\n`;
  } else {
    noteKeys.forEach((key, i) => {
      md += `### ${i + 1}. 筆記 (#${key})\n`;
      md += `${notes[key]}\n\n`;
    });
  }

  return md;
}

export function downloadMarkdownFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
