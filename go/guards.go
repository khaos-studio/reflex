package reflex

import (
	"encoding/json"
	"fmt"
	"reflect"
)

// Evaluate implements the Guard interface for BuiltinGuard.
// Uses numeric-aware equality for equals/not-equals comparisons: int(5)
// and float64(5.0) are treated as equal. This ensures guards evaluate
// correctly after JSON round-trips where numbers become float64.
// Non-numeric types fall back to reflect.DeepEqual.
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
		return numericEqual(val, g.Value), nil
	case GuardNotEquals:
		val, ok := bb.Get(g.Key)
		if !ok {
			return true, nil
		}
		return !numericEqual(val, g.Value), nil
	default:
		return false, fmt.Errorf("unknown guard type: %s", g.Type)
	}
}

// numericEqual attempts numeric comparison when both values are number-like.
// Falls back to reflect.DeepEqual for non-numeric types. This handles the
// common case where int values become float64 after JSON serialization.
func numericEqual(a, b any) bool {
	af, aOk := toFloat64(a)
	bf, bOk := toFloat64(b)
	if aOk && bOk {
		return af == bf
	}
	return reflect.DeepEqual(a, b)
}

// toFloat64 converts Go numeric types (including json.Number) to float64.
func toFloat64(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case float32:
		return float64(x), true
	case int:
		return float64(x), true
	case int8:
		return float64(x), true
	case int16:
		return float64(x), true
	case int32:
		return float64(x), true
	case int64:
		return float64(x), true
	case uint:
		return float64(x), true
	case uint8:
		return float64(x), true
	case uint16:
		return float64(x), true
	case uint32:
		return float64(x), true
	case uint64:
		return float64(x), true
	case json.Number:
		f, err := x.Float64()
		return f, err == nil
	default:
		return 0, false
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
