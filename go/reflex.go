package reflex

// CreateRegistry creates a new WorkflowRegistry. Register workflows before
// creating an engine.
func CreateRegistry() *Registry {
	return NewRegistry()
}

// CreateEngine creates a ReflexEngine bound to a registry and decision agent.
func CreateEngine(registry *Registry, agent DecisionAgent) *Engine {
	return NewEngine(registry, agent)
}
