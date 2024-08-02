# tree-sitter-c3 Changelog

## 0.2.0

### Changes

- Added node `bitstruct_member_declaration`
- Added field `name` to `distinct_declaration`
- Added field `name` to `const_declaration`
- Added field `type` to `bitstruct_member_declaration`
- Added field `body` to `bitstruct_body`
- Added field `return_type` to `lambda_declaration`
- Added fields `type` and `name` to `parameter`
- Removed node `multi_declaration`
- Removed node `optional_type`, it's now `type` with an optional '!' token at the end
- Node `multi_declaration` inlined into `global_declaration`
- Relaxed bitstruct members
- Relaxed function headers
- `macro_declaration` now always has a `macro_header`, previously it could have a `func_header`
- Fixed/improved parameter grammar
