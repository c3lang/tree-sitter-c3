# tree-sitter-c3 Changelog

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
- Removed rule `multi_declaration`
- Removed rule `optional_type`, it's now `type` with an optional '!' token at the end
- Renamed rule `suffix_expr` to `optional_expr`
- Rule `multi_declaration` inlined into `global_declaration`
- Relaxed bitstruct members
- Relaxed fault members
- Relaxed enum body to be empty
- Relaxed optional types
- `macro_declaration` now always has a `macro_header`, previously it could have a `func_header`
- Fixed not accepting optional types where it's permitted
- Fixed/improved parameter grammar
- Fixed incorrect ternary precedence
- Fixed not permitting assignment expressions in some cases
- Fixed try-unwrap chain
