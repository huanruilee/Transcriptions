import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('sync', ROOT / 'scripts/sync_study_guide_to_session.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


class StudyGuideSyncTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.course = self.root / 'courses/入中論善顯密意疏'
        for name in ('sessions', 'publications', 'source_outlines', 'verbatim'):
            (self.course / name).mkdir(parents=True)
            p = patch.object(sync, {'sessions': 'SESSIONS_DIR', 'publications': 'PUBLICATIONS_DIR',
                                   'source_outlines': 'OUTLINES_DIR', 'verbatim': 'VERBATIM_DIR'}[name], self.course / name)
            p.start()
            self.addCleanup(p.stop)
        self.session_path = self.course / 'sessions/session_36A.json'
        self.outline_path = self.course / 'source_outlines/36A.json'
        self.md = self.course / 'publications/lecture_36A_study_guide.md'
        self.md.write_text('### 導讀\n\n## 【正文講記】\n\n[▶ 00:00](https://example.org/audio#t=0) 諸法依緣而生。\n', encoding='utf8')
        self.session = {'sessionId': '36A', 'paragraphs': [{'id': 'p_1', 'heading': None,
            'start': 0, 'end': 10, 'sentences': [{'id': 'p1-s1', 'text': '諸法依緣而生。', 'start': 0, 'end': 10}],
            'verbatimSentences': [{'id': 'original-36A', 'text': '口語原文', 'start': 1.25, 'end': 8.75}]}]}
        self.session['contentOverview'] = self.overview(self.session)
        self.outline_path.write_text('{"original": true}\n')

    def overview(self, session):
        co = {'schemaVersion': 1, 'sourceTranscriptId': 'ru-zhong-lun/session_36A',
              'sourceDigest': sync.compute_source_digest(session), 'generatedBy': 'MiniMax-M3', 'status': 'ai-reviewed'}
        texts = {'mainPoints': ['緣起說明事物依待條件。', '自性成立的主張有何問題？'],
                 'discussionTopics': ['如何從生活觀察因果關係？'],
                 'referenceViews': ['宗大師以推理辨析對方立場。', '經典引文提供修學方向。']}
        co['review'] = {'reviewedBy': 'independent-reviewer', 'items': []}
        sentence = session['paragraphs'][0]['sentences'][0]
        for group, values in texts.items():
            co[group] = [{'text': text, 'evidence': [{'sentenceId': sentence['id'], 'quote': sentence['text']}]} for text in values]
            co['review']['items'].extend({'group': group, 'index': i, 'verdict': 'supported'} for i in range(len(values)))
        return co

    def save(self):
        self.session_path.write_text(json.dumps(self.session, ensure_ascii=False))

    def reject(self, replacement=None):
        self.save()
        before = {p: p.read_bytes() for p in (self.session_path, self.outline_path)}
        with self.assertRaises(ValueError):
            if replacement is None:
                sync.sync_session('36A')
            else:
                sync.sync_session('36A', overview_file=replacement)
        for p, data in before.items():
            self.assertEqual(p.read_bytes(), data)

    def test_missing_id_cannot_fallback_and_no_writes(self):
        self.session['contentOverview']['mainPoints'][0]['evidence'][0]['sentenceId'] = 'missing'
        self.reject()

    def test_candidate_preparation_then_independent_review_and_apply(self):
        self.save()
        before = {p: p.read_bytes() for p in (self.session_path, self.outline_path)}
        self.md.write_text(self.md.read_text().replace('諸法依緣而生。', '諸法不依因緣。'))
        scratch = self.root / 'scratch'
        sync.sync_session('36A', candidate_dir=scratch)
        candidate = json.loads((scratch / 'session_36A.json').read_text())
        self.assertTrue((scratch / '36A.json').is_file())
        for p, data in before.items():
            self.assertEqual(p.read_bytes(), data)
        co = candidate['contentOverview']
        self.assertEqual(co['status'], 'needs-review')
        self.assertNotIn('review', co)
        self.assertEqual(co['sourceDigest'], sync.compute_source_digest(candidate))
        self.assertNotEqual(co['sourceDigest'], self.session['contentOverview']['sourceDigest'])
        self.assertEqual(co['mainPoints'], self.session['contentOverview']['mainPoints'])
        self.assertEqual(candidate['paragraphs'][0]['verbatimSentences'], self.session['paragraphs'][0]['verbatimSentences'])
        # Draft cannot be applied until a separate review is supplied.
        draft = scratch / 'draft.json'
        draft.write_text(json.dumps(co))
        self.reject(draft)
        reviewed = scratch / 'reviewed.json'
        reviewed.write_text(json.dumps(self.overview(candidate)))
        sync.sync_session('36A', overview_file=reviewed)
        applied = json.loads(self.session_path.read_text())
        self.assertEqual(applied['paragraphs'], candidate['paragraphs'])
        self.assertEqual(applied['contentOverview']['sourceDigest'], co['sourceDigest'])

    def test_candidate_even_unchanged_source_has_no_supported_review(self):
        self.save()
        scratch = self.root / 'scratch'
        sync.sync_session('36A', candidate_dir=scratch)
        co = json.loads((scratch / 'session_36A.json').read_text())['contentOverview']
        self.assertEqual(co['status'], 'needs-review')
        self.assertNotIn('review', co)

    def test_candidate_without_existing_overview(self):
        del self.session['contentOverview']
        self.save()
        scratch = self.root / 'scratch'
        sync.sync_session('36A', candidate_dir=scratch)
        co = json.loads((scratch / 'session_36A.json').read_text())['contentOverview']
        self.assertEqual(co['status'], 'needs-review')
        self.assertNotIn('review', co)

    def test_candidate_rejects_production_or_nonempty_directory(self):
        self.save()
        before = {p: p.read_bytes() for p in (self.session_path, self.outline_path)}
        alias = self.root / 'alias'
        alias.symlink_to(self.course / 'sessions', target_is_directory=True)
        nonempty = self.root / 'occupied'
        nonempty.mkdir()
        (nonempty / 'keep.txt').write_text('preserve')
        for dest in (self.course, self.course / 'sessions', self.course / 'source_outlines', alias, nonempty):
            with self.subTest(dest=dest), self.assertRaises(ValueError):
                sync.sync_session('36A', candidate_dir=dest)
        for p, data in before.items():
            self.assertEqual(p.read_bytes(), data)

    def test_candidate_and_overview_file_are_mutually_exclusive(self):
        self.save()
        with self.assertRaises(ValueError):
            sync.sync_session('36A', candidate_dir=self.root / 'scratch', overview_file=self.root / 'unused')
        self.assertFalse((self.root / 'scratch').exists())

    def test_candidate_cli_option(self):
        self.save()
        before = self.session_path.read_bytes(), self.outline_path.read_bytes()
        scratch = self.root / 'cli-scratch'
        with patch('sys.argv', ['sync_study_guide_to_session.py', '36A', '--candidate-dir', str(scratch)]):
            sync.main()
        self.assertEqual((self.session_path.read_bytes(), self.outline_path.read_bytes()), before)
        self.assertEqual(json.loads((scratch / 'session_36A.json').read_text())['contentOverview']['status'], 'needs-review')

    def test_same_id_changed_meaning_cannot_retain_review(self):
        self.md.write_text(self.md.read_text().replace('諸法依緣而生。', '諸法不依因緣。'))
        self.reject()

    def test_stale_digest_rejected_even_with_matching_quotes(self):
        self.session['contentOverview']['sourceDigest'] = 'sha256:old'
        self.reject()

    def test_quote_mismatch_rejected_even_with_matching_digest(self):
        self.session['contentOverview']['mainPoints'][0]['evidence'][0]['quote'] = '不同意義'
        self.reject()

    def test_incomplete_or_unsupported_review_rejected(self):
        for verdict in (None, 'unsupported'):
            with self.subTest(verdict=verdict):
                co = self.overview(self.session)
                if verdict is None:
                    co['review']['items'].pop()
                else:
                    co['review']['items'][0]['verdict'] = verdict
                self.session['contentOverview'] = co
                self.reject()

    def test_duplicate_review_rejected(self):
        items = self.session['contentOverview']['review']['items']
        items.append(copy.deepcopy(items[0]))
        self.reject()

    def test_duplicate_bullets_rejected(self):
        co = self.session['contentOverview']
        co['mainPoints'][1] = copy.deepcopy(co['mainPoints'][0])
        self.reject()

    def test_duplicate_evidence_rejected(self):
        evidence = self.session['contentOverview']['mainPoints'][0]['evidence']
        evidence.append(copy.deepcopy(evidence[0]))
        self.reject()

    def test_duplicate_source_ids_rejected(self):
        candidate = copy.deepcopy(self.session)
        candidate['paragraphs'][0]['sentences'].append(copy.deepcopy(candidate['paragraphs'][0]['sentences'][0]))
        with self.assertRaises(ValueError):
            sync.validate_overview(candidate, self.overview(candidate), '36A')

    def test_absent_overview_rejected(self):
        del self.session['contentOverview']
        self.reject()

    def test_stale_replacement_rejected(self):
        replacement = self.root / 'overview.json'
        replacement.write_text(json.dumps(self.session['contentOverview']))
        self.md.write_text(self.md.read_text().replace('諸法依緣而生。', '諸法不依因緣。'))
        self.reject(replacement)

    def test_verbatim_file_cannot_override_existing_audio_alignment(self):
        (self.course / 'verbatim/verbatim_36A.json').write_text(json.dumps({
            'paragraphs': {'p_1': [{'id': 'replacement', 'start': 0, 'end': 1, 'text': '不同'}]}}))
        self.reject()

    def test_valid_existing_overview_retained_unchanged(self):
        self.save()
        sync.sync_session('36A')
        result = json.loads(self.session_path.read_text())
        self.assertEqual(result['contentOverview'], self.session['contentOverview'])
        self.assertEqual(result['paragraphs'][0]['verbatimSentences'], self.session['paragraphs'][0]['verbatimSentences'])

    def test_valid_replacement_bound_to_new_source(self):
        self.md.write_text(self.md.read_text().replace('諸法依緣而生。', '諸法不依因緣。'))
        candidate = copy.deepcopy(self.session)
        candidate['paragraphs'][0]['sentences'][0]['text'] = '諸法不依因緣。'
        replacement = self.root / 'overview.json'
        co = self.overview(candidate)
        replacement.write_text(json.dumps(co, ensure_ascii=False))
        self.save()
        sync.sync_session('36A', overview_file=replacement)
        result = json.loads(self.session_path.read_text())
        self.assertEqual(result['contentOverview'], co)
        self.assertEqual(result['paragraphs'][0]['verbatimSentences'], self.session['paragraphs'][0]['verbatimSentences'])

    def test_invalid_replacement_cannot_use_old_review(self):
        replacement = self.root / 'overview.json'
        co = self.overview(self.session)
        co['review']['items'] = []
        replacement.write_text(json.dumps(co))
        self.reject(replacement)

    def test_real_36a_verbatim_preserved_in_sandbox(self):
        original = json.loads((ROOT / 'courses/入中論善顯密意疏/sessions/session_36A.json').read_text())
        source = ROOT / 'courses/入中論善顯密意疏/publications/lecture_36A_study_guide.md'
        self.md.write_bytes(source.read_bytes())
        self.session = original
        self.save()
        before_bytes = self.session_path.read_bytes(), self.outline_path.read_bytes()
        scratch = self.root / 'real-36a-candidate'
        sync.sync_session('36A', candidate_dir=scratch)
        self.assertEqual((self.session_path.read_bytes(), self.outline_path.read_bytes()), before_bytes)
        candidate = json.loads((scratch / 'session_36A.json').read_text())
        self.assertEqual(candidate['contentOverview']['status'], 'needs-review')
        self.assertNotIn('review', candidate['contentOverview'])
        replacement = self.root / 'overview.json'
        replacement.write_text(json.dumps(self.overview(candidate), ensure_ascii=False))
        sync.sync_session('36A', overview_file=replacement)
        result = json.loads(self.session_path.read_text())
        before = {p['id']: p['verbatimSentences'] for p in original['paragraphs'] if p.get('verbatimSentences')}
        after = {p['id']: p['verbatimSentences'] for p in result['paragraphs'] if p.get('verbatimSentences')}
        self.assertTrue(before)
        self.assertEqual(after, before)


if __name__ == '__main__':
    unittest.main()
