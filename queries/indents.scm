[
  (compound_stmt)
  (initializer_list)
  (implies_body)
  (enum_body)
  (switch_body)
  (initializer_list)
  (struct_body)
  (bitstruct_body)
  (interface_body)
  (case_stmt)
  (default_stmt)
  (ct_if_stmt)
  (ct_for_stmt)
  (ct_foreach_stmt)
  (ct_switch_stmt)
  (ct_case_stmt)
  (faultdef_declaration)
] @indent.begin

([
  (fn_parameter_list)
  (macro_parameter_list)
  (call_invocation)
  (paren_cond)
  (for_cond)
  (paren_expr)
] @indent.align
  (#set! indent.open_delimiter "(")
  (#set! indent.close_delimiter ")"))

(faultdef_declaration
  ";" @indent.end)

(macro_func_body
  ";" @indent.end)

[
  ")"
  "}"
  "$else"
  "$endif"
  "$endfor"
  "$endforeach"
  "$endswitch"
] @indent.branch @indent.end

[
  (block_comment)
  (doc_comment)
  (raw_string_literal)
  (bytes_literal)
] @indent.auto

(string_content) @indent.ignore
