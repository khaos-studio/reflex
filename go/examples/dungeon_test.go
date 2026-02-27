package examples

import (
	"context"
	"testing"

	reflex "github.com/corpus-relica/reflex/go"
)

// setupDungeon creates a registry with all three workflows and a fresh engine.
func setupDungeon(t *testing.T) (*reflex.Engine, *DungeonAgent) {
	t.Helper()
	registry := reflex.CreateRegistry()
	registry.Register(DungeonCrawlWorkflow())
	registry.Register(CombatWorkflow())
	registry.Register(PuzzleWorkflow())

	agent := &DungeonAgent{}
	engine := reflex.CreateEngine(registry, agent)
	_, err := engine.Init("dungeon-crawl")
	if err != nil {
		t.Fatalf("init: %v", err)
	}
	return engine, agent
}

// advanceUntilSuspend calls Step repeatedly until the engine suspends or completes.
func advanceUntilSuspend(t *testing.T, engine *reflex.Engine) reflex.StepResult {
	t.Helper()
	ctx := context.Background()
	for i := 0; i < 100; i++ {
		result, err := engine.Step(ctx)
		if err != nil {
			t.Fatalf("step %d: %v", i, err)
		}
		if result.Status == "suspended" || result.Status == "completed" {
			return result
		}
	}
	t.Fatal("too many steps without suspend/complete")
	return reflex.StepResult{}
}

func TestDungeonVictoryPath(t *testing.T) {
	engine, agent := setupDungeon(t)

	// ENTRANCE → ANTECHAMBER → WEST_WING → ARMORY (suspend: take sword)
	r := advanceUntilSuspend(t, engine)
	if r.Status != "suspended" {
		t.Fatalf("expected suspend at ARMORY, got %s", r.Status)
	}

	// Take the sword
	agent.SetChoice("armory_choice", "take")
	r = advanceUntilSuspend(t, engine)
	// Should advance through GUARD_ROOM (combat sub-workflow) → ENCOUNTER → PLAYER_TURN (suspend)
	if r.Status != "suspended" {
		t.Fatalf("expected suspend at PLAYER_TURN, got %s", r.Status)
	}

	// Attack in combat
	agent.SetChoice("action", "attack")
	r = advanceUntilSuspend(t, engine)
	// Combat resolves → back to parent → WEST_SEAL → EAST_WING → LIBRARY (puzzle sub-workflow) → EXAMINE → ATTEMPT (suspend)
	if r.Status != "suspended" {
		t.Fatalf("expected suspend at puzzle ATTEMPT, got %s", r.Status)
	}

	// Answer riddle correctly
	agent.SetChoice("answer", "correct")
	r = advanceUntilSuspend(t, engine)
	// Puzzle completes → back to parent → ARCHIVES (suspend)
	if r.Status != "suspended" {
		t.Fatalf("expected suspend at ARCHIVES, got %s", r.Status)
	}

	// Take potion
	agent.SetChoice("archives_choice", "take")
	r = advanceUntilSuspend(t, engine)
	// EAST_SEAL → GREAT_HALL (suspend)
	if r.Status != "suspended" {
		t.Fatalf("expected suspend at GREAT_HALL, got %s", r.Status)
	}

	// Choose boss door
	agent.SetChoice("hall_choice", "boss")
	r = advanceUntilSuspend(t, engine)
	// BOSS_DOOR → BOSS_LAIR (combat) → ENCOUNTER → PLAYER_TURN (suspend)
	if r.Status != "suspended" {
		t.Fatalf("expected suspend at boss PLAYER_TURN, got %s", r.Status)
	}

	// Attack boss
	agent.SetChoice("action", "attack")
	r = advanceUntilSuspend(t, engine)
	// Combat resolves → THRONE → VICTORY → complete
	if r.Status != "completed" {
		t.Fatalf("expected completed (victory), got %s", r.Status)
	}
}

func TestDungeonEscapePath(t *testing.T) {
	engine, agent := setupDungeon(t)

	// Take sword
	advanceUntilSuspend(t, engine)
	agent.SetChoice("armory_choice", "take")

	// Win guard combat
	advanceUntilSuspend(t, engine)
	agent.SetChoice("action", "attack")

	// Answer riddle wrong
	advanceUntilSuspend(t, engine)
	agent.SetChoice("answer", "wrong1")

	// Skip potion
	advanceUntilSuspend(t, engine)
	agent.SetChoice("archives_choice", "leave")

	// Escape at Great Hall
	r := advanceUntilSuspend(t, engine)
	if r.Status != "suspended" {
		t.Fatalf("expected suspend at GREAT_HALL, got %s", r.Status)
	}
	agent.SetChoice("hall_choice", "escape")
	r = advanceUntilSuspend(t, engine)
	if r.Status != "completed" {
		t.Fatalf("expected completed (escape), got %s", r.Status)
	}
}

func TestDungeonBlackboardSeals(t *testing.T) {
	engine, agent := setupDungeon(t)

	// Take sword, win combat, solve puzzle, take potion, reach Great Hall
	advanceUntilSuspend(t, engine)
	agent.SetChoice("armory_choice", "take")
	advanceUntilSuspend(t, engine)
	agent.SetChoice("action", "attack")
	advanceUntilSuspend(t, engine)
	agent.SetChoice("answer", "correct")
	advanceUntilSuspend(t, engine)
	agent.SetChoice("archives_choice", "take")
	advanceUntilSuspend(t, engine)

	// At GREAT_HALL — blackboard should have both seals
	bb := engine.Blackboard()
	if !bb.Has("has_west_seal") {
		t.Error("missing has_west_seal")
	}
	if !bb.Has("has_east_seal") {
		t.Error("missing has_east_seal")
	}
	if !bb.Has("has_sword") {
		t.Error("missing has_sword")
	}
	if !bb.Has("has_potion") {
		t.Error("missing has_potion")
	}
}

func TestDungeonCombatSubWorkflow(t *testing.T) {
	// Test combat as standalone
	registry := reflex.CreateRegistry()
	registry.Register(CombatWorkflow())

	agent := &DungeonAgent{}
	engine := reflex.CreateEngine(registry, agent)
	_, err := engine.Init("combat")
	if err != nil {
		t.Fatalf("init: %v", err)
	}

	// Encounter auto-advances, suspends at PLAYER_TURN
	r := advanceUntilSuspend(t, engine)
	if r.Status != "suspended" {
		t.Fatalf("expected suspend, got %s", r.Status)
	}

	// Attack
	agent.SetChoice("action", "attack")
	r = advanceUntilSuspend(t, engine)
	if r.Status != "completed" {
		t.Fatalf("expected completed, got %s", r.Status)
	}

	// Check combat result on blackboard
	bb := engine.Blackboard()
	result, ok := bb.Get("combat_result")
	if !ok {
		t.Fatal("missing combat_result")
	}
	if result != "victory" && result != "defeat" {
		t.Fatalf("unexpected combat_result: %v", result)
	}
}

func TestDungeonPuzzleSolvedReturnMap(t *testing.T) {
	// Test puzzle as standalone
	registry := reflex.CreateRegistry()
	registry.Register(PuzzleWorkflow())

	agent := &DungeonAgent{}
	engine := reflex.CreateEngine(registry, agent)
	_, err := engine.Init("puzzle-riddle")
	if err != nil {
		t.Fatalf("init: %v", err)
	}

	r := advanceUntilSuspend(t, engine)
	if r.Status != "suspended" {
		t.Fatalf("expected suspend at ATTEMPT, got %s", r.Status)
	}

	agent.SetChoice("answer", "correct")
	r = advanceUntilSuspend(t, engine)
	if r.Status != "completed" {
		t.Fatalf("expected completed, got %s", r.Status)
	}

	bb := engine.Blackboard()
	solved, ok := bb.Get("puzzle_solved")
	if !ok || solved != true {
		t.Fatalf("expected puzzle_solved=true, got %v (ok=%v)", solved, ok)
	}
}

func TestDungeonPuzzleFailedPath(t *testing.T) {
	registry := reflex.CreateRegistry()
	registry.Register(PuzzleWorkflow())

	agent := &DungeonAgent{}
	engine := reflex.CreateEngine(registry, agent)
	engine.Init("puzzle-riddle")

	advanceUntilSuspend(t, engine)
	agent.SetChoice("answer", "wrong1")
	r := advanceUntilSuspend(t, engine)
	if r.Status != "completed" {
		t.Fatalf("expected completed, got %s", r.Status)
	}

	bb := engine.Blackboard()
	solved, ok := bb.Get("puzzle_solved")
	if !ok || solved != false {
		t.Fatalf("expected puzzle_solved=false, got %v", solved)
	}
}

func TestDungeonEventsEmitted(t *testing.T) {
	engine, agent := setupDungeon(t)

	nodeEnters := 0
	edgeTraversals := 0
	workflowPushes := 0
	workflowPops := 0
	engine.On(reflex.EventNodeEnter, func(_ reflex.Event) { nodeEnters++ })
	engine.On(reflex.EventEdgeTraverse, func(_ reflex.Event) { edgeTraversals++ })
	engine.On(reflex.EventWorkflowPush, func(_ reflex.Event) { workflowPushes++ })
	engine.On(reflex.EventWorkflowPop, func(_ reflex.Event) { workflowPops++ })

	// Play through escape path
	advanceUntilSuspend(t, engine)
	agent.SetChoice("armory_choice", "take")
	advanceUntilSuspend(t, engine)
	agent.SetChoice("action", "attack")
	advanceUntilSuspend(t, engine)
	agent.SetChoice("answer", "correct")
	advanceUntilSuspend(t, engine)
	agent.SetChoice("archives_choice", "take")
	advanceUntilSuspend(t, engine)
	agent.SetChoice("hall_choice", "escape")
	advanceUntilSuspend(t, engine)

	if nodeEnters < 10 {
		t.Errorf("expected at least 10 node enters, got %d", nodeEnters)
	}
	if edgeTraversals < 5 {
		t.Errorf("expected at least 5 edge traversals, got %d", edgeTraversals)
	}
	// 2 sub-workflows: combat (guard room) + puzzle
	if workflowPushes < 2 {
		t.Errorf("expected at least 2 workflow pushes (sub-workflows), got %d", workflowPushes)
	}
	if workflowPops < 2 {
		t.Errorf("expected at least 2 workflow pops, got %d", workflowPops)
	}
}

func TestDungeonCombatReadsParentBlackboard(t *testing.T) {
	engine, agent := setupDungeon(t)

	// Take sword at ARMORY
	advanceUntilSuspend(t, engine)
	agent.SetChoice("armory_choice", "take")

	// Now in combat sub-workflow (GUARD_ROOM invokes combat)
	// The combat agent reads has_sword from parent blackboard via scoped reads
	r := advanceUntilSuspend(t, engine) // at PLAYER_TURN
	if r.Status != "suspended" {
		t.Fatalf("expected suspend at PLAYER_TURN, got %s", r.Status)
	}

	// Attack — with sword, should deal 3 damage
	agent.SetChoice("action", "attack")
	advanceUntilSuspend(t, engine)

	// After combat, check guard_combat_result was returned
	bb := engine.Blackboard()
	result, ok := bb.Get("guard_combat_result")
	if !ok {
		t.Fatal("guard_combat_result not returned via ReturnMap")
	}
	// With sword (3 dmg) vs Tomb Guard (3 hp), should win
	if result != "victory" {
		t.Errorf("expected victory with sword, got %v", result)
	}
}

func TestDungeonWorkflowRegistration(t *testing.T) {
	registry := reflex.CreateRegistry()
	if err := registry.Register(DungeonCrawlWorkflow()); err != nil {
		t.Fatalf("dungeon-crawl registration: %v", err)
	}
	if err := registry.Register(CombatWorkflow()); err != nil {
		t.Fatalf("combat registration: %v", err)
	}
	if err := registry.Register(PuzzleWorkflow()); err != nil {
		t.Fatalf("puzzle-riddle registration: %v", err)
	}
}
