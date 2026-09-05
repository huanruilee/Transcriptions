export interface SessionNavItem {
  session_id: string;
  title: string;
  [key: string]: any;
}

export function naturalSortSessions<T extends { session_id: string }>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => {
    return a.session_id.localeCompare(b.session_id, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

export function getPrevNextSessions<T extends { session_id: string }>(
  sessions: T[],
  currentSessionId: string
): {
  prev: T | null;
  next: T | null;
  hasPrev: boolean;
  hasNext: boolean;
  currentIndex: number;
} {
  const currentIndex = sessions.findIndex(s => s.session_id === currentSessionId);
  if (currentIndex === -1) {
    return {
      prev: null,
      next: null,
      hasPrev: false,
      hasNext: false,
      currentIndex: -1,
    };
  }

  const prev = currentIndex > 0 ? sessions[currentIndex - 1] : null;
  const next = currentIndex < sessions.length - 1 ? sessions[currentIndex + 1] : null;

  return {
    prev,
    next,
    hasPrev: prev !== null,
    hasNext: next !== null,
    currentIndex,
  };
}
