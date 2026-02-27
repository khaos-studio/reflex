import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReflexEngine } from './engine';
import { WorkflowRegistry } from './registry';
import {
  Workflow,
  Node,
  DecisionAgent,
  DecisionContext,
  Decision,
  EngineEvent,
  ReturnMapping,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal node with an opaque spec. */
function node(id: string): Node {
  return { id, spec: {} };
}

/** Create a node that invokes a sub-workflow. */
function invocationNode(
  id: string,
  workflowId: string,
  returnMap: ReturnMapping[] = [],
): Node {
  return { id, spec: {}, invokes: { workflowId, returnMap } };
}

/** Wrap a resolve function as a DecisionAgent. */
function makeAgent(
  resolve: (ctx: DecisionContext) => Promise<Decision>,
): DecisionAgent {
  return { resolve };
}

// ---------------------------------------------------------------------------
// Workflow Fixtures
// ---------------------------------------------------------------------------

/**
 * Parent workflow: SETUP → INVOKE_CHILD → END
 * INVOKE_CHILD invokes 'child' with returnMap: output → result
 */
function parentWorkflow(): Workflow {
  return {
    id: 'parent',
    entry: 'SETUP',
    nodes: {
      SETUP: node('SETUP'),
      INVOKE_CHILD: invocationNode('INVOKE_CHILD', 'child', [
        { parentKey: 'result', childKey: 'output' },
      ]),
      END: node('END'),
    },
    edges: [
      { id: 'e-setup-invoke', from: 'SETUP', to: 'INVOKE_CHILD', event: 'NEXT' },
      { id: 'e-invoke-end', from: 'INVOKE_CHILD', to: 'END', event: 'NEXT' },
    ],
  };
}

/** Child workflow: CHILD_A → CHILD_END */
function childWorkflow(): Workflow {
  return {
    id: 'child',
    entry: 'CHILD_A',
    nodes: {
      CHILD_A: node('CHILD_A'),
      CHILD_END: node('CHILD_END'),
    },
    edges: [
      { id: 'e-child-a-end', from: 'CHILD_A', to: 'CHILD_END', event: 'NEXT' },
    ],
  };
}

/**
 * Recursive workflow: RC_START → RC_INVOKE → RC_END
 * RC_START has two outgoing edges controlled by guards on 'done' key.
 * RC_INVOKE invokes 'recursive' (itself).
 */
function recursiveWorkflow(): Workflow {
  return {
    id: 'recursive',
    entry: 'RC_START',
    nodes: {
      RC_START: node('RC_START'),
      RC_INVOKE: invocationNode('RC_INVOKE', 'recursive', []),
      RC_END: node('RC_END'),
    },
    edges: [
      {
        id: 'e-rc-start-invoke',
        from: 'RC_START',
        to: 'RC_INVOKE',
        event: 'RECURSE',
        guard: { type: 'not-exists', key: 'done' },
      },
      {
        id: 'e-rc-start-end',
        from: 'RC_START',
        to: 'RC_END',
        event: 'DONE',
        guard: { type: 'exists', key: 'done' },
      },
      {
        id: 'e-rc-invoke-end',
        from: 'RC_INVOKE',
        to: 'RC_END',
        event: 'NEXT',
      },
    ],
  };
}

/** Grandparent workflow: GP_INIT → GP_INVOKE → GP_END */
function grandparentWorkflow(): Workflow {
  return {
    id: 'gp-workflow',
    entry: 'GP_INIT',
    nodes: {
      GP_INIT: node('GP_INIT'),
      GP_INVOKE: invocationNode('GP_INVOKE', 'mid-workflow', []),
      GP_END: node('GP_END'),
    },
    edges: [
      { id: 'e-gp-init-invoke', from: 'GP_INIT', to: 'GP_INVOKE', event: 'NEXT' },
      { id: 'e-gp-invoke-end', from: 'GP_INVOKE', to: 'GP_END', event: 'NEXT' },
    ],
  };
}

/** Middle workflow: MID_INIT → MID_INVOKE → MID_END */
function middleWorkflow(): Workflow {
  return {
    id: 'mid-workflow',
    entry: 'MID_INIT',
    nodes: {
      MID_INIT: node('MID_INIT'),
      MID_INVOKE: invocationNode('MID_INVOKE', 'deep-workflow', []),
      MID_END: node('MID_END'),
    },
    edges: [
      { id: 'e-mid-init-invoke', from: 'MID_INIT', to: 'MID_INVOKE', event: 'NEXT' },
      { id: 'e-mid-invoke-end', from: 'MID_INVOKE', to: 'MID_END', event: 'NEXT' },
    ],
  };
}

/** Deep child workflow: DEEP_INIT → DEEP_END */
function deepWorkflow(): Workflow {
  return {
    id: 'deep-workflow',
    entry: 'DEEP_INIT',
    nodes: {
      DEEP_INIT: node('DEEP_INIT'),
      DEEP_END: node('DEEP_END'),
    },
    edges: [
      { id: 'e-deep-init-end', from: 'DEEP_INIT', to: 'DEEP_END', event: 'NEXT' },
    ],
  };
}

/**
 * Parent workflow with returnMap pointing to a key the child never writes.
 * SETUP → INVOKE_MISSING → END
 */
function missingKeyParentWorkflow(): Workflow {
  return {
    id: 'missing-parent',
    entry: 'SETUP',
    nodes: {
      SETUP: node('SETUP'),
      INVOKE_MISSING: invocationNode('INVOKE_MISSING', 'child', [
        { parentKey: 'result', childKey: 'nonexistent' },
      ]),
      END: node('END'),
    },
    edges: [
      { id: 'e-setup-invoke', from: 'SETUP', to: 'INVOKE_MISSING', event: 'NEXT' },
      { id: 'e-invoke-end', from: 'INVOKE_MISSING', to: 'END', event: 'NEXT' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('stack operations', () => {
  let registry: WorkflowRegistry;

  beforeEach(() => {
    registry = new WorkflowRegistry();
  });

  // -------------------------------------------------------------------------
  // 1. Invocation node — stack push
  // -------------------------------------------------------------------------

  describe('invocation node — stack push', () => {
    it('returns { status: invoked } with sub-workflow and entry node', async () => {
      registry.register(parentWorkflow());
      registry.register(childWorkflow());

      const resolveFn = vi.fn()
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-setup-invoke' });
      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      await engine.init('parent');

      // Step 1: advance SETUP → INVOKE_CHILD
      await engine.step();

      // Step 2: entering INVOKE_CHILD triggers invocation
      const result = await engine.step();

      expect(result.status).toBe('invoked');
      if (result.status === 'invoked') {
        expect(result.workflow.id).toBe('child');
        expect(result.node.id).toBe('CHILD_A');
      }
    });

    it('pushes a frame onto the stack with correct contents', async () => {
      registry.register(parentWorkflow());
      registry.register(childWorkflow());

      const resolveFn = vi.fn()
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-setup-invoke' });
      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      await engine.init('parent');

      await engine.step(); // advance to INVOKE_CHILD
      await engine.step(); // triggers invocation

      const stack = engine.stack();
      expect(stack).toHaveLength(1);
      expect(stack[0].workflowId).toBe('parent');
      expect(stack[0].currentNodeId).toBe('INVOKE_CHILD');
    });

    it('updates currentWorkflow and currentNode to sub-workflow', async () => {
      registry.register(parentWorkflow());
      registry.register(childWorkflow());

      const resolveFn = vi.fn()
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-setup-invoke' });
      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      await engine.init('parent');

      await engine.step();
      await engine.step();

      expect(engine.currentWorkflow()!.id).toBe('child');
      expect(engine.currentNode()!.id).toBe('CHILD_A');
    });

    it('does not call agent at invocation node', async () => {
      registry.register(parentWorkflow());
      registry.register(childWorkflow());

      const resolveFn = vi.fn()
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-setup-invoke' });
      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      await engine.init('parent');

      await engine.step(); // agent called once (at SETUP)
      await engine.step(); // invocation — agent NOT called

      expect(resolveFn).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Sub-workflow completion — stack pop
  // -------------------------------------------------------------------------

  describe('sub-workflow completion — stack pop', () => {
    it('returns { status: popped } with parent workflow and invoking node', async () => {
      registry.register(parentWorkflow());
      registry.register(childWorkflow());

      const resolveFn = vi.fn()
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-setup-invoke' })    // SETUP → INVOKE_CHILD
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-child-a-end' })     // CHILD_A → CHILD_END
        .mockResolvedValueOnce({ type: 'complete' });                           // CHILD_END (terminal)
      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      await engine.init('parent');

      await engine.step(); // advance to INVOKE_CHILD
      await engine.step(); // invocation → child at CHILD_A
      await engine.step(); // advance CHILD_A → CHILD_END
      const result = await engine.step(); // complete at CHILD_END → pop

      expect(result.status).toBe('popped');
      if (result.status === 'popped') {
        expect(result.workflow.id).toBe('parent');
        expect(result.node.id).toBe('INVOKE_CHILD');
      }
    });

    it('empties the stack after pop', async () => {
      registry.register(parentWorkflow());
      registry.register(childWorkflow());

      const resolveFn = vi.fn()
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-setup-invoke' })
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-child-a-end' })
        .mockResolvedValueOnce({ type: 'complete' });
      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      await engine.init('parent');

      await engine.step();
      await engine.step();
      await engine.step();
      await engine.step();

      expect(engine.stack()).toHaveLength(0);
    });

    it('restores parent as currentWorkflow and invoking node as currentNode', async () => {
      registry.register(parentWorkflow());
      registry.register(childWorkflow());

      const resolveFn = vi.fn()
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-setup-invoke' })
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-child-a-end' })
        .mockResolvedValueOnce({ type: 'complete' });
      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      await engine.init('parent');

      await engine.step();
      await engine.step();
      await engine.step();
      await engine.step();

      expect(engine.currentWorkflow()!.id).toBe('parent');
      expect(engine.currentNode()!.id).toBe('INVOKE_CHILD');
    });

    it('emits workflow:pop event', async () => {
      registry.register(parentWorkflow());
      registry.register(childWorkflow());

      const resolveFn = vi.fn()
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-setup-invoke' })
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-child-a-end' })
        .mockResolvedValueOnce({ type: 'complete' });
      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      const popEvents: unknown[] = [];
      engine.on('workflow:pop', (p) => popEvents.push(p));
      await engine.init('parent');

      await engine.step();
      await engine.step();
      await engine.step();
      await engine.step(); // pop

      expect(popEvents).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // 3. ReturnMap — value propagation
  // -------------------------------------------------------------------------

  describe('returnMap — value propagation', () => {
    it('copies child output to parent blackboard via returnMap', async () => {
      registry.register(parentWorkflow());
      registry.register(childWorkflow());

      const resolveFn = vi.fn()
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-setup-invoke' })
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-child-a-end' })
        .mockResolvedValueOnce({
          type: 'complete',
          writes: [{ key: 'output', value: 'child_result' }],
        });
      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      await engine.init('parent');

      await engine.step(); // advance to INVOKE_CHILD
      await engine.step(); // invocation
      await engine.step(); // advance CHILD_A → CHILD_END
      await engine.step(); // complete → pop with returnMap

      expect(engine.blackboard().get('result')).toBe('child_result');
    });

    it('emits blackboard:write during pop for returnMap write', async () => {
      registry.register(parentWorkflow());
      registry.register(childWorkflow());

      const resolveFn = vi.fn()
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-setup-invoke' })
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-child-a-end' })
        .mockResolvedValueOnce({
          type: 'complete',
          writes: [{ key: 'output', value: 'child_result' }],
        });
      const engine = new ReflexEngine(registry, makeAgent(resolveFn));

      // Only capture events during the pop step
      let bbWritesDuringPop: unknown[] = [];
      let capturing = false;
      engine.on('blackboard:write', (p) => {
        if (capturing) bbWritesDuringPop.push(p);
      });
      await engine.init('parent');

      await engine.step();
      await engine.step();
      await engine.step();

      capturing = true;
      await engine.step(); // pop step

      // Two writes: child's complete writes (to child bb) + returnMap write (to parent bb)
      expect(bbWritesDuringPop).toHaveLength(2);
    });

    it('returnMap entry has parent workflowId as source', async () => {
      registry.register(parentWorkflow());
      registry.register(childWorkflow());

      const resolveFn = vi.fn()
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-setup-invoke' })
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-child-a-end' })
        .mockResolvedValueOnce({
          type: 'complete',
          writes: [{ key: 'output', value: 'child_result' }],
        });
      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      await engine.init('parent');

      await engine.step();
      await engine.step();
      await engine.step();
      await engine.step();

      const entries = engine.blackboard().local();
      const resultEntry = entries.find((e) => e.key === 'result');
      expect(resultEntry).toBeDefined();
      expect(resultEntry!.source.workflowId).toBe('parent');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Scoped blackboard — child reads parent
  // -------------------------------------------------------------------------

  describe('scoped blackboard — child reads parent', () => {
    it('child agent sees parent-written value via scoped blackboard', async () => {
      registry.register(parentWorkflow());
      registry.register(childWorkflow());

      let capturedContext: DecisionContext | null = null;
      const resolveFn = vi.fn()
        .mockResolvedValueOnce({
          type: 'advance',
          edge: 'e-setup-invoke',
          writes: [{ key: 'parentValue', value: 'hello' }],
        })
        // Child at CHILD_A — capture context
        .mockImplementationOnce(async (ctx: DecisionContext) => {
          capturedContext = ctx;
          return { type: 'advance', edge: 'e-child-a-end' };
        })
        .mockResolvedValueOnce({ type: 'complete' });
      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      await engine.init('parent');

      await engine.step(); // advance SETUP → INVOKE_CHILD (writes parentValue)
      await engine.step(); // invocation
      await engine.step(); // child at CHILD_A — agent captures context

      expect(capturedContext).not.toBeNull();
      expect(capturedContext!.blackboard.get('parentValue')).toBe('hello');
      expect(capturedContext!.blackboard.has('parentValue')).toBe(true);
    });

    it('parent value is not in child local scope', async () => {
      registry.register(parentWorkflow());
      registry.register(childWorkflow());

      let capturedContext: DecisionContext | null = null;
      const resolveFn = vi.fn()
        .mockResolvedValueOnce({
          type: 'advance',
          edge: 'e-setup-invoke',
          writes: [{ key: 'parentValue', value: 'hello' }],
        })
        .mockImplementationOnce(async (ctx: DecisionContext) => {
          capturedContext = ctx;
          return { type: 'advance', edge: 'e-child-a-end' };
        })
        .mockResolvedValueOnce({ type: 'complete' });
      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      await engine.init('parent');

      await engine.step();
      await engine.step();
      await engine.step();

      const localKeys = capturedContext!.blackboard.local().map((e) => e.key);
      expect(localKeys).not.toContain('parentValue');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Scoped blackboard — child writes isolation
  // -------------------------------------------------------------------------

  describe('scoped blackboard — child writes isolation', () => {
    it('child local writes are not visible in parent after pop', async () => {
      registry.register(parentWorkflow());
      registry.register(childWorkflow());

      const resolveFn = vi.fn()
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-setup-invoke' })
        .mockResolvedValueOnce({
          type: 'advance',
          edge: 'e-child-a-end',
          writes: [{ key: 'childLocal', value: 'secret' }],
        })
        .mockResolvedValueOnce({
          type: 'complete',
          writes: [{ key: 'output', value: 'child_result' }],
        });
      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      await engine.init('parent');

      await engine.step(); // advance to INVOKE_CHILD
      await engine.step(); // invocation
      await engine.step(); // child advance (writes childLocal)
      await engine.step(); // child complete → pop

      expect(engine.blackboard().get('childLocal')).toBeUndefined();
      expect(engine.blackboard().has('childLocal')).toBe(false);
    });

    it('only returnMap-promoted values survive in parent', async () => {
      registry.register(parentWorkflow());
      registry.register(childWorkflow());

      const resolveFn = vi.fn()
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-setup-invoke' })
        .mockResolvedValueOnce({
          type: 'advance',
          edge: 'e-child-a-end',
          writes: [{ key: 'childLocal', value: 'secret' }],
        })
        .mockResolvedValueOnce({
          type: 'complete',
          writes: [{ key: 'output', value: 'promoted' }],
        });
      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      await engine.init('parent');

      await engine.step();
      await engine.step();
      await engine.step();
      await engine.step();

      // result is promoted via returnMap, childLocal is not
      expect(engine.blackboard().get('result')).toBe('promoted');
      expect(engine.blackboard().get('childLocal')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 6. Recursive invocation
  // -------------------------------------------------------------------------

  describe('recursive invocation', () => {
    it('self-invoking workflow completes via run()', async () => {
      registry.register(recursiveWorkflow());

      let maxStackDepth = 0;
      const resolveFn = vi.fn().mockImplementation(async (ctx: DecisionContext) => {
        const depth = ctx.stack.length;
        if (depth > maxStackDepth) maxStackDepth = depth;

        if (ctx.node.id === 'RC_START') {
          // At depth >= 2: 'done' is visible via scoped read, guard already filtered
          if (ctx.blackboard.has('done')) {
            return { type: 'advance', edge: 'e-rc-start-end' };
          }
          if (depth >= 1) {
            // At depth 1: write 'done' so the next recursive sub-workflow
            // takes the RC_END path instead of recursing again
            return {
              type: 'advance',
              edge: 'e-rc-start-invoke',
              writes: [{ key: 'done', value: true }],
            };
          }
          // Depth 0: advance to RC_INVOKE (no write, 'done' absent)
          return { type: 'advance', edge: 'e-rc-start-invoke' };
        }

        if (ctx.node.id === 'RC_END') {
          return { type: 'complete' };
        }

        // RC_INVOKE after pop — advance to RC_END
        return { type: 'advance', edge: 'e-rc-invoke-end' };
      });

      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      await engine.init('recursive');

      const result = await engine.run();

      expect(result.status).toBe('completed');
    });

    it('stack reaches expected depth during recursion', async () => {
      registry.register(recursiveWorkflow());

      let maxStackDepth = 0;
      const resolveFn = vi.fn().mockImplementation(async (ctx: DecisionContext) => {
        const depth = ctx.stack.length;
        if (depth > maxStackDepth) maxStackDepth = depth;

        if (ctx.node.id === 'RC_START') {
          if (ctx.blackboard.has('done')) {
            return { type: 'advance', edge: 'e-rc-start-end' };
          }
          if (depth >= 1) {
            return {
              type: 'advance',
              edge: 'e-rc-start-invoke',
              writes: [{ key: 'done', value: true }],
            };
          }
          return { type: 'advance', edge: 'e-rc-start-invoke' };
        }

        if (ctx.node.id === 'RC_END') {
          return { type: 'complete' };
        }

        return { type: 'advance', edge: 'e-rc-invoke-end' };
      });

      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      await engine.init('recursive');
      await engine.run();

      // Depth 0 → invoke → depth 1 → invoke → depth 2 (sees 'done', goes to RC_END)
      expect(maxStackDepth).toBe(2);
    });

    it('agent is called the expected number of times', async () => {
      registry.register(recursiveWorkflow());

      const resolveFn = vi.fn().mockImplementation(async (ctx: DecisionContext) => {
        const depth = ctx.stack.length;

        if (ctx.node.id === 'RC_START') {
          if (ctx.blackboard.has('done')) {
            return { type: 'advance', edge: 'e-rc-start-end' };
          }
          if (depth >= 1) {
            return {
              type: 'advance',
              edge: 'e-rc-start-invoke',
              writes: [{ key: 'done', value: true }],
            };
          }
          return { type: 'advance', edge: 'e-rc-start-invoke' };
        }

        if (ctx.node.id === 'RC_END') {
          return { type: 'complete' };
        }

        return { type: 'advance', edge: 'e-rc-invoke-end' };
      });

      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      await engine.init('recursive');
      await engine.run();

      // Calls:
      // 1. RC_START depth 0 → advance to RC_INVOKE (invocation auto)
      // 2. RC_START depth 1 → advance to RC_INVOKE with writes (invocation auto)
      // 3. RC_START depth 2 → advance to RC_END (sees 'done')
      // 4. RC_END depth 2 → complete (pop to depth 1)
      // 5. RC_INVOKE depth 1 → advance to RC_END
      // 6. RC_END depth 1 → complete (pop to depth 0)
      // 7. RC_INVOKE depth 0 → advance to RC_END
      // 8. RC_END depth 0 → complete (done)
      expect(resolveFn).toHaveBeenCalledTimes(8);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Stack depth > 2 — scoped reads across full chain
  // -------------------------------------------------------------------------

  describe('stack depth > 2', () => {
    it('grandparent value is readable at child depth', async () => {
      registry.register(grandparentWorkflow());
      registry.register(middleWorkflow());
      registry.register(deepWorkflow());

      let capturedContext: DecisionContext | null = null;
      const resolveFn = vi.fn()
        // GP_INIT → GP_INVOKE (writes gp_value)
        .mockResolvedValueOnce({
          type: 'advance',
          edge: 'e-gp-init-invoke',
          writes: [{ key: 'gp_value', value: 'from_grandparent' }],
        })
        // MID_INIT → MID_INVOKE (writes mid_value)
        .mockResolvedValueOnce({
          type: 'advance',
          edge: 'e-mid-init-invoke',
          writes: [{ key: 'mid_value', value: 'from_middle' }],
        })
        // DEEP_INIT — capture context
        .mockImplementationOnce(async (ctx: DecisionContext) => {
          capturedContext = ctx;
          return { type: 'advance', edge: 'e-deep-init-end' };
        })
        // DEEP_END → complete
        .mockResolvedValueOnce({ type: 'complete' })
        // MID_INVOKE → MID_END (after pop from deep)
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-mid-invoke-end' })
        // MID_END → complete
        .mockResolvedValueOnce({ type: 'complete' })
        // GP_INVOKE → GP_END (after pop from mid)
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-gp-invoke-end' })
        // GP_END → complete
        .mockResolvedValueOnce({ type: 'complete' });

      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      await engine.init('gp-workflow');

      await engine.run();

      expect(capturedContext).not.toBeNull();
      expect(capturedContext!.blackboard.get('gp_value')).toBe('from_grandparent');
      expect(capturedContext!.blackboard.get('mid_value')).toBe('from_middle');
    });

    it('child local() is empty when only ancestors have written', async () => {
      registry.register(grandparentWorkflow());
      registry.register(middleWorkflow());
      registry.register(deepWorkflow());

      let capturedContext: DecisionContext | null = null;
      const resolveFn = vi.fn()
        .mockResolvedValueOnce({
          type: 'advance',
          edge: 'e-gp-init-invoke',
          writes: [{ key: 'gp_value', value: 'from_grandparent' }],
        })
        .mockResolvedValueOnce({
          type: 'advance',
          edge: 'e-mid-init-invoke',
          writes: [{ key: 'mid_value', value: 'from_middle' }],
        })
        .mockImplementationOnce(async (ctx: DecisionContext) => {
          capturedContext = ctx;
          return { type: 'advance', edge: 'e-deep-init-end' };
        })
        .mockResolvedValueOnce({ type: 'complete' })
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-mid-invoke-end' })
        .mockResolvedValueOnce({ type: 'complete' })
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-gp-invoke-end' })
        .mockResolvedValueOnce({ type: 'complete' });

      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      await engine.init('gp-workflow');
      await engine.run();

      expect(capturedContext!.blackboard.local()).toHaveLength(0);
    });

    it('stack has depth 2 at deepest point', async () => {
      registry.register(grandparentWorkflow());
      registry.register(middleWorkflow());
      registry.register(deepWorkflow());

      let capturedContext: DecisionContext | null = null;
      const resolveFn = vi.fn()
        .mockResolvedValueOnce({
          type: 'advance',
          edge: 'e-gp-init-invoke',
          writes: [{ key: 'gp_value', value: 'from_grandparent' }],
        })
        .mockResolvedValueOnce({
          type: 'advance',
          edge: 'e-mid-init-invoke',
          writes: [{ key: 'mid_value', value: 'from_middle' }],
        })
        .mockImplementationOnce(async (ctx: DecisionContext) => {
          capturedContext = ctx;
          return { type: 'advance', edge: 'e-deep-init-end' };
        })
        .mockResolvedValueOnce({ type: 'complete' })
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-mid-invoke-end' })
        .mockResolvedValueOnce({ type: 'complete' })
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-gp-invoke-end' })
        .mockResolvedValueOnce({ type: 'complete' });

      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      await engine.init('gp-workflow');
      await engine.run();

      expect(capturedContext!.stack).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // 8. ReturnMap — missing child key
  // -------------------------------------------------------------------------

  describe('returnMap — missing child key', () => {
    it('pop succeeds when child never writes the mapped key', async () => {
      registry.register(missingKeyParentWorkflow());
      registry.register(childWorkflow());

      const resolveFn = vi.fn()
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-setup-invoke' })
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-child-a-end' })
        .mockResolvedValueOnce({ type: 'complete' }); // child completes without writing 'nonexistent'
      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      await engine.init('missing-parent');

      await engine.step();
      await engine.step();
      await engine.step();
      const result = await engine.step();

      expect(result.status).toBe('popped');
    });

    it('parent blackboard has no entry for the unmapped key', async () => {
      registry.register(missingKeyParentWorkflow());
      registry.register(childWorkflow());

      const resolveFn = vi.fn()
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-setup-invoke' })
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-child-a-end' })
        .mockResolvedValueOnce({ type: 'complete' });
      const engine = new ReflexEngine(registry, makeAgent(resolveFn));
      await engine.init('missing-parent');

      await engine.step();
      await engine.step();
      await engine.step();
      await engine.step();

      expect(engine.blackboard().get('result')).toBeUndefined();
      expect(engine.blackboard().has('result')).toBe(false);
    });

    it('no engine:error emitted and engine continues to completion', async () => {
      registry.register(missingKeyParentWorkflow());
      registry.register(childWorkflow());

      const resolveFn = vi.fn()
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-setup-invoke' })
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-child-a-end' })
        .mockResolvedValueOnce({ type: 'complete' })
        // After pop, at INVOKE_MISSING → advance to END
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-invoke-end' })
        // At END → complete
        .mockResolvedValueOnce({ type: 'complete' });
      const engine = new ReflexEngine(registry, makeAgent(resolveFn));

      const errors: unknown[] = [];
      engine.on('engine:error', (p) => errors.push(p));
      await engine.init('missing-parent');

      await engine.step();
      await engine.step();
      await engine.step();
      await engine.step(); // pop
      await engine.step(); // advance to END
      const result = await engine.step(); // complete

      expect(errors).toHaveLength(0);
      expect(result.status).toBe('completed');
    });
  });

  // -------------------------------------------------------------------------
  // 9. Event ordering — push and pop
  // -------------------------------------------------------------------------

  describe('event ordering — push and pop', () => {
    it('invocation step emits workflow:push then node:enter', async () => {
      registry.register(parentWorkflow());
      registry.register(childWorkflow());

      const resolveFn = vi.fn()
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-setup-invoke' });
      const engine = new ReflexEngine(registry, makeAgent(resolveFn));

      const events: string[] = [];
      const tracked: EngineEvent[] = ['workflow:push', 'node:enter'];
      for (const evt of tracked) {
        engine.on(evt, () => events.push(evt));
      }

      await engine.init('parent');
      await engine.step(); // advance (emits node:enter for INVOKE_CHILD)

      // Clear events from the advance step
      events.length = 0;

      await engine.step(); // invocation step

      expect(events).toEqual(['workflow:push', 'node:enter']);
    });

    it('pop step emits workflow:pop then node:enter', async () => {
      registry.register(parentWorkflow());
      registry.register(childWorkflow());

      const resolveFn = vi.fn()
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-setup-invoke' })
        .mockResolvedValueOnce({ type: 'advance', edge: 'e-child-a-end' })
        .mockResolvedValueOnce({
          type: 'complete',
          writes: [{ key: 'output', value: 'val' }],
        });
      const engine = new ReflexEngine(registry, makeAgent(resolveFn));

      const events: string[] = [];
      const tracked: EngineEvent[] = [
        'blackboard:write',
        'workflow:pop',
        'node:enter',
      ];
      for (const evt of tracked) {
        engine.on(evt, () => events.push(evt));
      }

      await engine.init('parent');
      await engine.step(); // advance
      await engine.step(); // invocation

      // Clear events from prior steps
      events.length = 0;

      await engine.step(); // child advance
      events.length = 0;   // clear child advance events

      await engine.step(); // complete → pop

      // Pop emits: blackboard:write (child complete writes) + blackboard:write (returnMap) + workflow:pop + node:enter
      // The child's complete writes happen BEFORE the pop; returnMap writes during pop
      // Order: blackboard:write (returnMap) → workflow:pop → node:enter
      expect(events).toContain('workflow:pop');
      expect(events).toContain('node:enter');

      const popIdx = events.indexOf('workflow:pop');
      const enterIdx = events.lastIndexOf('node:enter');
      expect(popIdx).toBeLessThan(enterIdx);
    });
  });
});
