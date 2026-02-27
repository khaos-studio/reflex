import { describe, it, expect } from 'vitest';
import { evaluateBuiltinGuard } from './guards';
import { ScopedBlackboardReader } from './blackboard';
import { BlackboardEntry, BuiltinGuard } from './types';

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
