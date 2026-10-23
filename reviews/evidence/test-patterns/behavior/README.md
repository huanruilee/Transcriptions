# Legacy pipeline behavior contract evidence

The tests exercise behavior from `scripts/lib/session_prompt.py`, `scripts/batch_convert_all.py`, and `scripts/build_verbatim_track.py`. LLM responses are mocked; the 36A/36B CLI probes run against copied scripts and temporary course trees. No live model/network calls or repository published outputs are used.

`baseline.txt`, `node-baseline.txt`, `revised-baseline.txt`, and `revised-node-baseline.txt` preserve earlier red runs and the defects they exposed: canonical output paths bypassed protection, and prompt punctuation exceeded the character budget. Both fixes are present in the current shared checkout. `green.txt` records all eight Python contracts passing; `node-green.txt` records the thin Node wrapper passing.

`tests/python/check_pipeline_mutations.py` replays six bounded mutations in temporary copies: canonical protection, recursive retry, 28-character chunking, repetition preservation, timing, and prompt budget. `fault-injection.txt` records each exact unittest command and nonzero status. No mutated source was copied back into the checkout.

Reproduce with:

```sh
PIPELINE_PYTHON=/private/tmp/transcriptions-pipeline-v2-venv/bin/python node --test tests/unit/pipelineBehavior.test.js
/private/tmp/transcriptions-pipeline-v2-venv/bin/python tests/python/check_pipeline_mutations.py
```
