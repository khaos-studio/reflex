package examples

import (
	"context"
	"testing"

	reflex "github.com/corpus-relica/reflex/go"
)

func TestE2ELinearWorkflow(t *testing.T) {
	r := reflex.NewRegistry()
	_ = r.Register(LinearWorkflow("linear"))

	e := reflex.NewEngine(r, NewRuleAgent())
	_, _ = e.Init("linear")

	res, err := e.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != reflex.StepCompleted {
		t.Errorf("expected completed, got %s", res.Status)
	}
}

func TestE2EBranchingWorkflow(t *testing.T) {
	r := reflex.NewRegistry()
	_ = r.Register(BranchingWorkflow())

	e := reflex.NewEngine(r, NewRuleAgent())
	_, _ = e.Init("branching")

	res, err := e.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != reflex.StepCompleted {
		t.Errorf("expected completed, got %s", res.Status)
	}
}

func TestE2EParentChildWorkflow(t *testing.T) {
	r := reflex.NewRegistry()
	parent, child := ParentChildWorkflows()
	_ = r.Register(child)
	_ = r.Register(parent)

	e := reflex.NewEngine(r, NewRuleAgent())
	_, _ = e.Init("parent")

	res, err := e.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != reflex.StepCompleted {
		t.Errorf("expected completed, got %s", res.Status)
	}

	// Verify returnMap propagated output → result
	v, ok := e.Blackboard().Get("result")
	if !ok || v != "from_child" {
		t.Errorf("expected result='from_child', got %v (ok=%v)", v, ok)
	}
}

func TestE2EEventTracking(t *testing.T) {
	r := reflex.NewRegistry()
	_ = r.Register(LinearWorkflow("linear"))

	e := reflex.NewEngine(r, NewRuleAgent())

	nodeEnters := 0
	e.On(reflex.EventNodeEnter, func(ev reflex.Event) { nodeEnters++ })

	edgeTraversals := 0
	e.On(reflex.EventEdgeTraverse, func(ev reflex.Event) { edgeTraversals++ })

	_, _ = e.Init("linear")
	_, _ = e.Run(context.Background())

	// A→B, B→C = 2 edge traversals, 2 node enters
	if edgeTraversals != 2 {
		t.Errorf("expected 2 edge traversals, got %d", edgeTraversals)
	}
	if nodeEnters != 2 {
		t.Errorf("expected 2 node enters, got %d", nodeEnters)
	}
}

func TestE2EBlackboardAuditTrail(t *testing.T) {
	r := reflex.NewRegistry()
	_ = r.Register(&reflex.Workflow{
		ID:    "audit",
		Entry: "S1",
		Nodes: map[string]*reflex.Node{
			"S1": {ID: "S1", Spec: reflex.NodeSpec{
				"writes": []reflex.BlackboardWrite{{Key: "step", Value: "s1"}},
			}},
			"S2": {ID: "S2", Spec: reflex.NodeSpec{
				"writes": []reflex.BlackboardWrite{{Key: "step", Value: "s2"}},
			}},
			"S3": {ID: "S3", Spec: reflex.NodeSpec{"complete": true}},
		},
		Edges: []reflex.Edge{
			{ID: "e1", From: "S1", To: "S2", Event: "NEXT"},
			{ID: "e2", From: "S2", To: "S3", Event: "NEXT"},
		},
	})

	e := reflex.NewEngine(r, NewRuleAgent())
	_, _ = e.Init("audit")
	_, _ = e.Run(context.Background())

	all := e.Blackboard().GetAll("step")
	if len(all) != 2 {
		t.Errorf("expected 2 audit entries for 'step', got %d", len(all))
	}
	if all[0].Value != "s1" || all[1].Value != "s2" {
		t.Error("audit trail order mismatch")
	}
}
