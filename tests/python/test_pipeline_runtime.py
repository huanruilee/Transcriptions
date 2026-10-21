import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
try:
    import requests
except ImportError:
    sys.modules['requests'] = types.ModuleType('requests')
import batch_convert_all as batch
import build_verbatim_track as verbatim


class RuntimeContracts(unittest.TestCase):
    def test_prepolish_preserves_content_and_repetitions(self):
        rows = batch.step2_pre_polish([{'start': 0, 'end': 2, 'text': '對，謝謝大家，謝謝大家，哎呦，喔，啊難尊者。'}])
        self.assertEqual(rows[0]['text'], '對，謝謝大家，謝謝大家，哎呦，喔，啊難尊者。')

    def test_filler_cleanup_does_not_remove_words(self):
        self.assertEqual(verbatim.clean_verbatim_text('哎呦，啊難尊者，對，對。', {}), '哎呦，啊難尊者，對，對。')
        self.assertEqual(verbatim.clean_verbatim_text('嗯，呃，空性。', {}), '空性。')

    def test_each_sentence_assigned_once_even_at_gaps_and_boundaries(self):
        sents = [{'start': t, 'end': t + .05, 'text': '對，對。', 'reviewNeeded': True, 'uncertainty': '待核對'} for t in [0, 9.85, 9.95, 10, 12, 25]]
        paras = [{'id': 'p_1', 'start': 0, 'end': 10}, {'id': 'p_2', 'start': 12, 'end': 20}]
        data = verbatim.build_verbatim_payload('36A', sents, paras, {})
        flattened = [s for group in data['paragraphs'].values() for s in group]
        self.assertEqual(len(flattened), len(sents))
        self.assertEqual(sorted(s['start'] for s in flattened), [s['start'] for s in sents])
        self.assertTrue(all(s['reviewNeeded'] for s in flattened))

    def test_golden_output_guard_rejects_explicit_and_symlink_targets(self):
        target = verbatim.VERBATIM_DIR / 'verbatim_36A.json'
        with self.assertRaises(ValueError):
            verbatim.validate_output_path(target)
        with tempfile.TemporaryDirectory() as td:
            alias = Path(td) / 'alias.json'
            alias.symlink_to(target)
            with self.assertRaises(ValueError):
                verbatim.validate_output_path(alias)

    def test_batch_guard_precedes_audio_and_network(self):
        with patch.object(batch, 'download_audio_if_needed', side_effect=AssertionError('network must not run')):
            with self.assertRaises(ValueError):
                batch.process_single_session('36A', {'36A': 'https://example.com/audio.mp3'}, session_map={})

    def test_llm_may_not_delete_repetition_or_rewrite(self):
        row = {'start': 1, 'end': 2, 'text': '對，對，沒有，沒有。'}
        with patch.object(batch, 'call_llm_completion', return_value='["對，沒有。"]'):
            result = batch.step3_llm_proofread([row], '36A')
        self.assertEqual(result[0]['text'], row['text'])
        self.assertTrue(result[0]['reviewNeeded'])

    def test_malformed_llm_recursively_retries_without_losing_rows(self):
        rows = [{'start': i, 'end': i + .5, 'text': '對，對。'} for i in range(3)]
        with patch.object(batch, 'call_llm_completion', return_value='[null]') as call:
            result = batch.step3_llm_proofread(rows, '36A')
        self.assertEqual(len(result), 3)
        self.assertTrue(all(s['reviewNeeded'] for s in result))
        self.assertEqual(call.call_count, 5)

    def test_speaker_evidence_and_quality_gate(self):
        rows = [{'start': 0, 'end': 1, 'text': '剛剛，對，對。'},
                {'start': 1, 'end': 2, 'text': '請問，對，對。', 'speaker': '學員'}]
        result = verbatim.build_verbatim_payload('36A', rows, [{'id': 'p_1', 'start': 0, 'end': 2}], {})
        self.assertEqual([s['speaker'] for s in result['paragraphs']['p_1']], ['格西', '學員'])
        for text in ['这个问题。', '非紋症。']:
            with self.assertRaises(ValueError):
                verbatim.build_verbatim_payload('36A', [dict(rows[0], text=text)], [{'id': 'p_1', 'start': 0, 'end': 2}], {})

    def test_guard_protects_all_published_gold_artifacts(self):
        for folder, name in [('sessions', 'session_36A.json'), ('publications', 'lecture_36B_study_guide.md')]:
            with self.assertRaises(ValueError):
                verbatim.validate_output_path(verbatim.COURSE_DIR / folder / name)

    def test_sandbox_emits_checkpoints_and_verbatim_without_publishing(self):
        rows = [{'start': 0, 'end': 2, 'text': '對，對。'}]
        paras = [{'id': 'p_1', 'heading': '【測試】原話', 'sentences': rows}]
        fake_opencc = types.SimpleNamespace(OpenCC=lambda _: types.SimpleNamespace(convert=lambda text: text))
        with tempfile.TemporaryDirectory() as td, patch.dict(sys.modules, {'opencc': fake_opencc}), \
                patch.object(batch, 'step1_asr_transcribe', return_value=(rows, 2)), \
                patch.object(batch, 'step3_llm_proofread', side_effect=lambda rows, *a, **k: rows), \
                patch.object(batch, 'step4_llm_structure', return_value=paras):
            self.assertTrue(batch.process_single_session('36A', {'36A': 'https://example.com/a.mp3'},
                                                       session_map={}, audio_path='fake.wav', output_dir=td))
            out = Path(td)
            for name in ['01_asr.json', '02_prepolished.json', '03_proofread.json', 'session_36A.json', 'verbatim_36A.json']:
                self.assertTrue((out / name).is_file(), name)
            data = json.loads((out / 'verbatim_36A.json').read_text())
            self.assertEqual(data['paragraphs']['p_1'][0]['text'], '對，對。')

    def test_cer_counts_and_normalization(self):
        from lib.pipeline_evaluation import cer, normalize_text, compare_runs
        self.assertEqual(cer('甲乙丙', '甲丁丙戊')['errors'], 2)
        self.assertEqual(normalize_text('對，對。嗯！'), '對對嗯')
        report = compare_runs('甲乙丙丁', '甲錯錯錯', '甲乙丙錯')
        self.assertAlmostEqual(report['relative_reduction'], 2 / 3)
        self.assertTrue(report['target_met'])
        self.assertIsNone(compare_runs('甲', '甲', '甲')['relative_reduction'])
        self.assertFalse(compare_runs('甲', '甲', '甲')['target_met'])
        with self.assertRaises(ValueError):
            cer('', '甲')

if __name__ == '__main__':
    unittest.main()
