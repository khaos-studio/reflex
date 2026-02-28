package reflex

// Type-safe blackboard accessors. These are package-level functions
// (not methods on BlackboardReader) to avoid breaking the interface.
//
// Numeric accessors handle the common JSON round-trip issue where
// int values become float64 after serialization/deserialization.

// BBString reads a string value from the blackboard.
// Returns ("", false) if the key doesn't exist or the value is not a string.
func BBString(bb BlackboardReader, key string) (string, bool) {
	v, ok := bb.Get(key)
	if !ok {
		return "", false
	}
	s, ok := v.(string)
	return s, ok
}

// BBBool reads a boolean value from the blackboard.
// Returns (false, false) if the key doesn't exist or the value is not a bool.
func BBBool(bb BlackboardReader, key string) (bool, bool) {
	v, ok := bb.Get(key)
	if !ok {
		return false, false
	}
	b, ok := v.(bool)
	return b, ok
}

// BBFloat reads a numeric value from the blackboard as float64.
// Handles int, float32, float64, json.Number, and all sized int/uint types.
// Returns (0, false) if the key doesn't exist or the value is not numeric.
func BBFloat(bb BlackboardReader, key string) (float64, bool) {
	v, ok := bb.Get(key)
	if !ok {
		return 0, false
	}
	return toFloat64(v)
}

// BBInt reads a numeric value from the blackboard as int.
// Handles float64 (common after JSON round-trips) by truncating to int.
// Returns (0, false) if the key doesn't exist or the value is not numeric.
func BBInt(bb BlackboardReader, key string) (int, bool) {
	f, ok := BBFloat(bb, key)
	if !ok {
		return 0, false
	}
	return int(f), true
}
