#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { auditAudioCalibration, auditAcousticEvidence } from './lib/audioCalibrationGate.js';
const [sourcePath,candidatePath,evidencePath]=process.argv.slice(2);
if (!sourcePath || !candidatePath || !evidencePath) throw new Error('Usage: node scripts/audit_audio_calibration.mjs SOURCE CANDIDATE ACOUSTIC_EVIDENCE');
const sha = raw => 'sha256:'+createHash('sha256').update(raw).digest('hex');
const source=readFileSync(sourcePath), raw=readFileSync(evidencePath);
const candidate=JSON.parse(readFileSync(candidatePath));
const structure=auditAudioCalibration(JSON.parse(source),candidate,sha(source));
const acoustic=auditAcousticEvidence(candidate,JSON.parse(raw),sha(raw));
console.log(JSON.stringify({ok:structure.ok&&acoustic.ok,structure,acoustic},null,2));
process.exitCode=structure.ok&&acoustic.ok?0:1;
