"""從有來源的校正紀錄固定典型案例；不宣稱是未見音訊驗收集。"""
import hashlib
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from build_verbatim_track import clean_verbatim_text, build_verbatim_payload
from lib.guarded_edits import apply_patches, propose_diff
from lib.source_alignment import SourceAligner


class HumanCorrectionRegression(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = json.loads((ROOT / 'tests/fixtures/humanCorrectionRegression.json').read_text())
        cls.database = json.loads((ROOT / 'courses/入中論善顯密意疏/learned_corrections.json').read_text())
        cls.learned = cls.database['global_terms']
        cls.protected = {p: hashlib.sha256(p.read_bytes()).hexdigest()
                         for sid in ['36A', '36B']
                         for p in (ROOT / 'courses/入中論善顯密意疏').rglob('*' + sid + '*')
                         if p.is_file() and p.suffix in ['.json', '.md', '.html']}

    @classmethod
    def tearDownClass(cls):
        for path, expected in cls.protected.items():
            assert hashlib.sha256(path.read_bytes()).hexdigest() == expected, path

    def test_fixture_provenance_is_not_audio_acceptance(self):
        cases = self.fixture['cases']
        self.assertEqual(len(cases), len({case['id'] for case in cases}))
        self.assertFalse(self.fixture['reference_audio_verified'])
        for case in cases:
            with self.subTest(case=case['id']):
                self.assertEqual(case['split'], 'development_regression')
                provenance = case['provenance']
                self.assertFalse(provenance['audio_verified'])
                self.assertTrue((ROOT / provenance['source_path']).is_file())
                if 'term_key' in provenance:
                    entry = self.learned[provenance['term_key']]
                    self.assertEqual(entry['corrected'], provenance['corrected_term'])
                    if provenance['record_type'] == 'reader_feedback':
                        self.assertIn('讀者校對回饋', entry['reasoning'])
                        self.assertEqual(entry['learned_from'], provenance['learned_from'])
                if 'context_record_index' in provenance:
                    original = self.database['context_rules'][provenance['context_record_index'] - 1]
                    self.assertEqual(case['input'], original['original'])
                    self.assertEqual(case['expected'], original['proposed'])

    def test_real_lexicon_cleanup_and_idempotence(self):
        for case in self.fixture['cases']:
            if case['mode'] != 'clean':
                continue
            with self.subTest(case=case['id']):
                actual = clean_verbatim_text(case['input'], self.learned)
                self.assertEqual(actual, case['expected'])
                self.assertEqual(clean_verbatim_text(actual, self.learned), actual)

    def test_verbatim_generation_preserves_text_speaker_time_and_repetitions(self):
        for case in self.fixture['cases']:
            if case['mode'] != 'clean':
                continue
            with self.subTest(case=case['id']):
                row = {'id': 'source-1', 'start': 1.25, 'end': 9.5,
                       'speaker': '學員', 'text': case['input']}
                result = build_verbatim_payload('test', [row],
                    [{'id': 'p_1', 'start': 0, 'end': 10}], learned=self.learned)
                actual = result['paragraphs']['p_1'][0]
                self.assertEqual(actual['text'], case['expected'])
                self.assertEqual((actual['speaker'], actual['start'], actual['end']), ('學員', 1.25, 9.5))

    def test_source_alignment_uses_real_page_and_preserves_each_recitation(self):
        for case in self.fixture['cases']:
            if case['mode'] != 'source_alignment':
                continue
            source = (ROOT / case['source_path']).read_text()
            self.assertIn(case['source_anchor'], source)
            aligner = SourceAligner({case['page']: source})
            hits = aligner.retrieve(case['input'])
            result = apply_patches(case['input'], aligner.propose_patches(case['input'], hits), self.learned, hits)
            self.assertEqual(result['text'], case['expected'])
            self.assertTrue(any(hit['page'] == case['page'] for hit in hits))

    def test_wrong_edits_and_repeat_deletion_remain_rejected(self):
        for case in self.fixture['cases']:
            if case['mode'] != 'guarded_proposal':
                continue
            result = apply_patches(case['input'], propose_diff(case['input'], case['proposed']), self.learned, [])
            self.assertEqual(result['text'], case['expected'])
            self.assertTrue(result['reviewNeeded'])
            self.assertFalse(any(edit['applied'] for edit in result['edits']))

    def test_recorded_term_patches_use_actual_lexicon_evidence(self):
        for case in self.fixture['cases']:
            if case['mode'] != 'clean' or 'term_key' not in case['provenance'] or case['input'] == case['expected']:
                continue
            with self.subTest(case=case['id']):
                result = apply_patches(case['input'], propose_diff(case['input'], case['expected']), self.learned, [])
                self.assertEqual(result['text'], case['expected'])
                self.assertTrue(any(edit['applied'] for edit in result['edits']))

    def test_llm_proposal_cannot_undo_recorded_correction_or_drop_repetitions(self):
        import batch_convert_all as pipeline
        row = {'start': 1.25, 'end': 9.5, 'speaker': '學員', 'text': '明言諦，對，對。'}
        proposal = json.dumps({'sentences': [{'index': 0, 'patches': [
            {'before': '對，對', 'after': '對', 'occurrence': 0, 'evidence': ''}]}]})
        with patch.object(pipeline, 'call_llm_completion', return_value=proposal):
            actual = pipeline.step3_llm_proofread([row], '36A', '')[0]
        self.assertEqual(actual['text'], '名言諦，對，對。')
        self.assertEqual((actual['start'], actual['end'], actual['speaker']), (1.25, 9.5, '學員'))
        self.assertTrue(actual['reviewNeeded'])


if __name__ == '__main__':
    unittest.main()
