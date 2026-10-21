import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from lib.asr_diagnostics import coverage_audit, error_breakdown, experiment_options, plan_chunks, text_risk_flags


class DiagnosticsContracts(unittest.TestCase):
    def test_overlapping_vad_does_not_double_count_and_words_override_segments(self):
        result = coverage_audit([{'start': 0, 'end': 8}, {'start': 6, 'end': 10}],
                                [{'start': 0, 'end': 10, 'words': [
                                    {'start': 0, 'end': 2, 'word': '對'},
                                    {'start': 7, 'end': 10, 'word': '對'}]}], 10)
        self.assertEqual(result['speech_seconds'], 10)
        self.assertEqual(result['uncovered_seconds'], 5)
        self.assertEqual(result['gaps'], [{'start': 2.0, 'end': 7.0}])
        self.assertFalse(result['publication_accepted'])

    def test_silence_is_not_a_missing_word_and_textless_spans_do_not_cover(self):
        result = coverage_audit([{'start': 2, 'end': 4}],
                                [{'start': 0, 'end': 10, 'text': ''}], 10)
        self.assertEqual(result['uncovered_seconds'], 2)
        silent = coverage_audit([], [], 10)
        self.assertIsNone(silent['coverage_ratio'])

    def test_invalid_time_evidence_fails_closed(self):
        for span in [{'start': -1, 'end': 2}, {'start': 2, 'end': 1},
                     {'start': 0, 'end': float('nan')}, {'start': 0, 'end': 11}]:
            with self.assertRaises(ValueError):
                coverage_audit([span], [], 10)

    def test_edit_breakdown_keeps_repetitions(self):
        result = error_breakdown('對，對，空性。', '對，空性。')
        self.assertEqual((result['deletions'], result['substitutions'], result['insertions']), (1, 0, 0))
        self.assertEqual(result['reference_chars'], 4)
        self.assertEqual(error_breakdown('甲乙', '甲丙丁')['errors'], 2)
        with self.assertRaises(ValueError):
            error_breakdown('', '甲')

    def test_ablation_changes_one_control_at_a_time(self):
        base = experiment_options('control')
        for name, key in [('repeat_1', 'repetition_penalty'), ('no_vad', 'vad_filter'),
                          ('no_words', 'word_timestamps'), ('fallback', 'temperature')]:
            candidate = experiment_options(name)
            self.assertEqual([k for k in base if base[k] != candidate[k]], [key])
        self.assertEqual(experiment_options('repeat_1')['repetition_penalty'], 1.0)
        with self.assertRaises(ValueError):
            experiment_options('unknown')

    def test_chunks_partition_all_audio_and_prefer_silence_without_dropping_it(self):
        chunks = plan_chunks(65, [{'start': 0, 'end': 18}, {'start': 22, 'end': 38},
                                 {'start': 42, 'end': 65}])
        self.assertEqual(chunks, [{'start': 0, 'end': 20}, {'start': 20, 'end': 40},
                                  {'start': 40, 'end': 65}])
        continuous = plan_chunks(66.4, [{'start': 0, 'end': 66.4}])
        self.assertEqual(continuous[0]['start'], 0)
        self.assertEqual(continuous[-1]['end'], 66.4)
        self.assertTrue(all(a['end'] == b['start'] for a, b in zip(continuous, continuous[1:])))

    def test_prompt_echo_and_abnormal_loops_are_review_flags_not_text_deletion(self):
        text = '本講名相：釋論。' + '人不執種子與芽' * 5 + '�'
        flags = text_risk_flags(text, '本講名相：釋論、世俗、勝義。')
        self.assertIn('PROMPT_MARKER_ECHO', flags)
        self.assertIn('REPEATED_PHRASE_REQUIRES_LISTENING', flags)
        self.assertIn('REPLACEMENT_CHARACTER', flags)
        self.assertEqual(text_risk_flags('對，對，空性。', None), [])
        self.assertIn('SUBTITLE_BOILERPLATE_REQUIRES_LISTENING', text_risk_flags('字幕由 Amara.org 提供', None))
        self.assertEqual(text.count('人不執種子與芽'), 5)


if __name__ == '__main__':
    unittest.main()
