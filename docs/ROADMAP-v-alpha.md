# Reflex Roadmap — V-Alpha

> **Last Updated**: 2026-02-07
> **Target**: Minimal viable framework — enough to run a real workflow with a real decision agent

Each milestone maps to a GitHub milestone. Each item within a milestone maps to an issue. Dependencies between milestones are sequential — complete M1 before starting M2, etc.

---

## M1: Core Types & Validation

**Goal**: Define the type system and workflow registration with structural validation. No execution yet — just the data model and the ability to register valid workflows.

### Issues

**M1-1: Core type definitions**
Define all types from DESIGN.md Section 2 as TypeScript interfaces in `src/types.ts`:
- `Workflow`, `Node`, `NodeSpec`, `Edge`
- `InvocationSpec`, `ReturnMapping`
- `BlackboardEntry`, `BlackboardSource`, `BlackboardWrite`
- `Guard` (`BuiltinGuard | CustomGuard`)
- `StackFrame`
- `DecisionAgent`, `DecisionContext`, `Decision`
- `StepResult`, `EngineEvent`

Export everything. No implementation, just types.

**M1-2: Workflow Registry with DAG validation**
Implement `WorkflowRegistry` class:
- `register(workflow)` — validates and stores
- `get(id)`, `has(id)`, `list()`
- Registration-time validation:
  - Topological sort (reject cycles)
  - Edge integrity (all `from`/`to` reference existing node IDs)
  - Entry node exists
  - At least one terminal node (no outgoing edges)
  - Invocation ref warnings (log if `invokes.workflowId` not yet registered)
- Throw descriptive errors on validation failure

**M1-3: Test suite for validation**
Unit tests:
- Valid DAG registers successfully
- Cyclic graph is rejected
- Missing edge targets are rejected
- Missing entry node is rejected
- No terminal nodes is rejected
- Invocation ref to unregistered workflow logs warning but doesn't reject
- Multiple workflows can be registered

---

## M2: Blackboard

**Goal**: Implement the scoped, append-only blackboard with lexical read semantics.

### Issues

**M2-1: BlackboardReader implementation**
Implement `BlackboardReader` that takes an ordered list of blackboard scopes (local → parent → grandparent):
- `get(key)` — walk scopes, return first match (latest entry for key in that scope)
- `has(key)` — walk scopes, return true if found in any
- `getAll(key)` — collect all entries for key across all scopes, ordered most-local first (includes shadowed entries)
- `entries()` — all entries across all scopes
- `keys()` — all unique keys across all scopes
- `local()` — only the innermost scope's entries

**M2-2: Blackboard write + append-only enforcement**
Implement the write side:
- Append-only — writes create new entries, never mutate existing
- Same-key writes shadow previous entries (latest-wins within scope)
- `BlackboardSource` metadata (workflowId, nodeId, stackDepth) attached to every write
- Timestamp on every entry

**M2-3: Test suite for blackboard**
Unit tests:
- Write and read back single value
- Same-key shadowing within a scope
- Cross-scope read precedence (local shadows parent)
- `getAll()` returns shadowed entries in correct order
- `local()` returns only innermost scope
- Append-only invariant: no mutation, no deletion
- Empty blackboard returns undefined / false / empty arrays

---

## M3: Guard Evaluation

**Goal**: Implement guard evaluation against the scoped blackboard.

### Issues

**M3-1: Built-in guard evaluator**
Implement evaluation for built-in guard types:
- `exists` — `blackboard.has(key)`
- `not-exists` — `!blackboard.has(key)`
- `equals` — `blackboard.get(key) === value`
- `not-equals` — `blackboard.get(key) !== value`

**M3-2: Custom guard support**
- Accept `CustomGuard.evaluate` function
- Call with scoped `BlackboardReader`
- Wrap in try/catch — if guard throws, treat as engine error (not a valid transition)

**M3-3: Edge filtering**
Given a node and the current blackboard, compute valid outgoing edges:
- Collect all outgoing edges for the node
- Evaluate each edge's guard (no guard = always valid)
- Return the filtered set

**M3-4: Test suite for guards**
Unit tests:
- `exists` passes/fails correctly
- `equals` with matching/non-matching values
- `not-exists` and `not-equals`
- Custom guard function called with correct blackboard
- Custom guard that throws → treated as error
- Edge with no guard is always valid
- Fan-out with mixed guard results → correct filtering
- Guards read from scoped blackboard (test cross-scope guard evaluation)

---

## M4: Execution Engine

**Goal**: Implement the core execution loop — the heart of Reflex.

### Issues

**M4-1: Engine scaffold**
Implement `ReflexEngine` class:
- Constructor takes `WorkflowRegistry` and `DecisionAgent`
- `init(workflowId)` — create session, push root workflow, set entry node, return sessionId
- State inspection: `sessionId()`, `currentNode()`, `currentWorkflow()`, `blackboard()`, `stack()`, `validEdges()`
- Internal state management: current workflow, current node, stack frames, blackboards

**M4-2: Single-workflow stepping**
Implement `step()` for the simple case (no invocations, no stack operations):
1. Evaluate guards → compute valid edges
2. Call decision agent with `DecisionContext`
3. Handle `advance` — validate edge is in valid set, apply writes, move to target node
4. Handle `suspend` — set engine status to suspended, return
5. Handle `complete` — enforce terminal-node-only, return completed status
6. Emit events in correct order

**M4-3: Stack operations — invoke and pop**
Extend `step()` to handle invocation nodes and stack:
- On entering a node with `invokes`: push current frame, start sub-workflow at entry
- On `complete` at terminal node with non-empty stack: execute returnMap, pop frame, resume parent at invoking node
- Scoped blackboard reader construction from stack frames

**M4-4: `run()` — step until done or suspended**
Implement `run()`:
- Call `step()` in a loop
- Stop on `completed`, `suspended`, or `engine:error`
- Return final result

**M4-5: Event emission**
Implement event system:
- `on(event, handler)` — subscribe
- Emit events in deterministic order per step (see DESIGN.md Section 3.2)
- Events: `node:enter`, `node:exit`, `edge:traverse`, `workflow:push`, `workflow:pop`, `blackboard:write`, `engine:complete`, `engine:suspend`, `engine:error`

**M4-6: Test suite for engine**
Unit tests:
- Linear workflow (A → B → C → END) runs to completion
- Decision agent `advance` moves to correct node
- Decision agent `suspend` suspends engine, resumable with next `step()`
- Decision agent `complete` at non-terminal node → engine error
- Decision agent `complete` at terminal node → workflow completes
- Blackboard writes from decisions are persisted
- Fan-out: decision agent picks from valid edges
- Invalid edge selection (not in valid set) → engine error

**M4-7: Test suite for stack operations**
Unit tests:
- Invocation node pushes stack, starts sub-workflow
- Sub-workflow completion pops stack, resumes parent
- ReturnMap copies correct values from child to parent
- Scoped blackboard: child reads parent values
- Scoped blackboard: child writes don't appear in parent's local
- Recursive invocation (workflow invokes itself) works correctly
- Stack depth > 2 (grandparent → parent → child) — scoped reads work across full chain
- ReturnMap with missing child key — handled gracefully

---

## M5: Integration Test — End-to-End

**Goal**: Prove the system works with a realistic workflow. Build a simple decision agent and run a multi-step, multi-workflow scenario.

### Issues

**M5-1: Example decision agent — deterministic**
Build a simple rule-based decision agent for testing:
- Given a node spec, reads from blackboard, writes values, picks edges
- Deterministic — same inputs → same outputs
- Demonstrates the full engine lifecycle without LLM complexity

**M5-2: Example workflow set — physical object modeling (simplified)**
Translate the recovered Relica PhysObjMachine into Reflex format:
- Root workflow with 4-5 nodes
- At least one invocation node (sub-workflow)
- Guards on at least one fan-out point
- ReturnMaps for sub-workflow results
- NodeSpecs containing simplified Relica-style step definitions

**M5-3: End-to-end test**
Integration test:
- Register workflows
- Init engine with root workflow
- Run to completion (or step-by-step)
- Verify: blackboard contains expected values at each step
- Verify: stack operations occurred in correct order
- Verify: returnMaps propagated correct values
- Verify: event emission trace matches expected sequence
- Verify: final state is correct

**M5-4: Suspension round-trip test**
Integration test specifically for suspend/resume:
- Decision agent suspends at a specific node
- Verify engine is suspended
- "Inject" human response (write to blackboard, call step again)
- Verify engine resumes and continues correctly

---

## M6: Package & Documentation

**Goal**: Make Reflex usable as a standalone package.

### Issues

**M6-1: Project setup**
- `package.json` with name `@reflex/core` (or `reflex-engine`, TBD)
- TypeScript config
- Build pipeline (tsc → dist)
- ESM + CJS output

**M6-2: Public API surface**
Define and export the public API:
- `createEngine(registry, agent, options?)` — factory function
- `createRegistry()` — factory function
- All types from `src/types.ts`
- Nothing else — keep the surface minimal

**M6-3: README**
- What Reflex is (one paragraph)
- Install + quick start (register workflow, create agent, run engine)
- Link to DESIGN.md for architecture details
- API reference (brief — types + factory functions)

---

## Milestone Dependency Graph

```
M1 (Types + Validation)
 │
 ├── M2 (Blackboard)
 │    │
 │    └── M3 (Guards)
 │         │
 │         └── M4 (Engine)
 │              │
 │              └── M5 (Integration Test)
 │                   │
 │                   └── M6 (Package)
 │
 └── M6-1 (Project Setup — can start in parallel with M2)
```

**Critical path**: M1 → M2 → M3 → M4 → M5 → M6

**Parallel opportunity**: M6-1 (project setup) can happen alongside M1/M2 since it's just scaffolding.

---

## Estimated Scope

| Milestone | Core Files | Est. LOC | Depends On |
|---|---|---|---|
| M1 | `types.ts`, `registry.ts`, `registry.test.ts` | ~200 | — |
| M2 | `blackboard.ts`, `blackboard.test.ts` | ~250 | M1 |
| M3 | `guards.ts`, `guards.test.ts` | ~150 | M1, M2 |
| M4 | `engine.ts`, `events.ts`, `engine.test.ts`, `stack.test.ts` | ~500 | M1-M3 |
| M5 | `examples/`, `integration.test.ts` | ~300 | M1-M4 |
| M6 | `package.json`, `tsconfig.json`, `README.md`, `index.ts` | ~100 | M1-M5 |
| **Total** | | **~1500** | |

This is a small, focused codebase. The engine itself is probably ~300 lines. The rest is types, validation, tests, and packaging.

---

## What V-Alpha Does NOT Include

Explicitly out of scope (see DESIGN.md Section 6):
- Parallel nodes / fork-join
- Typed blackboard values
- JSON/YAML workflow definition format
- Node input/output declarations
- Edge exhaustiveness checks
- ReturnMap completeness validation
- Persistence adapter implementation (interface only)
- LLM decision agent (consumer provides this)
- UI / visualization
