package examples

import (
	"context"
	"testing"

	reflex "github.com/corpus-relica/reflex/go"
)

// agentFn wraps a function as a DecisionAgent for inline test agents.
type agentFn func(ctx context.Context, dc reflex.DecisionContext) (reflex.Decision, error)

func (f agentFn) Resolve(ctx context.Context, dc reflex.DecisionContext) (reflex.Decision, error) {
	return f(ctx, dc)
}

// TestStreamingPersistence demonstrates cursor-based incremental reads
// for streaming persistence — reading only new blackboard entries after
// each step instead of re-scanning the full log.
//
// This pattern is used in production by khaos-wfl to persist workflow
// state to NDJSON files without quadratic duplication.
func TestStreamingPersistence(t *testing.T) {
	r := reflex.NewRegistry()
	_ = r.Register(&reflex.Workflow{
		ID:    "pipeline",
		Entry: "PARSE",
		Nodes: map[string]*reflex.Node{
			"PARSE":   {ID: "PARSE", Spec: reflex.NodeSpec{"writes": []reflex.BlackboardWrite{{Key: "parsed", Value: true}}}},
			"ANALYZE": {ID: "ANALYZE", Spec: reflex.NodeSpec{"writes": []reflex.BlackboardWrite{{Key: "score", Value: 85}}}},
			"DONE":    {ID: "DONE", Spec: reflex.NodeSpec{"complete": true}},
		},
		Edges: []reflex.Edge{
			{ID: "e1", From: "PARSE", To: "ANALYZE", Event: "NEXT"},
			{ID: "e2", From: "ANALYZE", To: "DONE", Event: "NEXT"},
		},
	})

	e := reflex.NewEngine(r, NewRuleAgent())
	_, _ = e.Init("pipeline")

	// Snapshot cursor before stepping
	bb := e.CurrentBlackboard()
	if bb == nil {
		t.Fatal("expected non-nil CurrentBlackboard after Init")
	}
	cursor := bb.Cursor()

	// Simulate a persistence log
	var persistedEntries []reflex.BlackboardEntry

	for {
		result, err := e.Step(context.Background())
		if err != nil {
			t.Fatalf("step error: %v", err)
		}

		// Read ONLY new entries since last cursor position
		entries, next := e.CurrentBlackboard().EntriesFrom(cursor)
		persistedEntries = append(persistedEntries, entries...)
		cursor = next

		if result.Status == reflex.StepCompleted {
			break
		}
	}

	// Verify: we captured entries without duplicates
	if len(persistedEntries) < 2 {
		t.Errorf("expected ≥2 persisted entries (parsed + score), got %d", len(persistedEntries))
	}

	// Verify specific keys were captured
	keys := make(map[string]bool)
	for _, e := range persistedEntries {
		keys[e.Key] = true
	}
	if !keys["parsed"] {
		t.Error("missing 'parsed' key in persisted entries")
	}
	if !keys["score"] {
		t.Error("missing 'score' key in persisted entries")
	}
}

// TestSeedBlackboardAndTypedAccessors demonstrates initializing a workflow
// with seed values and reading them back with type-safe accessors.
//
// Seed values configure the workflow at Init() time — the agent can read
// them to make decisions without hardcoding per-workflow behavior.
func TestSeedBlackboardAndTypedAccessors(t *testing.T) {
	r := reflex.NewRegistry()
	_ = r.Register(&reflex.Workflow{
		ID:    "configurable",
		Entry: "RUN",
		Nodes: map[string]*reflex.Node{
			"RUN":  {ID: "RUN", Spec: reflex.NodeSpec{}},
			"DONE": {ID: "DONE", Spec: reflex.NodeSpec{"complete": true}},
		},
		Edges: []reflex.Edge{
			{ID: "e1", From: "RUN", To: "DONE", Event: "NEXT"},
		},
	})

	// Init with seed values — configures the workflow run
	e := reflex.NewEngine(r, NewRuleAgent())
	_, err := e.Init("configurable", reflex.InitOptions{
		Blackboard: []reflex.BlackboardWrite{
			{Key: "project_path", Value: "/Users/demo/projects/test.kspd"},
			{Key: "max_retries", Value: 3},
			{Key: "verbose", Value: true},
			{Key: "threshold", Value: 0.75},
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	// Read seeds back with typed accessors — no manual type assertions
	bb := e.Blackboard()

	path, ok := reflex.BBString(bb, "project_path")
	if !ok || path != "/Users/demo/projects/test.kspd" {
		t.Errorf("BBString(project_path) = %q, %v", path, ok)
	}

	retries, ok := reflex.BBInt(bb, "max_retries")
	if !ok || retries != 3 {
		t.Errorf("BBInt(max_retries) = %d, %v", retries, ok)
	}

	verbose, ok := reflex.BBBool(bb, "verbose")
	if !ok || !verbose {
		t.Errorf("BBBool(verbose) = %v, %v", verbose, ok)
	}

	threshold, ok := reflex.BBFloat(bb, "threshold")
	if !ok || threshold != 0.75 {
		t.Errorf("BBFloat(threshold) = %f, %v", threshold, ok)
	}

	// Missing key returns zero value + false
	_, ok = reflex.BBString(bb, "nonexistent")
	if ok {
		t.Error("expected ok=false for missing key")
	}
}

// TestNumericGuardsAfterJSONRoundTrip demonstrates that guards evaluate
// correctly even after JSON serialization round-trips change int → float64.
//
// This is critical for persistence: a guard checking batch_idx == 5 must
// still pass when the restored value is float64(5) instead of int(5).
func TestNumericGuardsAfterJSONRoundTrip(t *testing.T) {
	r := reflex.NewRegistry()
	_ = r.Register(&reflex.Workflow{
		ID:    "guarded",
		Entry: "CHECK",
		Nodes: map[string]*reflex.Node{
			"CHECK": {ID: "CHECK", Spec: reflex.NodeSpec{
				"writes": []reflex.BlackboardWrite{{Key: "status", Value: "checked"}},
			}},
			"PASS": {ID: "PASS", Spec: reflex.NodeSpec{"complete": true}},
			"FAIL": {ID: "FAIL", Spec: reflex.NodeSpec{"complete": true}},
		},
		Edges: []reflex.Edge{
			// Guard: only take PASS edge when count == 3
			{ID: "pass", From: "CHECK", To: "PASS", Event: "NEXT", Guard: &reflex.BuiltinGuard{
				Type: reflex.GuardEquals, Key: "count", Value: float64(3), // float64 as if from JSON
			}},
			{ID: "fail", From: "CHECK", To: "FAIL", Event: "NEXT", Guard: &reflex.BuiltinGuard{
				Type: reflex.GuardNotEquals, Key: "count", Value: float64(3),
			}},
		},
	})

	// Seed with int(3) — guard compares int(3) == float64(3), must pass
	e := reflex.NewEngine(r, NewRuleAgent())
	_, _ = e.Init("guarded", reflex.InitOptions{
		Blackboard: []reflex.BlackboardWrite{
			{Key: "count", Value: 3}, // int, not float64
		},
	})

	res, err := e.Run(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != reflex.StepCompleted {
		t.Fatalf("expected completed, got %s", res.Status)
	}

	// Should have gone through PASS (int(3) equals float64(3))
	v, _ := e.Blackboard().Get("status")
	if v != "checked" {
		t.Errorf("expected status='checked', got %v", v)
	}
}

// TestSuspendWithWritesPersistence demonstrates that writes included in a
// suspend decision are applied to the blackboard before suspension.
// This allows agents to record partial progress that survives across
// suspend/resume cycles.
func TestSuspendWithWritesPersistence(t *testing.T) {
	r := reflex.NewRegistry()
	_ = r.Register(&reflex.Workflow{
		ID:    "suspend-writes",
		Entry: "WORK",
		Nodes: map[string]*reflex.Node{
			"WORK": {ID: "WORK", Spec: reflex.NodeSpec{}},
			"DONE": {ID: "DONE", Spec: reflex.NodeSpec{"complete": true}},
		},
		Edges: []reflex.Edge{
			{ID: "e1", From: "WORK", To: "DONE", Event: "NEXT"},
		},
	})

	callCount := 0
	agent := agentFn(func(_ context.Context, dc reflex.DecisionContext) (reflex.Decision, error) {
		callCount++
		if callCount == 1 {
			// First call: suspend with partial progress written
			return reflex.Decision{
				Type:   reflex.DecisionSuspend,
				Reason: "waiting for external input",
				Writes: []reflex.BlackboardWrite{
					{Key: "progress", Value: "50%"},
					{Key: "last_step", Value: "WORK"},
				},
			}, nil
		}
		// Resume: advance to DONE
		if len(dc.ValidEdges) > 0 {
			return reflex.Decision{Type: reflex.DecisionAdvance, Edge: dc.ValidEdges[0].ID}, nil
		}
		return reflex.Decision{Type: reflex.DecisionComplete}, nil
	})

	e := reflex.NewEngine(r, agent)
	_, _ = e.Init("suspend-writes")

	// Step 1: suspends with writes
	res, _ := e.Step(context.Background())
	if res.Status != reflex.StepSuspended {
		t.Fatalf("expected suspended, got %s", res.Status)
	}

	// Verify writes were applied despite suspension
	progress, ok := reflex.BBString(e.Blackboard(), "progress")
	if !ok || progress != "50%" {
		t.Errorf("expected progress='50%%', got %q (ok=%v)", progress, ok)
	}

	// Cursor should reflect the suspend writes
	bb := e.CurrentBlackboard()
	entries, _ := bb.EntriesFrom(0)
	keys := make([]string, len(entries))
	for i, e := range entries {
		keys[i] = e.Key
	}
	t.Logf("blackboard entries after suspend: %v", keys)

	hasProgress := false
	for _, e := range entries {
		if e.Key == "progress" {
			hasProgress = true
		}
	}
	if !hasProgress {
		t.Error("suspend writes not visible in cursor entries")
	}

	// Step 2: resume and complete
	res, _ = e.Step(context.Background())
	if res.Status != reflex.StepAdvanced {
		t.Fatalf("expected advanced after resume, got %s", res.Status)
	}
}
