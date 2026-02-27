// Reflex — Deterministic Rule-Based Decision Agent
// M5-1: Example agent that interprets NodeSpec as a rule descriptor.

import {
  DecisionAgent,
  DecisionContext,
  Decision,
  BlackboardWrite,
} from '../types';

// ---------------------------------------------------------------------------
// RuleSpec — the NodeSpec shape this agent understands
// ---------------------------------------------------------------------------

/**
 * A small DSL embedded in NodeSpec. The RuleAgent reads these fields
 * to produce a deterministic Decision for every node.
 *
 * Resolution order:
 *  1. suspend  → return suspend with reason
 *  2. complete → return complete (with optional writes)
 *  3. edge     → resolve edge, return advance (with optional writes)
 */
export interface RuleSpec {
  /** Key-value pairs to write to the blackboard. */
  writes?: BlackboardWrite[];
  /** If set, return a suspend decision with this reason. */
  suspend?: string;
  /** If true, return a complete decision (only valid at terminal nodes). */
  complete?: true;
  /**
   * Edge to advance along.
   * - string: use this edge ID directly.
   * - string[]: priority list — pick the first that appears in validEdges.
   * - omitted: fall back to the single valid edge (if exactly one).
   */
  edge?: string | string[];
  /** Index signature for NodeSpec compatibility. */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// RuleAgent
// ---------------------------------------------------------------------------

export class RuleAgent implements DecisionAgent {
  async resolve(context: DecisionContext): Promise<Decision> {
    const spec = context.node.spec as RuleSpec;

    // 1. Suspend
    if (spec.suspend !== undefined) {
      return { type: 'suspend', reason: spec.suspend };
    }

    // 2. Complete
    if (spec.complete) {
      return { type: 'complete', writes: spec.writes };
    }

    // 3. Advance — resolve edge
    const edgeId = this._resolveEdge(spec, context);
    return { type: 'advance', edge: edgeId, writes: spec.writes };
  }

  private _resolveEdge(spec: RuleSpec, context: DecisionContext): string {
    const { validEdges } = context;

    if (typeof spec.edge === 'string') {
      return spec.edge;
    }

    if (Array.isArray(spec.edge)) {
      const validIds = new Set(validEdges.map((e) => e.id));
      for (const candidate of spec.edge) {
        if (validIds.has(candidate)) {
          return candidate;
        }
      }
      // No candidate matched — return first in the list and let the engine
      // reject it with an engine:error (honest failure, spec is wrong).
      return spec.edge[0];
    }

    // No edge specified — fall back to single valid edge
    if (validEdges.length === 1) {
      return validEdges[0].id;
    }

    // Multiple valid edges and no spec.edge — cannot decide.
    // Return empty string; engine will reject it.
    return '';
  }
}

/** Factory function for creating a RuleAgent. */
export function createRuleAgent(): RuleAgent {
  return new RuleAgent();
}
