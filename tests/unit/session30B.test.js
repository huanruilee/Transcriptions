/**
 * tests/unit/session30B.test.js
 * RED → GREEN regression tests for Session 30B coverage.
 *
 * Session 30B = the lower half of 第30堂 (2017-01-21) lecture on p.100 of
 * 《入中論善顯密意疏》. The official Flyday archive publishes 30B as a
 * separate MP3 (20170121-B …p100(30).MP3) at
 *   https://buddha.flyday.com.tw/68%20…/20170121-B%20…p100(30).MP3
 * but the repo currently only maps 30A. These tests pin the contract so the
 * gap cannot silently regress.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const COURSE_DIR = path.resolve('courses/入中論善顯密意疏');
const AUDIO_MAP_PATH = path.join(COURSE_DIR, 'audio_map.json');
const COURSE_JSON_PATH = path.join(COURSE_DIR, 'course.json');
const SESSIONS_DIR = path.join(COURSE_DIR, 'sessions');
const TEXTBOOK_TABLE = path.join(COURSE_DIR, 'TEXTBOOK_PROGRESS_TABLE.md');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

describe('Session 30B coverage regression tests', () => {
  test('audio_map.json includes the 30B Flyday URL pointing at 20170121-B ...p100(30).MP3', () => {
    assert.ok(fs.existsSync(AUDIO_MAP_PATH), 'audio_map.json must exist');
    const audioMap = readJson(AUDIO_MAP_PATH);
    assert.ok(
      typeof audioMap['30B'] === 'string' && audioMap['30B'].length > 0,
      'audio_map.json must contain a 30B key pointing at the official 2017-01-21 B-track MP3'
    );
    assert.match(
      audioMap['30B'],
      /^https:\/\/buddha\.flyday\.com\.tw\/.*20170121-B.*p100\(30\)\.MP3$/i,
      `30B URL must match the official Flyday 20170121-B pattern, got: ${audioMap['30B']}`
    );
  });

  test('course.json has a 30B session entry with pageRange covering p.100', () => {
    const course = readJson(COURSE_JSON_PATH);
    const session30B = (course.sessions || []).find(s => s.sessionId === '30B');
    assert.ok(session30B, 'course.json must contain a session with sessionId "30B"');
    assert.ok(
      typeof session30B.pageRange === 'string' && session30B.pageRange.includes('100'),
      `30B entry must declare a pageRange covering p.100, got: ${session30B.pageRange}`
    );
    assert.ok(
      typeof session30B.date === 'string' && session30B.date.startsWith('2017-01-21'),
      `30B entry must be dated 2017-01-21, got: ${session30B.date}`
    );
  });

  test('TEXTBOOK_PROGRESS_TABLE.md lists 第 30B 堂 with a Flyday 20170121-B link', () => {
    assert.ok(fs.existsSync(TEXTBOOK_TABLE), 'TEXTBOOK_PROGRESS_TABLE.md must exist');
    const md = fs.readFileSync(TEXTBOOK_TABLE, 'utf8');
    assert.match(
      md,
      /第\s*30\s*B\s*堂/,
      'TEXTBOOK_PROGRESS_TABLE.md must list the 第 30B 堂 row'
    );
    assert.match(
      md,
      /20170121-B.*p100\(30\)\.MP3/,
      'TEXTBOOK_PROGRESS_TABLE.md 30B row must link to the 20170121-B ...p100(30).MP3 URL'
    );
  });

  test('sessions/session_30B.json exists with the full ASR-grounded schema', () => {
    const sessionPath = path.join(SESSIONS_DIR, 'session_30B.json');
    assert.ok(fs.existsSync(sessionPath), 'sessions/session_30B.json must exist');
    const data = readJson(sessionPath);

    assert.equal(data.sessionId, '30B', 'sessionId must be "30B"');
    assert.ok(
      typeof data.audioUrl === 'string' && data.audioUrl.includes('20170121-B'),
      'session_30B.json audioUrl must point at the Flyday 20170121-B stream'
    );
    assert.ok(Array.isArray(data.paragraphs) && data.paragraphs.length > 0,
      'session_30B.json must contain a non-empty paragraphs array');
    assert.ok(data._meta && data._meta.engine === 'whisper-large-v3-turbo',
      'session_30B.json must record the whisper-large-v3-turbo engine in _meta');

    // First/last sentence continuity — paragraph boundaries must align
    data.paragraphs.forEach((p, pIdx) => {
      assert.ok(p.id, `paragraph ${pIdx} missing id`);
      assert.ok(typeof p.start === 'number' && typeof p.end === 'number',
        `paragraph ${pIdx} missing numeric start/end`);
      assert.ok(Array.isArray(p.sentences) && p.sentences.length > 0,
        `paragraph ${pIdx} sentences must be a non-empty array`);
      const first = p.sentences[0];
      const last = p.sentences[p.sentences.length - 1];
      assert.ok(Math.abs(p.start - first.start) <= 0.05,
        `paragraph ${pIdx} start (${p.start}) must align with first sentence (${first.start})`);
      assert.ok(Math.abs(p.end - last.end) <= 0.05,
        `paragraph ${pIdx} end (${p.end}) must align with last sentence (${last.end})`);
    });
  });
});