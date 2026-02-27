package examples

import reflex "github.com/corpus-relica/reflex/go"

// ---------------------------------------------------------------------------
// Dungeon Crawl — Go port of reflex-dungeon
//
// The Tomb of Echoes: explore two wings, collect seals, fight enemies,
// solve a riddle, face the boss or escape.
//
// Root workflow: dungeon-crawl (simplified — one path per wing, no A/B slots)
//   ENTRANCE → ANTECHAMBER → (WEST or EAST wing) → GREAT_HALL → (BOSS or ESCAPE)
//
// Sub-workflows: combat (reusable), puzzle-riddle
// ---------------------------------------------------------------------------

// CombatWorkflow returns the reusable combat sub-workflow.
// 6 nodes: ENCOUNTER → PLAYER_TURN → RESOLVE → CHECK → (VICTORY_C or DEFEAT_C)
func CombatWorkflow() *reflex.Workflow {
	return &reflex.Workflow{
		ID:    "combat",
		Entry: "ENCOUNTER",
		Nodes: map[string]*reflex.Node{
			"ENCOUNTER":      {ID: "ENCOUNTER", Spec: reflex.NodeSpec{"type": "encounter"}},
			"PLAYER_TURN":    {ID: "PLAYER_TURN", Spec: reflex.NodeSpec{"type": "player_turn", "suspend": true, "writeKey": "action"}},
			"RESOLVE_ATTACK": {ID: "RESOLVE_ATTACK", Spec: reflex.NodeSpec{"type": "resolve"}},
			"CHECK_OUTCOME":  {ID: "CHECK_OUTCOME", Spec: reflex.NodeSpec{"type": "check"}},
			"VICTORY_C":      {ID: "VICTORY_C", Spec: reflex.NodeSpec{"type": "victory"}},
			"DEFEAT_C":       {ID: "DEFEAT_C", Spec: reflex.NodeSpec{"type": "defeat"}},
		},
		Edges: []reflex.Edge{
			{ID: "e-enc-turn", From: "ENCOUNTER", To: "PLAYER_TURN", Event: "NEXT"},
			{ID: "e-turn-resolve", From: "PLAYER_TURN", To: "RESOLVE_ATTACK", Event: "NEXT"},
			{ID: "e-resolve-check", From: "RESOLVE_ATTACK", To: "CHECK_OUTCOME", Event: "NEXT"},
			{ID: "e-check-victory", From: "CHECK_OUTCOME", To: "VICTORY_C", Event: "VICTORY",
				Guard: &reflex.BuiltinGuard{Type: reflex.GuardEquals, Key: "enemy_defeated", Value: true}},
			{ID: "e-check-defeat", From: "CHECK_OUTCOME", To: "DEFEAT_C", Event: "DEFEAT",
				Guard: &reflex.BuiltinGuard{Type: reflex.GuardEquals, Key: "player_defeated", Value: true}},
		},
	}
}

// PuzzleWorkflow returns the puzzle-riddle sub-workflow.
// 4 nodes: EXAMINE → ATTEMPT → (SOLVED or FAILED)
func PuzzleWorkflow() *reflex.Workflow {
	return &reflex.Workflow{
		ID:    "puzzle-riddle",
		Entry: "EXAMINE",
		Nodes: map[string]*reflex.Node{
			"EXAMINE": {ID: "EXAMINE", Spec: reflex.NodeSpec{"type": "examine"}},
			"ATTEMPT": {ID: "ATTEMPT", Spec: reflex.NodeSpec{"type": "attempt", "suspend": true, "writeKey": "answer"}},
			"SOLVED":  {ID: "SOLVED", Spec: reflex.NodeSpec{"type": "solved"}},
			"FAILED":  {ID: "FAILED", Spec: reflex.NodeSpec{"type": "failed"}},
		},
		Edges: []reflex.Edge{
			{ID: "e-exam-attempt", From: "EXAMINE", To: "ATTEMPT", Event: "NEXT"},
			{ID: "e-attempt-solved", From: "ATTEMPT", To: "SOLVED", Event: "CORRECT"},
			{ID: "e-attempt-failed", From: "ATTEMPT", To: "FAILED", Event: "WRONG"},
		},
	}
}

// DungeonCrawlWorkflow returns the root dungeon workflow (simplified).
// Path: ENTRANCE → ANTECHAMBER → west wing → east wing → GREAT_HALL → ending
func DungeonCrawlWorkflow() *reflex.Workflow {
	return &reflex.Workflow{
		ID:    "dungeon-crawl",
		Entry: "ENTRANCE",
		Nodes: map[string]*reflex.Node{
			"ENTRANCE":    {ID: "ENTRANCE", Spec: reflex.NodeSpec{"type": "start"}},
			"ANTECHAMBER": {ID: "ANTECHAMBER", Spec: reflex.NodeSpec{"type": "narrative"}},
			// West wing
			"WEST_WING": {ID: "WEST_WING", Spec: reflex.NodeSpec{"type": "narrative"}},
			"ARMORY":     {ID: "ARMORY", Spec: reflex.NodeSpec{"type": "loot", "suspend": true, "writeKey": "armory_choice"}},
			"GUARD_ROOM": {ID: "GUARD_ROOM", Spec: reflex.NodeSpec{"type": "invocation"},
				Invokes: &reflex.InvocationSpec{
					WorkflowID: "combat",
					ReturnMap: []reflex.ReturnMapping{
						{ParentKey: "guard_combat_result", ChildKey: "combat_result"},
						{ParentKey: "player_hp", ChildKey: "player_hp"},
					},
				}},
			"WEST_SEAL": {ID: "WEST_SEAL", Spec: reflex.NodeSpec{"type": "loot", "autoWriteKey": "has_west_seal", "writeValue": true}},
			// East wing
			"EAST_WING": {ID: "EAST_WING", Spec: reflex.NodeSpec{"type": "narrative"}},
			"LIBRARY": {ID: "LIBRARY", Spec: reflex.NodeSpec{"type": "invocation"},
				Invokes: &reflex.InvocationSpec{
					WorkflowID: "puzzle-riddle",
					ReturnMap:  []reflex.ReturnMapping{{ParentKey: "library_puzzle_solved", ChildKey: "puzzle_solved"}},
				}},
			"ARCHIVES":  {ID: "ARCHIVES", Spec: reflex.NodeSpec{"type": "loot", "suspend": true, "writeKey": "archives_choice"}},
			"EAST_SEAL": {ID: "EAST_SEAL", Spec: reflex.NodeSpec{"type": "loot", "autoWriteKey": "has_east_seal", "writeValue": true}},
			// Convergence
			"GREAT_HALL": {ID: "GREAT_HALL", Spec: reflex.NodeSpec{"type": "choice", "suspend": true, "writeKey": "hall_choice"}},
			"BOSS_DOOR":  {ID: "BOSS_DOOR", Spec: reflex.NodeSpec{"type": "gate"}},
			"BOSS_LAIR": {ID: "BOSS_LAIR", Spec: reflex.NodeSpec{"type": "invocation"},
				Invokes: &reflex.InvocationSpec{
					WorkflowID: "combat",
					ReturnMap: []reflex.ReturnMapping{
						{ParentKey: "boss_combat_result", ChildKey: "combat_result"},
						{ParentKey: "player_hp", ChildKey: "player_hp"},
					},
				}},
			"SIDE_EXIT": {ID: "SIDE_EXIT", Spec: reflex.NodeSpec{"type": "narrative"}},
			"THRONE":    {ID: "THRONE", Spec: reflex.NodeSpec{"type": "loot", "autoWriteKey": "has_crown", "writeValue": true}},
			"VICTORY":   {ID: "VICTORY", Spec: reflex.NodeSpec{"type": "terminal", "ending": "victory"}},
			"ESCAPE":    {ID: "ESCAPE", Spec: reflex.NodeSpec{"type": "terminal", "ending": "escape"}},
		},
		Edges: []reflex.Edge{
			// Entrance → West Wing (simplified: always go west first)
			{ID: "e-entrance", From: "ENTRANCE", To: "ANTECHAMBER", Event: "NEXT"},
			{ID: "e-ante-west", From: "ANTECHAMBER", To: "WEST_WING", Event: "NEXT"},
			// West wing linear
			{ID: "e-ww-armory", From: "WEST_WING", To: "ARMORY", Event: "NEXT"},
			{ID: "e-armory-guard", From: "ARMORY", To: "GUARD_ROOM", Event: "NEXT"},
			{ID: "e-guard-seal", From: "GUARD_ROOM", To: "WEST_SEAL", Event: "NEXT"},
			// Cross to east
			{ID: "e-wseal-east", From: "WEST_SEAL", To: "EAST_WING", Event: "NEXT"},
			// East wing linear
			{ID: "e-ew-library", From: "EAST_WING", To: "LIBRARY", Event: "NEXT"},
			{ID: "e-library-archives", From: "LIBRARY", To: "ARCHIVES", Event: "NEXT"},
			{ID: "e-archives-seal", From: "ARCHIVES", To: "EAST_SEAL", Event: "NEXT"},
			{ID: "e-eseal-hall", From: "EAST_SEAL", To: "GREAT_HALL", Event: "NEXT"},
			// Great Hall fan-out
			{ID: "e-hall-boss", From: "GREAT_HALL", To: "BOSS_DOOR", Event: "BOSS",
				Guard: &reflex.CustomGuardFunc{Fn: func(bb reflex.BlackboardReader) (bool, error) {
					return bb.Has("has_west_seal") && bb.Has("has_east_seal"), nil
				}}},
			{ID: "e-hall-escape", From: "GREAT_HALL", To: "SIDE_EXIT", Event: "ESCAPE"},
			// Boss path
			{ID: "e-boss-lair", From: "BOSS_DOOR", To: "BOSS_LAIR", Event: "NEXT"},
			{ID: "e-lair-throne", From: "BOSS_LAIR", To: "THRONE", Event: "NEXT"},
			{ID: "e-throne-victory", From: "THRONE", To: "VICTORY", Event: "NEXT"},
			// Escape path
			{ID: "e-side-escape", From: "SIDE_EXIT", To: "ESCAPE", Event: "NEXT"},
		},
	}
}
