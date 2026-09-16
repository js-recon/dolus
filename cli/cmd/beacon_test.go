package cmd

import "testing"

func TestOrDash(t *testing.T) {
	if orDash("") != "—" {
		t.Error("empty string should return em-dash")
	}
	if orDash("hostname") != "hostname" {
		t.Error("non-empty string should be returned as-is")
	}
	if orDash("  ") != "  " {
		t.Error("whitespace-only string should be returned as-is")
	}
}
