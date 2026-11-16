# PR #213 review repair evidence

## Workspace and scope

- Worker: Codex, isolated desktop task; no implementation delegation.
- Workspace: `/Users/henry/.codex/worktrees/f677/Transcriptions`.
- Initial worktree: clean, detached at `23707f6ff4d6cdc88d3b9dbfab9a0291586f8d59`.
- Repair branch: `codex/pr213-review-fixes`.
- Push destination: `origin/codex/shiliang-32-continuous-quality` (PR #213).
- Fetched PR baseline: `10a9e4b0080b997b08a894c0da52e7220a87ac8b`.
- Author/committer: `HenryLee-Agent <henryleechatgpt@gmail.com>`; authenticated GitHub account: `henrylee-agents`.
- The fetched baseline already contains all ten `activeMediaType.value` fixes and argparse help handling. They were retained and verified, not reimplemented.
- Changed application behavior: complete dedication boundaries, stable split-segment IDs/timestamps/rawText, and a public-facing private-audio notice and failure message.
- New runtime tests mount App.vue and invoke sentence clicks, real seekAndPlayAudio metadata handling, playback controls, rate changes and MP3/YouTube session transitions. Only media/provider boundaries and fixture fetch responses are mocked.

## RED before production edits

The new tests were written and run before production edits. Historical source was read with `git show`; App.vue was temporarily substituted and restored in `finally`. Python uses `BUILDER_PATH` to import a disposable historical copy. No historical mutating builder was run against repository artifacts.

| Source | Command | Result | Log |
| --- | --- | --- | --- |
| `10a9e4b^` (`8b33793`) App.vue | `npm run test:v2 -- tests/unit_v2/mediaRoutingIntegration.test.ts` | exit 1, 4 failed | red-runtime-historical.log |
| `10a9e4b` App.vue | same | exit 1, private-audio notice failed; 3 routing tests passed | red-runtime-current.log |
| `10a9e4b^` builder | `BUILDER_PATH=<historical-copy> python3 tests/unit/publication_builder_regression.py` | exit 1, detects original simplified ASR, suffix, CLI and alignment defects | red-builder-historical.log |
| `10a9e4b` builder | same | exit 1, detects missing 受命 ending, rawText slicing and split-ID loss | red-builder-current.log |

The current-baseline logs were refreshed with the final test harness after correcting its click timing and disabling external iframe document fetches via an about:blank test frame. This excludes harness errors from the reported RED evidence.

Log files preserve command output with trailing whitespace removed for Git diff checks.

## GREEN

| Command | Result | Log |
| --- | --- | --- |
| `python3 tests/unit/publication_builder_regression.py` | 7 passed, exit 0 | green-builder.log |
| `node --test tests/unit/publicationBuilderRegression.test.js tests/unit/studyGroup27Prototype.test.js tests/unit/studyGroupPublication.test.js` | 37 passed, exit 0 | green-targeted.log |
| `npm run test:v2 -- tests/unit_v2/mediaRoutingIntegration.test.ts` | 4 passed, exit 0 | green-runtime.log |
| `npm test` with local TCP binding permitted | 532 passed, 2 skipped, 0 failed, exit 0 | full-node-unrestricted.log |
| `npm run test:v2` | 24 files, 79 passed, exit 0 | full-vitest.log |
| `npm run build:v2` | passed, exit 0 | build.log |
| `git diff --check` | exit 0 | verified before commit |

First sandboxed `npm test` run failed to start the existing local sync server on port 19091 (`full-node.log`). Re-running with local binding permitted passed. The server test uses a temporary corrections database. Existing Vitest tests log blocked external YouTube fetches; the new integration tests use an inert local iframe and pass without network traffic. Vite reports an existing __dirname/config-loader warning.

CLI verification has two layers: the actual --help invocation compares content and modification times for every publication output, and an instrumented disposable copy verifies --help/invalid arguments never enter main (with a no-argument positive control). Playlist 11 is tested directly against the checked-in simplified candidate: seg-4632 is retained, seg-4633's repeated tail is excluded.

## Limits and handoff

- No merge or deployment. No live YouTube/MP3 playback or human transcript acceptance is claimed.
- Existing generated course/session JSON was not rebuilt. Dedication edits preserve original segment timestamps, which do not provide word-level timing for a shortened final clause.
- This patch covers the delegated runtime, dedication, CLI and public-access review findings. Older automated findings about `read_main_prototype()` depending on main and `make_paragraphs()` sourcing rawText from reviewed text remain separate issues; preserving rawText during trimming does not resolve that upstream provenance issue.
- Independent review/acceptance belongs to the requesting task; this worker report is not independent approval.
- The deliverable commit is the commit containing this evidence directory. Exact final SHA and verified remote push result are returned in the task handoff.
