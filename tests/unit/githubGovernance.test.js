import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('GitHub governance: production deploy waits for successful main acceptance', () => {
  const workflow = read('.github/workflows/deploy.yml');

  assert.match(workflow, /workflow_run:\s*[\s\S]*workflows:\s*\[Completion Acceptance\]/,
    'Pages deployment must be triggered by the acceptance workflow');
  assert.match(workflow, /types:\s*\[completed\]/,
    'Pages deployment must wait until acceptance completes');
  assert.doesNotMatch(workflow, /push:\s*\n\s+branches:\s*\n\s+- main/,
    'Pages must not deploy directly from an unverified push to main');
  assert.match(workflow, /workflow_run\.conclusion\s*==\s*'success'/,
    'Pages deployment must require a successful acceptance conclusion');
  assert.match(workflow, /workflow_run\.event\s*==\s*'push'/,
    'Pull-request acceptance runs must never deploy');
  assert.match(workflow, /workflow_run\.head_branch\s*==\s*'main'/,
    'Only accepted main commits may deploy');
  assert.match(workflow, /ref:\s*\$\{\{\s*github\.event\.workflow_run\.head_sha\s*\}\}/,
    'Deployment must check out the exact commit that passed acceptance');
  assert.match(workflow, /cancel-in-progress:\s*true/,
    'A newer accepted main commit must supersede an older pending deployment');
});

test('GitHub governance: acceptance is least-privilege and checks generated drift', () => {
  const workflow = read('.github/workflows/acceptance.yml');

  assert.match(workflow, /permissions:\s*\n\s+contents:\s*read/,
    'Acceptance workflow must explicitly use read-only repository permissions');
  assert.match(workflow, /git diff --exit-code/,
    'CI must fail when generated review artifacts are not committed');
});

test('GitHub governance: no-audio CI preserves matching reviewed clip evidence', () => {
  const probe = `
from scripts.build_human_review_package import preserved_clip_metadata
sample = {"start": 1.0, "end": 2.0, "text": "same"}
prior = {("01", 7): {
  "start": 1.0, "end": 2.0, "current_text": "same",
  "audio_clip_path": "qa_27B/_human_review_clips/01/01-0007.wav",
  "audio_clip_sha256": "a" * 64,
}}
assert preserved_clip_metadata(prior, "01", 7, sample) == (
  "qa_27B/_human_review_clips/01/01-0007.wav", "a" * 64)
changed = {"start": 1.0, "end": 2.0, "text": "changed"}
assert preserved_clip_metadata(prior, "01", 7, changed) == (None, None)
`;
  const result = spawnSync('python3', ['-c', probe], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('GitHub governance: every workflow action is pinned to an immutable SHA', () => {
  const workflowFiles = fs.readdirSync(path.join(ROOT, '.github/workflows'))
    .filter(file => file.endsWith('.yml'));

  for (const file of workflowFiles) {
    const workflow = read(`.github/workflows/${file}`);
    const actionUses = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s*#.*)?$/gm)];
    for (const [, action] of actionUses) {
      assert.match(action, /@[a-f0-9]{40}$/,
        `${file}: ${action} must use an immutable 40-character commit SHA`);
    }
  }
});

test('GitHub governance: collaboration and dependency policy files exist', () => {
  const required = [
    '.github/CODEOWNERS',
    '.github/PULL_REQUEST_TEMPLATE.md',
    '.github/ISSUE_TEMPLATE/bug.yml',
    '.github/ISSUE_TEMPLATE/task.yml',
    '.github/ISSUE_TEMPLATE/config.yml',
    '.github/dependabot.yml',
  ];

  for (const relativePath of required) {
    assert.ok(fs.existsSync(path.join(ROOT, relativePath)), `${relativePath} must exist`);
  }
});

test('GitHub governance: current documentation matches the canonical session count', () => {
  const course = JSON.parse(read('courses/入中論善顯密意疏/course.json'));
  const count = course.sessions.length;
  const readme = read('README.md');
  const acceptance = read('docs/COMPLETION_ACCEPTANCE.md');

  assert.match(readme, new RegExp(`${count}(?:%2F|/)${count}`),
    'README completion badge must match course.json');
  assert.match(readme, new RegExp(`${count} 講`),
    'README current course summary must match course.json');
  assert.match(acceptance, new RegExp(`exactly the accepted ${count} sessions`),
    'Completion acceptance documentation must match course.json');
});
