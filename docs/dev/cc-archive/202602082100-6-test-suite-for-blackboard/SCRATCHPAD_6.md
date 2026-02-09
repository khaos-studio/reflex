# M2-3: Test suite for blackboard - #6

## Issue Details
- **Repository:** corpus-relica/reflex
- **GitHub URL:** https://github.com/corpus-relica/reflex/issues/6
- **State:** open
- **Labels:** none
- **Milestone:** M2: Blackboard
- **Assignees:** none
- **Related Issues:**
  - Depends on: #1 (M1-1: Core type definitions) — completed
  - Depends on: #2 (M1-2: Workflow Registry with DAG validation) — completed
  - Depends on: #4 (M2-1: BlackboardReader implementation) — completed (PR #34 merged)
  - Depends on: #5 (M2-2: Blackboard write + append-only enforcement) — completed (PR #35 merged)

## Description
Unit tests:

- Write and read back single value
- Same-key shadowing within a scope
- Cross-scope read precedence (local shadows parent)
- `getAll()` returns shadowed entries in correct order
- `local()` returns only innermost scope
- Append-only invariant: no mutation, no deletion
- Empty blackboard returns undefined / false / empty arrays

## Acceptance Criteria
- [x] Write and read back single value — integrated test through ScopedBlackboard + reader
- [x] Same-key shadowing within a scope — write same key twice, read via reader
- [x] Cross-scope read precedence (local shadows parent) — multi-blackboard with parent scopes
- [x] `getAll()` returns shadowed entries in correct order — cross-scope via writer + reader
- [x] `local()` returns only innermost scope — via writer + reader with parent scopes
- [x] Append-only invariant: no mutation, no deletion — verify entries never change/disappear
- [x] Empty blackboard returns undefined / false / empty arrays
- [x] TypeScript compiles without errors

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 6-test-suite-for-blackboard
- **Current branch:** main

## Implementation Checklist

### Setup
- [x] Create feature branch from main

### Implementation Tasks

- [x] Add integrated blackboard test suite
  - Files affected: `src/blackboard.test.ts` (extend existing)
  - Why: Issues #4 and #5 each tested their own class in isolation. Issue #6 asks for a cohesive test suite that validates the blackboard as a system — writing via `ScopedBlackboard` and reading via `ScopedBlackboardReader` constructed from the writer's `reader()` method, including multi-scope scenarios with multiple `ScopedBlackboard` instances representing a call stack.

  Test cases (mapped to issue requirements):

  **1. Write and read back single value**
  - Append a key/value via `ScopedBlackboard.append()`, construct reader via `bb.reader()`, verify `reader.get(key)` returns the value
  - Round-trip: write multiple keys, read each back

  **2. Same-key shadowing within a scope**
  - Append `color=blue` then `color=red` on same blackboard, `reader.get('color')` returns `'red'`
  - Verify `reader.getAll('color')` returns both entries in chronological order

  **3. Cross-scope read precedence (local shadows parent)**
  - Create parent `ScopedBlackboard`, write `color=parent-blue`
  - Create child `ScopedBlackboard`, write `color=child-red`
  - Construct child reader with parent scope: `child.reader([parent.getEntries()])`
  - Verify `reader.get('color')` returns `'child-red'`
  - Verify parent-only key is visible to child reader
  - Three-deep scope chain (grandparent → parent → child)

  **4. `getAll()` returns shadowed entries in correct order**
  - Write `color` in grandparent, parent, and child
  - `getAll('color')` returns child entries first, then parent, then grandparent

  **5. `local()` returns only innermost scope**
  - Child writer + parent scope → `reader.local()` returns only child entries
  - Parent entries not included in `local()`

  **6. Append-only invariant: no mutation, no deletion**
  - After multiple appends, all previous entries still present and unchanged
  - `getEntries()` length only grows
  - Values and timestamps of existing entries preserved

  **7. Empty blackboard returns undefined / false / empty**
  - Fresh `ScopedBlackboard()` → `reader().get('x')` is undefined
  - `reader().has('x')` is false
  - `reader().getAll('x')` is `[]`
  - `reader().entries()` is `[]`
  - `reader().keys()` is `[]`
  - `reader().local()` is `[]`

### Quality Checks
- [x] TypeScript compiles without errors (`npx tsc --noEmit`)
- [x] All tests pass (`yarn test`) — 86/86 passing (69 blackboard + 17 registry)
- [x] Cross-reference test cases against issue description — all 7 categories covered (24 new integration tests)

## Technical Notes

### Architecture Considerations
- This is the "integration" test suite for M2 — it tests `ScopedBlackboard` and `ScopedBlackboardReader` working together as a system.
- The key pattern is: create `ScopedBlackboard` instances representing stack frames, use `append()` to write, use `reader(parentScopes)` to construct a reader that sees the full scope chain, then assert on reader methods.
- Existing tests from issues #4 and #5 already provide good unit-level coverage. These new tests focus on the integrated write→read pipeline and multi-blackboard scope chains.

### Implementation Approach
- Add a new top-level `describe('Blackboard integration (M2-3)')` block in `src/blackboard.test.ts`
- Keep it clearly separate from the existing reader and writer test blocks
- Each of the 7 issue requirements maps to a `describe` sub-block
- Reuse the existing `entry()` helper where needed for parent scope setup

### Potential Challenges
- Avoiding redundancy with existing tests — focus on integration scenarios that exercise both classes together
- Multi-scope setup requires creating multiple `ScopedBlackboard` instances and passing entries between them via `getEntries()` → this is the pattern the engine will use

### Assumptions Made
- The multi-scope test pattern (parent.getEntries() passed to child.reader()) accurately represents how the engine will use these classes
- No new source code needed — only tests

## Work Log

### 2026-02-08 - Session 1
- Added 24 integrated tests in new `describe('Blackboard integration (M2-3)')` block:
  - 3 write-and-read-back (single, batch, multi-call)
  - 3 same-key shadowing (get, getAll, has)
  - 4 cross-scope precedence (shadow, fallback, 3-deep, skip-level)
  - 2 getAll() cross-scope ordering (scope order, within-scope chronological)
  - 2 local() innermost only (child only, parent excluded)
  - 4 append-only invariant (persist, preserve values, length grows, shadow preserves original)
  - 6 empty blackboard (get, has, getAll, entries, keys, local)
- All quality checks passed: tsc clean, 86/86 tests green, all 8 acceptance criteria met
- Ready for commit

---
**Generated:** 2026-02-08
**By:** Issue Setup Skill
**Source:** https://github.com/corpus-relica/reflex/issues/6
