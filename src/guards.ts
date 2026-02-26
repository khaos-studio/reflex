// Reflex — Guard Evaluation
// Implements DESIGN.md Section 2.8

import { BuiltinGuard, BlackboardReader } from './types';

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
