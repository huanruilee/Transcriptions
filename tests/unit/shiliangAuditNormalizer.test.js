import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeOfficialTranscript } from '../../scripts/lib/shiliangAudit.js';

test('official transcript normalization removes form-feed page-number artifacts', () => {
  assert.equal(
    normalizeOfficialTranscript('相同\n\n2\n\n\f的道理'),
    '相同的道理',
  );
});

test('official transcript normalization preserves numbers inside spoken content', () => {
  assert.equal(
    normalizeOfficialTranscript('第 206 個偈頌'),
    '第206個偈頌',
  );
});
