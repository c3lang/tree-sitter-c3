(global_declaration 
  (ident) @variable)
(local_decl_after_type (ident) @variable)
(local_decl_after_type right: (type_access_expr field: (const_ident) @variable.member))
(type
  (base_type (base_type_name) @type))
(enum_declaration body: (enum_body (enum_constant) @variable.member))

(type
  (base_type (base_type_name) @type))

(type_ident) @type

[
  "const"
  "enum"
  "extern"
  "inline"
  "struct"
  "union"
  "module"
  "def"
  "fault"
  "defer"
] @keyword

"import" @include

[
  "return"
] @keyword.return

[
  "fn"
] @keyword.function

[
  "while"
  "for"
] @repeat

[
  "if"
  "else"
  "switch"
] @conditional

[
  "="
  "-"
  "*"
  "/"
  "+"
  "%"
  
  "~"
  "|"
  "&"
  "&&"
  "^"
  "<<"
  ">>"
  
  "<"
  "<="
  ">="
  ">"
  "=="
  "!="
  
  "!"
  "&&"
  "||"
  
  "-="
  "+="
  "*="
  "/="
  "%="
  "|="
  "&="
  "^="
  ">>="
  "<<="
  "--"
  "++"
  
  ".."

  "=>"
] @operator

[
  "."
  ";"
  ":"
  "::"
  ","
] @punctuation.delimiter

"..." @punctuation.special

[
  "("
  ")"
  "["
  "]"
  "{"
  "}"
] @punctuation.bracket

["null"] @constant.builtin
(string_literal) @string
(escape_sequence) @string.escape
(integer_literal) @number
(real_literal) @number
(char_literal) @character

(field_expr argument: (ident) @property)
(field_expr field: (access_ident) @type (#match? @type "^_?[A-Z]"))

(module path: (path_ident) @namespace)
(module (path_ident (ident) @namespace .))
(import_declaration (path_ident) @namespace)
(import_declaration (path_ident (ident) @namespace .))

(module_ident_expr (module_resolution) @namespace)
(module_ident_expr [(const_ident)(ident)(at_ident)] @identifier)

(call_expr function: (ident) @function)

[
 (line_comment)
 (doc_comment)
 (block_comment)
 ] @comment
