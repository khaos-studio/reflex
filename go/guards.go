package reflex

import (
	"fmt"
	"reflect"
)

// Evaluate implements the Guard interface for BuiltinGuard.
// Uses strict equality (reflect.DeepEqual) for equals/not-equals comparisons.
// Guards read from the full scope chain (local → parent → grandparent).
func (g *BuiltinGuard) Evaluate(bb BlackboardReader) (bool, error) {
	switch g.Type {
	case GuardExists:
		return bb.Has(g.Key), nil
	case GuardNotExists:
		return !bb.Has(g.Key), nil
	case GuardEquals:
		val, ok := bb.Get(g.Key)
		if !ok {
			return false, nil
		}
		return reflect.DeepEqual(val, g.Value), nil
	case GuardNotEquals:
		val, ok := bb.Get(g.Key)
		if !ok {
			return true, nil
		}
		return !reflect.DeepEqual(val, g.Value), nil
	default:
		return false, fmt.Errorf("unknown guard type: %s", g.Type)
	}
}

// Evaluate implements the Guard interface for CustomGuardFunc.
func (g *CustomGuardFunc) Evaluate(bb BlackboardReader) (bool, error) {
	return g.Fn(bb)
}

// FilterEdges computes valid outgoing edges for a node given the blackboard.
//
//  1. Collects outgoing edges (edge.From == nodeID)
//  2. Evaluates each edge's guard against the scoped blackboard
//  3. Edges with nil guard are always valid
//  4. Short-circuits on the first guard error
func FilterEdges(nodeID string, edges []Edge, bb BlackboardReader) ([]Edge, error) {
	var valid []Edge
	for i := range edges {
		if edges[i].From != nodeID {
			continue
		}
		if edges[i].Guard == nil {
			valid = append(valid, edges[i])
			continue
		}
		passed, err := edges[i].Guard.Evaluate(bb)
		if err != nil {
			return nil, err
		}
		if passed {
			valid = append(valid, edges[i])
		}
	}
	return valid, nil
}
