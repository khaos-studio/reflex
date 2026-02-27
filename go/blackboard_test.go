package reflex

import (
	"sync"
	"testing"
)

// helper to create a BlackboardEntry
func bbEntry(key string, value any) BlackboardEntry {
	return BlackboardEntry{Key: key, Value: value, Source: BlackboardSource{WorkflowID: "wf", NodeID: "n", StackDepth: 0}, Timestamp: 1}
}

func bbEntryWithSource(key string, value any, wfID, nodeID string, depth int) BlackboardEntry {
	return BlackboardEntry{Key: key, Value: value, Source: BlackboardSource{WorkflowID: wfID, NodeID: nodeID, StackDepth: depth}, Timestamp: 1}
}

// ---------------------------------------------------------------------------
// ScopedBlackboardReader — empty
// ---------------------------------------------------------------------------

func TestBlackboardReaderEmpty(t *testing.T) {
	reader := NewBlackboardReader(nil)

	t.Run("Get returns false", func(t *testing.T) {
		_, ok := reader.Get("anything")
		if ok {
			t.Error("expected ok=false for empty reader")
		}
	})
	t.Run("Has returns false", func(t *testing.T) {
		if reader.Has("anything") {
			t.Error("expected Has=false")
		}
	})
	t.Run("GetAll returns empty", func(t *testing.T) {
		if len(reader.GetAll("anything")) != 0 {
			t.Error("expected empty")
		}
	})
	t.Run("Entries returns empty", func(t *testing.T) {
		if len(reader.Entries()) != 0 {
			t.Error("expected empty")
		}
	})
	t.Run("Keys returns empty", func(t *testing.T) {
		if len(reader.Keys()) != 0 {
			t.Error("expected empty")
		}
	})
	t.Run("Local returns empty", func(t *testing.T) {
		if len(reader.Local()) != 0 {
			t.Error("expected empty")
		}
	})
}

// ---------------------------------------------------------------------------
// ScopedBlackboardReader — single scope
// ---------------------------------------------------------------------------

func TestBlackboardReaderSingleScope(t *testing.T) {
	scope := []BlackboardEntry{bbEntry("color", "blue"), bbEntry("size", "large")}
	reader := NewBlackboardReader([][]BlackboardEntry{scope})

	t.Run("Get returns value for existing key", func(t *testing.T) {
		v, ok := reader.Get("color")
		if !ok || v != "blue" {
			t.Errorf("expected blue, got %v (ok=%v)", v, ok)
		}
	})
	t.Run("Has returns true for existing key", func(t *testing.T) {
		if !reader.Has("color") {
			t.Error("expected Has=true")
		}
	})
	t.Run("Has returns false for missing key", func(t *testing.T) {
		if reader.Has("weight") {
			t.Error("expected Has=false")
		}
	})
	t.Run("Keys returns all unique keys", func(t *testing.T) {
		keys := reader.Keys()
		if len(keys) != 2 {
			t.Errorf("expected 2 keys, got %d", len(keys))
		}
	})
	t.Run("Local returns scope entries", func(t *testing.T) {
		if len(reader.Local()) != 2 {
			t.Errorf("expected 2 local entries, got %d", len(reader.Local()))
		}
	})
	t.Run("Entries returns all entries", func(t *testing.T) {
		if len(reader.Entries()) != 2 {
			t.Errorf("expected 2 entries, got %d", len(reader.Entries()))
		}
	})
}

// ---------------------------------------------------------------------------
// ScopedBlackboardReader — shadowing within scope (latest wins)
// ---------------------------------------------------------------------------

func TestBlackboardReaderShadowingWithinScope(t *testing.T) {
	scope := []BlackboardEntry{bbEntry("color", "blue"), bbEntry("color", "red")}
	reader := NewBlackboardReader([][]BlackboardEntry{scope})

	t.Run("Get returns latest value", func(t *testing.T) {
		v, ok := reader.Get("color")
		if !ok || v != "red" {
			t.Errorf("expected red (latest), got %v", v)
		}
	})
	t.Run("GetAll returns full history", func(t *testing.T) {
		all := reader.GetAll("color")
		if len(all) != 2 {
			t.Errorf("expected 2 entries, got %d", len(all))
		}
	})
	t.Run("Keys deduplicates", func(t *testing.T) {
		keys := reader.Keys()
		if len(keys) != 1 {
			t.Errorf("expected 1 key, got %d", len(keys))
		}
	})
}

// ---------------------------------------------------------------------------
// ScopedBlackboardReader — multi-scope (child shadows parent)
// ---------------------------------------------------------------------------

func TestBlackboardReaderMultiScope(t *testing.T) {
	child := []BlackboardEntry{bbEntry("color", "red")}
	parent := []BlackboardEntry{bbEntry("color", "blue"), bbEntry("size", "large")}
	reader := NewBlackboardReader([][]BlackboardEntry{child, parent})

	t.Run("Get returns child value (shadows parent)", func(t *testing.T) {
		v, ok := reader.Get("color")
		if !ok || v != "red" {
			t.Errorf("expected red (child), got %v", v)
		}
	})
	t.Run("Get returns parent value for non-shadowed key", func(t *testing.T) {
		v, ok := reader.Get("size")
		if !ok || v != "large" {
			t.Errorf("expected large (parent), got %v", v)
		}
	})
	t.Run("Has finds key in any scope", func(t *testing.T) {
		if !reader.Has("size") {
			t.Error("expected Has=true for parent key")
		}
	})
	t.Run("GetAll returns entries across scopes local-first", func(t *testing.T) {
		all := reader.GetAll("color")
		if len(all) != 2 {
			t.Errorf("expected 2, got %d", len(all))
		}
		if all[0].Value != "red" {
			t.Error("expected local entry first")
		}
	})
	t.Run("Keys includes keys from all scopes", func(t *testing.T) {
		keys := reader.Keys()
		if len(keys) != 2 {
			t.Errorf("expected 2 keys (color, size), got %d", len(keys))
		}
	})
	t.Run("Local returns only child entries", func(t *testing.T) {
		local := reader.Local()
		if len(local) != 1 || local[0].Value != "red" {
			t.Error("expected only child entries")
		}
	})
}

// ---------------------------------------------------------------------------
// ScopedBlackboardReader — three scopes (grandparent)
// ---------------------------------------------------------------------------

func TestBlackboardReaderThreeScopes(t *testing.T) {
	grandchild := []BlackboardEntry{bbEntry("a", 1)}
	child := []BlackboardEntry{bbEntry("b", 2)}
	parent := []BlackboardEntry{bbEntry("c", 3)}
	reader := NewBlackboardReader([][]BlackboardEntry{grandchild, child, parent})

	t.Run("reads from each scope level", func(t *testing.T) {
		v, _ := reader.Get("a")
		if v != 1 {
			t.Errorf("expected 1, got %v", v)
		}
		v, _ = reader.Get("b")
		if v != 2 {
			t.Errorf("expected 2, got %v", v)
		}
		v, _ = reader.Get("c")
		if v != 3 {
			t.Errorf("expected 3, got %v", v)
		}
	})
	t.Run("Entries returns all in scope order", func(t *testing.T) {
		entries := reader.Entries()
		if len(entries) != 3 {
			t.Errorf("expected 3, got %d", len(entries))
		}
	})
}

// ---------------------------------------------------------------------------
// ScopedBlackboard — write side
// ---------------------------------------------------------------------------

func TestBlackboardAppend(t *testing.T) {
	bb := NewBlackboard()
	source := BlackboardSource{WorkflowID: "wf1", NodeID: "n1", StackDepth: 0}

	t.Run("Append returns new entries", func(t *testing.T) {
		writes := []BlackboardWrite{{Key: "x", Value: 42}}
		newEntries := bb.Append(writes, source)
		if len(newEntries) != 1 {
			t.Fatalf("expected 1 entry, got %d", len(newEntries))
		}
		if newEntries[0].Key != "x" || newEntries[0].Value != 42 {
			t.Error("entry mismatch")
		}
	})
	t.Run("Entries grows after append", func(t *testing.T) {
		bb.Append([]BlackboardWrite{{Key: "y", Value: 99}}, source)
		entries := bb.Entries()
		if len(entries) != 2 {
			t.Errorf("expected 2, got %d", len(entries))
		}
	})
	t.Run("Source is preserved", func(t *testing.T) {
		entries := bb.Entries()
		if entries[0].Source.WorkflowID != "wf1" {
			t.Error("source not preserved")
		}
	})
	t.Run("Reader with parent scopes", func(t *testing.T) {
		parentEntries := []BlackboardEntry{bbEntry("parent_key", "parent_val")}
		reader := bb.Reader(parentEntries)
		v, ok := reader.Get("parent_key")
		if !ok || v != "parent_val" {
			t.Error("expected parent key visible via reader")
		}
		v, ok = reader.Get("x")
		if !ok || v != 42 {
			t.Error("expected local key visible via reader")
		}
	})
}

// ---------------------------------------------------------------------------
// ScopedBlackboard — initial entries
// ---------------------------------------------------------------------------

func TestBlackboardWithInitialEntries(t *testing.T) {
	initial := []BlackboardEntry{bbEntry("init", "value")}
	bb := NewBlackboard(initial...)
	entries := bb.Entries()
	if len(entries) != 1 || entries[0].Key != "init" {
		t.Error("initial entries not preserved")
	}
}

// ---------------------------------------------------------------------------
// Concurrent safety
// ---------------------------------------------------------------------------

func TestBlackboardConcurrentAppend(t *testing.T) {
	bb := NewBlackboard()
	source := BlackboardSource{WorkflowID: "wf", NodeID: "n", StackDepth: 0}
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			bb.Append([]BlackboardWrite{{Key: "k", Value: i}}, source)
		}(i)
	}
	wg.Wait()
	if len(bb.Entries()) != 100 {
		t.Errorf("expected 100 entries, got %d", len(bb.Entries()))
	}
}
