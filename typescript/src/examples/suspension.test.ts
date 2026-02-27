import { describe, it, expect, beforeEach } from 'vitest';
import { ReflexEngine } from '../engine';
import { WorkflowRegistry } from '../registry';
import {
  Workflow,
  DecisionAgent,
  DecisionContext,
  Decision,
  BlackboardWrite,
  EngineEvent,
} from '../types';

// ---------------------------------------------------------------------------
// SuspendingAgent — configurable test agent for suspension round-trips
// ---------------------------------------------------------------------------

/**
 * A decision agent that can be armed to suspend at specific nodes, then
 * resume with externally-injected blackboard writes.
 *
 * Usage:
 *   agent.suspendAt('GATHER')        — first visit suspends
 *   agent.inject('GATHER', writes)   — arm with writes; next step() resumes
 *   agent.writesAt('INIT', writes)   — static writes for non-suspension nodes
 */
class SuspendingAgent implements DecisionAgent {
  // null = "should suspend"; BlackboardWrite[] = "resume with these writes"
  private _suspensions = new Map<string, BlackboardWrite[] | null>();
  private _writes = new Map<string, BlackboardWrite[]>();

  suspendAt(nodeId: string): void {
    this._suspensions.set(nodeId, null);
  }

  inject(nodeId: string, writes: BlackboardWrite[]): void {
    this._suspensions.set(nodeId, writes);
  }

  writesAt(nodeId: string, writes: BlackboardWrite[]): void {
    this._writes.set(nodeId, writes);
  }

  async resolve(context: DecisionContext): Promise<Decision> {
    const nodeId = context.node.id;

    if (this._suspensions.has(nodeId)) {
      const pending = this._suspensions.get(nodeId);
      if (pending === null) {
        return { type: 'suspend', reason: `awaiting-input-at-${nodeId}` };
      }
      this._suspensions.delete(nodeId);
      if (context.validEdges.length === 0) {
        return { type: 'complete', writes: pending };
      }
      return { type: 'advance', edge: context.validEdges[0].id, writes: pending };
    }

    const writes = this._writes.get(nodeId);
    if (context.validEdges.length === 0) {
      return { type: 'complete', writes };
    }
    return { type: 'advance', edge: context.validEdges[0].id, writes };
  }
}

// ---------------------------------------------------------------------------
// Workflow fixtures
// ---------------------------------------------------------------------------

/** Simple 4-node linear workflow: INIT → GATHER → PROCESS → DONE */
function simpleWorkflow(): Workflow {
  return {
    id: 'suspension-test',
    entry: 'INIT',
    nodes: {
      INIT: { id: 'INIT', spec: {} },
      GATHER: { id: 'GATHER', spec: {} },
      PROCESS: { id: 'PROCESS', spec: {} },
      DONE: { id: 'DONE', spec: {} },
    },
    edges: [
      { id: 'e-init-gather', from: 'INIT', to: 'GATHER', event: 'NEXT' },
      { id: 'e-gather-process', from: 'GATHER', to: 'PROCESS', event: 'NEXT' },
      { id: 'e-process-done', from: 'PROCESS', to: 'DONE', event: 'NEXT' },
    ],
  };
}

/** Two suspension points: INIT → WAIT_A → WAIT_B → DONE */
function multiSuspensionWorkflow(): Workflow {
  return {
    id: 'multi-suspension-test',
    entry: 'INIT',
    nodes: {
      INIT: { id: 'INIT', spec: {} },
      WAIT_A: { id: 'WAIT_A', spec: {} },
      WAIT_B: { id: 'WAIT_B', spec: {} },
      DONE: { id: 'DONE', spec: {} },
    },
    edges: [
      { id: 'e-init-a', from: 'INIT', to: 'WAIT_A', event: 'NEXT' },
      { id: 'e-a-b', from: 'WAIT_A', to: 'WAIT_B', event: 'NEXT' },
      { id: 'e-b-done', from: 'WAIT_B', to: 'DONE', event: 'NEXT' },
    ],
  };
}

/** Sub-workflow that suspends mid-way: CHILD_START → CHILD_WAIT → CHILD_DONE */
function childWorkflow(): Workflow {
  return {
    id: 'child-with-suspension',
    entry: 'CHILD_START',
    nodes: {
      CHILD_START: { id: 'CHILD_START', spec: {} },
      CHILD_WAIT: { id: 'CHILD_WAIT', spec: {} },
      CHILD_DONE: { id: 'CHILD_DONE', spec: {} },
    },
    edges: [
      { id: 'e-cs-cw', from: 'CHILD_START', to: 'CHILD_WAIT', event: 'NEXT' },
      { id: 'e-cw-cd', from: 'CHILD_WAIT', to: 'CHILD_DONE', event: 'NEXT' },
    ],
  };
}

/** Parent that invokes child: P_START → P_INVOKE(child) → P_DONE */
function parentWorkflow(): Workflow {
  return {
    id: 'parent-with-child-suspension',
    entry: 'P_START',
    nodes: {
      P_START: { id: 'P_START', spec: {} },
      P_INVOKE: {
        id: 'P_INVOKE',
        spec: {},
        invokes: {
          workflowId: 'child-with-suspension',
          returnMap: [{ parentKey: 'childResult', childKey: 'injectedValue' }],
        },
      },
      P_DONE: { id: 'P_DONE', spec: {} },
    },
    edges: [
      { id: 'e-ps-pi', from: 'P_START', to: 'P_INVOKE', event: 'NEXT' },
      { id: 'e-pi-pd', from: 'P_INVOKE', to: 'P_DONE', event: 'NEXT' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_EVENTS: EngineEvent[] = [
  'node:enter', 'node:exit', 'edge:traverse',
  'workflow:push', 'workflow:pop',
  'blackboard:write', 'engine:complete',
  'engine:suspend', 'engine:error',
];

function collectEvents(engine: ReflexEngine): string[] {
  const events: string[] = [];
  for (const event of ALL_EVENTS) {
    engine.on(event, () => events.push(event));
  }
  return events;
}

// ---------------------------------------------------------------------------
// Simple workflow — basic suspend/resume round-trip
// ---------------------------------------------------------------------------

describe('Suspension round-trip — simple workflow', () => {
  let engine: ReflexEngine;
  let agent: SuspendingAgent;

  beforeEach(async () => {
    agent = new SuspendingAgent();
    agent.writesAt('INIT', [{ key: 'phase', value: 'init' }]);
    agent.suspendAt('GATHER');
    agent.writesAt('PROCESS', [{ key: 'processed', value: true }]);
    agent.writesAt('DONE', [{ key: 'status', value: 'done' }]);

    const registry = new WorkflowRegistry();
    registry.register(simpleWorkflow());
    engine = new ReflexEngine(registry, agent);
    await engine.init('suspension-test');
  });

  it('engine suspends with correct status and reason', async () => {
    await engine.step(); // INIT → GATHER
    const result = await engine.step(); // GATHER suspends

    expect(result).toMatchObject({
      status: 'suspended',
      reason: 'awaiting-input-at-GATHER',
    });
    expect(engine.status()).toBe('suspended');
    expect(engine.currentNode()!.id).toBe('GATHER');
  });

  it('blackboard is not mutated by suspend', async () => {
    await engine.step(); // INIT → GATHER (writes phase)
    const entriesBefore = engine.blackboard().entries().length;

    await engine.step(); // GATHER suspends — no writes

    expect(engine.blackboard().entries().length).toBe(entriesBefore);
    expect(engine.blackboard().has('humanAnswer')).toBe(false);
  });

  it('step() after inject() advances with injected writes', async () => {
    await engine.step(); // INIT → GATHER
    await engine.step(); // GATHER suspends

    agent.inject('GATHER', [{ key: 'humanAnswer', value: 42 }]);
    const result = await engine.step(); // GATHER → PROCESS

    expect(result).toMatchObject({ status: 'advanced', node: { id: 'PROCESS' } });
    expect(engine.blackboard().get('humanAnswer')).toBe(42);
    expect(engine.status()).toBe('running');
  });

  it('engine completes after resume with correct final state', async () => {
    await engine.step(); // INIT → GATHER
    await engine.step(); // GATHER suspends

    agent.inject('GATHER', [{ key: 'humanAnswer', value: 42 }]);
    await engine.step(); // GATHER → PROCESS
    await engine.step(); // PROCESS → DONE
    const result = await engine.step(); // DONE completes

    expect(result).toMatchObject({ status: 'completed' });
    expect(engine.blackboard().get('phase')).toBe('init');
    expect(engine.blackboard().get('humanAnswer')).toBe(42);
    expect(engine.blackboard().get('processed')).toBe(true);
    expect(engine.blackboard().get('status')).toBe('done');
  });
});

// ---------------------------------------------------------------------------
// Event trace — verify engine:suspend appears in deterministic sequence
// ---------------------------------------------------------------------------

describe('Suspension event trace', () => {
  it('full event sequence includes engine:suspend at correct position', async () => {
    const agent = new SuspendingAgent();
    agent.writesAt('INIT', [{ key: 'phase', value: 'init' }]);
    agent.suspendAt('GATHER');
    agent.writesAt('PROCESS', [{ key: 'processed', value: true }]);
    agent.writesAt('DONE', [{ key: 'status', value: 'done' }]);

    const registry = new WorkflowRegistry();
    registry.register(simpleWorkflow());
    const engine = new ReflexEngine(registry, agent);
    await engine.init('suspension-test');

    const events = collectEvents(engine);

    await engine.step(); // INIT → GATHER
    await engine.step(); // GATHER suspends
    agent.inject('GATHER', [{ key: 'humanAnswer', value: 42 }]);
    await engine.step(); // GATHER → PROCESS
    await engine.step(); // PROCESS → DONE
    await engine.step(); // DONE completes

    expect(events).toEqual([
      // INIT → GATHER
      'node:exit', 'edge:traverse', 'blackboard:write', 'node:enter',
      // GATHER suspends
      'engine:suspend',
      // GATHER → PROCESS (after inject)
      'node:exit', 'edge:traverse', 'blackboard:write', 'node:enter',
      // PROCESS → DONE
      'node:exit', 'edge:traverse', 'blackboard:write', 'node:enter',
      // DONE completes
      'blackboard:write', 'engine:complete',
    ]);
  });

  it('engine:suspend fires exactly once per suspension', async () => {
    const agent = new SuspendingAgent();
    agent.suspendAt('GATHER');

    const registry = new WorkflowRegistry();
    registry.register(simpleWorkflow());
    const engine = new ReflexEngine(registry, agent);
    await engine.init('suspension-test');

    const events = collectEvents(engine);

    await engine.step(); // INIT → GATHER
    await engine.step(); // GATHER suspends
    agent.inject('GATHER', [{ key: 'humanAnswer', value: 42 }]);
    await engine.step(); // GATHER → PROCESS
    await engine.step(); // PROCESS → DONE
    await engine.step(); // DONE completes

    expect(events.filter((e) => e === 'engine:suspend')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Multiple suspensions — two distinct pause points in one session
// ---------------------------------------------------------------------------

describe('Multiple suspensions in one session', () => {
  it('two suspensions with two injections, both values on blackboard', async () => {
    const agent = new SuspendingAgent();
    agent.writesAt('INIT', [{ key: 'phase', value: 'init' }]);
    agent.suspendAt('WAIT_A');
    agent.suspendAt('WAIT_B');
    agent.writesAt('DONE', [{ key: 'status', value: 'done' }]);

    const registry = new WorkflowRegistry();
    registry.register(multiSuspensionWorkflow());
    const engine = new ReflexEngine(registry, agent);
    await engine.init('multi-suspension-test');

    // First suspension at WAIT_A
    await engine.step(); // INIT → WAIT_A
    const r1 = await engine.step();
    expect(r1).toMatchObject({ status: 'suspended', reason: 'awaiting-input-at-WAIT_A' });

    agent.inject('WAIT_A', [{ key: 'answerA', value: 'alpha' }]);
    await engine.step(); // WAIT_A → WAIT_B

    // Second suspension at WAIT_B
    const r2 = await engine.step();
    expect(r2).toMatchObject({ status: 'suspended', reason: 'awaiting-input-at-WAIT_B' });

    agent.inject('WAIT_B', [{ key: 'answerB', value: 'beta' }]);
    await engine.step(); // WAIT_B → DONE
    await engine.step(); // DONE completes

    expect(engine.blackboard().get('answerA')).toBe('alpha');
    expect(engine.blackboard().get('answerB')).toBe('beta');
    expect(engine.blackboard().get('status')).toBe('done');
  });
});

// ---------------------------------------------------------------------------
// Sub-workflow suspension — child suspends, parent engine suspends too
// ---------------------------------------------------------------------------

describe('Suspension inside sub-workflow', () => {
  let engine: ReflexEngine;
  let agent: SuspendingAgent;

  beforeEach(async () => {
    agent = new SuspendingAgent();
    agent.writesAt('P_START', [{ key: 'parentPhase', value: 'started' }]);
    agent.writesAt('CHILD_START', [{ key: 'childPhase', value: 'started' }]);
    agent.suspendAt('CHILD_WAIT');
    agent.writesAt('CHILD_DONE', [{ key: 'childStatus', value: 'done' }]);
    agent.writesAt('P_DONE', [{ key: 'parentStatus', value: 'done' }]);

    const registry = new WorkflowRegistry();
    registry.register(childWorkflow());
    registry.register(parentWorkflow());
    engine = new ReflexEngine(registry, agent);
    await engine.init('parent-with-child-suspension');
  });

  it('sub-workflow suspension suspends parent engine, stack depth 1', async () => {
    await engine.step(); // P_START → P_INVOKE
    await engine.step(); // P_INVOKE invokes → CHILD_START
    await engine.step(); // CHILD_START → CHILD_WAIT
    const result = await engine.step(); // CHILD_WAIT suspends

    expect(result).toMatchObject({
      status: 'suspended',
      reason: 'awaiting-input-at-CHILD_WAIT',
    });
    expect(engine.status()).toBe('suspended');
    expect(engine.stack()).toHaveLength(1);
    expect(engine.currentNode()!.id).toBe('CHILD_WAIT');
  });

  it('resume completes sub-workflow and returnMap propagates injected value', async () => {
    await engine.step(); // P_START → P_INVOKE
    await engine.step(); // invoke → CHILD_START
    await engine.step(); // CHILD_START → CHILD_WAIT
    await engine.step(); // CHILD_WAIT suspends

    agent.inject('CHILD_WAIT', [{ key: 'injectedValue', value: 'human-data' }]);
    await engine.step(); // CHILD_WAIT → CHILD_DONE
    await engine.step(); // CHILD_DONE complete → pop → P_INVOKE
    await engine.step(); // P_INVOKE → P_DONE
    const result = await engine.step(); // P_DONE completes

    expect(result).toMatchObject({ status: 'completed' });
    expect(engine.blackboard().get('childResult')).toBe('human-data');
    expect(engine.blackboard().get('parentPhase')).toBe('started');
    expect(engine.blackboard().get('parentStatus')).toBe('done');
    // Child-local values gone after pop
    expect(engine.blackboard().has('childPhase')).toBe(false);
    expect(engine.blackboard().has('injectedValue')).toBe(false);
  });

  it('event trace includes workflow:push, engine:suspend, workflow:pop in order', async () => {
    const events = collectEvents(engine);

    await engine.step(); // P_START → P_INVOKE
    await engine.step(); // invoke
    await engine.step(); // CHILD_START → CHILD_WAIT
    await engine.step(); // suspend
    agent.inject('CHILD_WAIT', [{ key: 'injectedValue', value: 'human-data' }]);
    await engine.step(); // resume → CHILD_DONE
    await engine.step(); // complete + pop
    await engine.step(); // P_INVOKE → P_DONE
    await engine.step(); // complete

    expect(events).toContain('workflow:push');
    expect(events).toContain('engine:suspend');
    expect(events).toContain('workflow:pop');
    expect(events).toContain('engine:complete');

    const pushIdx = events.indexOf('workflow:push');
    const suspendIdx = events.indexOf('engine:suspend');
    const popIdx = events.indexOf('workflow:pop');
    const completeIdx = events.indexOf('engine:complete');

    expect(pushIdx).toBeLessThan(suspendIdx);
    expect(suspendIdx).toBeLessThan(popIdx);
    expect(popIdx).toBeLessThan(completeIdx);
  });
});
