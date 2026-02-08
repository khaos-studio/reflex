# Issue #1 - M1-1: Core type definitions

**Archived:** 2026-02-08
**PR:** #31 (merged)
**Status:** Completed

## Summary

Defined all 18 core TypeScript type definitions from DESIGN.md Sections 2 and 3.2 in `src/types.ts`. This is the foundational type system for the Reflex workflow orchestration framework — every subsequent module imports from this file.

## Types Defined

- `NodeSpec`, `ReturnMapping`, `InvocationSpec`, `Node`
- `BuiltinGuard`, `CustomGuard`, `Guard` (union)
- `Edge`, `Workflow`
- `BlackboardSource`, `BlackboardEntry`, `BlackboardWrite`
- `StackFrame`, `BlackboardReader`
- `DecisionContext`, `Decision` (discriminated union), `DecisionAgent`
- `StepResult` (discriminated union), `EngineEvent` (string literal union)

## Files Changed

- `src/types.ts` (new file, 173 lines)

## Key Decisions

- No `tsconfig.json` or `package.json` yet (deferred to M6-1)
- Used `interface` for object shapes, `type` for unions
- Used `ReadonlyArray<StackFrame>` for `DecisionContext.stack`
- Compilation verified with `npx tsc --noEmit --strict`

## Lessons Learned

- Straightforward transcription task — all types were fully specified in DESIGN.md
- Zero discrepancies found during cross-reference verification
