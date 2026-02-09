// Reflex — Scoped Blackboard Reader
// Implements DESIGN.md Section 2.11

import { BlackboardEntry, BlackboardReader } from './types';

// ---------------------------------------------------------------------------
// Scoped Blackboard Reader
// ---------------------------------------------------------------------------

/**
 * Read-only view over a chain of blackboard scopes with lexical precedence.
 *
 * Scopes are ordered local → parent → grandparent (index 0 = innermost).
 * Within each scope, entries are in chronological order (oldest first,
 * newest last) — append-only semantics mean the last entry for a key wins.
 */
export class ScopedBlackboardReader implements BlackboardReader {
  private readonly scopes: ReadonlyArray<readonly BlackboardEntry[]>;

  constructor(scopes: BlackboardEntry[][] = []) {
    this.scopes = scopes;
  }

  /**
   * Walk scopes local → parent → grandparent.
   * Return the value of the latest entry for `key` in the first scope that
   * contains it, or undefined if not found in any scope.
   */
  get(key: string): unknown | undefined {
    for (const scope of this.scopes) {
      // Walk backwards to find the latest entry for this key in the scope
      for (let i = scope.length - 1; i >= 0; i--) {
        if (scope[i].key === key) {
          return scope[i].value;
        }
      }
    }
    return undefined;
  }

  /**
   * Return true if `key` exists in any scope.
   */
  has(key: string): boolean {
    for (const scope of this.scopes) {
      for (const entry of scope) {
        if (entry.key === key) return true;
      }
    }
    return false;
  }

  /**
   * Collect all entries for `key` across all scopes, ordered most-local first.
   * Includes shadowed entries — entries from parent/grandparent scopes that
   * would be hidden by local entries in a `get()` call.
   *
   * Within each scope, entries preserve their chronological order.
   */
  getAll(key: string): BlackboardEntry[] {
    const result: BlackboardEntry[] = [];
    for (const scope of this.scopes) {
      for (const entry of scope) {
        if (entry.key === key) {
          result.push(entry);
        }
      }
    }
    return result;
  }

  /**
   * All entries across all scopes, local scope first.
   */
  entries(): BlackboardEntry[] {
    const result: BlackboardEntry[] = [];
    for (const scope of this.scopes) {
      for (const entry of scope) {
        result.push(entry);
      }
    }
    return result;
  }

  /**
   * All unique keys across all scopes.
   */
  keys(): string[] {
    const seen = new Set<string>();
    for (const scope of this.scopes) {
      for (const entry of scope) {
        seen.add(entry.key);
      }
    }
    return Array.from(seen);
  }

  /**
   * Only the innermost scope's entries.
   */
  local(): BlackboardEntry[] {
    if (this.scopes.length === 0) return [];
    return [...this.scopes[0]];
  }
}
