# M2-1: BlackboardReader implementation - #4

## Issue Details
- **Repository:** corpus-relica/reflex
- **GitHub URL:** https://github.com/corpus-relica/reflex/issues/4
- **State:** open
- **Labels:** none
- **Milestone:** M2: Blackboard
- **Assignees:** none
- **Related Issues:**
  - Depends on: #1 (M1-1: Core type definitions) — completed
  - Depends on: #2 (M1-2: Workflow Registry with DAG validation) — completed
  - Depends on: #3 (M1-3: Test suite for validation) — completed
  - Blocks: #5 (M2-2: Blackboard write + append-only enforcement)
  - Blocks: #6 (M2-3: Test suite for blackboard)

## Description
Implement `BlackboardReader` that takes an ordered list of blackboard scopes (local → parent → grandparent):

- `get(key)` — walk scopes, return first match (latest entry for key in that scope)
- `has(key)` — walk scopes, return true if found in any
- `getAll(key)` — collect all entries for key across all scopes, ordered most-local first (includes shadowed entries)
- `entries()` — all entries across all scopes
- `keys()` — all unique keys across all scopes
- `local()` — only the innermost scope's entries

## Acceptance Criteria
- [ ] `get(key)` walks scopes local → parent → grandparent, returns first match (latest entry for key in that scope)
- [ ] `has(key)` walks scopes, returns true if found in any
- [ ] `getAll(key)` collects all entries for key across all scopes, ordered most-local first
- [ ] `entries()` returns all entries across all scopes
- [ ] `keys()` returns all unique keys across all scopes
- [ ] `local()` returns only the innermost scope's entries
- [ ] TypeScript compiles without errors

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 4-blackboardreader-implementation
- **Current branch:** main

## Implementation Checklist

### Setup
- [x] Create feature branch from main

### Implementation Tasks

- [x] Implement BlackboardReader class
  - Files affected: `src/blackboard.ts` (new)
  - Why: The `BlackboardReader` interface is already defined in `types.ts` (lines 123-130). We need a concrete class that implements this interface. The class takes an ordered list of `BlackboardEntry[]` scopes (local → parent → grandparent) and provides read-only access with lexical scoping semantics.

  Implementation details:
  - Constructor takes `scopes: BlackboardEntry[][]` — ordered array of scope arrays, index 0 = innermost (local)
  - `get(key)`: For each scope (local first), find the latest entry for key (last entry with matching key in that scope's array). Return value of first match found, or undefined.
  - `has(key)`: Same walk as get(), return true if any scope contains an entry for key.
  - `getAll(key)`: For each scope (local first), collect ALL entries matching key. Return flat array ordered most-local first.
  - `entries()`: Concatenate all scope arrays, local first.
  - `keys()`: Collect unique keys from all entries across all scopes.
  - `local()`: Return the first scope (index 0) entries only.

- [x] Write tests for BlackboardReader
  - Files affected: `src/blackboard.test.ts` (new)
  - Why: Issue #4 focuses on the reader. Tests should cover all 6 methods and edge cases.

  Test cases:
  1. **Empty reader** — no scopes, all methods return empty/undefined/false
  2. **Single scope, single entry** — get/has/getAll/entries/keys/local all work
  3. **Single scope, multiple entries different keys** — keys() returns all, get() finds each
  4. **Single scope, same-key shadowing** — two entries for same key, get() returns latest (last in array)
  5. **Multi-scope: local shadows parent** — same key in local and parent, get() returns local value
  6. **Multi-scope: parent fallback** — key only in parent, get() returns parent value
  7. **Multi-scope: grandparent fallback** — key only in grandparent (3 scopes deep)
  8. **has() across scopes** — returns true if key in any scope
  9. **has() returns false for missing key**
  10. **getAll() includes shadowed entries** — entries from all scopes, most-local first
  11. **getAll() ordering within a scope** — preserves entry order within each scope
  12. **entries() concatenates all scopes** — local entries first, then parent, then grandparent
  13. **keys() deduplicates** — same key in multiple scopes appears once
  14. **local() returns only innermost scope** — parent entries not included
  15. **local() with empty innermost scope** — returns empty array

### Quality Checks
- [x] TypeScript compiles without errors (`tsc --noEmit`)
- [x] All tests pass (`yarn test`) — 45/45 passing (28 blackboard + 17 registry)
- [x] Cross-reference test cases against issue description — all 6 methods covered

## Technical Notes

### Architecture Considerations
- The `BlackboardReader` interface is already defined in `src/types.ts` (lines 123-130). The implementation must satisfy this interface exactly.
- The reader is read-only — it never modifies blackboard entries. Writes are handled separately in M2-2.
- Scopes are ordered arrays of `BlackboardEntry[]` — the caller (engine) constructs the scope chain from the call stack.
- "Latest entry" within a scope means the last entry with that key in the array (append-only semantics — newer entries are appended at the end).

### Implementation Approach
- Create a `ScopedBlackboardReader` class that implements the `BlackboardReader` interface
- Constructor receives `scopes: BlackboardEntry[][]` — index 0 is local (innermost), higher indices are parent/grandparent
- Keep it simple: linear scans are fine for v-alpha. No indexing or caching needed — scope arrays will be small.
- Export a factory function or just the class directly

### Potential Challenges
- Edge case: `get()` needs to find the *latest* entry for a key within a scope (last one in the array), not just any entry. Since the blackboard is append-only, the last entry wins.
- `getAll()` must preserve order: all entries from local scope first (in their original order), then parent, then grandparent — not interleaved by timestamp.

### Assumptions Made
- Scopes are provided in local-first order (index 0 = current workflow, index 1 = parent, etc.)
- Within each scope, entries are in chronological order (oldest first, newest last) — append-only
- The reader does not need to be mutable after construction (new entries trigger a new reader instance)

## Work Log

### 2026-02-08 - Session 1
- Created feature branch `4-blackboardreader-implementation` from main
- Implemented `ScopedBlackboardReader` class in `src/blackboard.ts`
  - Constructor takes `scopes: BlackboardEntry[][]` (local-first order)
  - `get()` walks scopes, reverse-scans each scope for latest entry
  - `has()` walks scopes, returns on first match
  - `getAll()` collects all entries for key across all scopes, preserving order
  - `entries()` concatenates all scopes, local first
  - `keys()` deduplicates via Set
  - `local()` returns a copy of innermost scope
- Wrote `src/blackboard.test.ts` with 28 tests across 7 describe blocks:
  - 7 empty reader tests (all methods + no-arg constructor)
  - 8 single scope tests (basic ops + same-key shadowing)
  - 5 multi-scope lexical scoping tests (local shadows parent, fallback, grandparent)
  - 3 getAll() cross-scope tests (shadowed entries, ordering, missing key)
  - 1 entries() concatenation test
  - 1 keys() deduplication test
  - 3 local() tests (innermost only, empty scope, copy safety)
- All quality checks passed: tsc clean, 45/45 tests green, all 6 acceptance criteria met
- Ready for commit

---
**Generated:** 2026-02-08
**By:** Issue Setup Skill
**Source:** https://github.com/corpus-relica/reflex/issues/4
