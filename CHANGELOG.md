# tree-sitter-c3 Changelog

## 0.5.4
- Improved parsing of byte literals
- Fixed generic type method alias (`alias foo = Type{int}.method`)
- Fixed not parsing named type `$Foo:` and hash `#foo:` arguments

## 0.5.3
- Fixed parsing of `macro foo($Type = Type)` (default argument of type parameter)
- Resolve parameter `$Type` of `macro foo($Type)` as `(ct_type_ident)` instead of `(type (base_type (ct_type_ident)))`

## 0.5.2
- Added rule `ct_else_stmt` encapsulating `$else` blocks
- Updated queries

## 0.5.1

- Parse `@operator` overloads
- Added rule `overload_operator`
- Added field `name` to `alias_declaration`
- Fixed not parsing attributes for `faultdef`

## 0.5.0

Preliminary grammar for C3 0.7.

- Updated syntax for C3 0.7
- Added rule `generic_type_ident`, wrapping `type_ident`/`module_type_ident` and `generic_arguments`
- Added `attrdef_declaration` + `attribute_list`
- `define_path_ident` -> `alias_path_ident`
- `define_path_at_ident` -> `alias_path_at_ident`
- `fault_declaration` -> `faultdef_declaration`
- `define_declaration` -> `alias_declaration`
- `distinct_declaration` -> `typedef_declaration`
- Renamed `func_typedef` -> `func_signature`
- Removed `typedef_type`, now inlined into `alias_declaration`
- Removed `define_ident`, now inlined into `alias_declaration`
- Removed `define_attribute`

## 0.4.1

### Changes
- Fixed `enum Foo : Bar {}` and `bitstruct Foo : Bar {}` (conflict with new generics syntax)
- Added missing `defer (catch ...)` syntax

## 0.4.0

### Changes
- Switch to new generics syntax
- Removed `Type {...}` grammar
- Added rule `typed_initializer_list` for `(Type) {...}` with precedence over cast

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
