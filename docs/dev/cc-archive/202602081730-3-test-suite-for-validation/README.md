# Issue #3 - M1-3: Test suite for validation

**Archived:** 2026-02-08
**PR:** #33
**Status:** Merged

## Summary
Added comprehensive test suite for WorkflowRegistry validation using Vitest. Set up minimal test infrastructure (package.json, tsconfig.json) and wrote 17 tests covering all validation paths: valid DAG registration, cycle detection, missing edge targets, missing entry node, no terminal nodes, invocation ref warnings, and multiple workflow registration.

## Key Decisions
- Used Vitest 2.x (pinned to ^2.1.0 for Node 22.11.0 compatibility) over Jest for zero-config TypeScript support
- Used Yarn as package manager per project preference
- Minimal package.json — just enough for test runner, formal project setup deferred to M6-1
- Tests co-located with source (src/registry.test.ts)
- Careful graph construction to isolate NO_TERMINAL_NODES from CYCLE_DETECTED based on validation order

## Files Changed
- `package.json` (new) — Vitest + TypeScript devDependencies
- `tsconfig.json` (new) — strict, ES2022, ESM, bundler moduleResolution
- `.gitignore` (new) — node_modules/, dist/
- `src/registry.test.ts` (new) — 17 tests across 8 describe blocks
- `yarn.lock` (new) — dependency lockfile

## Lessons Learned
- Vitest 3.x pulls Vite 7 which requires Node >=22.12.0; pinning to 2.x avoids this
- Validation order in registry.ts matters for test design: terminal check runs before cycle check, so graphs with no terminals and cycles throw NO_TERMINAL_NODES first
