# tree-sitter-c3
This is a complete implementation of the current C3 grammar for tree-sitter, usable for syntax highlighting, indentation, folding, code analysis, header/doc generation, and more.

The latest version supports C3 0.7.1 and is not compatible with C3 < 0.7.0.

### Playground
Check out the tree-sitter-c3 playground here: https://c3lang.github.io/tree-sitter-c3/

### Notes
- In some cases, this grammar is less strict than the compiler.
- Tree structure and node naming is still subject to change.

## Editors

### Emacs 29+
https://github.com/c3lang/c3-ts-mode

### Neovim
1) Install the [nvim-treesitter](https://github.com/nvim-treesitter/nvim-treesitter/tree/main) plugin from the `main` branch
2) Run `:TSInstall c3`

### Helix
Right now there is a proposal for [adding c3 language support](https://github.com/helix-editor/helix/pull/11521), but there is still no support.
To get started with c3 in helix editor:
1) Add this to `languages.toml`:
```toml
  [[grammar]]
  name = "c3"
  [grammar.source]
  git = "https://github.com/c3lang/tree-sitter-c3.git"
  rev = "main"

  [[language]]
  name = "c3"
  scope = "source.c3"
  file-types = ["c3", "c3i"]
  roots = ["project.json"]
  comment-token = "//"
  language-servers = ["c3-lsp"] #if you want LSP support
  [language.block-comment-tokens]
  end = "*/"
  start = "/*"

  #LSP support
  [language-server.c3-lsp]
  command = "c3lsp"
```
2) Run `hx -g fetch`, which will fetch all the grammars (you can exclude grammars with `use-grammars.only` or `use-grammars.except` in `languages.toml`).
3) Run `hx -g build` (you need to have `gcc`/`clang` installed on your system and possibly `gnumake`).
4) Add queries from `$XDG_CONFIG_HOME/helix/runtime/grammars/sources/c3/queries` to `$XDG_CONFIG_HOME/helix/runtime/queries/c3`:
```bash
  mkdir $XDG_CONFIG_HOME/helix/runtime/queries
  cp -r $XDG_CONFIG_HOME/helix/runtime/grammars/sources/c3/queries $XDG_CONFIG_HOME/helix/runtime/queries/c3
```
5) Now you can write `c3` in Helix Editor with highlighting and LSP support!
