# M1-2: Workflow Registry with DAG validation - #2

## Issue Details
- **Repository:** corpus-relica/reflex
- **GitHub URL:** https://github.com/corpus-relica/reflex/issues/2
- **State:** open
- **Labels:** none
- **Milestone:** M1: Core Types & Validation
- **Assignees:** none
- **Related Issues:**
  - Depends on: #1 (M1-1: Core type definitions) — completed
  - Blocks: #3 (M1-3: Test suite for validation)
  - Dependency of: All subsequent milestones (M2-M6)

## Description
Implement `WorkflowRegistry` class:

- `register(workflow)` — validates and stores
- `get(id)`, `has(id)`, `list()`

### Registration-time validation:
- Topological sort (reject cycles)
- Edge integrity (all `from`/`to` reference existing node IDs)
- Entry node exists
- At least one terminal node (no outgoing edges)
- Invocation ref warnings (log if `invokes.workflowId` not yet registered)
- Throw descriptive errors on validation failure

## Acceptance Criteria
- [ ] `WorkflowRegistry` class implemented in `src/registry.ts`
- [ ] `register(workflow)` validates and stores workflows
- [ ] `get(id)`, `has(id)`, `list()` retrieval methods work correctly
- [ ] Cyclic graphs rejected with descriptive error
- [ ] Invalid edge references rejected with descriptive error
- [ ] Missing entry node rejected with descriptive error
- [ ] No terminal nodes rejected with descriptive error
- [ ] Invocation ref to unregistered workflow logs warning but doesn't reject
- [ ] Descriptive errors on validation failure
- [ ] TypeScript compiles without errors

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 2-workflow-registry-with-dag-validation
- **Current branch:** main

## Implementation Checklist

### Setup
- [x] Create feature branch from main

### Implementation Tasks

- [x] Create `src/registry.ts` with full WorkflowRegistry implementation
  - Files affected: `src/registry.ts` (new file)
  - Why: Single file, single commit — all validation logic is interdependent

  Implementation details:

  **Custom error class:**
  - `WorkflowValidationError` extending Error
  - Properties: `code` (enum), `workflowId`, `details`
  - Error codes: `CYCLE_DETECTED`, `INVALID_EDGE`, `INVALID_ENTRY_NODE`, `NO_TERMINAL_NODES`, `DUPLICATE_WORKFLOW_ID`, `NODE_ID_MISMATCH`, `EMPTY_WORKFLOW`

  **Registry class:**
  - Private `Map<string, Workflow>` for storage
  - `register(workflow)` — runs all validators, then stores
  - `get(id)`, `has(id)`, `list()` — straightforward retrieval

  **Validation order in register():**
  1. Duplicate workflow ID check (fail fast)
  2. Empty workflow check (no nodes)
  3. Entry node exists in nodes dict
  4. Node ID consistency (dict keys match node.id field)
  5. Edge integrity (all from/to reference existing node IDs)
  6. Terminal nodes exist (at least one with no outgoing edges)
  7. Acyclicity (topological sort via Kahn's algorithm)
  8. Invocation ref warnings (console.warn, non-blocking)
  9. Store workflow

  **Kahn's algorithm for cycle detection:**
  - Build adjacency list + in-degree map from edges
  - Process zero-in-degree nodes iteratively
  - If not all nodes processed → cycle exists
  - Report unprocessed nodes in error message

### Quality Checks
- [x] TypeScript compiles without errors (tsc --noEmit --strict)
- [x] All methods and classes exported
- [x] Cross-reference validation rules against DESIGN.md Section 3.3 — 0 discrepancies

## Technical Notes

### Architecture Considerations
- This is the second foundational file — the engine (M4) will depend on it
- Imports types from `./types` (created in #1)
- No external dependencies
- No package.json yet (deferred to M6-1)

### Implementation Approach
- Direct implementation from DESIGN.md Section 3.3
- Custom `WorkflowValidationError` class for structured error handling
- Kahn's algorithm for topological sort (O(V+E), standard approach)
- `console.warn` for invocation ref warnings (sufficient for v-alpha)
- Validate node ID consistency (dict keys match node.id) as bonus integrity check

### Edge Cases
- Empty workflow (no nodes) → reject
- Single-node workflow (entry = terminal) → valid
- Duplicate workflow ID → reject
- Self-loop edge (from = to) → caught by cycle detection
- Multiple terminal nodes → valid
- Node with no incoming edges (besides entry) → valid

### Assumptions Made
- `console.warn` is acceptable for invocation ref warnings in v-alpha
- Custom error class preferred over plain `Error` for structured handling
- Node ID consistency check (dict key vs node.id) is worth including

## Work Log

### 2026-02-08 - Session 1
- Created feature branch `2-workflow-registry-with-dag-validation` from main
- Implemented `src/registry.ts` with full WorkflowRegistry class
  - `WorkflowValidationError` custom error class with 7 error codes
  - `register()` with 7 validation checks + invocation ref warnings
  - `get()`, `has()`, `list()` retrieval methods
  - Kahn's algorithm for cycle detection
- TypeScript compiles clean (`tsc --noEmit --strict`)
- Cross-referenced all 5 validation rules against DESIGN.md Section 3.3 — 0 discrepancies
- All implementation tasks and quality checks complete
- Ready for commit

---
**Generated:** 2026-02-08
**By:** Issue Setup Skill
**Source:** https://github.com/corpus-relica/reflex/issues/2
