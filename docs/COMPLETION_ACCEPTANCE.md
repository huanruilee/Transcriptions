# Completion Acceptance Tests

This repository treats `npm test` as the completion gate for the published
transcript platform.

## What The Gate Checks

- Unit behavior for segmentation, time lookup, and the audio sync player.
- `course.json` publishes exactly the accepted 198 sessions.
- Every published session points to an existing session JSON file.
- Every published session has non-empty paragraph and sentence transcript data.
- Every published session has monotonic paragraph and sentence timestamps.
- Every published session declares a publishable `audio/*.mp3` URL.
- `toc.json` timed links target existing sessions and in-range timestamps.
- `99B` remains explicitly unpublished until source B-segment audio exists.

## Commands

```bash
npm test
npm run test:unit
npm run test:acceptance
```

Deployment environments that include the ignored audio files can additionally
require local audio-file presence:

```bash
TRANSCRIPTIONS_REQUIRE_AUDIO_FILES=1 npm run test:acceptance
```

GitHub Actions runs `npm test` on pushes and pull requests to `main`.
