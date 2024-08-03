# tree-sitter-c3
This is a complete implementation of the current C3 grammar for tree-sitter, usable for syntax highlighting, indentation, folding, code analysis, header/doc generation, and more.

The latest version supports C3 0.6.1 and is not compatible with C3 < 0.6.0.

### Playground
Check out the tree-sitter-c3 playground here: https://c3lang.github.io/tree-sitter-c3/

### Notes
- This is in some cases a less strict version of the "true" grammar.
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
