# M2-2: Blackboard write + append-only enforcement - #5

## Issue Details
- **Repository:** corpus-relica/reflex
- **GitHub URL:** https://github.com/corpus-relica/reflex/issues/5
- **State:** open
- **Labels:** none
- **Milestone:** M2: Blackboard
- **Assignees:** none
- **Related Issues:**
  - Depends on: #1 (M1-1: Core type definitions) — completed
  - Depends on: #2 (M1-2: Workflow Registry with DAG validation) — completed
  - Depends on: #4 (M2-1: BlackboardReader implementation) — completed (PR #34 merged)
  - Blocks: #6 (M2-3: Test suite for blackboard)

## Description
Implement the write side:

- Append-only — writes create new entries, never mutate existing
- Same-key writes shadow previous entries (latest-wins within scope)
- `BlackboardSource` metadata (workflowId, nodeId, stackDepth) attached to every write
- Timestamp on every entry

## Acceptance Criteria
- [ ] Writes create new `BlackboardEntry` entries appended to a scope's array
- [ ] Same-key writes shadow previous entries (latest-wins, verified via reader)
- [ ] `BlackboardSource` metadata attached to every write
- [ ] Timestamp on every entry
- [ ] Append-only invariant: no mutation, no deletion of existing entries
- [ ] TypeScript compiles without errors

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 5-blackboard-write-append-only-enforcement
- **Current branch:** main

## Implementation Checklist

### Setup
- [ ] Create feature branch from main

### Implementation Tasks

- [x] Implement ScopedBlackboard class (write + read integration)
  - Files affected: `src/blackboard.ts` (extend existing)
  - Why: The read side (`ScopedBlackboardReader`) already exists. We need to add a `ScopedBlackboard` class that owns a mutable local blackboard (`BlackboardEntry[]`), provides an `append()` method for writes, and can construct a `ScopedBlackboardReader` view over the scope chain. This class will be what the engine instantiates per stack frame.

  Implementation details:
  - `ScopedBlackboard` class with:
    - `private entries: BlackboardEntry[]` — the local (owned) blackboard entries
    - `constructor(entries?: BlackboardEntry[])` — optionally seed with existing entries (for restoring state)
    - `append(writes: BlackboardWrite[], source: BlackboardSource): BlackboardEntry[]` — convert writes to entries with source + timestamp, append to local entries, return the new entries (for event emission)
    - `getEntries(): readonly BlackboardEntry[]` — read-only access to local entries (for stack frame snapshot / reader construction)
    - `reader(parentScopes?: BlackboardEntry[][]): ScopedBlackboardReader` — construct a reader with this blackboard's entries as the local scope plus any parent scopes
  - The class enforces append-only: no `delete`, `clear`, or `set` methods. The only mutation path is `append()`.
  - Timestamp: use `Date.now()` by default. Each entry in a single `append()` call gets the same timestamp (they're from the same decision).

- [x] Write tests for ScopedBlackboard
  - Files affected: `src/blackboard.test.ts` (extend existing)
  - Why: Test the write side — append-only enforcement, source metadata, timestamps, shadowing via reader integration.

  Test cases:
  1. **append() creates entries with correct key/value** — write a single value, verify entry
  2. **append() attaches source metadata** — verify workflowId, nodeId, stackDepth on entry
  3. **append() attaches timestamp** — verify timestamp is a number > 0
  4. **append() multiple writes in one call** — all get same timestamp and source
  5. **append() returns the new entries** — return value matches what was appended
  6. **append-only: entries accumulate** — multiple append() calls grow the array
  7. **append-only: no mutation of existing entries** — existing entries unchanged after append
  8. **same-key shadowing** — append same key twice, reader.get() returns latest
  9. **getEntries() returns current entries** — reflects all appends
  10. **getEntries() returns read-only view** — mutations to returned array don't affect internal state
  11. **reader() constructs working ScopedBlackboardReader** — reader.get() works
  12. **reader() with parent scopes** — child reader sees parent values
  13. **reader() local scope reflects writes** — append then construct reader, reader.get() sees new value
  14. **empty blackboard** — getEntries() returns empty, reader().get() returns undefined

### Quality Checks
- [x] TypeScript compiles without errors (`npx tsc --noEmit`)
- [x] All tests pass (`yarn test`) — 62/62 passing (45 blackboard + 17 registry)
- [x] Cross-reference test cases against acceptance criteria — all 6 met

## Technical Notes

### Architecture Considerations
- The `ScopedBlackboard` class bridges the write side (issue #5) and read side (issue #4). The engine will use `ScopedBlackboard` per stack frame, and construct `ScopedBlackboardReader` views from the scope chain when presenting context to the decision agent.
- `BlackboardWrite` (from `types.ts`) is what the decision agent produces — just `{key, value}`. `BlackboardEntry` is the full record with source and timestamp. The `append()` method handles the transformation.
- The class does NOT enforce any scope chain logic — that's the reader's job. This class just manages a single scope's entries.

### Implementation Approach
- Extend `src/blackboard.ts` rather than creating a new file — keeps all blackboard logic co-located.
- `ScopedBlackboard` is a simple append-only container. The immutability guarantee comes from the API surface: there is no way to remove or modify entries.
- `reader()` is a convenience method that creates a `ScopedBlackboardReader` with the local entries as scope[0] and any provided parent scopes as scope[1..n].

### Potential Challenges
- Timestamp consistency: all entries from a single `append()` call should share the same timestamp. This makes it clear they came from the same decision.
- `getEntries()` should return a defensive copy or readonly view to prevent external code from bypassing append-only semantics.

### Assumptions Made
- `Date.now()` is sufficient for timestamps in v-alpha (no need for injectable clock)
- A single `append()` call = one atomic batch from one decision (shared timestamp + source)
- The engine will call `append()` once per decision that includes writes

## Work Log

### 2026-02-08 - Session 1
- Implemented `ScopedBlackboard` class in `src/blackboard.ts`
  - Constructor with optional seed entries for state restoration
  - `append()` converts `BlackboardWrite[]` + `BlackboardSource` → `BlackboardEntry[]`, shared timestamp per call
  - `getEntries()` returns defensive copy of local entries
  - `reader()` constructs `ScopedBlackboardReader` with local entries + parent scopes
  - Append-only enforced by API surface — no delete, clear, or set methods
- Added 17 tests to `src/blackboard.test.ts` across 7 describe blocks:
  - 5 append() basics (key/value, source, timestamp, batch, return value)
  - 2 append-only invariant (accumulation, existing entry preservation)
  - 1 same-key shadowing via reader
  - 2 getEntries() (reflects appends, defensive copy)
  - 3 reader() integration (basic, parent scopes, local shadows parent)
  - 2 empty blackboard
  - 2 constructor with seed entries
- All quality checks passed: tsc clean, 62/62 tests green, all 6 acceptance criteria met
- Ready for commit

---
**Generated:** 2026-02-08
**By:** Issue Setup Skill
**Source:** https://github.com/corpus-relica/reflex/issues/5
