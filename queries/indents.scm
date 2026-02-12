[
  (compound_stmt)
  (initializer_list)
  (implies_body)
  (struct_body)
  (bitstruct_body)
  (enum_body)
  (interface_body)
  (switch_body)
  (ct_if_stmt)
  (ct_for_stmt)
  (ct_foreach_stmt)
  (ct_switch_stmt)
] @indent

([
  (case_stmt)
  (default_stmt)
  (ct_case_stmt)
] @indent
  (#set! indent.immediate 1))

(expr_stmt
  ";" @end) @indent

(declaration
  ";" @end) @indent

(const_declaration
  ";" @end) @indent

(return_stmt
  ";" @end) @indent

(faultdef_declaration
  ";" @end) @indent

(macro_func_body
  ";" @end)

[
  ")"
  "}"
  "$endfor"
  "$endforeach"
  "$endswitch"
  "$endif"
] @indent @end

"$else" @indent @end

([
  (func_param_list)
  (macro_param_list)
  (enum_param_list)
  (attribute_param_list)
  (call_arg_list)
  (paren_cond)
  (for_cond)
  (foreach_cond)
  (paren_expr)
] @_indent.align
  (#set! indent.open_delimiter "(")
  (#set! indent.close_delimiter ")"))

[
  (block_comment)
  (doc_comment)
  (raw_string_literal)
  (bytes_literal)
] @_indent.auto

(string_literal) @_indent.ignore
