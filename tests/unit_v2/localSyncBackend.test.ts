import { describe, it, expect } from 'vitest';
import { buildSyncPayload, parseHealthResponse } from '../../src/composables/useSyncBackend';

describe('LocalSyncBackend Test Pattern (TDD)', () => {
  it('應正確封裝待推送之校勘與筆記 Payload', () => {
    const corrections = {
      'sent-1': { original: '錯字', corrected: '正字', timestamp: 10 },
    };
    const notes = {
      'sent-1': '重要筆記',
    };

    const payload = buildSyncPayload('ru-zhong-lun', '02A', corrections, notes);
    expect(payload.courseId).toBe('ru-zhong-lun');
    expect(payload.sessionId).toBe('02A');
    expect(payload.corrections['sent-1'].corrected).toBe('正字');
    expect(payload.notes['sent-1']).toBe('重要筆記');
    expect(payload.clientTimestamp).toBeDefined();
  });

  it('應正確解析後端健康狀態檢查結果', () => {
    const okResponse = { status: 'ok', version: '1.0', active_port: 9091 };
    expect(parseHealthResponse(okResponse)).toBe(true);

    const errorResponse = { status: 'error' };
    expect(parseHealthResponse(errorResponse)).toBe(false);
    expect(parseHealthResponse(null)).toBe(false);
  });
});
