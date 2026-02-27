package reflex

import (
	"errors"
	"testing"
)

func linearWorkflow(id string) *Workflow {
	return &Workflow{
		ID:    id,
		Entry: "A",
		Nodes: map[string]*Node{
			"A": {ID: "A", Spec: NodeSpec{}},
			"B": {ID: "B", Spec: NodeSpec{}},
			"C": {ID: "C", Spec: NodeSpec{}},
		},
		Edges: []Edge{
			{ID: "e1", From: "A", To: "B", Event: "NEXT"},
			{ID: "e2", From: "B", To: "C", Event: "NEXT"},
		},
	}
}

func TestRegistryRegisterValidDAG(t *testing.T) {
	r := NewRegistry()
	if err := r.Register(linearWorkflow("wf1")); err != nil {
		t.Fatalf("expected valid DAG to register: %v", err)
	}
}

func TestRegistryRegisterBranchingDAG(t *testing.T) {
	r := NewRegistry()
	w := &Workflow{
		ID:    "branching",
		Entry: "A",
		Nodes: map[string]*Node{
			"A": {ID: "A", Spec: NodeSpec{}},
			"B": {ID: "B", Spec: NodeSpec{}},
			"C": {ID: "C", Spec: NodeSpec{}},
		},
		Edges: []Edge{
			{ID: "e1", From: "A", To: "B", Event: "LEFT"},
			{ID: "e2", From: "A", To: "C", Event: "RIGHT"},
		},
	}
	if err := r.Register(w); err != nil {
		t.Fatalf("expected branching DAG to register: %v", err)
	}
}

func TestRegistryRegisterConvergingDAG(t *testing.T) {
	r := NewRegistry()
	w := &Workflow{
		ID:    "converging",
		Entry: "A",
		Nodes: map[string]*Node{
			"A": {ID: "A", Spec: NodeSpec{}},
			"B": {ID: "B", Spec: NodeSpec{}},
			"C": {ID: "C", Spec: NodeSpec{}},
		},
		Edges: []Edge{
			{ID: "e1", From: "A", To: "C", Event: "NEXT"},
			{ID: "e2", From: "B", To: "C", Event: "NEXT"},
		},
	}
	if err := r.Register(w); err != nil {
		t.Fatalf("expected converging DAG to register: %v", err)
	}
}

func TestRegistryEmptyWorkflow(t *testing.T) {
	r := NewRegistry()
	w := &Workflow{ID: "empty", Entry: "A", Nodes: map[string]*Node{}, Edges: nil}
	err := r.Register(w)
	assertValidationError(t, err, ErrEmptyWorkflow)
}

func TestRegistryMissingEntryNode(t *testing.T) {
	r := NewRegistry()
	w := &Workflow{
		ID:    "bad-entry",
		Entry: "MISSING",
		Nodes: map[string]*Node{"A": {ID: "A", Spec: NodeSpec{}}},
	}
	err := r.Register(w)
	assertValidationError(t, err, ErrInvalidEntryNode)
}

func TestRegistryNodeIDMismatch(t *testing.T) {
	r := NewRegistry()
	w := &Workflow{
		ID:    "mismatch",
		Entry: "X",
		Nodes: map[string]*Node{"X": {ID: "Y", Spec: NodeSpec{}}},
	}
	err := r.Register(w)
	assertValidationError(t, err, ErrNodeIDMismatch)
}

func TestRegistryInvalidEdgeFrom(t *testing.T) {
	r := NewRegistry()
	w := &Workflow{
		ID:    "bad-edge",
		Entry: "A",
		Nodes: map[string]*Node{"A": {ID: "A", Spec: NodeSpec{}}, "B": {ID: "B", Spec: NodeSpec{}}},
		Edges: []Edge{{ID: "e1", From: "MISSING", To: "B", Event: "NEXT"}},
	}
	err := r.Register(w)
	assertValidationError(t, err, ErrInvalidEdge)
}

func TestRegistryInvalidEdgeTo(t *testing.T) {
	r := NewRegistry()
	w := &Workflow{
		ID:    "bad-edge2",
		Entry: "A",
		Nodes: map[string]*Node{"A": {ID: "A", Spec: NodeSpec{}}},
		Edges: []Edge{{ID: "e1", From: "A", To: "MISSING", Event: "NEXT"}},
	}
	err := r.Register(w)
	assertValidationError(t, err, ErrInvalidEdge)
}

func TestRegistryNoTerminalNodes(t *testing.T) {
	r := NewRegistry()
	w := &Workflow{
		ID:    "no-terminal",
		Entry: "A",
		Nodes: map[string]*Node{
			"A": {ID: "A", Spec: NodeSpec{}},
			"B": {ID: "B", Spec: NodeSpec{}},
		},
		Edges: []Edge{
			{ID: "e1", From: "A", To: "B", Event: "NEXT"},
			{ID: "e2", From: "B", To: "A", Event: "BACK"},
		},
	}
	err := r.Register(w)
	// This might be caught as either CycleDetected or NoTerminalNodes
	if err == nil {
		t.Fatal("expected error for no terminal nodes / cycle")
	}
}

func TestRegistryCycleDetected(t *testing.T) {
	r := NewRegistry()
	// Cycle: A→B→C→A. All nodes have outgoing edges AND form a cycle.
	// C→A closes the cycle; A is terminal-free, so NO_TERMINAL catches first.
	// Use a DAG with a terminal node + a separate cycle to isolate cycle detection.
	w := &Workflow{
		ID:    "cycle",
		Entry: "A",
		Nodes: map[string]*Node{
			"A": {ID: "A", Spec: NodeSpec{}},
			"B": {ID: "B", Spec: NodeSpec{}},
			"C": {ID: "C", Spec: NodeSpec{}},
			"D": {ID: "D", Spec: NodeSpec{}}, // terminal
		},
		Edges: []Edge{
			{ID: "e1", From: "A", To: "B", Event: "NEXT"},
			{ID: "e2", From: "B", To: "C", Event: "NEXT"},
			{ID: "e3", From: "C", To: "B", Event: "BACK"}, // cycle B↔C
			{ID: "e4", From: "A", To: "D", Event: "ALT"},
		},
	}
	err := r.Register(w)
	assertValidationError(t, err, ErrCycleDetected)
}

func TestRegistrySelfLoop(t *testing.T) {
	r := NewRegistry()
	w := &Workflow{
		ID:    "self-loop",
		Entry: "A",
		Nodes: map[string]*Node{"A": {ID: "A", Spec: NodeSpec{}}},
		Edges: []Edge{{ID: "e1", From: "A", To: "A", Event: "LOOP"}},
	}
	err := r.Register(w)
	if err == nil {
		t.Fatal("expected error for self-loop")
	}
}

func TestRegistryDuplicateID(t *testing.T) {
	r := NewRegistry()
	_ = r.Register(linearWorkflow("dup"))
	err := r.Register(linearWorkflow("dup"))
	assertValidationError(t, err, ErrDuplicateWorkflowID)
}

func TestRegistryGetHasList(t *testing.T) {
	r := NewRegistry()
	_ = r.Register(linearWorkflow("wf1"))
	_ = r.Register(linearWorkflow("wf2"))

	t.Run("Get returns registered workflow", func(t *testing.T) {
		w, ok := r.Get("wf1")
		if !ok || w.ID != "wf1" {
			t.Error("expected to get wf1")
		}
	})
	t.Run("Get returns false for missing", func(t *testing.T) {
		_, ok := r.Get("nope")
		if ok {
			t.Error("expected false for missing")
		}
	})
	t.Run("Has returns true", func(t *testing.T) {
		if !r.Has("wf1") {
			t.Error("expected Has=true")
		}
	})
	t.Run("Has returns false", func(t *testing.T) {
		if r.Has("nope") {
			t.Error("expected Has=false")
		}
	})
	t.Run("List returns all IDs", func(t *testing.T) {
		list := r.List()
		if len(list) != 2 {
			t.Errorf("expected 2, got %d", len(list))
		}
	})
}

func TestRegistryInvocationRefWarning(t *testing.T) {
	// Should register without error even if invocation target doesn't exist yet
	r := NewRegistry()
	w := &Workflow{
		ID:    "parent",
		Entry: "A",
		Nodes: map[string]*Node{
			"A": {ID: "A", Spec: NodeSpec{}, Invokes: &InvocationSpec{WorkflowID: "nonexistent", ReturnMap: nil}},
			"B": {ID: "B", Spec: NodeSpec{}},
		},
		Edges: []Edge{{ID: "e1", From: "A", To: "B", Event: "NEXT"}},
	}
	if err := r.Register(w); err != nil {
		t.Fatalf("invocation ref to unregistered workflow should warn, not error: %v", err)
	}
}

func assertValidationError(t *testing.T, err error, code ValidationErrorCode) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected ValidationError with code %s, got nil", code)
	}
	var ve *ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("expected *ValidationError, got %T: %v", err, err)
	}
	if ve.Code != code {
		t.Errorf("expected code %s, got %s: %s", code, ve.Code, ve.Message)
	}
}
