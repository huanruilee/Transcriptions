import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SOURCE_TEXT_DIR = path.resolve('courses/入中論善顯密意疏/source_text');
const COURSE_JSON_PATH = path.resolve('courses/入中論善顯密意疏/course.json');

describe('Treatise Ground Truth Source Text and Alignment Tests', () => {
  it('catalog.json exists and specifies 285 total pages', () => {
    const catalogPath = path.join(SOURCE_TEXT_DIR, 'catalog.json');
    assert.ok(fs.existsSync(catalogPath), 'catalog.json must exist');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    assert.equal(catalog.total_pages, 285, 'Must contain exactly 285 pages');
    assert.equal(Object.keys(catalog.pages).length, 285, 'Must index all 285 pages');
  });

  it('all 285 page text files exist and are non-empty', () => {
    for (let p = 1; p <= 285; p++) {
      const pageFile = path.join(SOURCE_TEXT_DIR, `page_${String(p).padStart(3, '0')}.txt`);
      assert.ok(fs.existsSync(pageFile), `Page file ${pageFile} must exist`);
      const content = fs.readFileSync(pageFile, 'utf8');
      assert.ok(content.length >= 10, `Page ${p} must contain valid extracted text`);
    }
  });

  it('all_verses.json contains valid citations with valid page numbers', () => {
    const versesPath = path.join(SOURCE_TEXT_DIR, 'all_verses.json');
    assert.ok(fs.existsSync(versesPath), 'all_verses.json must exist');
    const verses = JSON.parse(fs.readFileSync(versesPath, 'utf8'));
    assert.ok(Array.isArray(verses), 'Must be an array');
    assert.ok(verses.length > 100, `Must index at least 100 verses (found ${verses.length})`);

    for (const v of verses) {
      assert.ok(v.page >= 1 && v.page <= 285, `Page ${v.page} must be within [1, 285]`);
      assert.ok(typeof v.text === 'string' && v.text.length > 0, 'Verse text must be non-empty string');
    }
  });

  it('every session in course.json with pageRange maps to existing source pages', () => {
    const courseData = JSON.parse(fs.readFileSync(COURSE_JSON_PATH, 'utf8'));
    const sessions = courseData.sessions || [];

    for (const s of sessions) {
      if (s.pageRange) {
        const matches = s.pageRange.match(/\d+/g);
        if (matches) {
          for (const m of matches) {
            const pageNum = parseInt(m, 10);
            if (pageNum >= 1 && pageNum <= 285) {
              const pageFile = path.join(SOURCE_TEXT_DIR, `page_${String(pageNum).padStart(3, '0')}.txt`);
              assert.ok(fs.existsSync(pageFile), `Session ${s.sessionId} (${s.pageRange}) page ${pageNum} must exist`);
            }
          }
        }
      }
    }
  });
});
