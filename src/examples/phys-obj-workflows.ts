// Reflex — Physical Object Modeling Workflow Set
// M5-2: Simplified translation of the Relica PhysObjMachine into Reflex format.
//
// Two workflows:
//   1. define-part-object   — linear sub-workflow (3 nodes)
//   2. define-physical-object — root workflow with fan-out + invocation (6 nodes)
//
// Both are designed for the RuleAgent from M5-1.

import { Workflow } from '../types';
import { WorkflowRegistry } from '../registry';
import { RuleSpec } from './rule-agent';

// ---------------------------------------------------------------------------
// Helper — build a node with a RuleSpec
// ---------------------------------------------------------------------------

function ruleNode(id: string, spec: RuleSpec) {
  return { id, spec };
}

// ---------------------------------------------------------------------------
// Sub-workflow: define-part-object (3 nodes, linear)
// ---------------------------------------------------------------------------

export const definePartObjectWorkflow: Workflow = {
  id: 'define-part-object',
  entry: 'PART_CLASSIFY',
  nodes: {
    PART_CLASSIFY: ruleNode('PART_CLASSIFY', {
      writes: [{ key: 'partContext', value: 'Physical Object — Part' }],
    }),
    PART_BASIC_DATA: ruleNode('PART_BASIC_DATA', {
      writes: [{ key: 'partConcept', value: 'Aluminum Housing' }],
    }),
    PART_DONE: ruleNode('PART_DONE', {
      complete: true,
      writes: [{ key: 'partStatus', value: 'complete' }],
    }),
  },
  edges: [
    { id: 'e-part-classify-basic', from: 'PART_CLASSIFY', to: 'PART_BASIC_DATA', event: 'NEXT' },
    { id: 'e-part-basic-done', from: 'PART_BASIC_DATA', to: 'PART_DONE', event: 'NEXT' },
  ],
};

// ---------------------------------------------------------------------------
// Root workflow: define-physical-object (6 nodes)
// ---------------------------------------------------------------------------

export const definePhysicalObjectWorkflow: Workflow = {
  id: 'define-physical-object',
  entry: 'CLASSIFY',
  nodes: {
    CLASSIFY: ruleNode('CLASSIFY', {
      writes: [{ key: 'workflowType', value: 'define-physical-object' }],
      edge: 'e-classify-basic',
    }),
    BASIC_DATA: ruleNode('BASIC_DATA', {
      writes: [
        { key: 'conceptName', value: 'Steel Pipe' },
        { key: 'needsPart', value: true },
      ],
      edge: 'e-basic-branch',
    }),
    BRANCH: ruleNode('BRANCH', {
      edge: ['e-branch-to-part', 'e-branch-to-spec'],
    }),
    DEFINE_PART: {
      id: 'DEFINE_PART',
      spec: {},
      invokes: {
        workflowId: 'define-part-object',
        returnMap: [{ parentKey: 'Part Concept', childKey: 'partConcept' }],
      },
    },
    SPEC_COMPOSE: ruleNode('SPEC_COMPOSE', {
      writes: [
        { key: 'specRelation', value: 'Steel Pipe specializes Physical Object' },
      ],
    }),
    DONE: ruleNode('DONE', {
      complete: true,
      writes: [{ key: 'status', value: 'physical-object-defined' }],
    }),
  },
  edges: [
    { id: 'e-classify-basic', from: 'CLASSIFY', to: 'BASIC_DATA', event: 'NEXT' },
    { id: 'e-basic-branch', from: 'BASIC_DATA', to: 'BRANCH', event: 'NEXT' },
    {
      id: 'e-branch-to-part',
      from: 'BRANCH',
      to: 'DEFINE_PART',
      event: 'DEFINE_PART',
      guard: { type: 'exists', key: 'needsPart' },
    },
    {
      id: 'e-branch-to-spec',
      from: 'BRANCH',
      to: 'SPEC_COMPOSE',
      event: 'SPEC_COMPOSE',
      guard: { type: 'not-exists', key: 'needsPart' },
    },
    { id: 'e-part-to-spec', from: 'DEFINE_PART', to: 'SPEC_COMPOSE', event: 'NEXT' },
    { id: 'e-spec-done', from: 'SPEC_COMPOSE', to: 'DONE', event: 'NEXT' },
  ],
};

// ---------------------------------------------------------------------------
// Registry helper
// ---------------------------------------------------------------------------

/** Register both workflows in the correct order (sub-workflow first). */
export function registerPhysObjWorkflows(registry: WorkflowRegistry): void {
  registry.register(definePartObjectWorkflow);
  registry.register(definePhysicalObjectWorkflow);
}
