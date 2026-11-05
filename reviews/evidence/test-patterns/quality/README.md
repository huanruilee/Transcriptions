Quality policy consolidation evidence

| Rule | Traditional Chinese purity profile | Golden standard profile |
| --- | --- | --- |
| Simplified-character set | Mapping keys where Simplified differs from Traditional; includes 后, 传, 罗, 萨 | Existing STRICT_SIMP_REGEX set; does not include 后, 传, 罗, 萨 |
| Forbidden homophones | None | Existing nine golden-standard patterns |
| `rawText` scope | Consumer recursively omits values whose immediate key is `rawText` | Consumer scans `JSON.stringify(data)`, including `rawText` |

RED: `node --test tests/unit/transcriptQualityPolicy.test.js` failed with exit 1 because `scripts/lib/transcriptQualityPolicy.js` did not yet exist.

GREEN: the same command passed 4/4 tests, exit 0. Consumer verification with `node --test tests/unit/traditionalChinesePurity.test.js tests/acceptance/goldenStandard.test.js` passed 11/11, exit 0. `red.log`, `green.log`, and `consumers.log` preserve the raw command outputs.
