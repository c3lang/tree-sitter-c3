# tree-sitter-c3
This is a complete implementation of the current C3 grammar for tree-sitter, usable for syntax highlighting, indentation, folding, code analysis, header/doc generation, and more.

The latest version supports C3 0.6.7 and is not compatible with C3 < 0.6.4.

### Playground
Check out the tree-sitter-c3 playground here: https://c3lang.github.io/tree-sitter-c3/

### Notes
- In some cases, this grammar is less strict than the compiler.
- Tree structure and node naming is still subject to change.

## Editors

### Emacs 29+
https://github.com/c3lang/c3-ts-mode

### Neovim
1) Install the [nvim-treesitter](https://github.com/nvim-treesitter/nvim-treesitter) plugin
2) Add the following to your `init.lua`:
```lua
vim.filetype.add({
  extension = {
    c3 = "c3",
    c3i = "c3",
    c3t = "c3",
  },
})

local parser_config = require "nvim-treesitter.parsers".get_parser_configs()
parser_config.c3 = {
  install_info = {
    url = "https://github.com/c3lang/tree-sitter-c3",
    files = {"src/parser.c", "src/scanner.c"},
    branch = "main",
  },
}
```
3) Run `:TSInstall c3`
4) Follow the steps for [adding queries](https://github.com/nvim-treesitter/nvim-treesitter?tab=readme-ov-file#adding-queries) to install `queries/highlights.scm`. <br>For example, copy `tree-sitter-c3/queries/*` to `~/.config/nvim/queries/c3/` (replace `~/.config/nvim` with your runtime path), such that you end up with the highlights file at `~/.config/nvim/queries/c3/highlights.scm`.

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
