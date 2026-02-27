// Package examples provides reference implementations for the Reflex engine.
package examples

import (
	"context"
	"fmt"

	reflex "github.com/corpus-relica/reflex/go"
)

// RuleAgent is a deterministic decision agent that interprets NodeSpec
// as a rule descriptor. It reads "suspend", "complete", "edge", and "writes"
// keys from the spec to produce a deterministic decision.
//
// Resolution order:
//  1. suspend → return suspend with reason
//  2. complete → return complete (with optional writes)
//  3. edge → resolve edge, return advance (with optional writes)
//
// Port of src/examples/rule-agent.ts.
type RuleAgent struct{}

// NewRuleAgent creates a new deterministic rule-based agent.
func NewRuleAgent() *RuleAgent { return &RuleAgent{} }

// Resolve implements reflex.DecisionAgent.
func (a *RuleAgent) Resolve(_ context.Context, dc reflex.DecisionContext) (reflex.Decision, error) {
	spec := dc.Node.Spec

	// 1. Suspend
	if reason, ok := spec["suspend"].(string); ok {
		return reflex.Decision{Type: reflex.DecisionSuspend, Reason: reason}, nil
	}

	// 2. Complete
	if complete, ok := spec["complete"].(bool); ok && complete {
		return reflex.Decision{Type: reflex.DecisionComplete, Writes: parseWrites(spec)}, nil
	}

	// 3. Advance — resolve edge
	edgeID, err := resolveEdge(spec, dc.ValidEdges)
	if err != nil {
		return reflex.Decision{}, err
	}
	return reflex.Decision{Type: reflex.DecisionAdvance, Edge: edgeID, Writes: parseWrites(spec)}, nil
}

func resolveEdge(spec reflex.NodeSpec, validEdges []reflex.Edge) (string, error) {
	edge := spec["edge"]
	switch e := edge.(type) {
	case string:
		return e, nil
	case []string:
		validIDs := make(map[string]bool, len(validEdges))
		for _, ve := range validEdges {
			validIDs[ve.ID] = true
		}
		for _, candidate := range e {
			if validIDs[candidate] {
				return candidate, nil
			}
		}
		if len(e) > 0 {
			return e[0], nil // let engine reject
		}
	case []any:
		validIDs := make(map[string]bool, len(validEdges))
		for _, ve := range validEdges {
			validIDs[ve.ID] = true
		}
		for _, candidate := range e {
			if s, ok := candidate.(string); ok && validIDs[s] {
				return s, nil
			}
		}
		if len(e) > 0 {
			if s, ok := e[0].(string); ok {
				return s, nil
			}
		}
	}

	// No edge specified — fall back to single valid edge
	if len(validEdges) == 1 {
		return validEdges[0].ID, nil
	}
	if len(validEdges) == 0 {
		return "", fmt.Errorf("no valid edges and no edge specified in spec")
	}
	return "", fmt.Errorf("multiple valid edges and no edge specified in spec")
}

func parseWrites(spec reflex.NodeSpec) []reflex.BlackboardWrite {
	raw, ok := spec["writes"]
	if !ok {
		return nil
	}
	switch w := raw.(type) {
	case []reflex.BlackboardWrite:
		return w
	case []any:
		var writes []reflex.BlackboardWrite
		for _, item := range w {
			if m, ok := item.(map[string]any); ok {
				key, _ := m["key"].(string)
				writes = append(writes, reflex.BlackboardWrite{Key: key, Value: m["value"]})
			}
		}
		return writes
	}
	return nil
}
