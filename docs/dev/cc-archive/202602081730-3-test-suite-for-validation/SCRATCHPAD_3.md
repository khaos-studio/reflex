# M1-3: Test suite for validation - #3

## Issue Details
- **Repository:** corpus-relica/reflex
- **GitHub URL:** https://github.com/corpus-relica/reflex/issues/3
- **State:** open
- **Labels:** none
- **Milestone:** M1: Core Types & Validation
- **Assignees:** none
- **Related Issues:**
  - Depends on: #1 (M1-1: Core type definitions) — completed
  - Depends on: #2 (M1-2: Workflow Registry with DAG validation) — completed, PR #32 merged
  - Blocks: #3 is the final issue in M1, unblocking M2 (Blackboard)

## Description
Unit tests for WorkflowRegistry validation:

- Valid DAG registers successfully
- Cyclic graph is rejected
- Missing edge targets are rejected
- Missing entry node is rejected
- No terminal nodes is rejected
- Invocation ref to unregistered workflow logs warning but doesn't reject
- Multiple workflows can be registered

## Acceptance Criteria
- [ ] Valid DAG registers successfully
- [ ] Cyclic graph is rejected
- [ ] Missing edge targets are rejected
- [ ] Missing entry node is rejected
- [ ] No terminal nodes is rejected
- [ ] Invocation ref to unregistered workflow logs warning but doesn't reject
- [ ] Multiple workflows can be registered
- [ ] TypeScript compiles without errors

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 3-test-suite-for-validation
- **Current branch:** main

## Implementation Checklist

### Setup
- [x] Create feature branch from main

### Implementation Tasks

- [x] Set up minimal test infrastructure
  - Files affected: `package.json` (new), `tsconfig.json` (new)
  - Why: No build/test tooling exists yet. Need a test runner. Use Vitest (fast, native TypeScript support, zero-config) with a minimal `package.json` and `tsconfig.json`. Keep it lean — just enough for `npm test`.

- [x] Write test suite for WorkflowRegistry validation
  - Files affected: `src/registry.test.ts` (new)
  - Why: All tests belong in a single file — they cover a single class. Tests should exercise each validation path in `registry.ts`.

  Test cases:
  1. **Valid DAG registers successfully** — simple linear workflow (A → B → C), verify `has()` returns true and `get()` returns the workflow
  2. **Single-node workflow** — entry node with no edges (valid: entry = terminal)
  3. **Cyclic graph rejected** — A → B → A, verify `WorkflowValidationError` with code `CYCLE_DETECTED`
  4. **Invalid edge: missing 'from' node** — edge references non-existent source
  5. **Invalid edge: missing 'to' node** — edge references non-existent target
  6. **Missing entry node** — entry points to non-existent node, verify `INVALID_ENTRY_NODE`
  7. **Empty workflow (no nodes)** — verify `EMPTY_WORKFLOW`
  8. **No terminal nodes** — all nodes have outgoing edges (A → B → A creates cycle, but simpler: A ↔ B with edges both ways — caught as cycle first, so use A → B, B → A which is cycle. Better: every node has an outgoing edge but no cycle is impossible in a DAG. Since a DAG always has at least one terminal node, this validation is redundant for valid DAGs — but it's checked before acyclicity. So: A → B, B → C, C → A has cycle AND no terminals. Test separately: need a graph where NO_TERMINAL_NODES fires before CYCLE_DETECTED. Since terminal check runs before cycle check in the code, construct: nodes A, B with edges A→B and B→A — terminal check will find A has outgoing to B and B has outgoing to A → no terminals → throws NO_TERMINAL_NODES before cycle check)
  9. **Node ID mismatch** — dict key doesn't match node.id, verify `NODE_ID_MISMATCH`
  10. **Duplicate workflow ID** — register same workflow twice, verify `DUPLICATE_WORKFLOW_ID`
  11. **Invocation ref warning** — node invokes unregistered workflow, verify console.warn is called but registration succeeds
  12. **Invocation ref: no warning when target registered** — register target first, then workflow with invocation, verify no warning
  13. **Multiple workflows** — register several workflows, verify `list()` returns all IDs
  14. **get() for unknown ID** — returns undefined
  15. **has() for unknown ID** — returns false

### Quality Checks
- [x] TypeScript compiles without errors (`tsc --noEmit`)
- [x] All tests pass (`npm test`) — 17/17 passing
- [x] Cross-reference test cases against issue description — all 7 required scenarios covered

## Technical Notes

### Architecture Considerations
- No `package.json` exists yet — M6-1 is the formal project setup, but we need minimal tooling now to run tests
- Keep test infrastructure minimal: Vitest is the lightest option with native TS support
- Tests co-located with source (`src/registry.test.ts`) following standard convention

### Implementation Approach
- **Vitest** over Jest: zero-config with TypeScript, no babel/ts-jest setup needed, fast
- Helper function to build minimal valid workflows for tests (reduces boilerplate)
- Each test case is independent — no shared state between tests
- Test error codes specifically (not just "throws"), since `WorkflowValidationError` has structured error information

### Potential Challenges
- Validation order matters for some test cases (e.g., NO_TERMINAL_NODES fires before CYCLE_DETECTED for certain graph structures)
- Console.warn capture for invocation ref tests — use `vi.spyOn(console, 'warn')`

### Assumptions Made
- Vitest is acceptable as test runner (lightweight, no need for full Jest)
- Minimal `package.json` is acceptable even though M6-1 handles formal project setup — we just need enough to run tests
- `tsconfig.json` will be minimal — strict mode, ESM, targeting ES2020+

## Work Log

### 2026-02-08 - Session 1
- Created feature branch `3-test-suite-for-validation` from main
- Set up minimal test infrastructure: `package.json` (Vitest 2.x, TypeScript 5.x), `tsconfig.json` (strict, ESM, ES2022)
- Used yarn instead of npm per user preference; pinned Vitest to 2.x for Node 22.11.0 compatibility
- Wrote `src/registry.test.ts` with 17 tests across 8 describe blocks:
  - 3 valid workflow tests (linear, single-node, fan-out)
  - 2 retrieval edge cases (get/has unknown ID)
  - 1 list() test with multiple workflows
  - 7 validation error tests (DUPLICATE_WORKFLOW_ID, EMPTY_WORKFLOW, INVALID_ENTRY_NODE, NODE_ID_MISMATCH, INVALID_EDGE x2, NO_TERMINAL_NODES)
  - 1 cycle detection test (CYCLE_DETECTED with careful graph construction to avoid NO_TERMINAL_NODES firing first)
  - 2 invocation ref tests (warns for unregistered, silent for registered)
  - 1 multiple workflows test
- All quality checks passed: tsc clean, 17/17 tests green
- All 7 issue requirements covered
- Ready for commit

---
**Generated:** 2026-02-08
**By:** Issue Setup Skill
**Source:** https://github.com/corpus-relica/reflex/issues/3
