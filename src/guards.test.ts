import { describe, it, expect } from 'vitest';
import { evaluateBuiltinGuard, evaluateCustomGuard, evaluateGuard } from './guards';
import { ScopedBlackboardReader } from './blackboard';
import { BlackboardEntry, BuiltinGuard, CustomGuard, Guard } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a BlackboardEntry with minimal required fields. */
function entry(
  key: string,
  value: unknown,
  opts: { workflowId?: string; nodeId?: string; stackDepth?: number } = {},
): BlackboardEntry {
  return {
    key,
    value,
    source: {
      workflowId: opts.workflowId ?? 'wf',
      nodeId: opts.nodeId ?? 'n',
      stackDepth: opts.stackDepth ?? 0,
    },
    timestamp: Date.now(),
  };
}

/** Shorthand: reader with a single local scope. */
function readerWith(...entries: BlackboardEntry[]): ScopedBlackboardReader {
  return new ScopedBlackboardReader([entries]);
}

/** Shorthand: reader with local + parent scopes. */
function readerWithScopes(
  local: BlackboardEntry[],
  parent: BlackboardEntry[],
): ScopedBlackboardReader {
  return new ScopedBlackboardReader([local, parent]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('evaluateBuiltinGuard', () => {
  // -----------------------------------------------------------------------
  // exists
  // -----------------------------------------------------------------------

  describe('exists', () => {
    const guard: BuiltinGuard = { type: 'exists', key: 'color' };

    it('returns true when key is present in blackboard', () => {
      const bb = readerWith(entry('color', 'red'));
      expect(evaluateBuiltinGuard(guard, bb)).toBe(true);
    });

    it('returns false when key is absent', () => {
      const bb = readerWith(entry('size', 10));
      expect(evaluateBuiltinGuard(guard, bb)).toBe(false);
    });

    it('returns true when key exists in parent scope', () => {
      const bb = readerWithScopes([], [entry('color', 'blue')]);
      expect(evaluateBuiltinGuard(guard, bb)).toBe(true);
    });

    it('ignores guard.value — only checks presence', () => {
      const guardWithValue: BuiltinGuard = { type: 'exists', key: 'color', value: 'red' };
      const bb = readerWith(entry('color', 'blue'));
      expect(evaluateBuiltinGuard(guardWithValue, bb)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // not-exists
  // -----------------------------------------------------------------------

  describe('not-exists', () => {
    const guard: BuiltinGuard = { type: 'not-exists', key: 'color' };

    it('returns true when key is absent', () => {
      const bb = readerWith(entry('size', 10));
      expect(evaluateBuiltinGuard(guard, bb)).toBe(true);
    });

    it('returns false when key is present', () => {
      const bb = readerWith(entry('color', 'red'));
      expect(evaluateBuiltinGuard(guard, bb)).toBe(false);
    });

    it('returns false when key exists only in parent scope', () => {
      const bb = readerWithScopes([], [entry('color', 'blue')]);
      expect(evaluateBuiltinGuard(guard, bb)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // equals
  // -----------------------------------------------------------------------

  describe('equals', () => {
    it('returns true when blackboard value matches guard value', () => {
      const guard: BuiltinGuard = { type: 'equals', key: 'status', value: 'active' };
      const bb = readerWith(entry('status', 'active'));
      expect(evaluateBuiltinGuard(guard, bb)).toBe(true);
    });

    it('returns false when values differ', () => {
      const guard: BuiltinGuard = { type: 'equals', key: 'status', value: 'active' };
      const bb = readerWith(entry('status', 'inactive'));
      expect(evaluateBuiltinGuard(guard, bb)).toBe(false);
    });

    it('returns false when key is absent (undefined !== value)', () => {
      const guard: BuiltinGuard = { type: 'equals', key: 'status', value: 'active' };
      const bb = readerWith();
      expect(evaluateBuiltinGuard(guard, bb)).toBe(false);
    });

    it('uses strict equality — 1 !== "1"', () => {
      const guard: BuiltinGuard = { type: 'equals', key: 'count', value: 1 };
      const bb = readerWith(entry('count', '1'));
      expect(evaluateBuiltinGuard(guard, bb)).toBe(false);
    });

    it('resolves value from scoped blackboard (latest local entry wins)', () => {
      const guard: BuiltinGuard = { type: 'equals', key: 'color', value: 'green' };
      const bb = readerWithScopes(
        [entry('color', 'green')],
        [entry('color', 'red')],
      );
      expect(evaluateBuiltinGuard(guard, bb)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // not-equals
  // -----------------------------------------------------------------------

  describe('not-equals', () => {
    it('returns true when values differ', () => {
      const guard: BuiltinGuard = { type: 'not-equals', key: 'status', value: 'active' };
      const bb = readerWith(entry('status', 'inactive'));
      expect(evaluateBuiltinGuard(guard, bb)).toBe(true);
    });

    it('returns false when values are strictly equal', () => {
      const guard: BuiltinGuard = { type: 'not-equals', key: 'status', value: 'active' };
      const bb = readerWith(entry('status', 'active'));
      expect(evaluateBuiltinGuard(guard, bb)).toBe(false);
    });

    it('returns true when key is absent (undefined !== defined value)', () => {
      const guard: BuiltinGuard = { type: 'not-equals', key: 'status', value: 'active' };
      const bb = readerWith();
      expect(evaluateBuiltinGuard(guard, bb)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Custom Guard Evaluator
// ---------------------------------------------------------------------------

describe('evaluateCustomGuard', () => {
  it('returns { ok: true, passed: true } when evaluate returns true', () => {
    const guard: CustomGuard = { type: 'custom', evaluate: () => true };
    const bb = readerWith(entry('x', 1));
    const result = evaluateCustomGuard(guard, bb);
    expect(result).toEqual({ ok: true, passed: true });
  });

  it('returns { ok: true, passed: false } when evaluate returns false', () => {
    const guard: CustomGuard = { type: 'custom', evaluate: () => false };
    const bb = readerWith(entry('x', 1));
    const result = evaluateCustomGuard(guard, bb);
    expect(result).toEqual({ ok: true, passed: false });
  });

  it('returns { ok: false, error } when evaluate throws an Error', () => {
    const err = new Error('guard broke');
    const guard: CustomGuard = { type: 'custom', evaluate: () => { throw err; } };
    const bb = readerWith();
    const result = evaluateCustomGuard(guard, bb);
    expect(result).toEqual({ ok: false, error: err });
  });

  it('returns { ok: false, error } when evaluate throws a non-Error (string)', () => {
    const guard: CustomGuard = { type: 'custom', evaluate: () => { throw 'boom'; } };
    const bb = readerWith();
    const result = evaluateCustomGuard(guard, bb);
    expect(result).toEqual({ ok: false, error: 'boom' });
  });

  it('passes the BlackboardReader to evaluate — can use reader.get()', () => {
    const guard: CustomGuard = {
      type: 'custom',
      evaluate: (bb) => bb.get('color') === 'red',
    };
    const bb = readerWith(entry('color', 'red'));
    const result = evaluateCustomGuard(guard, bb);
    expect(result).toEqual({ ok: true, passed: true });
  });

  it('passes scoped blackboard — cross-scope reads work inside custom guard', () => {
    const guard: CustomGuard = {
      type: 'custom',
      evaluate: (bb) => bb.get('parentKey') === 'parentValue',
    };
    const bb = readerWithScopes([], [entry('parentKey', 'parentValue')]);
    const result = evaluateCustomGuard(guard, bb);
    expect(result).toEqual({ ok: true, passed: true });
  });
});

// ---------------------------------------------------------------------------
// Unified Guard Evaluator (dispatch)
// ---------------------------------------------------------------------------

describe('evaluateGuard — dispatch', () => {
  // Built-in dispatch

  it('dispatches exists guard → { ok: true, passed: true }', () => {
    const guard: Guard = { type: 'exists', key: 'x' };
    const bb = readerWith(entry('x', 1));
    expect(evaluateGuard(guard, bb)).toEqual({ ok: true, passed: true });
  });

  it('dispatches exists guard (missing) → { ok: true, passed: false }', () => {
    const guard: Guard = { type: 'exists', key: 'x' };
    const bb = readerWith();
    expect(evaluateGuard(guard, bb)).toEqual({ ok: true, passed: false });
  });

  it('dispatches equals guard → { ok: true, passed: true }', () => {
    const guard: Guard = { type: 'equals', key: 'status', value: 'on' };
    const bb = readerWith(entry('status', 'on'));
    expect(evaluateGuard(guard, bb)).toEqual({ ok: true, passed: true });
  });

  it('dispatches not-exists guard → { ok: true, passed: true }', () => {
    const guard: Guard = { type: 'not-exists', key: 'x' };
    const bb = readerWith();
    expect(evaluateGuard(guard, bb)).toEqual({ ok: true, passed: true });
  });

  it('dispatches not-equals guard → { ok: true, passed: true }', () => {
    const guard: Guard = { type: 'not-equals', key: 'status', value: 'off' };
    const bb = readerWith(entry('status', 'on'));
    expect(evaluateGuard(guard, bb)).toEqual({ ok: true, passed: true });
  });

  // Custom dispatch

  it('dispatches custom guard returning true → { ok: true, passed: true }', () => {
    const guard: Guard = { type: 'custom', evaluate: () => true };
    const bb = readerWith();
    expect(evaluateGuard(guard, bb)).toEqual({ ok: true, passed: true });
  });

  it('dispatches custom guard returning false → { ok: true, passed: false }', () => {
    const guard: Guard = { type: 'custom', evaluate: () => false };
    const bb = readerWith();
    expect(evaluateGuard(guard, bb)).toEqual({ ok: true, passed: false });
  });

  it('dispatches custom guard that throws → { ok: false, error }', () => {
    const err = new Error('fail');
    const guard: Guard = { type: 'custom', evaluate: () => { throw err; } };
    const bb = readerWith();
    expect(evaluateGuard(guard, bb)).toEqual({ ok: false, error: err });
  });
});
