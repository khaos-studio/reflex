import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowRegistry, WorkflowValidationError } from './registry';
import { Workflow, Node } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal node with an opaque spec. */
function node(id: string, invokes?: Node['invokes']): Node {
  return { id, spec: {}, ...(invokes ? { invokes } : {}) };
}

/** Build a simple linear workflow: A → B → C (terminal). */
function linearWorkflow(id = 'linear'): Workflow {
  return {
    id,
    entry: 'A',
    nodes: {
      A: node('A'),
      B: node('B'),
      C: node('C'),
    },
    edges: [
      { id: 'e1', from: 'A', to: 'B', event: 'NEXT' },
      { id: 'e2', from: 'B', to: 'C', event: 'NEXT' },
    ],
  };
}

/** Build a single-node workflow (entry = terminal). */
function singleNodeWorkflow(id = 'single'): Workflow {
  return {
    id,
    entry: 'A',
    nodes: { A: node('A') },
    edges: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowRegistry', () => {
  let registry: WorkflowRegistry;

  beforeEach(() => {
    registry = new WorkflowRegistry();
  });

  // -----------------------------------------------------------------------
  // Successful registration
  // -----------------------------------------------------------------------

  describe('valid workflows', () => {
    it('registers a linear DAG successfully', () => {
      const wf = linearWorkflow();
      registry.register(wf);

      expect(registry.has('linear')).toBe(true);
      expect(registry.get('linear')).toBe(wf);
    });

    it('registers a single-node workflow (entry = terminal)', () => {
      const wf = singleNodeWorkflow();
      registry.register(wf);

      expect(registry.has('single')).toBe(true);
    });

    it('registers a workflow with fan-out (multiple outgoing edges)', () => {
      const wf: Workflow = {
        id: 'fanout',
        entry: 'A',
        nodes: {
          A: node('A'),
          B: node('B'),
          C: node('C'),
        },
        edges: [
          { id: 'e1', from: 'A', to: 'B', event: 'LEFT' },
          { id: 'e2', from: 'A', to: 'C', event: 'RIGHT' },
        ],
      };

      registry.register(wf);
      expect(registry.has('fanout')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Retrieval methods
  // -----------------------------------------------------------------------

  describe('retrieval', () => {
    it('get() returns undefined for unknown ID', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });

    it('has() returns false for unknown ID', () => {
      expect(registry.has('nonexistent')).toBe(false);
    });

    it('list() returns all registered workflow IDs', () => {
      registry.register(linearWorkflow('wf-1'));
      registry.register(singleNodeWorkflow('wf-2'));
      registry.register(linearWorkflow('wf-3'));

      const ids = registry.list();
      expect(ids).toHaveLength(3);
      expect(ids).toContain('wf-1');
      expect(ids).toContain('wf-2');
      expect(ids).toContain('wf-3');
    });
  });

  // -----------------------------------------------------------------------
  // Validation: DUPLICATE_WORKFLOW_ID
  // -----------------------------------------------------------------------

  describe('DUPLICATE_WORKFLOW_ID', () => {
    it('rejects registering the same workflow ID twice', () => {
      registry.register(linearWorkflow('dup'));

      expect(() => registry.register(linearWorkflow('dup'))).toThrowError(
        WorkflowValidationError,
      );

      try {
        registry.register(linearWorkflow('dup'));
      } catch (e) {
        const err = e as WorkflowValidationError;
        expect(err.code).toBe('DUPLICATE_WORKFLOW_ID');
        expect(err.workflowId).toBe('dup');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Validation: EMPTY_WORKFLOW
  // -----------------------------------------------------------------------

  describe('EMPTY_WORKFLOW', () => {
    it('rejects a workflow with no nodes', () => {
      const wf: Workflow = {
        id: 'empty',
        entry: 'A',
        nodes: {},
        edges: [],
      };

      expect(() => registry.register(wf)).toThrowError(
        WorkflowValidationError,
      );

      try {
        registry.register(wf);
      } catch (e) {
        const err = e as WorkflowValidationError;
        expect(err.code).toBe('EMPTY_WORKFLOW');
        expect(err.workflowId).toBe('empty');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Validation: INVALID_ENTRY_NODE
  // -----------------------------------------------------------------------

  describe('INVALID_ENTRY_NODE', () => {
    it('rejects when entry node does not exist in nodes', () => {
      const wf: Workflow = {
        id: 'bad-entry',
        entry: 'MISSING',
        nodes: { A: node('A') },
        edges: [],
      };

      expect(() => registry.register(wf)).toThrowError(
        WorkflowValidationError,
      );

      try {
        registry.register(wf);
      } catch (e) {
        const err = e as WorkflowValidationError;
        expect(err.code).toBe('INVALID_ENTRY_NODE');
        expect(err.workflowId).toBe('bad-entry');
        expect(err.details.entry).toBe('MISSING');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Validation: NODE_ID_MISMATCH
  // -----------------------------------------------------------------------

  describe('NODE_ID_MISMATCH', () => {
    it('rejects when dict key does not match node.id', () => {
      const wf: Workflow = {
        id: 'mismatch',
        entry: 'A',
        nodes: {
          A: node('A'),
          B: { id: 'WRONG', spec: {} },
        },
        edges: [{ id: 'e1', from: 'A', to: 'B', event: 'NEXT' }],
      };

      expect(() => registry.register(wf)).toThrowError(
        WorkflowValidationError,
      );

      try {
        registry.register(wf);
      } catch (e) {
        const err = e as WorkflowValidationError;
        expect(err.code).toBe('NODE_ID_MISMATCH');
        expect(err.details.key).toBe('B');
        expect(err.details.nodeId).toBe('WRONG');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Validation: INVALID_EDGE
  // -----------------------------------------------------------------------

  describe('INVALID_EDGE', () => {
    it('rejects edge with non-existent source (from) node', () => {
      const wf: Workflow = {
        id: 'bad-from',
        entry: 'A',
        nodes: {
          A: node('A'),
          B: node('B'),
        },
        edges: [{ id: 'e1', from: 'GHOST', to: 'B', event: 'NEXT' }],
      };

      expect(() => registry.register(wf)).toThrowError(
        WorkflowValidationError,
      );

      try {
        registry.register(wf);
      } catch (e) {
        const err = e as WorkflowValidationError;
        expect(err.code).toBe('INVALID_EDGE');
        expect(err.details.field).toBe('from');
        expect(err.details.nodeId).toBe('GHOST');
      }
    });

    it('rejects edge with non-existent target (to) node', () => {
      const wf: Workflow = {
        id: 'bad-to',
        entry: 'A',
        nodes: {
          A: node('A'),
          B: node('B'),
        },
        edges: [{ id: 'e1', from: 'A', to: 'GHOST', event: 'NEXT' }],
      };

      expect(() => registry.register(wf)).toThrowError(
        WorkflowValidationError,
      );

      try {
        registry.register(wf);
      } catch (e) {
        const err = e as WorkflowValidationError;
        expect(err.code).toBe('INVALID_EDGE');
        expect(err.details.field).toBe('to');
        expect(err.details.nodeId).toBe('GHOST');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Validation: NO_TERMINAL_NODES
  // -----------------------------------------------------------------------

  describe('NO_TERMINAL_NODES', () => {
    it('rejects when every node has outgoing edges', () => {
      // A → B, B → A: both have outgoing edges → no terminals.
      // Terminal check runs before cycle check, so NO_TERMINAL_NODES fires first.
      const wf: Workflow = {
        id: 'no-terminals',
        entry: 'A',
        nodes: {
          A: node('A'),
          B: node('B'),
        },
        edges: [
          { id: 'e1', from: 'A', to: 'B', event: 'NEXT' },
          { id: 'e2', from: 'B', to: 'A', event: 'BACK' },
        ],
      };

      expect(() => registry.register(wf)).toThrowError(
        WorkflowValidationError,
      );

      try {
        registry.register(wf);
      } catch (e) {
        const err = e as WorkflowValidationError;
        expect(err.code).toBe('NO_TERMINAL_NODES');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Validation: CYCLE_DETECTED
  // -----------------------------------------------------------------------

  describe('CYCLE_DETECTED', () => {
    it('rejects a cyclic graph', () => {
      // A → B → C → B: C is not terminal (has outgoing to B), but A has no
      // outgoing back so terminal check passes (A is terminal? No — A→B).
      // Actually A has outgoing. Let's make: A → B → C → B.
      // Nodes with outgoing: A (→B), B (→C), C (→B). No terminals → fires
      // NO_TERMINAL_NODES first.
      //
      // To test CYCLE_DETECTED specifically, we need at least one terminal.
      // A → B → C, B → C already exists, add C → B for cycle but also
      // add D with no outgoing:
      // A → B → C → B (cycle), D is terminal.
      const wf: Workflow = {
        id: 'cyclic',
        entry: 'A',
        nodes: {
          A: node('A'),
          B: node('B'),
          C: node('C'),
          D: node('D'),
        },
        edges: [
          { id: 'e1', from: 'A', to: 'B', event: 'NEXT' },
          { id: 'e2', from: 'B', to: 'C', event: 'NEXT' },
          { id: 'e3', from: 'C', to: 'B', event: 'BACK' },
          { id: 'e4', from: 'A', to: 'D', event: 'ALT' },
        ],
      };

      expect(() => registry.register(wf)).toThrowError(
        WorkflowValidationError,
      );

      try {
        registry.register(wf);
      } catch (e) {
        const err = e as WorkflowValidationError;
        expect(err.code).toBe('CYCLE_DETECTED');
        expect(err.details.nodesInCycle).toEqual(
          expect.arrayContaining(['B', 'C']),
        );
      }
    });
  });

  // -----------------------------------------------------------------------
  // Invocation ref warnings
  // -----------------------------------------------------------------------

  describe('invocation ref warnings', () => {
    it('warns but still registers when invocation target is not yet registered', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const wf: Workflow = {
        id: 'parent',
        entry: 'A',
        nodes: {
          A: node('A', { workflowId: 'unknown-child', returnMap: [] }),
        },
        edges: [],
      };

      registry.register(wf);

      expect(registry.has('parent')).toBe(true);
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0][0]).toContain('unknown-child');

      warnSpy.mockRestore();
    });

    it('does not warn when invocation target is already registered', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Register target first
      registry.register(singleNodeWorkflow('child'));

      const wf: Workflow = {
        id: 'parent',
        entry: 'A',
        nodes: {
          A: node('A', { workflowId: 'child', returnMap: [] }),
        },
        edges: [],
      };

      registry.register(wf);

      expect(registry.has('parent')).toBe(true);
      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // Multiple workflows
  // -----------------------------------------------------------------------

  describe('multiple workflows', () => {
    it('registers and retrieves multiple independent workflows', () => {
      const wf1 = linearWorkflow('wf-alpha');
      const wf2 = singleNodeWorkflow('wf-beta');
      const wf3 = linearWorkflow('wf-gamma');

      registry.register(wf1);
      registry.register(wf2);
      registry.register(wf3);

      expect(registry.list()).toHaveLength(3);
      expect(registry.get('wf-alpha')).toBe(wf1);
      expect(registry.get('wf-beta')).toBe(wf2);
      expect(registry.get('wf-gamma')).toBe(wf3);
    });
  });
});
