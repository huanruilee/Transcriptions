export interface TranscriptOverview {
  mainPoints: string[];
  discussionTopics: string[];
  referenceViews: string[];
  source: 'reviewed' | 'derived';
}

interface OverviewInput {
  contentOverview?: Partial<Omit<TranscriptOverview, 'source'>>;
  discussionQuestions?: Array<{
    displayQuestion?: string;
    rawQuestion?: string;
    teacherSummary?: { items?: string[] };
  }>;
  paragraphs?: Array<{
    heading?: string | null;
    teacherSummary?: { items?: string[] } | null;
  }>;
  summary?: string;
}

interface SessionOverviewMeta {
  title?: string;
  summary?: string;
}

const MAX_ITEMS = 5;
const MAX_MAIN_POINTS = 4;

function normalizeItems(values: unknown[], limit = MAX_ITEMS): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (typeof value !== 'string') continue;
    const text = value.replace(/\s+/g, ' ').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= limit) break;
  }

  return result;
}

function cleanHeading(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/^【(?:科判導讀|科判)】\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanSummary(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.replace(/\s+/g, ' ').trim();
  const separator = text.indexOf('・');
  return separator >= 0 ? text.slice(separator + 1).trim() : text;
}

function questionContext(value: string): string {
  const text = value.replace(/^第[一二三四五六七八九十\d]+題[：:、]?\s*/, '').trim();
  const marker = text.search(/[，。；]?請問/);
  if (marker >= 10) return text.slice(0, marker).replace(/[，。；\s]+$/, '');
  return text;
}

function mainPointFromHeading(value: string): string {
  const looksLikeQuestion = /[？?]|請問|^(?:為何|如何|是否)/.test(value);
  if (!looksLikeQuestion) return value;
  const context = questionContext(value);
  if (context.length <= 52) return context;
  return `${context.slice(0, 51).replace(/[，。；、\s]+$/, '')}…`;
}

export function buildTranscriptOverview(
  data: OverviewInput,
  session: SessionOverviewMeta = {},
): TranscriptOverview | null {
  const explicit = data.contentOverview;
  const questions = Array.isArray(data.discussionQuestions) ? data.discussionQuestions : [];
  const paragraphs = Array.isArray(data.paragraphs) ? data.paragraphs : [];
  const headings = normalizeItems(
    paragraphs.map((paragraph) => mainPointFromHeading(cleanHeading(paragraph.heading))),
    MAX_MAIN_POINTS,
  );
  const questionTexts = normalizeItems(questions.map((question) => (
    question.displayQuestion || question.rawQuestion || ''
  )));
  const questionContexts = normalizeItems(
    questionTexts.map((question) => mainPointFromHeading(question)),
    MAX_MAIN_POINTS,
  );
  const teacherViews = normalizeItems([
    ...questions.flatMap((question) => question.teacherSummary?.items || []),
    ...paragraphs.flatMap((paragraph) => paragraph.teacherSummary?.items || []),
  ]);
  const summary = cleanSummary(data.summary || session.summary || '');

  const explicitMain = normalizeItems(explicit?.mainPoints || []);
  const explicitTopics = normalizeItems(explicit?.discussionTopics || []);
  const explicitViews = normalizeItems(explicit?.referenceViews || []);
  const hasCompleteExplicit = explicitMain.length > 0
    && explicitTopics.length > 0
    && explicitViews.length > 0;

  const mainPoints = explicitMain.length
    ? explicitMain
    : (headings.length ? headings : (questionContexts.length ? questionContexts : normalizeItems([summary])));
  const discussionTopics = explicitTopics.length
    ? explicitTopics
    : (questionTexts.length ? questionTexts : (summary ? [summary] : headings));
  const referenceViews = explicitViews.length
    ? explicitViews
    : (teacherViews.length ? teacherViews : (summary ? [summary] : headings));

  if (mainPoints.length + discussionTopics.length + referenceViews.length === 0) return null;

  return {
    mainPoints,
    discussionTopics,
    referenceViews,
    source: hasCompleteExplicit ? 'reviewed' : 'derived',
  };
}
