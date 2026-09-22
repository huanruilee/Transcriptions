# Boundary Ledger Application

- Source: `reviews/evidence/shiliang_32/boundary_decisions.json`
- Applied mechanically: 30 new merges; 29 ledger merges were already present.
- Scope: paragraph arrays only; sentence `id`, `text`, `rawText`, `start`, and `end` were preserved.
- Paragraph `end` values were re-anchored to each merged paragraph's final sentence.

Verification:

- `node --test tests/unit/paragraphBoundaryIntegrity.test.js tests/unit/shiliangAllSessionsPatterns.test.js tests/unit/sessionInventory.test.js`
- `node --test tests/unit/shiliangVerseCoverage.test.js`
- `npm run build:v2`

All checks passed.
