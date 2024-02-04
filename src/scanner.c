#include <tree_sitter/parser.h>

enum TokenType {
  BLOCK_COMMENT_TEXT,
};

void *tree_sitter_c3_external_scanner_create() { return NULL; }
void tree_sitter_c3_external_scanner_destroy(void *p) {}
void tree_sitter_c3_external_scanner_reset(void *p) {}
unsigned tree_sitter_c3_external_scanner_serialize(void *p, char *buffer) { return 0; }
void tree_sitter_c3_external_scanner_deserialize(void *p, const char *b, unsigned n) {}

static bool scan_block_comment(TSLexer *lexer) {
  for (int stack = 0;;) {
    if (lexer->eof(lexer)) {
      return false;
    }

    int32_t c = lexer->lookahead;

    if (c == '/') {
      lexer->advance(lexer, false);
      if (lexer->lookahead == '*') {
        lexer->advance(lexer, false);
        stack += 1;
      }
    } else if (c == '*') {
      lexer->mark_end(lexer);
      lexer->advance(lexer, false);
      if (lexer->lookahead == '/') {
        lexer->advance(lexer, false);
        stack -= 1;
        if (stack == -1) {
          return true;
        }
      }
    } else {
      lexer->advance(lexer, false);
    }
  }
  return false;
}

bool tree_sitter_c3_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  if (valid_symbols[BLOCK_COMMENT_TEXT] && scan_block_comment(lexer)) {
    lexer->result_symbol = BLOCK_COMMENT_TEXT;
    return true;
  }

  return false;
}
