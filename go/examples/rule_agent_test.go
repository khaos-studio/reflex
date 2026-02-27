package examples

import (
	"context"
	"testing"

	reflex "github.com/corpus-relica/reflex/go"
)

func TestRuleAgentSuspend(t *testing.T) {
	agent := NewRuleAgent()
	dc := reflex.DecisionContext{
		Node: &reflex.Node{ID: "n", Spec: reflex.NodeSpec{"suspend": "waiting"}},
	}
	d, err := agent.Resolve(context.Background(), dc)
	if err != nil {
		t.Fatal(err)
	}
	if d.Type != reflex.DecisionSuspend || d.Reason != "waiting" {
		t.Errorf("expected suspend with reason 'waiting', got %v", d)
	}
}

func TestRuleAgentComplete(t *testing.T) {
	agent := NewRuleAgent()
	dc := reflex.DecisionContext{
		Node: &reflex.Node{ID: "n", Spec: reflex.NodeSpec{"complete": true}},
	}
	d, err := agent.Resolve(context.Background(), dc)
	if err != nil {
		t.Fatal(err)
	}
	if d.Type != reflex.DecisionComplete {
		t.Errorf("expected complete, got %v", d)
	}
}

func TestRuleAgentCompleteWithWrites(t *testing.T) {
	agent := NewRuleAgent()
	dc := reflex.DecisionContext{
		Node: &reflex.Node{ID: "n", Spec: reflex.NodeSpec{
			"complete": true,
			"writes":   []reflex.BlackboardWrite{{Key: "k", Value: "v"}},
		}},
	}
	d, err := agent.Resolve(context.Background(), dc)
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Writes) != 1 || d.Writes[0].Key != "k" {
		t.Errorf("expected 1 write, got %v", d.Writes)
	}
}

func TestRuleAgentAdvanceExplicitEdge(t *testing.T) {
	agent := NewRuleAgent()
	dc := reflex.DecisionContext{
		Node:       &reflex.Node{ID: "n", Spec: reflex.NodeSpec{"edge": "e1"}},
		ValidEdges: []reflex.Edge{{ID: "e1"}, {ID: "e2"}},
	}
	d, err := agent.Resolve(context.Background(), dc)
	if err != nil {
		t.Fatal(err)
	}
	if d.Type != reflex.DecisionAdvance || d.Edge != "e1" {
		t.Errorf("expected advance e1, got %v", d)
	}
}

func TestRuleAgentAdvancePriorityList(t *testing.T) {
	agent := NewRuleAgent()
	dc := reflex.DecisionContext{
		Node:       &reflex.Node{ID: "n", Spec: reflex.NodeSpec{"edge": []string{"e2", "e1"}}},
		ValidEdges: []reflex.Edge{{ID: "e1"}},
	}
	d, err := agent.Resolve(context.Background(), dc)
	if err != nil {
		t.Fatal(err)
	}
	if d.Edge != "e1" {
		t.Errorf("expected e1 (first valid from priority list), got %s", d.Edge)
	}
}

func TestRuleAgentAdvanceSingleValidEdge(t *testing.T) {
	agent := NewRuleAgent()
	dc := reflex.DecisionContext{
		Node:       &reflex.Node{ID: "n", Spec: reflex.NodeSpec{}},
		ValidEdges: []reflex.Edge{{ID: "e1"}},
	}
	d, err := agent.Resolve(context.Background(), dc)
	if err != nil {
		t.Fatal(err)
	}
	if d.Edge != "e1" {
		t.Errorf("expected auto-selected e1, got %s", d.Edge)
	}
}

func TestRuleAgentErrorMultipleEdges(t *testing.T) {
	agent := NewRuleAgent()
	dc := reflex.DecisionContext{
		Node:       &reflex.Node{ID: "n", Spec: reflex.NodeSpec{}},
		ValidEdges: []reflex.Edge{{ID: "e1"}, {ID: "e2"}},
	}
	_, err := agent.Resolve(context.Background(), dc)
	if err == nil {
		t.Error("expected error for ambiguous edges")
	}
}

func TestRuleAgentErrorNoEdges(t *testing.T) {
	agent := NewRuleAgent()
	dc := reflex.DecisionContext{
		Node:       &reflex.Node{ID: "n", Spec: reflex.NodeSpec{}},
		ValidEdges: nil,
	}
	_, err := agent.Resolve(context.Background(), dc)
	if err == nil {
		t.Error("expected error for no valid edges")
	}
}
