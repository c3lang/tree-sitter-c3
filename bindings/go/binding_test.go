package tree_sitter_c3_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_c3 "github.com/c3lang/tree-sitter-c3/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_c3.Language())
	if language == nil {
		t.Errorf("Error loading C3 grammar")
	}
}
