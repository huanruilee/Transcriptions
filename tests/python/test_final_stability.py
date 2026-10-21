import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from lib.pipeline_evaluation import assess_final_stability, compare_runs


def evidence(candidate_errors=99):
    return {'stage': 'FINAL_VERBATIM', 'reference_audio_verified': True,
            'unseen_evaluation_set': True, 'fidelity_checked': True,
            'runs': [{'repeat': repeat, 'clip': clip, 'audio_sha256': 'a' * 64,
                      'reference_sha256': 'b' * 64, 'reference_chars': 1000,
                      'baseline_errors': 100, 'candidate_errors': candidate_errors,
                      'quality_passed': True} for repeat in range(3)
                     for clip in ['recitation', 'dialogue', 'commentary']]}


class FinalStabilityContracts(unittest.TestCase):
    def test_single_comparison_no_longer_requires_forty_percent(self):
        reference = '甲' * 100
        old, new = '乙' * 50 + '甲' * 50, '乙' * 49 + '甲' * 51
        self.assertTrue(compare_runs(reference, old, new)['target_met'])
        self.assertFalse(compare_runs(reference, old, new, minimum_relative_reduction=.4)['target_met'])

    def test_small_repeatable_final_improvement_is_enough(self):
        result = assess_final_stability(evidence())
        self.assertTrue(result['accepted'])
        self.assertAlmostEqual(result['relative_reduction'], .01)

    def test_tie_regression_or_single_run_is_not_stable(self):
        for errors in [100, 101]:
            self.assertFalse(assess_final_stability(evidence(errors))['accepted'])
        data = evidence()
        data['runs'] = data['runs'][:3]
        self.assertFalse(assess_final_stability(data)['accepted'])

    def test_unverified_reused_or_raw_evidence_cannot_accept(self):
        for key, value in [('stage', 'RAW_ASR'), ('reference_audio_verified', False),
                           ('unseen_evaluation_set', False), ('fidelity_checked', False)]:
            data = evidence()
            data[key] = value
            self.assertFalse(assess_final_stability(data)['accepted'])

    def test_mismatched_or_duplicate_pairs_fail_closed(self):
        data = evidence()
        data['runs'][-1]['audio_sha256'] = 'c' * 64
        self.assertFalse(assess_final_stability(data)['accepted'])
        data = evidence()
        data['runs'].append(data['runs'][0])
        self.assertFalse(assess_final_stability(data)['accepted'])

    def test_one_regressing_repeat_or_failed_quality_is_not_accepted(self):
        data = evidence()
        for row in data['runs'][-3:]:
            row['candidate_errors'] = 101
        self.assertFalse(assess_final_stability(data)['accepted'])
        data = evidence()
        data['runs'][0]['quality_passed'] = False
        self.assertFalse(assess_final_stability(data)['accepted'])


if __name__ == '__main__':
    unittest.main()
