# Reflex Roadmap — V1.0

> **Last Updated**: 2026-02-27
> **Target**: Production-ready release — stable API, declarative workflows, persistence, parallel execution
> **Predecessor**: [ROADMAP-v-alpha.md](ROADMAP-v-alpha.md) (M1–M6, 24 issues — completed)

Each milestone maps to a GitHub milestone. Each item within a milestone maps to an issue. M7–M9 can proceed in parallel. M10 depends on M7–M9 being stable. M11 is the gate.

**Guiding input**: [Khaos Machine technical evaluation](https://github.com/corpus-relica/reflex/issues/54) — the first independent assessment of Reflex identified these gaps as blockers for real-world adoption.

---

## M7: Declarative Workflows

**Goal**: Define workflows as data (JSON), not just code. Enables non-programmer authoring, cross-language portability (same JSON loaded by TS and Go), and workflow storage/transmission.

### Issues

**M7-1: Workflow JSON schema**
Define a JSON Schema for the `Workflow` type:
- All fields from `types.ts`: nodes, edges, entry, guards, invocation specs, return mappings
- Guard expressions: built-in guards as JSON objects, custom guards as named references (not inline functions — those stay programmatic)
- NodeSpec as freeform `Record<string, unknown>` (the agent interprets it, not the engine)
- Publish as a standalone `.json` schema file in `docs/`

**M7-2: Workflow loader**
Implement a `loadWorkflow(json: unknown): Workflow` function:
- Validates against JSON schema
- Returns typed `Workflow` object
- Throws `WorkflowValidationError` on schema violations (reuse existing error type)
- Handles both parsed objects and raw JSON strings
- Custom guards: JSON references a guard name → resolved against a guard registry (new concept: `GuardRegistry` or `guards` map passed to loader)

**M7-3: Test suite for declarative workflows**
- Valid JSON loads successfully
- Missing required fields rejected
- Invalid guard type rejected
- Custom guard reference resolved correctly
- Round-trip: programmatic workflow → serialize to JSON → load → deep equal
- Cross-implementation: same JSON file loadable by both TS and Go (test with fixture files in `docs/fixtures/`)

---

## M8: Node Contracts

**Goal**: Declare what each node reads from and writes to the blackboard. Enable static verification at registration time — catch wiring errors before execution.

### Issues

**M8-1: Input/output declaration types**
Extend `Node` type with optional contract declarations:
- `inputs?: NodeInput[]` — keys this node expects to read from the blackboard
  - `{ key: string, required: boolean, description?: string }`
- `outputs?: NodeOutput[]` — keys this node may write to the blackboard
  - `{ key: string, guaranteed: boolean, description?: string }`
- These are declarations, not enforcement — the engine doesn't block reads/writes at runtime. They're for static analysis only.
- Update JSON schema (M7) to include contracts.

**M8-2: Static verification at registration**
Add an optional verification pass to `WorkflowRegistry.register()`:
- For each node with declared `inputs`, check that at least one upstream node (reachable via edges, respecting DAG order) declares that key in `outputs`
- For `required` inputs with no upstream producer: emit a `ValidationWarning` (not an error — guards and agent logic may provide values dynamically)
- For invocation nodes: check that `returnMap` target keys appear in sub-workflow terminal nodes' outputs (if declared)
- Verification is opt-in: `registry.register(workflow, { verify: true })` or a separate `registry.verify(workflowId)` method
- Return a `VerificationResult` with warnings and info, not just pass/fail

**M8-3: Test suite for node contracts**
- Node with satisfied inputs passes verification
- Node with missing required input produces warning
- Node with optional input and no producer passes clean
- ReturnMap verified against sub-workflow outputs
- Verification across invocation boundaries (parent → child contracts)
- Verification with guards (conditional paths — input may or may not be available)
- Programmatic workflow without contracts: verification skipped, no errors

---

## M9: Persistence

**Goal**: Save and restore engine state across process boundaries. Suspension becomes useful for real human-in-the-loop workflows that span hours or days.

### Issues

**M9-1: Engine snapshot format**
Define a serializable snapshot of engine state:
- `EngineSnapshot` type: session ID, workflow registry state (which workflows are registered + their IDs), current node, engine status, stack frames, all blackboard entries (all scopes)
- JSON-serializable — no functions, no class instances in the snapshot
- Challenge: `NodeSpec` is `Record<string, unknown>` — must be JSON-serializable by convention. Document this constraint.
- Challenge: Custom guards contain functions — snapshot stores guard *names*, not functions. Restoration requires a guard registry (same concept as M7-2).
- Version field in snapshot for forward compatibility

**M9-2: Save/load implementation**
Implement snapshot operations on `ReflexEngine`:
- `engine.snapshot(): EngineSnapshot` — capture current state
- `restoreEngine(snapshot: EngineSnapshot, registry: WorkflowRegistry, agent: DecisionAgent, guards?: GuardRegistry): ReflexEngine` — reconstruct engine from snapshot
- The registry and agent must be provided at restore time (not serialized — they contain functions)
- Adapter interface: `PersistenceAdapter { save(id: string, snapshot: EngineSnapshot): Promise<void>; load(id: string): Promise<EngineSnapshot | null> }`
- No built-in adapter implementations (consumers provide their own: file system, database, etc.)
- The adapter is optional — `snapshot()` and `restoreEngine()` work without it for manual save/load

**M9-3: Test suite for persistence**
- Snapshot captures all engine state correctly
- Restore produces engine that behaves identically to original
- Round-trip: init → step to mid-workflow → snapshot → restore → continue → complete
- Suspended engine: snapshot → restore → resume → complete
- Stack depth > 1: snapshot with active sub-workflow → restore → sub-workflow completes → parent resumes
- Blackboard integrity: all entries (all scopes) preserved across save/load
- Custom guard restoration via guard registry
- Missing guard in registry on restore → clear error

---

## M10: Parallel Execution

**Goal**: Fork/join nodes that split execution into concurrent paths. This is the biggest formal model change — it moves from a single program counter to multiple.

### Design Constraints

The formal model changes from a pushdown automaton (single stack, single head) to a concurrent pushdown system. The append-only blackboard invariant is preserved — concurrent branches can all write, and writes from parallel branches are visible to the join node. No branch can see another branch's in-progress writes until the join.

### Issues

**M10-1: Fork/join types and DAG validation**
Extend the type system:
- `ForkNode`: a node with multiple outgoing edges that are ALL traversed (not selected by guard/agent — all paths execute)
- `JoinNode`: a node that waits for all incoming fork paths to complete before proceeding
- Fork/join must be paired — every fork has exactly one matching join
- DAG validation update: detect unpaired forks/joins, validate that forked paths converge at the join, no cross-path edges
- Each forked path gets its own blackboard scope (isolated writes). The join node merges scopes (append all entries from all branches)

**M10-2: Concurrent execution engine**
Implement parallel path execution:
- At a fork node: create N execution contexts (one per outgoing edge), each with its own blackboard scope and position
- Step function: steps ALL active contexts (round-robin or truly concurrent depending on runtime — TS: Promise.all, Go: goroutines)
- At a join node: wait for all incoming paths to reach the join, merge blackboard scopes, continue with single execution context
- Agent is called once per active context per step — agent must handle concurrent calls
- Events: `fork:start`, `fork:path:enter`, `fork:path:complete`, `join:complete`

**M10-3: Parallel blackboard semantics**
Define merge behavior when forked paths rejoin:
- Each fork path has an isolated blackboard scope (like a sub-workflow)
- At join: all entries from all fork paths are appended to the parent scope
- Conflict resolution: if two paths write the same key, both entries are preserved (append-only). The join node sees all values via `getAll(key)`. The `get(key)` returns the entry from the highest-numbered path (deterministic ordering: paths are numbered by edge order in the fork node)
- Document the formal model change in DESIGN.md

**M10-4: Test suite for parallel execution**
- Fork into 2 paths, both complete, join succeeds
- Fork into 3+ paths
- Forked paths with different lengths (short path waits at join for long path)
- Blackboard isolation: path A's writes not visible to path B during execution
- Blackboard merge at join: all writes from all paths visible after join
- Conflicting writes: same key written by multiple paths → both preserved, deterministic get() winner
- Fork with guards on outgoing edges (guard filters which paths actually execute — partial fork)
- Nested fork (fork within a forked path) — if supported
- Fork + sub-workflow invocation (forked path contains an invocation node)
- Agent receives correct context per path (isolated blackboard, correct node)

---

## M11: API Stabilization

**Goal**: Lock the public API surface. After v1.0.0, breaking changes require a major version bump.

### Issues

**M11-1: Public API audit**
Review every exported symbol against these criteria:
- Is the name clear and conventional?
- Is the type signature minimal (no unnecessary optionals, no overly broad types)?
- Does it need to be public? (If only used internally, remove from exports)
- Are error types specific enough for consumers to catch and handle?
- Document every public symbol with JSDoc (TS) / GoDoc (Go)
- Output: annotated list of all public symbols with status (keep / rename / remove / deprecate)

**M11-2: Migration guide**
Document changes from v0.x to v1.0:
- New features (declarative workflows, node contracts, persistence, parallel execution)
- Breaking changes (if any — renamed types, changed signatures)
- Upgrade path for existing v0.x consumers
- Side-by-side examples: "v0.x way" vs "v1.0 way"

**M11-3: v1.0.0 release**
- Final test pass (all implementations)
- Update DESIGN.md with parallel execution model (Section 1 formal model, new Section for fork/join)
- Update root README with v1.0 status and features
- npm publish `@corpus-relica/reflex@1.0.0`
- Go module tag `v1.0.0`
- GitHub release with changelog
- Close milestone

---

## Milestone Dependency Graph

```
M7 (Declarative Workflows) ──┐
                              │
M8 (Node Contracts) ──────────┼──→ M10 (Parallel Execution) ──→ M11 (API Stabilization)
                              │
M9 (Persistence) ─────────────┘
```

**Parallel opportunity**: M7, M8, M9 are independent and can proceed concurrently.

**Critical path**: Any of M7/M8/M9 → M10 → M11

---

## Estimated Scope

| Milestone | Key Files | Est. Issues | Depends On |
|-----------|-----------|-------------|------------|
| M7 | `schema.json`, `loader.ts`, `loader.test.ts` | 3 | — |
| M8 | `types.ts` (extend), `registry.ts` (extend), `contracts.test.ts` | 3 | — |
| M9 | `snapshot.ts`, `persistence.ts`, `persistence.test.ts` | 3 | — |
| M10 | `types.ts` (extend), `engine.ts` (extend), `parallel.test.ts` | 4 | M7–M9 |
| M11 | `index.ts` (audit), `DESIGN.md` (update), release | 3 | M7–M10 |
| **Total** | | **16** | |

---

## Cross-Implementation Note

This roadmap targets the formal specification and the TypeScript reference implementation. The Go implementation (`go/`) should track the same milestones against the same spec. Issues are spec + TypeScript; Go implementation may track separately or in the same issues depending on contributor workflow.

---

## What V1.0 Does NOT Include

Explicitly out of scope (consider for v1.1+):
- Typed blackboard values (runtime schema validation on entries)
- Edge exhaustiveness checks (all possible outputs covered)
- Built-in persistence adapters (file, database, etc.)
- Built-in decision agents (LLM, rule engine, etc.)
- UI / visualization (separate projects: reflex-coffee, reflex-dungeon)
- Hot-reload workflows (swap workflow definition mid-execution)
- Distributed execution (engine instances across processes/machines)
