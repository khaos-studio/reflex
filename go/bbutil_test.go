package reflex

import (
	"encoding/json"
	"testing"
)

// ---------------------------------------------------------------------------
// BBString
// ---------------------------------------------------------------------------

func TestBBStringHit(t *testing.T) {
	bb := readerWith(bbEntry("name", "alice"))
	v, ok := BBString(bb, "name")
	if !ok || v != "alice" {
		t.Errorf("expected (alice, true), got (%v, %v)", v, ok)
	}
}

func TestBBStringMiss(t *testing.T) {
	bb := readerWith()
	v, ok := BBString(bb, "name")
	if ok || v != "" {
		t.Errorf("expected ('', false), got (%v, %v)", v, ok)
	}
}

func TestBBStringWrongType(t *testing.T) {
	bb := readerWith(bbEntry("count", 42))
	v, ok := BBString(bb, "count")
	if ok || v != "" {
		t.Errorf("expected ('', false) for int value, got (%v, %v)", v, ok)
	}
}

// ---------------------------------------------------------------------------
// BBBool
// ---------------------------------------------------------------------------

func TestBBBoolHit(t *testing.T) {
	bb := readerWith(bbEntry("flag", true))
	v, ok := BBBool(bb, "flag")
	if !ok || !v {
		t.Errorf("expected (true, true), got (%v, %v)", v, ok)
	}
}

func TestBBBoolMiss(t *testing.T) {
	bb := readerWith()
	v, ok := BBBool(bb, "flag")
	if ok || v {
		t.Errorf("expected (false, false), got (%v, %v)", v, ok)
	}
}

// ---------------------------------------------------------------------------
// BBFloat
// ---------------------------------------------------------------------------

func TestBBFloatFromInt(t *testing.T) {
	bb := readerWith(bbEntry("count", int(42)))
	v, ok := BBFloat(bb, "count")
	if !ok || v != 42.0 {
		t.Errorf("expected (42.0, true), got (%v, %v)", v, ok)
	}
}

func TestBBFloatFromFloat64(t *testing.T) {
	bb := readerWith(bbEntry("pi", float64(3.14)))
	v, ok := BBFloat(bb, "pi")
	if !ok || v != 3.14 {
		t.Errorf("expected (3.14, true), got (%v, %v)", v, ok)
	}
}

func TestBBFloatFromJSONNumber(t *testing.T) {
	bb := readerWith(bbEntry("val", json.Number("99")))
	v, ok := BBFloat(bb, "val")
	if !ok || v != 99.0 {
		t.Errorf("expected (99.0, true), got (%v, %v)", v, ok)
	}
}

func TestBBFloatFromString(t *testing.T) {
	bb := readerWith(bbEntry("val", "hello"))
	v, ok := BBFloat(bb, "val")
	if ok || v != 0 {
		t.Errorf("expected (0, false) for string, got (%v, %v)", v, ok)
	}
}

// ---------------------------------------------------------------------------
// BBInt
// ---------------------------------------------------------------------------

func TestBBIntFromFloat64(t *testing.T) {
	bb := readerWith(bbEntry("count", float64(7.0)))
	v, ok := BBInt(bb, "count")
	if !ok || v != 7 {
		t.Errorf("expected (7, true), got (%v, %v)", v, ok)
	}
}

func TestBBIntFromInt(t *testing.T) {
	bb := readerWith(bbEntry("count", int(7)))
	v, ok := BBInt(bb, "count")
	if !ok || v != 7 {
		t.Errorf("expected (7, true), got (%v, %v)", v, ok)
	}
}

func TestBBIntTruncates(t *testing.T) {
	bb := readerWith(bbEntry("val", float64(7.9)))
	v, ok := BBInt(bb, "val")
	if !ok || v != 7 {
		t.Errorf("expected (7, true) — truncated from 7.9, got (%v, %v)", v, ok)
	}
}

func TestBBIntMiss(t *testing.T) {
	bb := readerWith()
	v, ok := BBInt(bb, "count")
	if ok || v != 0 {
		t.Errorf("expected (0, false), got (%v, %v)", v, ok)
	}
}
