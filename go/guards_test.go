package reflex

import (
	"encoding/json"
	"errors"
	"testing"
)

func readerWith(entries ...BlackboardEntry) BlackboardReader {
	return NewBlackboardReader([][]BlackboardEntry{entries})
}

// ---------------------------------------------------------------------------
// BuiltinGuard — exists
// ---------------------------------------------------------------------------

func TestGuardExists(t *testing.T) {
	g := &BuiltinGuard{Type: GuardExists, Key: "color"}
	t.Run("true when key present", func(t *testing.T) {
		ok, err := g.Evaluate(readerWith(bbEntry("color", "blue")))
		if err != nil || !ok {
			t.Errorf("expected true, got %v err=%v", ok, err)
		}
	})
	t.Run("false when key absent", func(t *testing.T) {
		ok, err := g.Evaluate(readerWith())
		if err != nil || ok {
			t.Errorf("expected false, got %v err=%v", ok, err)
		}
	})
}

// ---------------------------------------------------------------------------
// BuiltinGuard — not-exists
// ---------------------------------------------------------------------------

func TestGuardNotExists(t *testing.T) {
	g := &BuiltinGuard{Type: GuardNotExists, Key: "color"}
	t.Run("true when key absent", func(t *testing.T) {
		ok, err := g.Evaluate(readerWith())
		if err != nil || !ok {
			t.Errorf("expected true, got %v", ok)
		}
	})
	t.Run("false when key present", func(t *testing.T) {
		ok, err := g.Evaluate(readerWith(bbEntry("color", "blue")))
		if err != nil || ok {
			t.Errorf("expected false, got %v", ok)
		}
	})
}

// ---------------------------------------------------------------------------
// BuiltinGuard — equals
// ---------------------------------------------------------------------------

func TestGuardEquals(t *testing.T) {
	g := &BuiltinGuard{Type: GuardEquals, Key: "color", Value: "blue"}
	t.Run("true when value matches", func(t *testing.T) {
		ok, err := g.Evaluate(readerWith(bbEntry("color", "blue")))
		if err != nil || !ok {
			t.Errorf("expected true, got %v", ok)
		}
	})
	t.Run("false when value differs", func(t *testing.T) {
		ok, err := g.Evaluate(readerWith(bbEntry("color", "red")))
		if err != nil || ok {
			t.Errorf("expected false, got %v", ok)
		}
	})
	t.Run("false when key absent", func(t *testing.T) {
		ok, err := g.Evaluate(readerWith())
		if err != nil || ok {
			t.Errorf("expected false, got %v", ok)
		}
	})
}

// ---------------------------------------------------------------------------
// BuiltinGuard — not-equals
// ---------------------------------------------------------------------------

func TestGuardNotEquals(t *testing.T) {
	g := &BuiltinGuard{Type: GuardNotEquals, Key: "color", Value: "blue"}
	t.Run("true when value differs", func(t *testing.T) {
		ok, err := g.Evaluate(readerWith(bbEntry("color", "red")))
		if err != nil || !ok {
			t.Errorf("expected true, got %v", ok)
		}
	})
	t.Run("false when value matches", func(t *testing.T) {
		ok, err := g.Evaluate(readerWith(bbEntry("color", "blue")))
		if err != nil || ok {
			t.Errorf("expected false, got %v", ok)
		}
	})
	t.Run("true when key absent", func(t *testing.T) {
		ok, err := g.Evaluate(readerWith())
		if err != nil || !ok {
			t.Errorf("expected true (key absent), got %v", ok)
		}
	})
}

// ---------------------------------------------------------------------------
// BuiltinGuard — numeric-aware equality
// ---------------------------------------------------------------------------

func TestGuardEqualsNumericAware(t *testing.T) {
	t.Run("int vs float64", func(t *testing.T) {
		// Blackboard has int(5), guard expects float64(5.0)
		g := &BuiltinGuard{Type: GuardEquals, Key: "count", Value: float64(5.0)}
		ok, err := g.Evaluate(readerWith(bbEntry("count", int(5))))
		if err != nil || !ok {
			t.Errorf("expected int(5) == float64(5.0), got %v err=%v", ok, err)
		}
	})
	t.Run("float64 vs int", func(t *testing.T) {
		// Blackboard has float64(5.0), guard expects int(5)
		g := &BuiltinGuard{Type: GuardEquals, Key: "count", Value: int(5)}
		ok, err := g.Evaluate(readerWith(bbEntry("count", float64(5.0))))
		if err != nil || !ok {
			t.Errorf("expected float64(5.0) == int(5), got %v err=%v", ok, err)
		}
	})
	t.Run("json.Number vs int", func(t *testing.T) {
		g := &BuiltinGuard{Type: GuardEquals, Key: "count", Value: int(5)}
		ok, err := g.Evaluate(readerWith(bbEntry("count", json.Number("5"))))
		if err != nil || !ok {
			t.Errorf("expected json.Number(5) == int(5), got %v err=%v", ok, err)
		}
	})
	t.Run("string vs string unchanged", func(t *testing.T) {
		g := &BuiltinGuard{Type: GuardEquals, Key: "name", Value: "alice"}
		ok, err := g.Evaluate(readerWith(bbEntry("name", "alice")))
		if err != nil || !ok {
			t.Errorf("expected string equality, got %v", ok)
		}
	})
	t.Run("map vs map unchanged", func(t *testing.T) {
		m := map[string]any{"a": 1}
		g := &BuiltinGuard{Type: GuardEquals, Key: "data", Value: m}
		ok, err := g.Evaluate(readerWith(bbEntry("data", map[string]any{"a": 1})))
		if err != nil || !ok {
			t.Errorf("expected map equality, got %v", ok)
		}
	})
	t.Run("int vs string falls back to DeepEqual", func(t *testing.T) {
		g := &BuiltinGuard{Type: GuardEquals, Key: "val", Value: "5"}
		ok, err := g.Evaluate(readerWith(bbEntry("val", int(5))))
		if err != nil || ok {
			t.Errorf("expected int(5) != string(5), got %v", ok)
		}
	})
}

func TestGuardNotEqualsNumericAware(t *testing.T) {
	t.Run("int vs different float64", func(t *testing.T) {
		g := &BuiltinGuard{Type: GuardNotEquals, Key: "count", Value: float64(6.0)}
		ok, err := g.Evaluate(readerWith(bbEntry("count", int(5))))
		if err != nil || !ok {
			t.Errorf("expected int(5) != float64(6.0), got %v", ok)
		}
	})
	t.Run("int vs same float64", func(t *testing.T) {
		g := &BuiltinGuard{Type: GuardNotEquals, Key: "count", Value: float64(5.0)}
		ok, err := g.Evaluate(readerWith(bbEntry("count", int(5))))
		if err != nil || ok {
			t.Errorf("expected int(5) not-not-equal float64(5.0), got %v", ok)
		}
	})
}

// ---------------------------------------------------------------------------
// BuiltinGuard — unknown type
// ---------------------------------------------------------------------------

func TestGuardUnknownType(t *testing.T) {
	g := &BuiltinGuard{Type: "bogus", Key: "x"}
	_, err := g.Evaluate(readerWith())
	if err == nil {
		t.Error("expected error for unknown guard type")
	}
}

// ---------------------------------------------------------------------------
// CustomGuardFunc
// ---------------------------------------------------------------------------

func TestCustomGuardFunc(t *testing.T) {
	t.Run("returns true", func(t *testing.T) {
		g := &CustomGuardFunc{Fn: func(bb BlackboardReader) (bool, error) { return true, nil }}
		ok, err := g.Evaluate(readerWith())
		if err != nil || !ok {
			t.Errorf("expected true, got %v", ok)
		}
	})
	t.Run("returns false", func(t *testing.T) {
		g := &CustomGuardFunc{Fn: func(bb BlackboardReader) (bool, error) { return false, nil }}
		ok, err := g.Evaluate(readerWith())
		if err != nil || ok {
			t.Errorf("expected false, got %v", ok)
		}
	})
	t.Run("returns error", func(t *testing.T) {
		g := &CustomGuardFunc{Fn: func(bb BlackboardReader) (bool, error) { return false, errors.New("boom") }}
		_, err := g.Evaluate(readerWith())
		if err == nil {
			t.Error("expected error")
		}
	})
	t.Run("reads blackboard", func(t *testing.T) {
		g := &CustomGuardFunc{Fn: func(bb BlackboardReader) (bool, error) { return bb.Has("x"), nil }}
		ok, _ := g.Evaluate(readerWith(bbEntry("x", 1)))
		if !ok {
			t.Error("expected guard to read blackboard")
		}
	})
}

// ---------------------------------------------------------------------------
// FilterEdges
// ---------------------------------------------------------------------------

func TestFilterEdges(t *testing.T) {
	t.Run("returns only outgoing edges", func(t *testing.T) {
		edges := []Edge{
			{ID: "e1", From: "A", To: "B", Event: "NEXT"},
			{ID: "e2", From: "B", To: "C", Event: "NEXT"},
		}
		valid, err := FilterEdges("A", edges, readerWith())
		if err != nil {
			t.Fatal(err)
		}
		if len(valid) != 1 || valid[0].ID != "e1" {
			t.Errorf("expected 1 edge (e1), got %d", len(valid))
		}
	})
	t.Run("no-guard edges always valid", func(t *testing.T) {
		edges := []Edge{{ID: "e1", From: "A", To: "B", Event: "NEXT"}}
		valid, err := FilterEdges("A", edges, readerWith())
		if err != nil || len(valid) != 1 {
			t.Error("expected no-guard edge to be valid")
		}
	})
	t.Run("guarded edge filtered out", func(t *testing.T) {
		edges := []Edge{
			{ID: "e1", From: "A", To: "B", Event: "NEXT", Guard: &BuiltinGuard{Type: GuardExists, Key: "missing"}},
		}
		valid, err := FilterEdges("A", edges, readerWith())
		if err != nil || len(valid) != 0 {
			t.Errorf("expected 0 valid edges, got %d", len(valid))
		}
	})
	t.Run("guard passes edge through", func(t *testing.T) {
		edges := []Edge{
			{ID: "e1", From: "A", To: "B", Event: "NEXT", Guard: &BuiltinGuard{Type: GuardExists, Key: "x"}},
		}
		valid, err := FilterEdges("A", edges, readerWith(bbEntry("x", 1)))
		if err != nil || len(valid) != 1 {
			t.Errorf("expected 1 valid edge, got %d", len(valid))
		}
	})
	t.Run("guard error propagates", func(t *testing.T) {
		edges := []Edge{
			{ID: "e1", From: "A", To: "B", Event: "NEXT", Guard: &CustomGuardFunc{
				Fn: func(bb BlackboardReader) (bool, error) { return false, errors.New("fail") },
			}},
		}
		_, err := FilterEdges("A", edges, readerWith())
		if err == nil {
			t.Error("expected error from guard")
		}
	})
	t.Run("no outgoing edges returns empty", func(t *testing.T) {
		edges := []Edge{{ID: "e1", From: "B", To: "C", Event: "NEXT"}}
		valid, err := FilterEdges("A", edges, readerWith())
		if err != nil || len(valid) != 0 {
			t.Errorf("expected 0, got %d", len(valid))
		}
	})
	t.Run("multiple edges mixed guards", func(t *testing.T) {
		edges := []Edge{
			{ID: "e1", From: "A", To: "B", Event: "YES", Guard: &BuiltinGuard{Type: GuardEquals, Key: "choice", Value: "b"}},
			{ID: "e2", From: "A", To: "C", Event: "NO", Guard: &BuiltinGuard{Type: GuardEquals, Key: "choice", Value: "c"}},
			{ID: "e3", From: "A", To: "D", Event: "DEFAULT"},
		}
		bb := readerWith(bbEntry("choice", "c"))
		valid, err := FilterEdges("A", edges, bb)
		if err != nil {
			t.Fatal(err)
		}
		if len(valid) != 2 {
			t.Errorf("expected 2 (e2+e3), got %d", len(valid))
		}
	})
}
