// Reflex — Execution Engine Scaffold
// Implements DESIGN.md Section 3.2
// M4-1: Constructor, init(), and state inspection methods.
// step(), run(), and on() are stubbed — implemented in M4-2 through M4-5.

import {
  Workflow,
  Node,
  Edge,
  BlackboardReader,
  StackFrame,
  DecisionAgent,
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

  // Event handlers — populated in M4-5
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
    throw new EngineError('step() not implemented — see M4-2');
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
  // Events (stubbed — implemented in M4-5)
  // -------------------------------------------------------------------------

  on(_event: EngineEvent, _handler: EventHandler): void {
    // Implemented in M4-5
  }
}
