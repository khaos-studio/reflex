# M1-1: Core type definitions - #1

## Issue Details
- **Repository:** corpus-relica/reflex
- **GitHub URL:** https://github.com/corpus-relica/reflex/issues/1
- **State:** open
- **Labels:** none
- **Milestone:** M1: Core Types & Validation
- **Assignees:** none
- **Related Issues:**
  - Blocks: #2 (M1-2: Workflow Registry), #3 (M1-3: Test suite)
  - Dependency of: All subsequent milestones (M2-M6)

## Description
Define all types from DESIGN.md Section 2 as TypeScript interfaces in `src/types.ts`:

- `Workflow`, `Node`, `NodeSpec`, `Edge`
- `InvocationSpec`, `ReturnMapping`
- `BlackboardEntry`, `BlackboardSource`, `BlackboardWrite`
- `Guard` (`BuiltinGuard | CustomGuard`)
- `StackFrame`
- `DecisionAgent`, `DecisionContext`, `Decision`
- `StepResult`, `EngineEvent`

Export everything. No implementation, just types.

## Acceptance Criteria
- [ ] All types from DESIGN.md Section 2 defined as TypeScript interfaces
- [ ] All types exported from `src/types.ts`
- [ ] No implementation code — pure type definitions
- [ ] Types match DESIGN.md exactly (field names, shapes, optionality)
- [ ] Includes runtime types from Section 3.2 (`StepResult`, `EngineEvent`)
- [ ] `BlackboardReader` interface included (Section 2.11)

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 1-core-type-definitions
- **Current branch:** main

## Implementation Checklist

### Setup
- [x] Create feature branch from main

### Implementation Tasks

- [x] Create `src/types.ts` with all type definitions
  - Files affected: `src/types.ts` (new file)
  - Why: Single file, single commit — all types are interdependent

  Types to define (in dependency order):
  1. `NodeSpec` — opaque bag, index signature
  2. `ReturnMapping` — parentKey, childKey
  3. `InvocationSpec` — workflowId, returnMap
  4. `Node` — id, description?, spec, invokes?
  5. `Edge` — id, from, to, event, guard?
  6. `Workflow` — id, entry, nodes, edges, metadata?
  7. `BlackboardSource` — workflowId, nodeId, stackDepth
  8. `BlackboardEntry` — key, value, source, timestamp
  9. `BlackboardWrite` — key, value
  10. `BuiltinGuard` — type (exists|equals|not-exists|not-equals), key, value?
  11. `CustomGuard` — type 'custom', evaluate function
  12. `Guard` — union type
  13. `StackFrame` — workflowId, currentNodeId, returnMap, blackboard
  14. `BlackboardReader` — get, has, getAll, entries, keys, local
  15. `DecisionContext` — workflow, node, blackboard, validEdges, stack
  16. `Decision` — discriminated union (advance|suspend|complete)
  17. `DecisionAgent` — resolve method
  18. `StepResult` — discriminated union (advanced|invoked|popped|completed|suspended)
  19. `EngineEvent` — string literal union

### Quality Checks
- [x] TypeScript compiles without errors (tsc --noEmit or equivalent)
- [x] All types exported
- [x] Cross-reference every type against DESIGN.md to verify accuracy

## Technical Notes

### Architecture Considerations
- This is the foundational file — every other module in Reflex will import from it
- No project setup (package.json, tsconfig) exists yet — that's M6-1
- For now, just create the source file; compilation verification can wait for project setup or be done with a quick tsc check

### Implementation Approach
- Direct transcription from DESIGN.md Section 2 + Section 3.2
- Use TypeScript `interface` for object shapes, `type` for unions
- Maintain order from the design doc for readability
- Use `readonly` where appropriate (e.g., `ReadonlyArray<StackFrame>` in DecisionContext)

### Potential Challenges
- None significant — the types are fully specified in DESIGN.md
- Minor: `BlackboardReader` in DecisionContext uses the interface, but the reader is also listed separately — include the interface definition

### Assumptions Made
- `src/types.ts` is the target file path (per issue description)
- No `tsconfig.json` yet — may need minimal one for type checking, or defer to M6-1
- `NodeSpec` uses index signature `[key: string]: unknown` per DESIGN.md

## Work Log

### 2026-02-08 - Session 1
- Created feature branch `1-core-type-definitions` from main
- Created `src/types.ts` with all 18 type definitions
- TypeScript compiles clean (`tsc --noEmit --strict`)
- Cross-referenced every type field-by-field against DESIGN.md — 0 discrepancies
- All types exported, no implementation code
- Ready for commit

---
**Generated:** 2026-02-08
**By:** Issue Setup Skill
**Source:** https://github.com/corpus-relica/reflex/issues/1
