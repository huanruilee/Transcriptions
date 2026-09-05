export interface OverviewSessionItem {
  session_id: string;
  title: string;
  page?: string;
  date?: string;
  [key: string]: any;
}

export function filterOverviewSessions(
  sessions: OverviewSessionItem[],
  query: string
): OverviewSessionItem[] {
  if (!query || !query.trim()) return sessions;
  const q = query.trim().toLowerCase();

  return sessions.filter(s => {
    const idMatch = s.session_id.toLowerCase().includes(q);
    const titleMatch = (s.title || '').toLowerCase().includes(q);
    const pageMatch = (s.page || '').toLowerCase().includes(q);
    const dateMatch = (s.date || '').toLowerCase().includes(q);
    return idMatch || titleMatch || pageMatch || dateMatch;
  });
}
