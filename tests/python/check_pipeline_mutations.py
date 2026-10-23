"""Bounded fault-injection check for the pipeline behavior contracts.

Every mutation is applied to a fresh temporary repository copy. The checkout is
read only for this script; generated files and failed test runs stay in temp dirs.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEST = "test_pipeline_behavior.py"
MUTATIONS = (
    ("published output protection", "scripts/build_verbatim_track.py",
     "if out_path.resolve() in protected_outputs and not args.dry_run:", "if False:",
     "test_36a_36b_canonical_outputs_are_protected_even_with_explicit_out"),
    ("recursive LLM retry", "scripts/batch_convert_all.py", "if len(batch) > 1:",
     "if len(batch) > 100:", "test_llm_retry_splits_batch_then_returns_successful_single_sentence_results"),
    ("legacy 28-character splitting", "scripts/batch_convert_all.py",
     "return n >= HARD_MAX_CHARS", "return n >= 28",
     "test_prepolish_does_not_split_at_legacy_28_character_boundary"),
    ("verbatim repetition preservation", "scripts/build_verbatim_track.py",
     "cleaned = clean_verbatim_text(raw_t, learned)",
     "cleaned = clean_verbatim_text(raw_t, learned).replace(\"對，對\", \"對\")",
     "test_verbatim_keeps_repetitions_speakers_and_sentence_timing"),
    ("verbatim timing preservation", "scripts/build_verbatim_track.py",
     'round(float(s.get("start", 0)), 2)',
     'round(float(s.get("start", 0)) + 1, 2)',
     "test_verbatim_keeps_repetitions_speakers_and_sentence_timing"),
    ("prompt max character budget", "scripts/lib/session_prompt.py",
     "if len(cand) + 1 > max_chars:", "if len(cand) > max_chars:",
     "test_prompt_uses_real_page_window_and_terms_from_window"),
)


def prepare_copy(root: Path) -> None:
    for relative in ("scripts/batch_convert_all.py", "scripts/build_verbatim_track.py",
                     "scripts/lib/session_prompt.py", f"tests/python/{TEST}"):
        source = ROOT / relative
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)


def main() -> int:
    all_detected = True
    for label, relative, old, new, method in MUTATIONS:
        with tempfile.TemporaryDirectory(prefix="pipeline-mutation-") as tmp:
            root = Path(tmp)
            prepare_copy(root)
            target = root / relative
            text = target.read_text(encoding="utf-8")
            if text.count(old) != 1:
                print(f"ERROR {label}: expected one mutation anchor, found {text.count(old)}")
                return 2
            target.write_text(text.replace(old, new, 1), encoding="utf-8")
            command = [sys.executable, "-m", "unittest", "discover", "-s", "tests/python",
                       "-p", TEST, "-k", method, "-v"]
            result = subprocess.run(command, cwd=root, text=True, capture_output=True)
            detected = result.returncode != 0
            all_detected &= detected
            print(f"FAULT: {label}")
            print("COMMAND: " + " ".join(command))
            print(f"EXIT STATUS: {result.returncode} (expected nonzero; detected={detected})")
            for line in (result.stdout + result.stderr).splitlines():
                if line.startswith(("FAIL:", "ERROR:", "Ran ", "FAILED ", "OK")) or "AssertionError:" in line:
                    print("  " + line.strip())
            print()
    return 0 if all_detected else 1


if __name__ == "__main__":
    raise SystemExit(main())
