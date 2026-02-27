// Reflex — Guard Evaluation
// Implements DESIGN.md Section 2.8

import { BuiltinGuard, CustomGuard, Guard, Edge, BlackboardReader } from './types.js';

// ---------------------------------------------------------------------------
// Guard Result Type
// ---------------------------------------------------------------------------

/**
 * Discriminated result from guard evaluation.
 *
 * - `{ ok: true, passed }` — guard evaluated successfully, `passed` is the result
 * - `{ ok: false, error }` — guard threw during evaluation (engine error)
 *
 * This is an evaluation-layer type, not a domain type — it lives here rather
 * than in types.ts because it is consumed only by the guard subsystem and the
 * engine's edge-filtering logic.
 */
export type GuardResult =
  | { ok: true; passed: boolean }
  | { ok: false; error: unknown };

// ---------------------------------------------------------------------------
// Built-in Guard Evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate a built-in guard against the scoped blackboard.
 *
 * Uses strict equality (===) for equals/not-equals comparisons.
 * Guards read from the full scope chain (local → parent → grandparent).
 */
export function evaluateBuiltinGuard(
  guard: BuiltinGuard,
  blackboard: BlackboardReader,
): boolean {
  switch (guard.type) {
    case 'exists':
      return blackboard.has(guard.key);
    case 'not-exists':
      return !blackboard.has(guard.key);
    case 'equals':
      return blackboard.get(guard.key) === guard.value;
    case 'not-equals':
      return blackboard.get(guard.key) !== guard.value;
    default: {
      const _exhaustive: never = guard.type;
      throw new Error(`Unknown guard type: ${_exhaustive}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Custom Guard Evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate a custom guard against the scoped blackboard.
 *
 * Calls the guard's `evaluate` function with the BlackboardReader.
 * If the function throws, the error is caught and returned as
 * `{ ok: false, error }` — the caller (engine) treats this as an
 * engine error, not a valid transition.
 *
 * Contract: custom guards SHOULD be total, terminating, and side-effect free.
 * Violations are caught here but indicate a bug in the guard, not in Reflex.
 */
export function evaluateCustomGuard(
  guard: CustomGuard,
  blackboard: BlackboardReader,
): GuardResult {
  try {
    const passed = guard.evaluate(blackboard);
    return { ok: true, passed };
  } catch (error) {
    return { ok: false, error };
  }
}

// ---------------------------------------------------------------------------
// Unified Guard Evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate any guard (built-in or custom) against the scoped blackboard.
 *
 * Dispatches to `evaluateBuiltinGuard` or `evaluateCustomGuard` based on
 * the guard's `type` discriminant. Returns a `GuardResult` in both cases
 * so the caller has a uniform API.
 *
 * Built-in guards are safe by construction (exhaustive switch, no I/O) and
 * wrapped directly in `{ ok: true }`. Custom guards go through try/catch.
 */
export function evaluateGuard(
  guard: Guard,
  blackboard: BlackboardReader,
): GuardResult {
  if (guard.type === 'custom') {
    return evaluateCustomGuard(guard, blackboard);
  }
  const passed = evaluateBuiltinGuard(guard, blackboard);
  return { ok: true, passed };
}

// ---------------------------------------------------------------------------
// Edge Filtering
// ---------------------------------------------------------------------------

/**
 * Result of filtering outgoing edges for a node.
 *
 * - `{ ok: true, edges }` — all guards evaluated successfully, `edges` is the valid set
 * - `{ ok: false, error }` — a guard threw during evaluation (engine error)
 *
 * Follows the same discriminated union pattern as `GuardResult`.
 */
export type FilterEdgesResult =
  | { ok: true; edges: Edge[] }
  | { ok: false; error: unknown };

/**
 * Compute valid outgoing edges for a node given the current blackboard.
 *
 * 1. Collects outgoing edges (where `edge.from === nodeId`)
 * 2. Evaluates each edge's guard against the scoped blackboard
 * 3. Edges with no guard are always valid
 * 4. Short-circuits on the first guard error (`{ ok: false }`)
 *
 * This is the composition point between guard evaluation (M3-1/M3-2) and
 * the execution engine (M4). The engine calls this to determine which
 * edges are available for the decision agent to choose from.
 */
export function filterEdges(
  nodeId: string,
  edges: Edge[],
  blackboard: BlackboardReader,
): FilterEdgesResult {
  const outgoing = edges.filter((e) => e.from === nodeId);
  const valid: Edge[] = [];

  for (const edge of outgoing) {
    if (!edge.guard) {
      valid.push(edge);
      continue;
    }

    const result = evaluateGuard(edge.guard, blackboard);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    if (result.passed) {
      valid.push(edge);
    }
  }

  return { ok: true, edges: valid };
}
