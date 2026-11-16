import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { loadMiniMaxConfiguration } from '../../scripts/minimax_responses_call.mjs';

test('MiniMax helper accepts environment-only credentials when config file is absent', () => {
  const missingConfigPath = path.join(
    os.tmpdir(),
    `missing-minimax-config-${process.pid}-${Date.now()}.json`,
  );
  assert.equal(fs.existsSync(missingConfigPath), false);

  const config = loadMiniMaxConfiguration({
    MMX_CONFIG_PATH: missingConfigPath,
    MINIMAX_API_KEY: 'environment-key',
  });

  assert.equal(config.apiKey, 'environment-key');
  assert.equal(config.baseUrl, 'https://api.minimax.cn');
  assert.equal(config.timeoutSeconds, 300);
});
