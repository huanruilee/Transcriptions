"""Behavior contracts for the legacy ASR/LLM and verbatim pipeline scripts."""
from __future__ import annotations

import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


class PipelineBehaviorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.batch = load_module("batch_convert_all_behavior", ROOT / "scripts/batch_convert_all.py")
        cls.verbatim = load_module("build_verbatim_track_behavior", ROOT / "scripts/build_verbatim_track.py")
        cls.prompt = load_module("session_prompt_behavior", ROOT / "scripts/lib/session_prompt.py")

    def test_prompt_uses_real_page_window_and_terms_from_window(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp)
            (src / "page_090.txt").write_text("『前頁關鍵名相』\n", encoding="utf-8")
            (src / "page_100.txt").write_text("巳一 緣起正理\n", encoding="utf-8")
            (src / "page_103.txt").write_text("《後頁觀察》\n", encoding="utf-8")
            pages = self.prompt.window_pages("p.100", before=10, after=3, max_page=285)
            self.assertEqual((pages[0], pages[-1]), (90, 103))
            result = self.prompt.build_initial_prompt("p.100", source_dir=src)
            self.assertIn("前頁關鍵名相", result)
            self.assertIn("緣起正理", result)
            self.assertIn("後頁觀察", result)
            self.assertLessEqual(len(result), 220)
            exact_source = src / "page_001.txt"
            exact_source.write_text("『關鍵名相』\n", encoding="utf-8")
            char_limit = len(self.prompt.PROMPT_HEAD) + len("關鍵名相")
            bounded = self.prompt.build_initial_prompt("p.1", source_dir=src, max_chars=char_limit)
            self.assertLessEqual(len(bounded), char_limit)
            self.assertEqual(self.prompt.build_initial_prompt("p.1", source_dir=src, max_chars=0), "")
            self.assertEqual(self.prompt.build_initial_prompt("p.1", source_dir=src, max_chars=1), "。")
            context = self.prompt.build_source_context("p.100", source_dir=src)
            self.assertLess(context.index("第 100 頁"), context.index("第 90 頁"))

    def test_prepolish_does_not_split_at_legacy_28_character_boundary(self):
        phrase = "緣起性空觀待因緣而有自性不可得" * 3
        self.assertGreater(len(phrase), 28)
        raw = [{"start": i * 0.2, "end": i * 0.2 + 0.1, "text": c}
               for i, c in enumerate(phrase)]
        polished = self.batch.step2_pre_polish(raw)
        self.assertEqual(len(polished), 1)
        self.assertEqual(polished[0]["text"].replace(" ", "").rstrip("。"), phrase)

    def test_prepolish_splits_at_long_silence_boundary(self):
        raw = [
            {"start": 0, "end": 0.4, "text": "前一段"},
            {"start": 2.0, "end": 2.4, "text": "後一段"},
        ]
        polished = self.batch.step2_pre_polish(raw)
        self.assertEqual([s["text"].rstrip("。") for s in polished], ["前一段", "後一段"])

    def test_llm_retry_splits_batch_then_returns_successful_single_sentence_results(self):
        seen = []

        def completion(messages, **kwargs):
            prompt = messages[-1]["content"]
            texts = json.loads(prompt.split("：\n", 1)[1])
            seen.append((texts, kwargs["max_tokens"]))
            if len(texts) > 1:
                return "not a JSON array"
            return json.dumps(["修訂：" + texts[0]], ensure_ascii=False)

        sentences = [{"start": i, "end": i + 0.5, "text": f"原句{i}"} for i in range(2)]
        with patch.object(self.batch, "call_llm_completion", side_effect=completion):
            result = self.batch.step3_llm_proofread(sentences, "TST")
        self.assertEqual([s["text"] for s in result], ["修訂：原句0", "修訂：原句1"])
        self.assertEqual([len(texts) for texts, _ in seen], [2, 1, 1])
        self.assertTrue(all(tokens == self.batch.dynamic_max_tokens(texts) for texts, tokens in seen))
        self.assertFalse(any(s.get("reviewNeeded") for s in result))

    def test_llm_ultimate_failure_preserves_source_and_marks_review_needed(self):
        sentences = [{"start": 0, "end": 1, "text": "原句一"},
                     {"start": 1, "end": 2, "text": "原句二"}]
        with patch.object(self.batch, "call_llm_completion", return_value="invalid" ) as mocked:
            result = self.batch.step3_llm_proofread(sentences, "TST")
        self.assertEqual([s["text"] for s in result], ["原句一", "原句二"])
        self.assertTrue(all(s.get("reviewNeeded") for s in result))
        self.assertEqual(mocked.call_count, 3)

    def test_dynamic_output_budget_scales_and_clamps(self):
        self.assertEqual(self.batch.dynamic_max_tokens(["短"]), 1024)
        self.assertEqual(self.batch.dynamic_max_tokens(["字" * 1000]), 2756)
        self.assertEqual(self.batch.dynamic_max_tokens(["字" * 10000]), 8000)

    def test_verbatim_keeps_repetitions_speakers_and_sentence_timing(self):
        sentences = [
            {"start": 1.234, "end": 2.678, "text": "對，對，我剛才說自性，應該說無自性。", "speaker": "格西"},
            {"start": 5.125, "end": 6.875, "text": "這是一般口語陳述。", "speaker": "學員"},
        ]
        paras = [{"id": "p_1", "start": 0, "end": 4}, {"id": "p_2", "start": 4, "end": 8}]
        payload = self.verbatim.build_verbatim_payload("TST", sentences, paras, learned={})
        first = payload["paragraphs"]["p_1"][0]
        second = payload["paragraphs"]["p_2"][0]
        self.assertIn("對，對", first["text"])
        self.assertIn("自性，應該說無自性", first["text"])
        self.assertEqual((first["start"], first["end"], first["speaker"]), (1.23, 2.68, "格西"))
        self.assertEqual((second["start"], second["end"], second["speaker"]), (5.12, 6.88, "學員"))

    def test_36a_36b_canonical_outputs_are_protected_even_with_explicit_out(self):
        # Run a copied CLI and isolated course tree; no repository or published file is touched.
        cases = (("36A", "verbatim_36A.json", "verbatim_36A.json", "explicit"),
                 ("36B", "verbatim_36B.json", "verbatim_36B.json", "explicit"),
                 ("37A", "verbatim_36B.json", "verbatim_36B.json", "explicit"),
                 ("36A", "relative", "verbatim_36A.json", "explicit"),
                 ("36B", "alias", "verbatim_36B.json", "explicit"),
                 ("36A", "verbatim_36A.json", "verbatim_36A.json", "default"),
                 ("37A", "scratch-output.json", "scratch-output.json", "scratch"))
        for sid, out_kind, sentinel_name, mode in cases:
            with self.subTest(session=sid, output=out_kind), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                scripts = root / "scripts"
                scripts.mkdir()
                shutil.copy2(ROOT / "scripts/build_verbatim_track.py", scripts / "build_verbatim_track.py")
                course = root / "courses/入中論善顯密意疏"
                (course / "sessions").mkdir(parents=True)
                (course / "verbatim").mkdir()
                (course / f"verbatim/verbatim_{sid}.json").write_text("published sentinel\n", encoding="utf-8")
                (course / f"sessions/session_{sid}.json").write_text(json.dumps({"paragraphs": []}), encoding="utf-8")
                sentinel = course / f"verbatim/{sentinel_name}"
                if not sentinel.exists():
                    sentinel.write_text("published sentinel\n", encoding="utf-8")
                if mode == "default":
                    out_path = None
                elif mode == "scratch":
                    out_path = str(root / out_kind)
                elif out_kind == "relative":
                    out_path = f"courses/入中論善顯密意疏/verbatim/{sentinel_name}"
                elif out_kind == "alias":
                    alias = root / "published-alias.json"
                    alias.symlink_to(sentinel)
                    out_path = str(alias)
                else:
                    out_path = str(sentinel)
                command = [sys.executable, str(scripts / "build_verbatim_track.py"), sid]
                if out_path is not None:
                    command.extend(["--out", out_path])
                run = subprocess.run(command, cwd=root, capture_output=True, text=True)
                if mode == "scratch":
                    self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
                    self.assertEqual((root / out_kind).is_file(), True)
                    self.assertEqual(sentinel.read_text(encoding="utf-8"), "published sentinel\n")
                else:
                    self.assertEqual(run.returncode, 2, run.stdout + run.stderr)
                    self.assertEqual(sentinel.read_text(encoding="utf-8"), "published sentinel\n")


if __name__ == "__main__":
    unittest.main(verbosity=2)
