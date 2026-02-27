import { describe, it, expect, beforeEach } from 'vitest';
import { ReflexEngine } from '../engine';
import { WorkflowRegistry } from '../registry';
import { createRuleAgent } from './rule-agent';
import {
  definePhysicalObjectWorkflow,
  definePartObjectWorkflow,
  registerPhysObjWorkflows,
} from './phys-obj-workflows';
import { Workflow, EngineEvent, StepResult } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Step the engine N times and return all results. */
async function stepN(engine: ReflexEngine, n: number): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for (let i = 0; i < n; i++) {
    results.push(await engine.step());
  }
  return results;
}

/** All engine event types — subscribe to everything. */
const ALL_EVENTS: EngineEvent[] = [
  'node:enter',
  'node:exit',
  'edge:traverse',
  'workflow:push',
  'workflow:pop',
  'blackboard:write',
  'engine:complete',
  'engine:suspend',
  'engine:error',
];

/** Subscribe to all events and accumulate into a returned array. */
function collectEvents(engine: ReflexEngine): string[] {
  const events: string[] = [];
  for (const event of ALL_EVENTS) {
    engine.on(event, () => events.push(event));
  }
  return events;
}

/** Create a no-part variant by removing needsPart from BASIC_DATA writes. */
function makeNoPartWorkflow(): Workflow {
  return {
    ...definePhysicalObjectWorkflow,
    id: 'define-physical-object-no-part',
    nodes: {
      ...definePhysicalObjectWorkflow.nodes,
      BASIC_DATA: {
        ...definePhysicalObjectWorkflow.nodes['BASIC_DATA'],
        spec: {
          writes: [{ key: 'conceptName', value: 'Steel Pipe' }],
          edge: 'e-basic-branch',
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// With-part path (full invocation lifecycle)
// ---------------------------------------------------------------------------

describe('End-to-end: define-physical-object (with part)', () => {
  let engine: ReflexEngine;

  beforeEach(async () => {
    const registry = new WorkflowRegistry();
    registerPhysObjWorkflows(registry);
    engine = new ReflexEngine(registry, createRuleAgent());
    await engine.init('define-physical-object');
  });

  it('produces correct StepResult sequence across all 10 steps', async () => {
    const results = await stepN(engine, 10);

    // Step 1: CLASSIFY → BASIC_DATA
    expect(results[0]).toMatchObject({ status: 'advanced', node: { id: 'BASIC_DATA' } });
    // Step 2: BASIC_DATA → BRANCH
    expect(results[1]).toMatchObject({ status: 'advanced', node: { id: 'BRANCH' } });
    // Step 3: BRANCH → DEFINE_PART (guard selects e-branch-to-part)
    expect(results[2]).toMatchObject({ status: 'advanced', node: { id: 'DEFINE_PART' } });
    // Step 4: DEFINE_PART invokes define-part-object
    expect(results[3]).toMatchObject({
      status: 'invoked',
      workflow: { id: 'define-part-object' },
      node: { id: 'PART_CLASSIFY' },
    });
    // Step 5: PART_CLASSIFY → PART_BASIC_DATA
    expect(results[4]).toMatchObject({ status: 'advanced', node: { id: 'PART_BASIC_DATA' } });
    // Step 6: PART_BASIC_DATA → PART_DONE
    expect(results[5]).toMatchObject({ status: 'advanced', node: { id: 'PART_DONE' } });
    // Step 7: PART_DONE completes → pop → DEFINE_PART (parent)
    expect(results[6]).toMatchObject({
      status: 'popped',
      workflow: { id: 'define-physical-object' },
      node: { id: 'DEFINE_PART' },
    });
    // Step 8: DEFINE_PART → SPEC_COMPOSE (post-pop, single-edge fallback)
    expect(results[7]).toMatchObject({ status: 'advanced', node: { id: 'SPEC_COMPOSE' } });
    // Step 9: SPEC_COMPOSE → DONE
    expect(results[8]).toMatchObject({ status: 'advanced', node: { id: 'DONE' } });
    // Step 10: DONE completes → session terminates
    expect(results[9]).toMatchObject({ status: 'completed' });
  });

  it('blackboard state progresses correctly at each step', async () => {
    const bb = () => engine.blackboard();

    // Step 1: workflowType written
    await engine.step();
    expect(bb().get('workflowType')).toBe('define-physical-object');
    expect(bb().has('conceptName')).toBe(false);

    // Step 2: conceptName + needsPart written
    await engine.step();
    expect(bb().get('conceptName')).toBe('Steel Pipe');
    expect(bb().get('needsPart')).toBe(true);

    // Step 3: BRANCH writes nothing — values unchanged
    await engine.step();
    expect(bb().get('needsPart')).toBe(true);
    expect(bb().has('partContext')).toBe(false);

    // Step 4: invocation — child scope is empty, parent values visible via scope
    await engine.step();
    expect(bb().local()).toHaveLength(0);
    expect(bb().get('conceptName')).toBe('Steel Pipe');

    // Step 5: partContext written to child scope
    await engine.step();
    expect(bb().get('partContext')).toBe('Physical Object — Part');
    expect(bb().local()).toHaveLength(1);

    // Step 6: partConcept written to child scope
    await engine.step();
    expect(bb().get('partConcept')).toBe('Aluminum Housing');

    // Step 7: pop — child keys gone, returnMap key survives
    await engine.step();
    expect(bb().get('Part Concept')).toBe('Aluminum Housing');
    expect(bb().has('partContext')).toBe(false);
    expect(bb().has('partConcept')).toBe(false);
    expect(bb().has('partStatus')).toBe(false);

    // Step 8: post-pop advance, no new writes
    await engine.step();
    expect(bb().get('Part Concept')).toBe('Aluminum Housing');

    // Step 9: specRelation written
    await engine.step();
    expect(bb().get('specRelation')).toBe('Steel Pipe specializes Physical Object');

    // Step 10: status written
    await engine.step();
    expect(bb().get('status')).toBe('physical-object-defined');
  });

  it('stack depth tracks correctly through invocation lifecycle', async () => {
    // Steps 1-3: pre-invocation, stack empty
    await stepN(engine, 3);
    expect(engine.stack()).toHaveLength(0);

    // Step 4: invocation — stack depth 1, frame captures parent state
    await engine.step();
    expect(engine.stack()).toHaveLength(1);
    expect(engine.stack()[0].workflowId).toBe('define-physical-object');
    expect(engine.stack()[0].currentNodeId).toBe('DEFINE_PART');

    // Steps 5-6: still in sub-workflow, stack unchanged
    await stepN(engine, 2);
    expect(engine.stack()).toHaveLength(1);

    // Step 7: pop — stack empty again
    await engine.step();
    expect(engine.stack()).toHaveLength(0);

    // Steps 8-10: back in parent, stack stays empty
    await stepN(engine, 3);
    expect(engine.stack()).toHaveLength(0);
  });

  it('full event emission trace matches deterministic order', async () => {
    const events = collectEvents(engine);
    await engine.run();

    expect(events).toEqual([
      // Step 1: CLASSIFY → BASIC_DATA
      'node:exit', 'edge:traverse', 'blackboard:write', 'node:enter',
      // Step 2: BASIC_DATA → BRANCH (2 writes batched into 1 event)
      'node:exit', 'edge:traverse', 'blackboard:write', 'node:enter',
      // Step 3: BRANCH → DEFINE_PART (no writes)
      'node:exit', 'edge:traverse', 'node:enter',
      // Step 4: DEFINE_PART invocation push
      'workflow:push', 'node:enter',
      // Step 5: PART_CLASSIFY → PART_BASIC_DATA
      'node:exit', 'edge:traverse', 'blackboard:write', 'node:enter',
      // Step 6: PART_BASIC_DATA → PART_DONE
      'node:exit', 'edge:traverse', 'blackboard:write', 'node:enter',
      // Step 7: PART_DONE complete + returnMap + pop
      'blackboard:write', 'blackboard:write', 'workflow:pop', 'node:enter',
      // Step 8: DEFINE_PART post-pop → SPEC_COMPOSE (no writes)
      'node:exit', 'edge:traverse', 'node:enter',
      // Step 9: SPEC_COMPOSE → DONE
      'node:exit', 'edge:traverse', 'blackboard:write', 'node:enter',
      // Step 10: DONE complete, session terminates
      'blackboard:write', 'engine:complete',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Without-part path (guard skips invocation)
// ---------------------------------------------------------------------------

describe('End-to-end: define-physical-object (without part)', () => {
  let engine: ReflexEngine;

  beforeEach(async () => {
    const registry = new WorkflowRegistry();
    registry.register(definePartObjectWorkflow);
    registry.register(makeNoPartWorkflow());
    engine = new ReflexEngine(registry, createRuleAgent());
    await engine.init('define-physical-object-no-part');
  });

  it('produces correct 5-step sequence taking spec path', async () => {
    const results = await stepN(engine, 5);

    expect(results[0]).toMatchObject({ status: 'advanced', node: { id: 'BASIC_DATA' } });
    expect(results[1]).toMatchObject({ status: 'advanced', node: { id: 'BRANCH' } });
    // Key: guard selects e-branch-to-spec (needsPart absent)
    expect(results[2]).toMatchObject({ status: 'advanced', node: { id: 'SPEC_COMPOSE' } });
    expect(results[3]).toMatchObject({ status: 'advanced', node: { id: 'DONE' } });
    expect(results[4]).toMatchObject({ status: 'completed' });
  });

  it('event trace contains no workflow:push or workflow:pop', async () => {
    const events = collectEvents(engine);
    await engine.run();

    expect(events.filter((e) => e === 'workflow:push')).toHaveLength(0);
    expect(events.filter((e) => e === 'workflow:pop')).toHaveLength(0);
    expect(events).toContain('engine:complete');
  });

  it('final blackboard has no Part Concept', async () => {
    await engine.run();

    expect(engine.blackboard().has('Part Concept')).toBe(false);
    expect(engine.blackboard().get('status')).toBe('physical-object-defined');
    expect(engine.blackboard().get('specRelation')).toBe(
      'Steel Pipe specializes Physical Object',
    );
  });
});
