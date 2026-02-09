import { describe, it, expect } from 'vitest';
import { ScopedBlackboardReader } from './blackboard';
import { BlackboardEntry } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a BlackboardEntry with minimal required fields. */
function entry(
  key: string,
  value: unknown,
  opts: { workflowId?: string; nodeId?: string; stackDepth?: number; timestamp?: number } = {},
): BlackboardEntry {
  return {
    key,
    value,
    source: {
      workflowId: opts.workflowId ?? 'wf',
      nodeId: opts.nodeId ?? 'n',
      stackDepth: opts.stackDepth ?? 0,
    },
    timestamp: opts.timestamp ?? Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScopedBlackboardReader', () => {
  // -----------------------------------------------------------------------
  // Empty reader
  // -----------------------------------------------------------------------

  describe('empty reader', () => {
    it('returns undefined from get()', () => {
      const reader = new ScopedBlackboardReader([]);
      expect(reader.get('anything')).toBeUndefined();
    });

    it('returns false from has()', () => {
      const reader = new ScopedBlackboardReader([]);
      expect(reader.has('anything')).toBe(false);
    });

    it('returns empty array from getAll()', () => {
      const reader = new ScopedBlackboardReader([]);
      expect(reader.getAll('anything')).toEqual([]);
    });

    it('returns empty array from entries()', () => {
      const reader = new ScopedBlackboardReader([]);
      expect(reader.entries()).toEqual([]);
    });

    it('returns empty array from keys()', () => {
      const reader = new ScopedBlackboardReader([]);
      expect(reader.keys()).toEqual([]);
    });

    it('returns empty array from local()', () => {
      const reader = new ScopedBlackboardReader([]);
      expect(reader.local()).toEqual([]);
    });

    it('handles no-arg constructor as empty', () => {
      const reader = new ScopedBlackboardReader();
      expect(reader.get('x')).toBeUndefined();
      expect(reader.entries()).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Single scope
  // -----------------------------------------------------------------------

  describe('single scope', () => {
    it('get() returns value for existing key', () => {
      const e = entry('color', 'blue');
      const reader = new ScopedBlackboardReader([[e]]);
      expect(reader.get('color')).toBe('blue');
    });

    it('has() returns true for existing key', () => {
      const reader = new ScopedBlackboardReader([[entry('color', 'blue')]]);
      expect(reader.has('color')).toBe(true);
    });

    it('has() returns false for missing key', () => {
      const reader = new ScopedBlackboardReader([[entry('color', 'blue')]]);
      expect(reader.has('size')).toBe(false);
    });

    it('keys() returns all unique keys', () => {
      const reader = new ScopedBlackboardReader([
        [entry('color', 'blue'), entry('size', 'large')],
      ]);
      expect(reader.keys()).toContain('color');
      expect(reader.keys()).toContain('size');
      expect(reader.keys()).toHaveLength(2);
    });

    it('get() returns each key correctly with multiple entries', () => {
      const reader = new ScopedBlackboardReader([
        [entry('color', 'blue'), entry('size', 'large')],
      ]);
      expect(reader.get('color')).toBe('blue');
      expect(reader.get('size')).toBe('large');
    });

    it('same-key shadowing: get() returns latest entry (last in array)', () => {
      const reader = new ScopedBlackboardReader([
        [entry('color', 'blue'), entry('color', 'red')],
      ]);
      expect(reader.get('color')).toBe('red');
    });

    it('same-key shadowing: getAll() returns both entries in order', () => {
      const e1 = entry('color', 'blue');
      const e2 = entry('color', 'red');
      const reader = new ScopedBlackboardReader([[e1, e2]]);
      const all = reader.getAll('color');
      expect(all).toHaveLength(2);
      expect(all[0].value).toBe('blue');
      expect(all[1].value).toBe('red');
    });

    it('local() returns all entries from the single scope', () => {
      const e1 = entry('color', 'blue');
      const e2 = entry('size', 'large');
      const reader = new ScopedBlackboardReader([[e1, e2]]);
      const loc = reader.local();
      expect(loc).toHaveLength(2);
      expect(loc[0]).toEqual(e1);
      expect(loc[1]).toEqual(e2);
    });
  });

  // -----------------------------------------------------------------------
  // Multi-scope: lexical scoping
  // -----------------------------------------------------------------------

  describe('multi-scope lexical scoping', () => {
    it('local shadows parent: get() returns local value', () => {
      const local = [entry('color', 'local-red')];
      const parent = [entry('color', 'parent-blue')];
      const reader = new ScopedBlackboardReader([local, parent]);
      expect(reader.get('color')).toBe('local-red');
    });

    it('parent fallback: get() returns parent value when not in local', () => {
      const local = [entry('size', 'large')];
      const parent = [entry('color', 'parent-blue')];
      const reader = new ScopedBlackboardReader([local, parent]);
      expect(reader.get('color')).toBe('parent-blue');
    });

    it('grandparent fallback: get() walks 3 scopes deep', () => {
      const local: BlackboardEntry[] = [];
      const parent: BlackboardEntry[] = [];
      const grandparent = [entry('origin', 'root-value')];
      const reader = new ScopedBlackboardReader([local, parent, grandparent]);
      expect(reader.get('origin')).toBe('root-value');
    });

    it('has() returns true if key in any scope', () => {
      const local: BlackboardEntry[] = [];
      const parent = [entry('color', 'blue')];
      const reader = new ScopedBlackboardReader([local, parent]);
      expect(reader.has('color')).toBe(true);
    });

    it('has() returns false if key in no scope', () => {
      const local = [entry('size', 'big')];
      const parent = [entry('color', 'blue')];
      const reader = new ScopedBlackboardReader([local, parent]);
      expect(reader.has('weight')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // getAll() across scopes
  // -----------------------------------------------------------------------

  describe('getAll() across scopes', () => {
    it('includes shadowed entries from all scopes, most-local first', () => {
      const local = [entry('color', 'local-red')];
      const parent = [entry('color', 'parent-blue')];
      const grandparent = [entry('color', 'gp-green')];
      const reader = new ScopedBlackboardReader([local, parent, grandparent]);

      const all = reader.getAll('color');
      expect(all).toHaveLength(3);
      expect(all[0].value).toBe('local-red');
      expect(all[1].value).toBe('parent-blue');
      expect(all[2].value).toBe('gp-green');
    });

    it('preserves entry order within each scope', () => {
      const local = [entry('x', 1), entry('x', 2)];
      const parent = [entry('x', 10), entry('x', 20)];
      const reader = new ScopedBlackboardReader([local, parent]);

      const all = reader.getAll('x');
      expect(all).toHaveLength(4);
      expect(all.map((e) => e.value)).toEqual([1, 2, 10, 20]);
    });

    it('returns empty for non-existent key', () => {
      const reader = new ScopedBlackboardReader([[entry('a', 1)]]);
      expect(reader.getAll('z')).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // entries() across scopes
  // -----------------------------------------------------------------------

  describe('entries()', () => {
    it('concatenates all scopes, local first', () => {
      const eLocal = entry('a', 1);
      const eParent = entry('b', 2);
      const eGP = entry('c', 3);
      const reader = new ScopedBlackboardReader([[eLocal], [eParent], [eGP]]);

      const all = reader.entries();
      expect(all).toHaveLength(3);
      expect(all[0]).toEqual(eLocal);
      expect(all[1]).toEqual(eParent);
      expect(all[2]).toEqual(eGP);
    });
  });

  // -----------------------------------------------------------------------
  // keys() deduplication
  // -----------------------------------------------------------------------

  describe('keys()', () => {
    it('deduplicates keys across scopes', () => {
      const local = [entry('color', 'red')];
      const parent = [entry('color', 'blue'), entry('size', 'big')];
      const reader = new ScopedBlackboardReader([local, parent]);

      const k = reader.keys();
      expect(k).toHaveLength(2);
      expect(k).toContain('color');
      expect(k).toContain('size');
    });
  });

  // -----------------------------------------------------------------------
  // local()
  // -----------------------------------------------------------------------

  describe('local()', () => {
    it('returns only innermost scope entries', () => {
      const eLocal = entry('a', 1);
      const eParent = entry('b', 2);
      const reader = new ScopedBlackboardReader([[eLocal], [eParent]]);

      const loc = reader.local();
      expect(loc).toHaveLength(1);
      expect(loc[0]).toEqual(eLocal);
    });

    it('returns empty array when innermost scope is empty', () => {
      const reader = new ScopedBlackboardReader([[], [entry('b', 2)]]);
      expect(reader.local()).toEqual([]);
    });

    it('returns a copy — mutations do not affect reader', () => {
      const e = entry('a', 1);
      const reader = new ScopedBlackboardReader([[e]]);
      const loc = reader.local();
      loc.pop();
      expect(reader.local()).toHaveLength(1);
    });
  });
});
