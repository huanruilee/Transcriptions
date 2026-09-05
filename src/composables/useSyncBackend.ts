export interface SyncPayload {
  courseId: string;
  sessionId: string;
  corrections: Record<string, any>;
  notes: Record<string, string>;
  clientTimestamp: string;
}

export function buildSyncPayload(
  courseId: string,
  sessionId: string,
  corrections: Record<string, any>,
  notes: Record<string, string>
): SyncPayload {
  return {
    courseId,
    sessionId,
    corrections,
    notes,
    clientTimestamp: new Date().toISOString(),
  };
}

export function parseHealthResponse(data: any): boolean {
  if (!data || typeof data !== 'object') return false;
  return data.status === 'ok';
}

export async function probeSyncHealth(port = 9091): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return false;
    const json = await res.json();
    return parseHealthResponse(json);
  } catch {
    return false;
  }
}
