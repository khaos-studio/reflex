// Reflex — Execution Engine
// Implements DESIGN.md Section 3.2
// M4-1: Constructor, init(), state inspection.
// M4-2: step() — single-workflow stepping with event emission.
// run() stubbed — implemented in M4-4.

import {
  Workflow,
  Node,
  Edge,
  BlackboardReader,
  BlackboardSource,
  StackFrame,
  DecisionAgent,
  DecisionContext,
  Decision,
  StepResult,
  RunResult,
  EngineEvent,
  EventHandler,
  EngineStatus,
} from './types';
import { WorkflowRegistry } from './registry';
import { ScopedBlackboard, ScopedBlackboardReader } from './blackboard';
import { filterEdges } from './guards';

// ---------------------------------------------------------------------------
// Engine Error
// ---------------------------------------------------------------------------

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineError';
  }
}

// ---------------------------------------------------------------------------
// ReflexEngine
// ---------------------------------------------------------------------------

export class ReflexEngine {
  private readonly _registry: WorkflowRegistry;
  private readonly _agent: DecisionAgent;

  // Session state — null until init() is called
  private _sessionId: string | null = null;
  private _status: EngineStatus = 'idle';
  private _currentWorkflowId: string | null = null;
  private _currentNodeId: string | null = null;
  private _currentBlackboard: ScopedBlackboard | null = null;

  // Call stack — suspended workflow frames (active frame is NOT on the stack)
  private _stack: StackFrame[] = [];

  // Event handlers
  private readonly _handlers: Map<EngineEvent, EventHandler[]> = new Map();

  constructor(registry: WorkflowRegistry, agent: DecisionAgent) {
    this._registry = registry;
    this._agent = agent;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async init(workflowId: string): Promise<string> {
    const workflow = this._registry.get(workflowId);
    if (!workflow) {
      throw new EngineError(
        `Cannot initialize: workflow '${workflowId}' is not registered`,
      );
    }

    this._sessionId = crypto.randomUUID();
    this._currentWorkflowId = workflowId;
    this._currentNodeId = workflow.entry;
    this._currentBlackboard = new ScopedBlackboard();
    this._stack = [];
    this._status = 'running';

    return this._sessionId;
  }

  async step(): Promise<StepResult> {
    // -- Precondition guards ------------------------------------------------
    if (this._status !== 'running' && this._status !== 'suspended') {
      throw new EngineError(
        `step() called in invalid state: '${this._status}' — engine must be 'running' or 'suspended'`,
      );
    }
    if (
      this._currentWorkflowId === null ||
      this._currentNodeId === null ||
      this._currentBlackboard === null
    ) {
      throw new EngineError('step() called before init()');
    }
    // Resume from suspension
    if (this._status === 'suspended') {
      this._status = 'running';
    }

    const workflow = this._registry.get(this._currentWorkflowId)!;
    const node = workflow.nodes[this._currentNodeId]!;

    // -- Guard evaluation ---------------------------------------------------
    const reader = this.blackboard();
    const filterResult = filterEdges(
      this._currentNodeId,
      workflow.edges,
      reader,
    );
    if (!filterResult.ok) {
      this._status = 'suspended';
      this._emit('engine:error', {
        error: filterResult.error,
        nodeId: this._currentNodeId,
      });
      return { status: 'suspended', reason: 'Guard evaluation error' };
    }
    const validEdges = filterResult.edges;

    // -- Build DecisionContext and call agent --------------------------------
    const context: DecisionContext = {
      workflow,
      node,
      blackboard: reader,
      validEdges,
      stack: this.stack(),
    };

    let decision: Decision;
    try {
      decision = await this._agent.resolve(context);
    } catch (error) {
      this._status = 'suspended';
      this._emit('engine:error', { error, nodeId: this._currentNodeId });
      return { status: 'suspended', reason: 'Decision agent threw an error' };
    }

    // -- Handle advance -----------------------------------------------------
    if (decision.type === 'advance') {
      const chosenEdge = validEdges.find((e) => e.id === decision.edge);
      if (!chosenEdge) {
        this._status = 'suspended';
        this._emit('engine:error', {
          error: new EngineError(
            `Decision agent chose invalid edge '${decision.edge}'`,
          ),
          nodeId: this._currentNodeId,
        });
        return { status: 'suspended', reason: 'Invalid edge selection' };
      }

      this._emit('node:exit', { node, workflow });
      this._emit('edge:traverse', { edge: chosenEdge, workflow });

      if (decision.writes && decision.writes.length > 0) {
        const source: BlackboardSource = {
          workflowId: this._currentWorkflowId,
          nodeId: this._currentNodeId,
          stackDepth: this._stack.length,
        };
        const newEntries = this._currentBlackboard.append(
          decision.writes,
          source,
        );
        this._emit('blackboard:write', { entries: newEntries, workflow });
      }

      this._currentNodeId = chosenEdge.to;
      const nextNode = workflow.nodes[chosenEdge.to]!;
      this._emit('node:enter', { node: nextNode, workflow });

      return { status: 'advanced', node: nextNode };
    }

    // -- Handle suspend -----------------------------------------------------
    if (decision.type === 'suspend') {
      this._status = 'suspended';
      this._emit('engine:suspend', {
        reason: decision.reason,
        nodeId: this._currentNodeId,
      });
      return { status: 'suspended', reason: decision.reason };
    }

    // -- Handle complete ----------------------------------------------------
    // Enforce terminal-node-only (structural: no outgoing edges)
    const hasOutgoing = workflow.edges.some(
      (e) => e.from === this._currentNodeId,
    );
    if (hasOutgoing) {
      this._status = 'suspended';
      this._emit('engine:error', {
        error: new EngineError(
          `Decision agent returned 'complete' at non-terminal node '${this._currentNodeId}'`,
        ),
        nodeId: this._currentNodeId,
      });
      return { status: 'suspended', reason: 'complete at non-terminal node' };
    }

    if (decision.writes && decision.writes.length > 0) {
      const source: BlackboardSource = {
        workflowId: this._currentWorkflowId,
        nodeId: this._currentNodeId,
        stackDepth: this._stack.length,
      };
      const newEntries = this._currentBlackboard.append(
        decision.writes,
        source,
      );
      this._emit('blackboard:write', { entries: newEntries, workflow });
    }

    if (this._stack.length === 0) {
      this._status = 'completed';
      this._emit('engine:complete', { workflow });
      return { status: 'completed' };
    }

    // Stack pop — M4-3 implements this branch
    throw new EngineError(
      'complete with non-empty stack not implemented — see M4-3',
    );
  }

  async run(): Promise<RunResult> {
    throw new EngineError('run() not implemented — see M4-4');
  }

  // -------------------------------------------------------------------------
  // State Inspection
  // -------------------------------------------------------------------------

  status(): EngineStatus {
    return this._status;
  }

  sessionId(): string {
    if (this._sessionId === null) {
      throw new EngineError('Engine not initialized — call init() first');
    }
    return this._sessionId;
  }

  currentNode(): Node | null {
    if (this._currentWorkflowId === null || this._currentNodeId === null) {
      return null;
    }
    const workflow = this._registry.get(this._currentWorkflowId);
    if (!workflow) return null;
    return workflow.nodes[this._currentNodeId] ?? null;
  }

  currentWorkflow(): Workflow | null {
    if (this._currentWorkflowId === null) return null;
    return this._registry.get(this._currentWorkflowId) ?? null;
  }

  blackboard(): BlackboardReader {
    if (this._currentBlackboard === null) {
      return new ScopedBlackboardReader([]);
    }
    // Stack frames ordered so _stack[0] is the most-recent parent.
    // ScopedBlackboard.reader() takes parent scopes in that same order.
    const parentScopes = this._stack.map((frame) => [...frame.blackboard]);
    return this._currentBlackboard.reader(parentScopes);
  }

  stack(): ReadonlyArray<StackFrame> {
    return [...this._stack];
  }

  validEdges(): Edge[] {
    const workflow = this.currentWorkflow();
    if (!workflow || this._currentNodeId === null) return [];

    const reader = this.blackboard();
    const result = filterEdges(this._currentNodeId, workflow.edges, reader);

    if (!result.ok) {
      // Guard evaluation error — proper engine:error event emission is
      // implemented in M4-5. For now, return no valid edges.
      return [];
    }

    return result.edges;
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  on(event: EngineEvent, handler: EventHandler): void {
    const handlers = this._handlers.get(event) ?? [];
    handlers.push(handler);
    this._handlers.set(event, handlers);
  }

  private _emit(event: EngineEvent, payload?: unknown): void {
    const handlers = this._handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(payload);
      }
    }
  }
}
