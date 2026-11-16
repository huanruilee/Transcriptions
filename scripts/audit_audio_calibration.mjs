#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { auditAudioCalibration, auditAcousticEvidence, auditAudioIdentity } from './lib/audioCalibrationGate.js';
const [sourcePath,candidatePath,evidencePath,identityPath]=process.argv.slice(2);
if (!sourcePath || !candidatePath || !evidencePath || !identityPath) throw new Error('Usage: node scripts/audit_audio_calibration.mjs SOURCE CANDIDATE ACOUSTIC_EVIDENCE AUDIO_IDENTITY');
const sha = raw => 'sha256:'+createHash('sha256').update(raw).digest('hex');
const source=readFileSync(sourcePath), raw=readFileSync(evidencePath);
const candidate=JSON.parse(readFileSync(candidatePath));
const structure=auditAudioCalibration(JSON.parse(source),candidate,sha(source));
const acoustic=auditAcousticEvidence(candidate,JSON.parse(raw),sha(raw));
const identityRaw=readFileSync(identityPath);
const identity=auditAudioIdentity(candidate,JSON.parse(identityRaw),sha(identityRaw));
const ok=structure.ok&&acoustic.ok&&identity.ok;
console.log(JSON.stringify({ok,structure,acoustic,identity},null,2));
process.exitCode=ok?0:1;
