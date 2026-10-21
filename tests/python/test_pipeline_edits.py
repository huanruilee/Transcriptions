import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from lib.guarded_edits import canonical_text, apply_patches, propose_diff
from lib.source_alignment import SourceAligner


class EditContracts(unittest.TestCase):
    def test_traditional_before_comparison(self):
        self.assertEqual(canonical_text('对，什么，自性。'), '對，什麼，自性。')
        self.assertEqual(canonical_text('無明瞭'), '無明了')
        edits = propose_diff('对，对，空性。', '對，對，空性。')
        self.assertEqual(edits, [])

    def test_partial_acceptance_does_not_reject_whole_sentence(self):
        text = '若得隨意處，對，對，中庸之道。'
        patches = [{'start': 3, 'end': 4, 'before': '意', 'after': '一', 'evidence': '若得隨一處'},
                   {'start': 6, 'end': 8, 'before': '對，', 'after': '', 'evidence': ''},
                   {'start': 10, 'end': 14, 'before': '中庸之道', 'after': '中道', 'evidence': ''}]
        result = apply_patches(text, patches, {}, [{'text': '若得隨一處', 'page': 104, 'line': 14}])
        self.assertEqual(result['text'], '若得隨一處，對，對，中庸之道。')
        self.assertEqual(sum(p['applied'] for p in result['edits']), 1)
        self.assertTrue(result['reviewNeeded'])

    def test_no_source_or_unsupported_homophone_is_not_auto_approved(self):
        edit = {'start': 0, 'end': 1, 'before': '意', 'after': '義', 'evidence': '義'}
        result = apply_patches('意。', [edit], {}, [{'text': '義', 'page': 1, 'line': 1}])
        self.assertEqual(result['text'], '意。')
        self.assertFalse(result['edits'][0]['applied'])

    def test_wrong_offsets_and_overlaps_fail_closed(self):
        patches = [{'start': 0, 'end': 2, 'before': '若得', 'after': '若得', 'evidence': ''},
                   {'start': 1, 'end': 3, 'before': '得隨', 'after': '得隨', 'evidence': ''},
                   {'start': 10, 'end': 11, 'before': '錯', 'after': '字'}]
        result = apply_patches('若得隨一處。', patches, {}, [])
        self.assertEqual(result['text'], '若得隨一處。')
        self.assertFalse(any(p['applied'] for p in result['edits']))

    def test_learned_safe_regex_context_is_required(self):
        lexicon = {'明言諦': {'corrected': '名言諦', 'safe_regex': '明言諦'}}
        proposal = {'start': 0, 'end': 3, 'before': '明言諦', 'after': '名言諦'}
        result = apply_patches('明言諦，對，對。', [proposal], lexicon, [])
        self.assertEqual(result['text'], '名言諦，對，對。')
        wrong = apply_patches('明言，對。', [{'start': 0, 'end': 2, 'before': '明言', 'after': '名言'}], lexicon, [])
        self.assertEqual(wrong['text'], '明言，對。')

    def test_alignment_preserves_source_provenance_across_line_wraps(self):
        aligner = SourceAligner({104: '《六十正理\n論》亦云：「若得隨一處，即被惑蛇咬，\n若心無所住，即不被彼咬。」'})
        hits = aligner.retrieve('若得隨意處，既被或射咬，對不對？')
        self.assertTrue(any('若得隨一處' in h['text'] for h in hits))
        self.assertTrue(all(h['page'] == 104 and h['line'] >= 1 for h in hits))
        self.assertEqual(aligner.retrieve('請問停車場怎麼走？'), [])

    def test_word_boundaries_are_used_without_losing_or_inventing_words(self):
        import batch_convert_all as batch
        rows = [{'start': 0, 'end': 8, 'text': '空性，對，對。', 'words': [
            {'start': 0, 'end': 1, 'word': '空性，'},
            {'start': 2.2, 'end': 3, 'word': '對，'},
            {'start': 3, 'end': 4, 'word': '對。'}]}]
        result = batch.step2_pre_polish(rows)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]['start'], 0)
        self.assertEqual(result[0]['end'], 1)
        self.assertEqual(result[1]['start'], 2.2)
        self.assertIn('對，對', result[1]['text'])
        from lib.pipeline_evaluation import normalize_text
        self.assertEqual(normalize_text(''.join(s['text'] for s in result)), '空性對對')

    def test_t6_keeps_each_repeated_recitation(self):
        aligner = SourceAligner({104: '若得隨一處，即被惑蛇咬。'})
        text = '若得隨意處，若得隨意處，對，對。'
        hits = aligner.retrieve(text)
        result = apply_patches(text, aligner.propose_patches(text, hits), {}, hits)
        self.assertEqual(result['text'], '若得隨一處，若得隨一處，對，對。')
        self.assertEqual(len(result['edits']), 2)

    def test_cached_asr_is_bound_to_exact_audio_bytes(self):
        import batch_convert_all as batch
        import tempfile
        with tempfile.TemporaryDirectory() as td:
            audio = Path(td) / 'audio.wav'
            audio.write_bytes(b'original audio')
            cache = Path(td) / 'asr.json'
            cache.write_text(json.dumps({'duration': 1, 'segments': [], 'provenance': {'audio_sha256': 'wrong'}}))
            with self.assertRaises(ValueError):
                batch.load_asr_result(cache, audio)

    def test_model_agreement_is_not_audio_reference_approval(self):
        from evaluate_pipeline_edits import verified_reference
        self.assertFalse(verified_reference({'verified': True, 'items': []}))
        self.assertFalse(verified_reference({'items': [{'status': 'APPROVED', 'audioChecked': False, 'reviewer': '核對者'}]}))
        self.assertFalse(verified_reference({'items': [{'status': 'APPROVED', 'audioChecked': True, 'reviewer': ''}]}))
        self.assertTrue(verified_reference({'items': [{'status': 'APPROVED', 'audioChecked': True, 'reviewer': '核對者'}]}))

    def test_untrusted_evidence_type_is_rejected_without_crash(self):
        result = apply_patches('若得隨意處。', [{'start': 3, 'end': 4, 'before': '意', 'after': '一', 'evidence': 104}], {},
                               [{'page': 104, 'line': 1, 'text': '若得隨一處'}])
        self.assertEqual(result['text'], '若得隨意處。')
        self.assertFalse(result['edits'][0]['applied'])

    def test_legacy_full_sentence_script_conversion_is_not_flagged(self):
        import batch_convert_all as batch
        with patch.object(batch, 'call_llm_completion', return_value='["對，對，空性。"]'):
            result = batch.step3_llm_proofread([{'start': 0, 'end': 2, 'text': '对，对，空性。'}], '36A')
        self.assertEqual(result[0]['text'], '對，對，空性。')
        self.assertFalse(result[0].get('reviewNeeded', False))

    def test_llm_patch_protocol_keeps_valid_patch_and_repetition(self):
        import batch_convert_all as batch
        source = '=== 《善顯密意疏》第 104 頁 ===\n若得隨一處，即被惑蛇咬。'
        response = {'sentences': [{'index': 0, 'patches': [
            {'start': 3, 'end': 4, 'before': '意', 'after': '一', 'evidence': '若得隨一處'},
            {'start': 6, 'end': 8, 'before': '對，', 'after': '', 'evidence': ''}]}]}
        row = {'start': 0, 'end': 4, 'text': '若得隨意處，對，對。'}
        with patch.object(batch, 'call_llm_completion', return_value=json.dumps(response, ensure_ascii=False)):
            result = batch.step3_llm_proofread([row], '36A', source)
        self.assertEqual(result[0]['text'], '若得隨一處，對，對。')
        self.assertTrue(result[0]['reviewNeeded'])
        self.assertEqual((result[0]['start'], result[0]['end']), (0, 4))

if __name__ == '__main__':
    unittest.main()
