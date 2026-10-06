import importlib.util
import unittest
import json
import tempfile
import subprocess
import sys
from unittest.mock import patch
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "grounded_correct_sinianzhu.py"
SPEC = importlib.util.spec_from_file_location("grounded_correct_sinianzhu", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


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


    def test_compact_gate_requires_exact_coverage_and_known_ids(self):
        chunk = [{"id": "seg-1"}, {"id": "seg-2"}]
        self.assertEqual(COMPACT_MODULE.validate({"reviewed_count": 2, "uncertain_ids": ["seg-2"]}, chunk), {"seg-2"})
        with self.assertRaises(ValueError):
            COMPACT_MODULE.validate({"reviewed_count": 1, "uncertain_ids": []}, chunk)
        with self.assertRaises(ValueError):
            COMPACT_MODULE.validate({"reviewed_count": 2, "uncertain_ids": ["unknown"]}, chunk)


    def run_fixture(self, batch=2, effects=None, ids=("seg-1", "seg-2")):
        fixture = {"paragraphs": [{"heading": "測試", "sentences": [
            {"id": sid, "text": "四念住", "rawText": "四念住", "start": i, "end": i+1, "reviewNeeded": True}
            for i, sid in enumerate(ids)
        ]}]}
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "session.json"
            path.write_text(json.dumps(fixture))
            with patch.object(COMPACT_MODULE, "gate", side_effect=effects or [set(), set()]):
                return COMPACT_MODULE.process(path, batch, False)

    def test_nonpositive_batch_never_clears_without_review(self):
        for batch in (-1, 0):
            with self.subTest(batch=batch), self.assertRaises(ValueError):
                self.run_fixture(batch=batch)

    def test_cli_rejects_nonpositive_batch_before_apply(self):
        for batch in ("-1", "0"):
            result = subprocess.run([sys.executable, str(COMPACT_SCRIPT), "--batch", batch, "--apply"], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertIn("batch must be positive", result.stderr)

    def test_duplicate_or_empty_source_ids_are_rejected(self):
        for ids in (("same", "same"), ("", "seg-2"), (None, "seg-2")):
            with self.subTest(ids=ids), self.assertRaises(ValueError):
                self.run_fixture(ids=ids)

    def test_compact_gate_rejects_ambiguous_response_types(self):
        for result in ({"reviewed_count": True, "uncertain_ids": []},
                       {"reviewed_count": 1.0, "uncertain_ids": []},
                       {"reviewed_count": 1, "uncertain_ids": ["seg-1", "seg-1"]}):
            with self.subTest(result=result), self.assertRaises(ValueError):
                COMPACT_MODULE.validate(result, [{"id": "seg-1"}])

    def test_either_model_failure_keeps_whole_batch_pending(self):
        for effects in ([RuntimeError("local failed")], [set(), RuntimeError("external failed")]):
            data, records, clear, pending, _ = self.run_fixture(effects=effects)
            self.assertEqual((clear, pending), (0, 2))
            self.assertTrue(records[0]["error"])
            self.assertTrue(data["_meta"]["candidateReviewRequired"])

    def test_dual_success_retains_union_of_uncertainty(self):
        data, records, clear, pending, _ = self.run_fixture(effects=[{"seg-1"}, set()])
        self.assertEqual((clear, pending), (1, 1))
        self.assertEqual([s["reviewNeeded"] for s in data["paragraphs"][0]["sentences"]], [True, False])

if __name__ == "__main__":
    unittest.main()
