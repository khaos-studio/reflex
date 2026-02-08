# Issue #2 - Workflow Registry with DAG Validation

**Archived:** 2026-02-08
**PR:** #32 (Merged)
**Status:** Completed

## Summary
Implemented `WorkflowRegistry` class in `src/registry.ts` with full DAG validation. The registry validates workflows at registration time, rejecting cycles, invalid edges, missing entry nodes, and workflows without terminal nodes. Uses Kahn's algorithm for topological sort cycle detection.

## Key Decisions
- Custom `WorkflowValidationError` class with structured error codes (7 codes: `CYCLE_DETECTED`, `INVALID_EDGE`, `INVALID_ENTRY_NODE`, `NO_TERMINAL_NODES`, `DUPLICATE_WORKFLOW_ID`, `NODE_ID_MISMATCH`, `EMPTY_WORKFLOW`)
- Kahn's algorithm chosen for cycle detection (O(V+E), standard approach)
- `console.warn` for invocation ref warnings (non-blocking, sufficient for v-alpha)
- Node ID consistency check (dict key vs node.id) included as bonus integrity check

## Files Changed
- `src/registry.ts` (new) - WorkflowRegistry class with validation logic

## Lessons Learned
- All 5 validation rules from DESIGN.md Section 3.3 mapped cleanly to implementation
- Single-file implementation was appropriate given interdependence of validation logic
