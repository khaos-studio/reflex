import { describe, it, expect, beforeEach } from 'vitest';
import { RuleAgent, RuleSpec, createRuleAgent } from './rule-agent';
import { ReflexEngine } from '../engine';
import { WorkflowRegistry } from '../registry';
import {
  DecisionContext,
  Workflow,
  Node,
  Edge,
  BlackboardReader,
  StackFrame,
} from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal DecisionContext for unit-testing the agent in isolation. */
function makeContext(
  spec: RuleSpec,
  validEdges: Edge[] = [],
  nodeId = 'TEST',
): DecisionContext {
  const node: Node = { id: nodeId, spec };
  const workflow: Workflow = {
    id: 'test-wf',
    entry: nodeId,
    nodes: { [nodeId]: node },
    edges: [],
  };
  const blackboard: BlackboardReader = {
    get: () => undefined,
    has: () => false,
    getAll: () => [],
    entries: () => [],
    keys: () => [],
    local: () => [],
  };
  return {
    workflow,
    node,
    blackboard,
    validEdges,
    stack: [] as ReadonlyArray<StackFrame>,
  };
}

/** Create a minimal edge. */
function edge(id: string, from = 'A', to = 'B'): Edge {
  return { id, from, to, event: 'NEXT' };
}

/** Create a node with a RuleSpec. */
function ruleNode(id: string, spec: RuleSpec): Node {
  return { id, spec };
}

// ---------------------------------------------------------------------------
// Unit Tests — Agent in isolation
// ---------------------------------------------------------------------------

describe('RuleAgent', () => {
  let agent: RuleAgent;

  beforeEach(() => {
    agent = createRuleAgent();
  });

  // -------------------------------------------------------------------------
  // Advance decisions
  // -------------------------------------------------------------------------

  describe('advance decisions', () => {
    it('returns advance with specified edge and writes', async () => {
      const spec: RuleSpec = {
        writes: [{ key: 'color', value: 'blue' }],
        edge: 'e-next',
      };
      const ctx = makeContext(spec, [edge('e-next')]);

      const decision = await agent.resolve(ctx);

      expect(decision).toEqual({
        type: 'advance',
        edge: 'e-next',
        writes: [{ key: 'color', value: 'blue' }],
      });
    });

    it('returns advance with no writes when spec omits writes', async () => {
      const spec: RuleSpec = { edge: 'e-next' };
      const ctx = makeContext(spec, [edge('e-next')]);

      const decision = await agent.resolve(ctx);

      expect(decision).toEqual({
        type: 'advance',
        edge: 'e-next',
        writes: undefined,
      });
    });

    it('falls back to single valid edge when spec omits edge', async () => {
      const spec: RuleSpec = { writes: [{ key: 'x', value: 1 }] };
      const ctx = makeContext(spec, [edge('e-only')]);

      const decision = await agent.resolve(ctx);

      expect(decision).toEqual({
        type: 'advance',
        edge: 'e-only',
        writes: [{ key: 'x', value: 1 }],
      });
    });
  });

  // -------------------------------------------------------------------------
  // Suspend decisions
  // -------------------------------------------------------------------------

  describe('suspend decisions', () => {
    it('returns suspend with reason from spec', async () => {
      const spec: RuleSpec = { suspend: 'awaiting-human-input' };
      const ctx = makeContext(spec);

      const decision = await agent.resolve(ctx);

      expect(decision).toEqual({
        type: 'suspend',
        reason: 'awaiting-human-input',
      });
    });

    it('suspend takes priority over edge and writes', async () => {
      const spec: RuleSpec = {
        suspend: 'paused',
        edge: 'e-next',
        writes: [{ key: 'a', value: 1 }],
      };
      const ctx = makeContext(spec, [edge('e-next')]);

      const decision = await agent.resolve(ctx);

      expect(decision.type).toBe('suspend');
    });
  });

  // -------------------------------------------------------------------------
  // Complete decisions
  // -------------------------------------------------------------------------

  describe('complete decisions', () => {
    it('returns complete with writes from spec', async () => {
      const spec: RuleSpec = {
        complete: true,
        writes: [{ key: 'result', value: 'done' }],
      };
      const ctx = makeContext(spec);

      const decision = await agent.resolve(ctx);

      expect(decision).toEqual({
        type: 'complete',
        writes: [{ key: 'result', value: 'done' }],
      });
    });

    it('returns complete with no writes', async () => {
      const spec: RuleSpec = { complete: true };
      const ctx = makeContext(spec);

      const decision = await agent.resolve(ctx);

      expect(decision).toEqual({ type: 'complete', writes: undefined });
    });
  });

  // -------------------------------------------------------------------------
  // Edge resolution
  // -------------------------------------------------------------------------

  describe('edge resolution', () => {
    it('uses string edge directly', async () => {
      const spec: RuleSpec = { edge: 'e-target' };
      const ctx = makeContext(spec, [edge('e-target')]);

      const decision = await agent.resolve(ctx);

      expect(decision.type).toBe('advance');
      if (decision.type === 'advance') {
        expect(decision.edge).toBe('e-target');
      }
    });

    it('picks first candidate from priority list that is in validEdges', async () => {
      const spec: RuleSpec = { edge: ['e-preferred', 'e-fallback'] };
      const ctx = makeContext(spec, [
        edge('e-preferred'),
        edge('e-fallback'),
      ]);

      const decision = await agent.resolve(ctx);

      if (decision.type === 'advance') {
        expect(decision.edge).toBe('e-preferred');
      }
    });

    it('skips first candidate when not in validEdges, picks second', async () => {
      const spec: RuleSpec = { edge: ['e-guarded-out', 'e-fallback'] };
      // Only e-fallback survives guard evaluation
      const ctx = makeContext(spec, [edge('e-fallback')]);

      const decision = await agent.resolve(ctx);

      if (decision.type === 'advance') {
        expect(decision.edge).toBe('e-fallback');
      }
    });

    it('returns first candidate when none match validEdges (honest failure)', async () => {
      const spec: RuleSpec = { edge: ['e-a', 'e-b'] };
      const ctx = makeContext(spec, [edge('e-unrelated')]);

      const decision = await agent.resolve(ctx);

      if (decision.type === 'advance') {
        // Agent returns its first candidate; engine will reject it
        expect(decision.edge).toBe('e-a');
      }
    });

    it('returns empty string when no edge specified and multiple valid edges', async () => {
      const spec: RuleSpec = {};
      const ctx = makeContext(spec, [edge('e-a'), edge('e-b')]);

      const decision = await agent.resolve(ctx);

      if (decision.type === 'advance') {
        expect(decision.edge).toBe('');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Smoke tests — real engine
  // -------------------------------------------------------------------------

  describe('smoke test — real engine', () => {
    it('runs a linear 3-node workflow to completion', async () => {
      const workflow: Workflow = {
        id: 'linear',
        entry: 'START',
        nodes: {
          START: ruleNode('START', {
            writes: [{ key: 'subject', value: 'world' }],
            edge: 'e-start-mid',
          }),
          MID: ruleNode('MID', {
            writes: [{ key: 'greeting', value: 'Hello, world!' }],
            edge: 'e-mid-end',
          }),
          END: ruleNode('END', {
            complete: true,
            writes: [{ key: 'status', value: 'finished' }],
          }),
        },
        edges: [
          { id: 'e-start-mid', from: 'START', to: 'MID', event: 'NEXT' },
          { id: 'e-mid-end', from: 'MID', to: 'END', event: 'NEXT' },
        ],
      };

      const registry = new WorkflowRegistry();
      registry.register(workflow);
      const engine = new ReflexEngine(registry, agent);
      await engine.init('linear');

      const result = await engine.run();

      expect(result.status).toBe('completed');
      expect(engine.blackboard().get('subject')).toBe('world');
      expect(engine.blackboard().get('greeting')).toBe('Hello, world!');
      expect(engine.blackboard().get('status')).toBe('finished');
    });

    it('handles guard-driven fan-out with priority-list edge', async () => {
      const workflow: Workflow = {
        id: 'fanout',
        entry: 'SETUP',
        nodes: {
          SETUP: ruleNode('SETUP', {
            writes: [{ key: 'route', value: 'A' }],
            edge: 'e-setup-decide',
          }),
          DECIDE: ruleNode('DECIDE', {
            edge: ['e-path-a', 'e-path-b'],
          }),
          PATH_A: ruleNode('PATH_A', {
            writes: [{ key: 'chosen', value: 'A' }],
            edge: 'e-a-end',
          }),
          PATH_B: ruleNode('PATH_B', {
            writes: [{ key: 'chosen', value: 'B' }],
            edge: 'e-b-end',
          }),
          END: ruleNode('END', { complete: true }),
        },
        edges: [
          { id: 'e-setup-decide', from: 'SETUP', to: 'DECIDE', event: 'NEXT' },
          {
            id: 'e-path-a',
            from: 'DECIDE',
            to: 'PATH_A',
            event: 'TAKE_A',
            guard: { type: 'equals', key: 'route', value: 'A' },
          },
          {
            id: 'e-path-b',
            from: 'DECIDE',
            to: 'PATH_B',
            event: 'TAKE_B',
            guard: { type: 'equals', key: 'route', value: 'B' },
          },
          { id: 'e-a-end', from: 'PATH_A', to: 'END', event: 'DONE' },
          { id: 'e-b-end', from: 'PATH_B', to: 'END', event: 'DONE' },
        ],
      };

      const registry = new WorkflowRegistry();
      registry.register(workflow);
      const engine = new ReflexEngine(registry, agent);
      await engine.init('fanout');

      const result = await engine.run();

      expect(result.status).toBe('completed');
      expect(engine.blackboard().get('route')).toBe('A');
      expect(engine.blackboard().get('chosen')).toBe('A');
    });

    it('suspends when spec says suspend', async () => {
      const workflow: Workflow = {
        id: 'suspend-demo',
        entry: 'INIT',
        nodes: {
          INIT: ruleNode('INIT', { edge: 'e-init-wait' }),
          WAIT: ruleNode('WAIT', { suspend: 'awaiting-external-input' }),
          FINISH: ruleNode('FINISH', { complete: true }),
        },
        edges: [
          { id: 'e-init-wait', from: 'INIT', to: 'WAIT', event: 'NEXT' },
          { id: 'e-wait-finish', from: 'WAIT', to: 'FINISH', event: 'NEXT' },
        ],
      };

      const registry = new WorkflowRegistry();
      registry.register(workflow);
      const engine = new ReflexEngine(registry, agent);
      await engine.init('suspend-demo');

      const result = await engine.run();

      expect(result.status).toBe('suspended');
      if (result.status === 'suspended') {
        expect(result.reason).toBe('awaiting-external-input');
      }
      expect(engine.status()).toBe('suspended');
      expect(engine.currentNode()?.id).toBe('WAIT');
    });
  });
});
