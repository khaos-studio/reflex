package examples

import (
	"context"
	"fmt"
	"math"

	reflex "github.com/corpus-relica/reflex/go"
)

// DungeonAgent is a DecisionAgent that drives the dungeon crawler.
// It handles three workflow types: dungeon-crawl, combat, puzzle-riddle.
//
// Player choices are injected via SetChoice() before calling Step/Run.
// This replaces the browser-based pendingChoice mechanism from the
// TypeScript version.
type DungeonAgent struct {
	choiceKey   string
	choiceValue string
	hasChoice   bool
}

// SetChoice injects a player choice for the next suspend point.
func (a *DungeonAgent) SetChoice(key, value string) {
	a.choiceKey = key
	a.choiceValue = value
	a.hasChoice = true
}

func (a *DungeonAgent) consumeChoice(expectedKey string) (string, bool) {
	if a.hasChoice && a.choiceKey == expectedKey {
		v := a.choiceValue
		a.hasChoice = false
		a.choiceKey = ""
		a.choiceValue = ""
		return v, true
	}
	return "", false
}

// Resolve implements reflex.DecisionAgent.
func (a *DungeonAgent) Resolve(_ context.Context, dc reflex.DecisionContext) (reflex.Decision, error) {
	switch dc.Workflow.ID {
	case "combat":
		return a.resolveCombat(dc)
	case "puzzle-riddle":
		return a.resolvePuzzle(dc)
	default:
		return a.resolveDungeon(dc)
	}
}

func (a *DungeonAgent) resolveDungeon(dc reflex.DecisionContext) (reflex.Decision, error) {
	spec := dc.Node.Spec
	nodeID := dc.Node.ID

	// Terminal nodes
	if spec["type"] == "terminal" || len(dc.ValidEdges) == 0 {
		return reflex.Decision{Type: reflex.DecisionComplete}, nil
	}

	// Suspend nodes: check for pending choice
	if suspend, _ := spec["suspend"].(bool); suspend {
		writeKey, _ := spec["writeKey"].(string)
		choice, ok := a.consumeChoice(writeKey)
		if !ok {
			prompt, _ := spec["prompt"].(string)
			if prompt == "" {
				prompt = "Awaiting input"
			}
			return reflex.Decision{Type: reflex.DecisionSuspend, Reason: prompt}, nil
		}

		var writes []reflex.BlackboardWrite

		switch {
		case nodeID == "ARMORY":
			writes = append(writes, reflex.BlackboardWrite{Key: "armory_choice", Value: choice})
			if choice == "take" {
				writes = append(writes, reflex.BlackboardWrite{Key: "has_sword", Value: true})
			}
		case nodeID == "ARCHIVES":
			writes = append(writes, reflex.BlackboardWrite{Key: "archives_choice", Value: choice})
			if choice == "take" {
				writes = append(writes, reflex.BlackboardWrite{Key: "has_potion", Value: true})
			}
		case nodeID == "GREAT_HALL":
			writes = append(writes, reflex.BlackboardWrite{Key: "hall_choice", Value: choice})
			if choice == "boss" {
				if edge := findEdge(dc.ValidEdges, "e-hall-boss"); edge != nil {
					return reflex.Decision{Type: reflex.DecisionAdvance, Edge: edge.ID, Writes: writes}, nil
				}
			}
			if edge := findEdge(dc.ValidEdges, "e-hall-escape"); edge != nil {
				return reflex.Decision{Type: reflex.DecisionAdvance, Edge: edge.ID, Writes: writes}, nil
			}
		default:
			writes = append(writes, reflex.BlackboardWrite{Key: writeKey, Value: choice})
		}

		return reflex.Decision{Type: reflex.DecisionAdvance, Edge: dc.ValidEdges[0].ID, Writes: writes}, nil
	}

	// Auto-write loot (seal stones, throne)
	var writes []reflex.BlackboardWrite
	if autoKey, ok := spec["autoWriteKey"].(string); ok {
		writes = append(writes, reflex.BlackboardWrite{Key: autoKey, Value: spec["writeValue"]})
	}

	return reflex.Decision{Type: reflex.DecisionAdvance, Edge: dc.ValidEdges[0].ID, Writes: writes}, nil
}

func (a *DungeonAgent) resolveCombat(dc reflex.DecisionContext) (reflex.Decision, error) {
	nodeID := dc.Node.ID
	bb := dc.Blackboard

	switch nodeID {
	case "ENCOUNTER":
		// Determine enemy from parent stack
		isGuardian := false
		if len(dc.Stack) > 0 {
			isGuardian = dc.Stack[0].CurrentNodeID == "BOSS_LAIR"
		}
		enemyName := "Tomb Guard"
		enemyHp := 3
		if isGuardian {
			enemyName = "The Guardian of Echoes"
			enemyHp = 5
		}
		playerHp := 8
		if v, ok := bb.Get("player_hp"); ok {
			if hp, ok := v.(int); ok {
				playerHp = hp
			}
		}
		writes := []reflex.BlackboardWrite{
			{Key: "enemy_name", Value: enemyName},
			{Key: "enemy_hp", Value: enemyHp},
			{Key: "player_hp", Value: playerHp},
		}
		return reflex.Decision{Type: reflex.DecisionAdvance, Edge: dc.ValidEdges[0].ID, Writes: writes}, nil

	case "PLAYER_TURN":
		action, ok := a.consumeChoice("action")
		if !ok {
			return reflex.Decision{Type: reflex.DecisionSuspend, Reason: "Choose your action"}, nil
		}
		writes := []reflex.BlackboardWrite{{Key: "action", Value: action}}
		return reflex.Decision{Type: reflex.DecisionAdvance, Edge: dc.ValidEdges[0].ID, Writes: writes}, nil

	case "RESOLVE_ATTACK":
		return a.resolveAttack(dc)

	case "CHECK_OUTCOME":
		if len(dc.ValidEdges) > 0 {
			return reflex.Decision{Type: reflex.DecisionAdvance, Edge: dc.ValidEdges[0].ID}, nil
		}
		return reflex.Decision{}, fmt.Errorf("no valid edges at CHECK_OUTCOME")

	case "VICTORY_C":
		return reflex.Decision{Type: reflex.DecisionComplete,
			Writes: []reflex.BlackboardWrite{{Key: "combat_result", Value: "victory"}}}, nil
	case "DEFEAT_C":
		return reflex.Decision{Type: reflex.DecisionComplete,
			Writes: []reflex.BlackboardWrite{{Key: "combat_result", Value: "defeat"}}}, nil
	}

	if len(dc.ValidEdges) > 0 {
		return reflex.Decision{Type: reflex.DecisionAdvance, Edge: dc.ValidEdges[0].ID}, nil
	}
	return reflex.Decision{Type: reflex.DecisionComplete}, nil
}

func (a *DungeonAgent) resolveAttack(dc reflex.DecisionContext) (reflex.Decision, error) {
	bb := dc.Blackboard
	action, _ := bb.Get("action")
	hasSword := bbBool(bb, "has_sword")
	hasPotion := bbBool(bb, "has_potion")
	potionUsed := bbBool(bb, "potion_used")
	playerHp := bbInt(bb, "player_hp", 8)
	enemyHp := bbInt(bb, "enemy_hp", 3)
	enemyName, _ := bb.Get("enemy_name")
	isGuardian := enemyName == "The Guardian of Echoes"

	enemyDamage := 2
	if isGuardian {
		enemyDamage = 3
	}
	playerDamage := 1
	if hasSword {
		playerDamage = 3
	}

	writes := []reflex.BlackboardWrite{}

	// First round
	switch action {
	case "attack":
		enemyHp = max(0, enemyHp-playerDamage)
	case "potion":
		if hasPotion && !potionUsed {
			playerHp = min(8, playerHp+4)
			writes = append(writes, reflex.BlackboardWrite{Key: "potion_used", Value: true})
		}
	case "defend":
		reduced := max(1, enemyDamage-2)
		playerHp = max(0, playerHp-reduced)
	}

	if enemyHp > 0 && action != "defend" {
		playerHp = max(0, playerHp-enemyDamage)
	}

	// Remaining rounds
	for round := 2; round <= 10 && enemyHp > 0 && playerHp > 0; round++ {
		enemyHp = max(0, enemyHp-playerDamage)
		if enemyHp > 0 {
			playerHp = max(0, playerHp-enemyDamage)
		}
	}

	if enemyHp > 0 && playerHp > 0 {
		enemyHp = 0 // force victory after 10 rounds
	}

	writes = append(writes,
		reflex.BlackboardWrite{Key: "enemy_hp", Value: enemyHp},
		reflex.BlackboardWrite{Key: "player_hp", Value: playerHp},
		reflex.BlackboardWrite{Key: "enemy_defeated", Value: enemyHp <= 0},
		reflex.BlackboardWrite{Key: "player_defeated", Value: playerHp <= 0},
	)

	return reflex.Decision{Type: reflex.DecisionAdvance, Edge: dc.ValidEdges[0].ID, Writes: writes}, nil
}

func (a *DungeonAgent) resolvePuzzle(dc reflex.DecisionContext) (reflex.Decision, error) {
	nodeID := dc.Node.ID

	switch nodeID {
	case "EXAMINE":
		return reflex.Decision{Type: reflex.DecisionAdvance, Edge: dc.ValidEdges[0].ID}, nil
	case "ATTEMPT":
		answer, ok := a.consumeChoice("answer")
		if !ok {
			return reflex.Decision{Type: reflex.DecisionSuspend, Reason: "Choose your answer"}, nil
		}
		writes := []reflex.BlackboardWrite{{Key: "answer", Value: answer}}
		if answer == "correct" {
			edge := findEdge(dc.ValidEdges, "e-attempt-solved")
			if edge == nil {
				edge = &dc.ValidEdges[0]
			}
			return reflex.Decision{Type: reflex.DecisionAdvance, Edge: edge.ID, Writes: writes}, nil
		}
		edge := findEdge(dc.ValidEdges, "e-attempt-failed")
		if edge == nil {
			edge = &dc.ValidEdges[0]
		}
		return reflex.Decision{Type: reflex.DecisionAdvance, Edge: edge.ID, Writes: writes}, nil
	case "SOLVED":
		return reflex.Decision{Type: reflex.DecisionComplete,
			Writes: []reflex.BlackboardWrite{{Key: "puzzle_solved", Value: true}}}, nil
	case "FAILED":
		return reflex.Decision{Type: reflex.DecisionComplete,
			Writes: []reflex.BlackboardWrite{{Key: "puzzle_solved", Value: false}}}, nil
	}
	return reflex.Decision{Type: reflex.DecisionComplete}, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func findEdge(edges []reflex.Edge, id string) *reflex.Edge {
	for i := range edges {
		if edges[i].ID == id {
			return &edges[i]
		}
	}
	return nil
}

func bbBool(bb reflex.BlackboardReader, key string) bool {
	v, ok := bb.Get(key)
	if !ok {
		return false
	}
	b, _ := v.(bool)
	return b
}

func bbInt(bb reflex.BlackboardReader, key string, def int) int {
	v, ok := bb.Get(key)
	if !ok {
		return def
	}
	switch n := v.(type) {
	case int:
		return n
	case float64:
		return int(math.Round(n))
	}
	return def
}
