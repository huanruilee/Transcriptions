// Smoke check for the editorial-audit ledger gate. Prints PASS/FAIL + details.
// Checks: workspace path, branch, HEAD, manifest SHA256, manifest↔file hashes,
// and that the private anchor_index.json carries all five evidence roles with
// self-consistent response/text hashes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../../..');
const MANIFEST = path.join(ROOT, 'reviews/evidence/study-group-2025/playlist-01/acceptance-prep/input_manifest.json');
const PRIVATE_DIR = '/home/henry/.gx10/tasks/study-group-session01-gpu-anchors-20260916/evidence';
const EXPECTED = {
  workspace: '/home/henry/.gx10/tasks/study-group-session01-ledger-20260916/repo',
  branch: 'codex/study-group-session01-ledger',
  head: '28748fbd9021ffb5b73a326606af749f13c79327',
  manifestSha256: 'f63497d0508ed4f4623d75bd7edeb0cbbf58da79f9fafb886f12b9f4f2014a9c',
  roles: ['opening', 'middle', 'ending', 'question', 'teacher-summary'],
};
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok, detail });

check('workspace', process.cwd() === EXPECTED.workspace || ROOT === EXPECTED.workspace, ROOT);
let branch = '', head = '';
try {
  branch = execSync('git branch --show-current', { cwd: ROOT }).toString().trim();
  head = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
} catch { /* fail below */ }
check('branch', branch === EXPECTED.branch, branch);
check('HEAD', head === EXPECTED.head, head);

const manifestBuf = fs.readFileSync(MANIFEST);
const mSha = sha(manifestBuf);
check('manifest-sha256', mSha === EXPECTED.manifestSha256, mSha);
const manifest = JSON.parse(manifestBuf.toString('utf8'));
for (const [name, entry] of Object.entries(manifest.files)) {
  const abs = path.join(ROOT, entry.repoPath);
  const ok = fs.existsSync(abs) && sha(fs.readFileSync(abs)) === entry.sha256;
  check(`manifest-file:${name}`, ok, entry.sha256);
}

const idxPath = path.join(PRIVATE_DIR, 'anchor_index.json');
check('private-anchor-index-exists', fs.existsSync(idxPath), idxPath);
if (fs.existsSync(idxPath)) {
  const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
  const roles = idx.items.map((i) => i.role).sort();
  check('private-roles-all-five', JSON.stringify(roles) === JSON.stringify([...EXPECTED.roles].sort()), roles.join(','));
  for (const it of idx.items) {
    const respFile = path.join(PRIVATE_DIR, `${it.role}.asr.json`);
    const respOk = fs.existsSync(respFile) && sha(fs.readFileSync(respFile)) === it.responseSha256;
    const textOk = fs.existsSync(respFile)
      && sha(Buffer.from(JSON.parse(fs.readFileSync(respFile, 'utf8')).text, 'utf8')) === it.textSha256;
    check(`private-response:${it.role}`, respOk && textOk, `response=${respOk} text=${textOk}`);
    const clipFile = path.join(PRIVATE_DIR, `${it.role}.clip.sha256`);
    check(`private-clip-digest:${it.role}`,
      fs.existsSync(clipFile) && fs.readFileSync(clipFile, 'utf8').trim() === it.clipSha256,
      'clip binaries deleted per cleanup.json; digest sidecar verified');
  }
}

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'ok' : 'FAIL'} ${c.name} ${c.detail}`);
console.log(failed.length === 0 ? 'PASS' : `FAIL (${failed.length})`);
process.exit(failed.length === 0 ? 0 : 1);
