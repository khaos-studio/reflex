package examples

import reflex "github.com/corpus-relica/reflex/go"

// LinearWorkflow creates a simple A→B→C linear workflow for testing.
func LinearWorkflow(id string) *reflex.Workflow {
	return &reflex.Workflow{
		ID:    id,
		Entry: "A",
		Nodes: map[string]*reflex.Node{
			"A": {ID: "A", Spec: reflex.NodeSpec{"autoAdvance": true}},
			"B": {ID: "B", Spec: reflex.NodeSpec{"autoAdvance": true}},
			"C": {ID: "C", Spec: reflex.NodeSpec{"complete": true}},
		},
		Edges: []reflex.Edge{
			{ID: "e1", From: "A", To: "B", Event: "NEXT"},
			{ID: "e2", From: "B", To: "C", Event: "NEXT"},
		},
	}
}

// BranchingWorkflow creates a workflow with guard-based branching.
// INIT → DECIDE → (LEFT or RIGHT, guarded on "choice" key) → END
func BranchingWorkflow() *reflex.Workflow {
	return &reflex.Workflow{
		ID:    "branching",
		Entry: "INIT",
		Nodes: map[string]*reflex.Node{
			"INIT":  {ID: "INIT", Spec: reflex.NodeSpec{"writes": []reflex.BlackboardWrite{{Key: "choice", Value: "right"}}}},
			"DECIDE": {ID: "DECIDE", Spec: reflex.NodeSpec{}},
			"LEFT":  {ID: "LEFT", Spec: reflex.NodeSpec{"complete": true}},
			"RIGHT": {ID: "RIGHT", Spec: reflex.NodeSpec{"complete": true}},
		},
		Edges: []reflex.Edge{
			{ID: "e-init", From: "INIT", To: "DECIDE", Event: "NEXT"},
			{ID: "e-left", From: "DECIDE", To: "LEFT", Event: "GO",
				Guard: &reflex.BuiltinGuard{Type: reflex.GuardEquals, Key: "choice", Value: "left"}},
			{ID: "e-right", From: "DECIDE", To: "RIGHT", Event: "GO",
				Guard: &reflex.BuiltinGuard{Type: reflex.GuardEquals, Key: "choice", Value: "right"}},
		},
	}
}

// ParentChildWorkflows returns a parent and child workflow for sub-workflow tests.
// Parent: START → INVOKE(child) → END
// Child: CHILD_START → CHILD_END
func ParentChildWorkflows() (*reflex.Workflow, *reflex.Workflow) {
	child := &reflex.Workflow{
		ID:    "child",
		Entry: "CHILD_START",
		Nodes: map[string]*reflex.Node{
			"CHILD_START": {ID: "CHILD_START", Spec: reflex.NodeSpec{
				"writes": []reflex.BlackboardWrite{{Key: "output", Value: "from_child"}},
			}},
			"CHILD_END": {ID: "CHILD_END", Spec: reflex.NodeSpec{"complete": true}},
		},
		Edges: []reflex.Edge{
			{ID: "ec1", From: "CHILD_START", To: "CHILD_END", Event: "NEXT"},
		},
	}

	parent := &reflex.Workflow{
		ID:    "parent",
		Entry: "START",
		Nodes: map[string]*reflex.Node{
			"START": {ID: "START", Spec: reflex.NodeSpec{}},
			"INVOKE": {ID: "INVOKE", Spec: reflex.NodeSpec{}, Invokes: &reflex.InvocationSpec{
				WorkflowID: "child",
				ReturnMap:  []reflex.ReturnMapping{{ParentKey: "result", ChildKey: "output"}},
			}},
			"END": {ID: "END", Spec: reflex.NodeSpec{"complete": true}},
		},
		Edges: []reflex.Edge{
			{ID: "ep1", From: "START", To: "INVOKE", Event: "NEXT"},
			{ID: "ep2", From: "INVOKE", To: "END", Event: "NEXT"},
		},
	}

	return parent, child
}

// SuspensionWorkflow creates a workflow where the first node suspends.
// WAIT(suspend) → DONE(complete)
func SuspensionWorkflow() *reflex.Workflow {
	return &reflex.Workflow{
		ID:    "suspension",
		Entry: "WAIT",
		Nodes: map[string]*reflex.Node{
			"WAIT": {ID: "WAIT", Spec: reflex.NodeSpec{"suspend": "awaiting input"}},
			"DONE": {ID: "DONE", Spec: reflex.NodeSpec{"complete": true}},
		},
		Edges: []reflex.Edge{
			{ID: "e1", From: "WAIT", To: "DONE", Event: "NEXT"},
		},
	}
}
