import { describe, it, expect, beforeEach } from 'vitest';
import { ReflexEngine } from '../engine';
import { WorkflowRegistry } from '../registry';
import { createRuleAgent, RuleAgent } from './rule-agent';
import {
  definePhysicalObjectWorkflow,
  definePartObjectWorkflow,
  registerPhysObjWorkflows,
} from './phys-obj-workflows';
import { Workflow, EngineEvent } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a "no-part" variant by spreading and removing needsPart from writes. */
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
// Tests
// ---------------------------------------------------------------------------

describe('Physical Object Workflows', () => {
  let agent: RuleAgent;
  let registry: WorkflowRegistry;

  beforeEach(() => {
    agent = createRuleAgent();
    registry = new WorkflowRegistry();
  });

  // -------------------------------------------------------------------------
  // With part (invocation path)
  // -------------------------------------------------------------------------

  describe('define-physical-object — with part', () => {
    it('runs to completion with all expected blackboard values', async () => {
      registerPhysObjWorkflows(registry);
      const engine = new ReflexEngine(registry, agent);
      await engine.init('define-physical-object');

      const result = await engine.run();

      expect(result.status).toBe('completed');
      expect(engine.blackboard().get('workflowType')).toBe('define-physical-object');
      expect(engine.blackboard().get('conceptName')).toBe('Steel Pipe');
      expect(engine.blackboard().get('Part Concept')).toBe('Aluminum Housing');
      expect(engine.blackboard().get('specRelation')).toBe(
        'Steel Pipe specializes Physical Object',
      );
      expect(engine.blackboard().get('status')).toBe('physical-object-defined');
    });

    it('returnMap promotes partConcept as Part Concept in parent', async () => {
      registerPhysObjWorkflows(registry);
      const engine = new ReflexEngine(registry, agent);
      await engine.init('define-physical-object');

      await engine.run();

      // Part Concept comes from returnMap, partConcept is the child's local key
      expect(engine.blackboard().get('Part Concept')).toBe('Aluminum Housing');
    });
  });

  // -------------------------------------------------------------------------
  // Without part (skip invocation)
  // -------------------------------------------------------------------------

  describe('define-physical-object — without part', () => {
    it('takes the spec-compose path when needsPart is absent', async () => {
      const noPartWorkflow = makeNoPartWorkflow();
      registry.register(definePartObjectWorkflow);
      registry.register(noPartWorkflow);
      const engine = new ReflexEngine(registry, agent);
      await engine.init('define-physical-object-no-part');

      const result = await engine.run();

      expect(result.status).toBe('completed');
      expect(engine.blackboard().get('specRelation')).toBe(
        'Steel Pipe specializes Physical Object',
      );
      expect(engine.blackboard().get('status')).toBe('physical-object-defined');
    });

    it('has no Part Concept when sub-workflow is skipped', async () => {
      const noPartWorkflow = makeNoPartWorkflow();
      registry.register(definePartObjectWorkflow);
      registry.register(noPartWorkflow);
      const engine = new ReflexEngine(registry, agent);
      await engine.init('define-physical-object-no-part');

      await engine.run();

      expect(engine.blackboard().has('Part Concept')).toBe(false);
      expect(engine.blackboard().has('partConcept')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Stack operations
  // -------------------------------------------------------------------------

  describe('stack operations', () => {
    it('stack depth is 1 when sub-workflow is active', async () => {
      registerPhysObjWorkflows(registry);
      const engine = new ReflexEngine(registry, agent);
      await engine.init('define-physical-object');

      let maxStackDepth = 0;
      engine.on('workflow:push', () => {
        maxStackDepth = Math.max(maxStackDepth, engine.stack().length);
      });

      await engine.run();

      expect(maxStackDepth).toBe(1);
    });

    it('stack is empty after sub-workflow pops', async () => {
      registerPhysObjWorkflows(registry);
      const engine = new ReflexEngine(registry, agent);
      await engine.init('define-physical-object');

      let stackAfterPop = -1;
      engine.on('workflow:pop', () => {
        stackAfterPop = engine.stack().length;
      });

      await engine.run();

      expect(stackAfterPop).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Scoped blackboard
  // -------------------------------------------------------------------------

  describe('scoped blackboard', () => {
    it('child workflow can read parent conceptName via scoped blackboard', async () => {
      registerPhysObjWorkflows(registry);

      // Use a spy agent that captures the blackboard at PART_BASIC_DATA
      let childSawConceptName = false;
      const spyAgent = createRuleAgent();
      const originalResolve = spyAgent.resolve.bind(spyAgent);
      spyAgent.resolve = async (ctx) => {
        if (ctx.node.id === 'PART_BASIC_DATA') {
          childSawConceptName = ctx.blackboard.has('conceptName');
        }
        return originalResolve(ctx);
      };

      const engine = new ReflexEngine(registry, spyAgent);
      await engine.init('define-physical-object');
      await engine.run();

      expect(childSawConceptName).toBe(true);
    });

    it('parent conceptName is not in child local scope', async () => {
      registerPhysObjWorkflows(registry);

      let conceptNameInLocal = true;
      const spyAgent = createRuleAgent();
      const originalResolve = spyAgent.resolve.bind(spyAgent);
      spyAgent.resolve = async (ctx) => {
        if (ctx.node.id === 'PART_BASIC_DATA') {
          const localKeys = ctx.blackboard.local().map((e) => e.key);
          conceptNameInLocal = localKeys.includes('conceptName');
        }
        return originalResolve(ctx);
      };

      const engine = new ReflexEngine(registry, spyAgent);
      await engine.init('define-physical-object');
      await engine.run();

      expect(conceptNameInLocal).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Event trace
  // -------------------------------------------------------------------------

  describe('event trace', () => {
    it('emits exactly one push and one pop for the with-part path', async () => {
      registerPhysObjWorkflows(registry);
      const engine = new ReflexEngine(registry, agent);
      await engine.init('define-physical-object');

      const events: EngineEvent[] = [];
      engine.on('workflow:push', () => events.push('workflow:push'));
      engine.on('workflow:pop', () => events.push('workflow:pop'));

      await engine.run();

      expect(events).toEqual(['workflow:push', 'workflow:pop']);
    });

    it('emits no push/pop on the without-part path', async () => {
      const noPartWorkflow = makeNoPartWorkflow();
      registry.register(definePartObjectWorkflow);
      registry.register(noPartWorkflow);
      const engine = new ReflexEngine(registry, agent);
      await engine.init('define-physical-object-no-part');

      const events: EngineEvent[] = [];
      engine.on('workflow:push', () => events.push('workflow:push'));
      engine.on('workflow:pop', () => events.push('workflow:pop'));

      await engine.run();

      expect(events).toEqual([]);
    });
  });
});
