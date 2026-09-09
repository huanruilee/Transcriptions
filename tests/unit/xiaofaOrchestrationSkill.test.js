import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const PATH = '.agents/skills/xiaofa_orchestration/SKILL.md';
const skill = fs.readFileSync(PATH, 'utf8');

test('Xiaofa skill requires an isolated task workspace in every dispatch template', () => {
  assert.doesNotMatch(skill, /Workspace: \/home\/henry\/\.gx10\/xiaofa\/workspace/);
  assert.match(skill, /Workspace: <TEMP_WORKSPACE>/);
});

test('Xiaofa skill does not hard-code test counts or grant auto-merge authority', () => {
  assert.doesNotMatch(skill, /279 passed|all 279|gh pr merge|auto-merge enabled/i);
  assert.match(skill, /record the observed pass, fail, and skip counts/i);
});

test('temporary Agent network access is allowlisted instead of absolutely forbidden', () => {
  assert.match(skill, /Only manifest-listed endpoints may be\s+accessed/);
  assert.match(skill, /external network access is forbidden/);
});

test('raw and published timestamp permissions are explicitly separated', () => {
  assert.match(skill, /Raw ASR timestamps are immutable/);
  assert.match(skill, /Published sentence timestamps may change\s+only from `CONFIRMED` audio\/alignment evidence/);
  assert.match(skill, /recompute paragraph start and\s+end/);
});
