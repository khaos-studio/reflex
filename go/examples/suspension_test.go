package examples

import (
	"context"
	"testing"

	reflex "github.com/corpus-relica/reflex/go"
)

func TestSuspensionAndResumption(t *testing.T) {
	r := reflex.NewRegistry()
	_ = r.Register(SuspensionWorkflow())

	agent := NewRuleAgent()
	e := reflex.NewEngine(r, agent)
	_, _ = e.Init("suspension")

	// Step 1: WAIT suspends
	res, err := e.Step(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != reflex.StepSuspended {
		t.Fatalf("expected suspended, got %s", res.Status)
	}
	if res.Reason != "awaiting input" {
		t.Errorf("expected reason 'awaiting input', got '%s'", res.Reason)
	}
	if e.Status() != reflex.StatusSuspended {
		t.Error("engine should be suspended")
	}
	if e.CurrentNode().ID != "WAIT" {
		t.Error("should still be at WAIT node")
	}
}

func TestSuspensionRunReturnsSuspended(t *testing.T) {
	r := reflex.NewRegistry()
	_ = r.Register(SuspensionWorkflow())

	e := reflex.NewEngine(r, NewRuleAgent())
	_, _ = e.Init("suspension")

	res, err := e.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != reflex.StepSuspended {
		t.Errorf("expected Run to return suspended, got %s", res.Status)
	}
}

func TestSuspensionResumeAfterSuspend(t *testing.T) {
	r := reflex.NewRegistry()

	// Custom workflow: WAIT → PROCESS → DONE
	// WAIT suspends first time, advances second time
	_ = r.Register(&reflex.Workflow{
		ID:    "resume-test",
		Entry: "WAIT",
		Nodes: map[string]*reflex.Node{
			"WAIT":    {ID: "WAIT", Spec: reflex.NodeSpec{"suspend": "need data"}},
			"PROCESS": {ID: "PROCESS", Spec: reflex.NodeSpec{}},
			"DONE":    {ID: "DONE", Spec: reflex.NodeSpec{"complete": true}},
		},
		Edges: []reflex.Edge{
			{ID: "e1", From: "WAIT", To: "PROCESS", Event: "NEXT"},
			{ID: "e2", From: "PROCESS", To: "DONE", Event: "NEXT"},
		},
	})

	callCount := 0
	agent := &countingAgent{calls: &callCount}
	e := reflex.NewEngine(r, agent)
	_, _ = e.Init("resume-test")

	// Step 1: suspend
	res1, _ := e.Step(context.Background())
	if res1.Status != reflex.StepSuspended {
		t.Fatalf("expected suspended, got %s", res1.Status)
	}

	// After suspension, continue stepping (agent now advances)
	res2, _ := e.Step(context.Background())
	if res2.Status != reflex.StepAdvanced || res2.Node.ID != "PROCESS" {
		t.Fatalf("expected advanced to PROCESS, got %s", res2.Status)
	}

	res3, _ := e.Step(context.Background())
	if res3.Status != reflex.StepAdvanced || res3.Node.ID != "DONE" {
		t.Fatalf("expected advanced to DONE, got %s", res3.Status)
	}

	res4, _ := e.Step(context.Background())
	if res4.Status != reflex.StepCompleted {
		t.Fatalf("expected completed, got %s", res4.Status)
	}
}

// countingAgent suspends on first call to each node, advances on second.
type countingAgent struct {
	calls     *int
	nodeVisits map[string]int
}

func (a *countingAgent) Resolve(_ context.Context, dc reflex.DecisionContext) (reflex.Decision, error) {
	if a.nodeVisits == nil {
		a.nodeVisits = make(map[string]int)
	}
	a.nodeVisits[dc.Node.ID]++
	*a.calls++

	// First visit to a node with "suspend" spec → suspend
	if _, hasSuspend := dc.Node.Spec["suspend"]; hasSuspend && a.nodeVisits[dc.Node.ID] == 1 {
		return reflex.Decision{Type: reflex.DecisionSuspend, Reason: dc.Node.Spec["suspend"].(string)}, nil
	}

	if len(dc.ValidEdges) == 0 {
		return reflex.Decision{Type: reflex.DecisionComplete}, nil
	}
	return reflex.Decision{Type: reflex.DecisionAdvance, Edge: dc.ValidEdges[0].ID}, nil
}

func TestSuspensionMultipleSuspends(t *testing.T) {
	r := reflex.NewRegistry()
	_ = r.Register(&reflex.Workflow{
		ID:    "multi-suspend",
		Entry: "A",
		Nodes: map[string]*reflex.Node{
			"A": {ID: "A", Spec: reflex.NodeSpec{"suspend": "first"}},
			"B": {ID: "B", Spec: reflex.NodeSpec{"suspend": "second"}},
			"C": {ID: "C", Spec: reflex.NodeSpec{"complete": true}},
		},
		Edges: []reflex.Edge{
			{ID: "e1", From: "A", To: "B", Event: "NEXT"},
			{ID: "e2", From: "B", To: "C", Event: "NEXT"},
		},
	})

	callCount := 0
	agent := &countingAgent{calls: &callCount}
	e := reflex.NewEngine(r, agent)
	_, _ = e.Init("multi-suspend")

	// A suspends
	r1, _ := e.Step(context.Background())
	if r1.Status != reflex.StepSuspended || r1.Reason != "first" {
		t.Fatalf("expected suspend 'first', got %s %s", r1.Status, r1.Reason)
	}

	// Resume A → advance to B
	r2, _ := e.Step(context.Background())
	if r2.Status != reflex.StepAdvanced || r2.Node.ID != "B" {
		t.Fatalf("expected advance to B, got %s", r2.Status)
	}

	// B suspends
	r3, _ := e.Step(context.Background())
	if r3.Status != reflex.StepSuspended || r3.Reason != "second" {
		t.Fatalf("expected suspend 'second', got %s %s", r3.Status, r3.Reason)
	}

	// Resume B → advance to C
	r4, _ := e.Step(context.Background())
	if r4.Status != reflex.StepAdvanced || r4.Node.ID != "C" {
		t.Fatalf("expected advance to C, got %s", r4.Status)
	}

	// C completes
	r5, _ := e.Step(context.Background())
	if r5.Status != reflex.StepCompleted {
		t.Fatalf("expected completed, got %s", r5.Status)
	}
}
