# tree-sitter-c3 Changelog

## 0.3.2

Final grammar for C3 0.6.7.

### Changes
- Revert tree-sitter ABI version back to 14
- Fixed not permitting empty compile-time switch body

## 0.3.1

### Changes
- Added rule for short function syntax `fn int test() => @pool() { return 1; }`

## 0.3.0

### Changes
- Added grammar for inline enums
- Removed experimental `<[]>` syntax
- Updated highlights.scm

## 0.2.5

### Changes

- Fixed incomplete char literal grammar
- Renamed rule `character` to `char_content` for char literal content that is not an escape sequence

## 0.2.4

### Changes

- Added experimental `[?]` and `<[ ]>` syntax for C3 0.6.7
- Added splat for initializers

## 0.2.3

### Changes

- Added rule for doc comment contracts
- Added highlighting for @require / @ensure / @deprecated contracts

## 0.2.2

### Changes

- Update C3 grammar to 0.6.3
- Added rule `call_arg`, replacing `arg` for call arguments
- Added field `name` to `call_arg`

## 0.2.1

### Changes

- Update C3 grammar to 0.6.2

## 0.2.0

### Changes

- Extracted new rule `bitstruct_member_declaration`
- Extracted new rule `access_eval`
- Added field `name` to `distinct_declaration`
- Added field `name` to `const_declaration`
- Added field `type` to `bitstruct_member_declaration`
- Added field `body` to `bitstruct_body`
- Added field `return_type` to `lambda_declaration`
- Added fields `type` and `name` to `parameter`
- Added field `name` to `var_decl`
- Added field `return_type` to `func_typedef`
- Added field `name` to `enum_param_declaration`
- Removed rule `multi_declaration`
- Removed rule `optional_type`, it's now `type` with an optional '!' token at the end
- Renamed rule `suffix_expr` to `optional_expr`
- Rule `multi_declaration` inlined into `global_declaration`
- Relaxed bitstruct members
- Relaxed enum body to be empty
- Relaxed fault body to be empty
- Relaxed optional types
- `macro_declaration` now always has a `macro_header`, previously it could have a `func_header`
- Fixed not accepting optional types where it's permitted
- Fixed/improved parameter grammar
- Fixed incorrect ternary precedence
- Fixed not permitting assignment expressions in some cases
- Fixed try-unwrap chain
