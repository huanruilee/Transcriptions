import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

test('native Flyday audio does not opt into CORS mode', () => {
  const app = fs.readFileSync(path.join(ROOT, 'src/App.vue'), 'utf8');
  const idPosition = app.indexOf('id="audio-element"');
  assert.notEqual(idPosition, -1, 'audio-element must exist');

  const tagStart = app.lastIndexOf('<audio', idPosition);
  const tagEnd = app.indexOf('>', idPosition);
  assert.notEqual(tagStart, -1, 'audio-element opening tag must exist');
  assert.notEqual(tagEnd, -1, 'audio-element opening tag must close');

  const audioTag = app.slice(tagStart, tagEnd + 1);
  assert.doesNotMatch(
    audioTag,
    /\bcrossorigin\s*=/i,
    'Flyday does not return CORS headers; native playback must use the default no-CORS media mode',
  );
});
