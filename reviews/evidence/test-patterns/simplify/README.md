Baseline and after evidence for the behavior-preserving study-group test refactor.

- `before.log`: `node --test tests/unit/studyGroupPrototype.test.js`, exit 0, 47 tests passed.
- `after.log`: same command, exit 0, 47 tests passed.
- `duplicate-path-before.log`: `node --test tests/unit/studyGroupPrototype.test.js tests/unit/studyGroupPrototype.test.js`, exit 0, 47 tests passed. Node deduplicates the identical input path.
- `duplicate-path-after.log`: `node --test tests/unit/paragraphBoundaryIntegrity.test.js tests/unit/paragraphBoundaryIntegrity.test.js`, exit 0, 11 tests passed.
- `paragraph-single.log`: `node --test tests/unit/paragraphBoundaryIntegrity.test.js`, exit 0, 11 tests passed.

No RED test was added because the change only consolidates already passing test cases into a loop and removes an experimentally confirmed duplicate test-file argument. No course evidence or production code was edited.
