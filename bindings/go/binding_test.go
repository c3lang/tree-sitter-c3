package tree_sitter_c3_test

import (
	"testing"

	tree_sitter "github.com/smacker/go-tree-sitter"
	"github.com/tree-sitter/tree-sitter-c3"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_c3.Language())
	if language == nil {
		t.Errorf("Error loading C3 grammar")
	}
}
