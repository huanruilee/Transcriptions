#!/usr/bin/env node
// Reuse the exact normal reader's source/content-bound approval validator.
import fs from 'node:fs';
import {projectApprovedRebuild} from '../src/utils/approvedRebuildReader.js';
const [source,publication]=process.argv.slice(2);
if(!publication)throw new Error('Usage: source publication');
await projectApprovedRebuild(fs.readFileSync(source,'utf8'),JSON.parse(fs.readFileSync(publication,'utf8')));
