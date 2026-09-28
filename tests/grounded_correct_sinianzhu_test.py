import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "grounded_correct_sinianzhu.py"
SPEC = importlib.util.spec_from_file_location("grounded_correct_sinianzhu", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

TRIAGE_SCRIPT = Path(__file__).parents[1] / "scripts" / "triage_sinianzhu_review.py"
TRIAGE_SPEC = importlib.util.spec_from_file_location("triage_sinianzhu_review", TRIAGE_SCRIPT)
TRIAGE_MODULE = importlib.util.module_from_spec(TRIAGE_SPEC)
TRIAGE_SPEC.loader.exec_module(TRIAGE_MODULE)

COMPACT_SCRIPT = Path(__file__).parents[1] / "scripts" / "compact_sinianzhu_review.py"
COMPACT_SPEC = importlib.util.spec_from_file_location("compact_sinianzhu_review", COMPACT_SCRIPT)
COMPACT_MODULE = importlib.util.module_from_spec(COMPACT_SPEC)
COMPACT_SPEC.loader.exec_module(COMPACT_MODULE)


class GroundedCorrectionSafetyTest(unittest.TestCase):
    def test_allows_same_length_local_term_replacement(self):
        self.assertTrue(MODULE.is_local_typo_edit("四年祖", "四念住"))
        self.assertTrue(MODULE.is_local_typo_edit("各位居子", "各位居士"))

    def test_rejects_sentence_substitution(self):
        self.assertFalse(MODULE.is_local_typo_edit("這個四念住裡邊有兩個意義", "一個是念 一個是住"))

    def test_rejects_insertions_without_source_audio(self):
        self.assertFalse(MODULE.is_local_typo_edit("先學習就唸", "先學習這個念"))

    def test_rejects_empty_or_unchanged_text(self):
        self.assertFalse(MODULE.is_local_typo_edit("四念住", "四念住"))
        self.assertFalse(MODULE.is_local_typo_edit("四念住", ""))

    def test_review_triage_requires_unanimous_high_confidence_clear(self):
        clear = {"status": "clear", "confidence": 0.95}
        self.assertTrue(TRIAGE_MODULE.is_clear_decision(clear, clear))
        self.assertFalse(TRIAGE_MODULE.is_clear_decision(clear, {"status": "uncertain", "confidence": 0.99}))
        self.assertFalse(TRIAGE_MODULE.is_clear_decision(clear, {"status": "clear", "confidence": 0.89}))
        self.assertFalse(TRIAGE_MODULE.is_clear_decision(clear, {}))
        self.assertFalse(TRIAGE_MODULE.is_clear_decision(clear, clear, errors=["batch failed"]))

    def test_compact_gate_requires_exact_coverage_and_known_ids(self):
        chunk = [{"id": "seg-1"}, {"id": "seg-2"}]
        self.assertEqual(COMPACT_MODULE.validate({"reviewed_count": 2, "uncertain_ids": ["seg-2"]}, chunk), {"seg-2"})
        with self.assertRaises(ValueError):
            COMPACT_MODULE.validate({"reviewed_count": 1, "uncertain_ids": []}, chunk)
        with self.assertRaises(ValueError):
            COMPACT_MODULE.validate({"reviewed_count": 2, "uncertain_ids": ["unknown"]}, chunk)


if __name__ == "__main__":
    unittest.main()
