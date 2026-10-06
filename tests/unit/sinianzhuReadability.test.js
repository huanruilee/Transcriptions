import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const dir = 'courses/四念住';
const toc = read(`${dir}/toc.json`);
const course = read(`${dir}/course.json`);

test('四念住 catalog resolves the actual course directory', () => {
  const entry = read('courses/catalog.json').courses.find(c => c.id === toc.courseId);
  assert.equal(entry.path, dir);
  assert.equal(entry.publicationState, 'candidate-review-required');
});

test('every authoritative TOC lecture has a readable candidate index entry', () => {
  assert.deepEqual(course.sessions?.map(s => s.sessionId), toc.sections.map(s => s.sessionId));
  for (const source of toc.sections) {
    const entry = course.sessions.find(s => s.sessionId === source.sessionId);
    const transcript = read(`${dir}/sessions/session_${entry.sessionId}.json`);
    assert.equal(entry.youtubeVideoId, source.videoId);
    assert.equal(entry.youtubeVideoId, transcript.youtubeVideoId);
    assert.equal(entry.mediaType, 'video/youtube');
    assert.equal(entry.transcriptStatus, 'candidate-review-required');
    assert.equal(transcript.publicationState, 'candidate-review-required');
    assert.equal(transcript.audioAvailable, false);
    assert.ok(transcript.paragraphs.flatMap(p => p.sentences).length > 0);
    assert.ok(transcript.paragraphs.every(p => p.sentences.every(s => s.text.trim())));
  }
});
