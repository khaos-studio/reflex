# Issue #5 - M2-2: Blackboard write + append-only enforcement

**Archived:** 2026-02-08
**PR:** #35
**Status:** Merged

## Summary
Implemented `ScopedBlackboard` class in `src/blackboard.ts` — an append-only write-side companion to the existing `ScopedBlackboardReader`. The class owns a local `BlackboardEntry[]` that grows via `append()`, converts `BlackboardWrite[]` + `BlackboardSource` into full entries with timestamps, and can construct reader views over the scope chain. Wrote 17 tests covering append basics, append-only invariant, same-key shadowing, getEntries defensive copy, reader integration, empty blackboard, and constructor with seed entries.

## Key Decisions
- Single `append()` call = one atomic batch from one decision (shared timestamp + source)
- `getEntries()` returns a defensive copy (spread) to prevent external mutation
- Constructor accepts optional seed entries for state restoration scenarios
- `Date.now()` sufficient for timestamps in v-alpha (no injectable clock)
- Append-only enforced by API surface — no delete, clear, or set methods

## Files Changed
- `src/blackboard.ts` (extended) — Added ScopedBlackboard class
- `src/blackboard.test.ts` (extended) — Added 17 tests across 7 describe blocks

## Lessons Learned
- The write side is a natural complement to the reader — `ScopedBlackboard` owns entries and `reader()` bridges to `ScopedBlackboardReader`
- Defensive copies via spread (`[...this.entries]`) are simple and effective for small arrays in v-alpha
