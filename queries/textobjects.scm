(func_definition
  body: (_) @function.inside) @function.around

(struct_declaration
  body: (_) @class.inside) @class.around

(enum_declaration
  body: (_) @class.inside) @class.around

(interface_declaration
  body: (_) @class.inside) @class.around

(macro_declaration
  body: (_) @function.inside) @function.around

(line_comment) @comment.inside
(line_comment)+ @comment.around

(doc_comment) @comment.inside
(doc_comment)+ @comment.around
