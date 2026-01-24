/**
 * @file C3 grammar for tree-sitter
 * @author Christian Buttner
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Note that this grammar is not as strict as the compiler.
// For example it permits
// - Some expressions where the compiler requires parenthesis
// - Empty structs/enums
// - Mixing omission of bitstruct member bitranges
// - Optional types everywhere
// - `try` followed by expressions with lower precedence than &&)

const B64 = /[\sA-Za-z0-9+/=]*/;
const HEX = /[\sA-Fa-f0-9]*/;
const INT = /[0-9](_?[0-9])*/;
const HINT = /[a-fA-F0-9](_?[a-fA-F0-9])*/;
const OINT = /[0-7](_?[0-7])*/;
const BINT = /[0-1](_?[0-1])*/;
// NOTE ll/ull suffixes experimental for C3 >= 0.7.2
const INTTYPE = /[UuIi](8|16|32|64|128)|[Uu][Ll]{0,2}|[Ll]{1,2}/;
const IDENT       = /_*[a-z][_a-zA-Z0-9]*/;
const TYPE_IDENT  = /_*[A-Z][_A-Z0-9]*[a-z][_a-zA-Z0-9]*/;
const CONST_IDENT = /_*[A-Z][_A-Z0-9]*/;

// https://c3lang.github.io/c3-web/references/docs/precedence/
// c3c/src/compiler/enums.h
const PREC = {
  // Expressions
  ASSIGNMENT: 1,
  TERNARY: 2,
  // Binary expressions
  LOGICAL_OR: 3,
  LOGICAL_AND: 4,
  RELATIONAL: 5,
  ADD: 6,
  BITWISE: 7,
  SHIFT: 8,
  MULTIPLY: 9,
  // Unary expressions
  UNARY: 10,
  // Trailing expressions
  TRAILING: 11,
  FIELD: 11,
  SUBSCRIPT: 11,
};

function commaSep(rule) {
  return optional(commaSep1(rule));
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}

function commaSepTrailing(rule) {
  return optional(commaSepTrailing1(rule));
}

function commaSepTrailing1(rule) {
  return seq(rule, repeat(seq(',', rule)), optional(','));
}

function sep(rule, separator) {
  return optional(sep1(rule, separator));
}

function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}

function sepTrailing(rule, separator) {
  return optional(sepTrailing1(rule, separator));
}

function sepTrailing1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)), optional(separator));
}

function make_binary_expr($, table) {
  return choice(...table.map(([operator, precedence]) => {
    return prec.left(precedence, seq(
      field('left', $._expr),
      field('operator', operator),
      field('right', $._expr),
    ));
  }));
}

export default grammar({
  name: 'c3',

  extras: $ => [
    /\s|\r?\n/, // White space and line endings
    $.line_comment,
    $.block_comment,
  ],

  // WARNING: must be in the same order as scanner.c TokenType enum
  //   don't comment it can lead to picking wrong parser
  externals: $ => [
    $.block_comment_text,
    $.block_comment_end_or_eof,
    $.doc_comment_text,
    $.real_literal,
  ],

  inline: $ => [
    $._statement,
    $._top_level_item,
  ],

  word: $ => $.ident,

  rules: {
    // File
    // -------------------------
    source_file: $ => seq(
      // Treat '#!' as a line comment for now to preserve existing highlighting rules
      optional(alias($.hashbang_line, $.line_comment)),
      repeat($._top_level_item),
    ),

    // Literals
    // -------------------------
    integer_literal: _ => token(seq(
      choice(
        INT,
        seq(/0[xX]/, HINT),
        seq(/0[oO]/, OINT),
        seq(/0[bB]/, BINT),
      ),
      optional(INTTYPE),
    )),

    escape_sequence: _ => token(prec(1, seq(
      '\\',
      choice(
        /[0abefnrtv'"\\]/,
        /x[0-9a-fA-F]{2}/,
        /u[0-9a-fA-F]{4}/,
        /U[0-9a-fA-F]{8}/,
      ),
    ))),

    char_literal: $ => seq(
      '\'',
      repeat1(choice(
        alias(token.immediate(prec(1, /[^\\'\n]+/)), $.char_content),
        // NOTE The compiler does not allow mixing unicode and ASCII/bytes, but permit this here for simplicity.
        $.escape_sequence,
      )),
      '\'',
    ),

    string_literal: $ => seq(
      '"',
      repeat(choice(
        alias(token.immediate(prec(1, /[^\\"\n]+/)), $.string_content),
        $.escape_sequence,
      )),
      '"',
    ),

    raw_string_literal: $ => seq(
      '`',
      alias(token.immediate(repeat(prec(1, /(``|[^`])/))), $.raw_string_content),
      '`',
    ),

    bytes_literal: _ => token(choice(
      seq('x\'', HEX, '\''),
      seq('x"',  HEX, '"'),
      seq('x`',  HEX, '`'),
      seq('b64\'', B64, '\''),
      seq('b64"',  B64, '"'),
      seq('b64`',  B64, '`'),
    )),

    // Comments
    // -------------------------
    line_comment: _ => token(seq('//', /([^\n])*/)),
    hashbang_line: _ => token(seq('#!', /([^\n])*/)),

    // Doc comments and contracts
    // -------------------------
    // Optional ':' is deprecated
    _doc_comment_description: $ => seq(optional(':'), field('description', $.string_expr)),
    doc_comment_contract_descriptor: _ => token(/\[&?(?:in|out|inout)\]/),
    doc_comment_contract: $ => choice(
      seq(
        field('name', alias('@param', $.at_ident)),
        optional(field('mutability_contract', $.doc_comment_contract_descriptor)),
        field('parameter', choice($._arg_ident, '...')),
        optional($._doc_comment_description),
      ),
      seq(
        field('name', alias(choice('@ensure', '@require'), $.at_ident)),
        commaSep1($._expr),
        optional($._doc_comment_description),
      ),
      seq(
        field('name', alias('@return', $.at_ident)),
        choice(
          seq(
            '?',
            commaSep1($._expr),
            optional($._doc_comment_description),
          ),
          optional(field('description', $.string_expr)),
        ),
      ),
      // Other @idents
      seq(
        field('name', $.at_ident),
        optional(field('description', $.string_expr)),
      ),
    ),
    doc_comment: $ => seq(
      '<*',
      // NOTE parsed by scanner.c (scan_doc_comment_text)
      optional($.doc_comment_text),
      repeat($.doc_comment_contract),
      '*>',
    ),

    block_comment: $ => seq(
      '/*',
      // NOTE parsed by scanner.c (scan_block_comment_scanner)
      $.block_comment_text,
      // NOTE parsed by scanner.c (scan_block_comment_end_or_eof)
      alias($.block_comment_end_or_eof, '*/'),
    ),

    // Identifiers
    // -------------------------
    // Variables, parameters, functions and macros
    ident: _ => IDENT,
    ct_ident: _ => token(seq('$', IDENT)),
    at_ident: _ => token(seq('@', IDENT)),
    hash_ident: _ => token(seq('#', IDENT)),
    // Types
    type_ident: _ => TYPE_IDENT,
    ct_type_ident: _ => token(seq('$', TYPE_IDENT)),
    at_type_ident: _ => token(seq('@', TYPE_IDENT)),
    // Constants
    const_ident: _ => CONST_IDENT,
    ct_const_ident: _ => token(seq('$', CONST_IDENT)),
    // Builtins
    builtin_const: _ => token(seq('$$', CONST_IDENT)),
    builtin: _ => token(seq('$$', IDENT)),

    _decl_ident: $ => choice(
      $.ident,
      $.ct_ident
    ),

    _arg_ident: $ => choice(
      $.ident,
      $.ct_ident,
      $.ct_type_ident,
      $.hash_ident
    ),

    _func_macro_ident: $ => choice(
      $.ident,
      $.at_ident
    ),

    _expr_ident: $ => choice(
      $.const_ident,
      $.ident,
      $.at_ident,
    ),

    _local_expr_ident: $ => choice(
      $.ct_ident,
      $.hash_ident,
    ),

    // Module Paths
    // -------------------------
    module_resolution: $ => prec.left(seq(
      $.ident,
      '::',
    )),
    _module_path: $ => repeat1($.module_resolution),
    path_ident: $ => seq(optional($._module_path), $.ident),
    path_type_ident: $ => seq(optional($._module_path), $.type_ident),
    path_at_type_ident: $ => seq(optional($._module_path), $.at_type_ident),


    // Generic Parameters
    // -------------------------
    _generic_args: $ => commaSep1($._expr),
    generic_arg_list: $ => seq('{', optional($._generic_args), '}'),

    // Helpers
    // -------------------------
    _assign_right_expr: $ => seq('=', field('right', $._expr)),

    _cond: $ => choice(
      choice($._try_unwrap_chain, $.catch_unwrap),
      seq(
        commaSep1($._decl_or_expr),
        optional(seq(',', choice($._try_unwrap_chain, $.catch_unwrap))),
      ),
    ),
    paren_cond: $ => seq('(', $._cond, ')'),

    // Parameters
    // -------------------------
    _parameter: $ => choice(
      // Typed parameters
      seq(
        field('type', $.type),
        optional(choice(
          '...', // Deprecated, remove for C3 0.8
          seq(optional('...'), field('name', choice($.ident, $.ct_ident)), optional($.attributes)),
          // Macro expression parameters
          seq(field('name', $.hash_ident), optional($.attributes)),
        )),
      ),

      // Untyped parameters
      '...',
      seq(field('name', $.ident), optional('...'), optional($.attributes)),
      seq('&', field('name', $.ident), optional($.attributes)), // Method ref parameter such as &self
      // Macro parameters
      seq(
        field('name', choice($.ct_ident, $.hash_ident)),
        optional($.attributes)
      ),
    ),

    param_default: $ => seq('=', field('right', choice('...', $._expr))),
    param: $ => seq($._parameter, optional($.param_default)),
    _parameters: $ => commaSepTrailing1($.param),

    // Attributes
    // -------------------------
    _attribute_name: $ => choice(
      $.at_ident,
      $.path_at_type_ident,
    ),

    overload_operator: $ => choice(
      seq('[', ']'),
      seq('&', '[', ']'),
      seq('[', ']', '='),
      'len',
      '~',
      '+',
      '-',
      '*',
      '/',
      '%',
      '&',
      '|',
      '^',
      '<<',
      '>>',
      '==',
      '!=',
      '+=',
      '-=',
      '*=',
      '/=',
      '%=',
      '&=',
      '|=',
      '^=',
      '<<=',
      '>>=',
    ),

    attribute_arg: $ => choice($.overload_operator, $._expr),
    attribute_arg_list: $ => seq('(', commaSep1($.attribute_arg), ')'),
    attribute: $ => seq(
      field('name', $._attribute_name),
      optional($.attribute_arg_list),
    ),
    attributes: $ => prec.right(repeat1($.attribute)),

    ////////////////////////////
    // Top Level
    // -------------------------
    _top_level_item: $ => choice(
      $.module_declaration,
      $.import_declaration,
      $.global_declaration,
      $.func_definition,

      $.ct_assert_stmt,
      $.ct_echo_stmt,
      $.ct_include_stmt,
      $.ct_exec_stmt,

      $.struct_declaration,
      $.enum_declaration,
      $.macro_declaration,
      $.bitstruct_declaration,
      $.alias_declaration,
      $.faultdef_declaration,
      $.typedef_declaration,
      $.attrdef_declaration,
      $.interface_declaration,
    ),

    // Module
    // -------------------------
    _module_param: $ => choice($.const_ident, $.type_ident),
    generic_param_list: $ => seq('<', commaSep1($._module_param), '>'),
    module_declaration: $ => seq(
      repeat($.doc_comment),
      'module',
      field('path', $.path_ident),
      optional($.generic_param_list),
      optional($.attributes),
      ';'
    ),

    // Import
    // -------------------------
    import_declaration: $ => seq(
      repeat($.doc_comment),
      'import',
      field('path', commaSep1($.path_ident)),
      optional($.attributes),
      ';'
    ),

    // Alias
    // -------------------------
    func_signature: $ => seq(
      'fn',
      field('return_type', $.type),
      $.func_param_list,
      optional($.attributes),
    ),

    alias_declaration: $ => seq(
      repeat($.doc_comment),
      'alias',
      choice(
        // Variable/function/macro/method/module
        seq(
          field('name', $._func_macro_ident),
          optional($.attributes),
          choice(
            seq('=', 'module', $.path_ident),
            $._assign_right_expr,
          )
        ),
        // Constant
        seq(
          field('name', $.const_ident),
          optional($.attributes),
          $._assign_right_expr,
        ),
        // Type/function
        seq(
          field('name', $.type_ident),
          optional($.generic_param_list),
          optional($.attributes),
          '=',
          choice($._type_expr, $.func_signature)
        ),
      ),
      ';'
    ),

    // Faultdef
    // -------------------------
    faultdef_declaration: $ => seq(
      repeat($.doc_comment),
      'faultdef',
      commaSep1($.const_ident),
      optional($.attributes),
      ';',
    ),

    // Typedef
    // -------------------------
    typedef_declaration: $ => seq(
      repeat($.doc_comment),
      'typedef',
      field('name', $.type_ident),
      optional($.interface_impl_list),
      optional($.attributes),
      '=',
      optional('inline'),
      $.type,
      optional($.attribute), // @align
      ';'
    ),

    // Attrdef
    // -------------------------
    attribute_list: $ => commaSep1($.attribute),
    attribute_param_list: $ => seq('(', $._parameters, ')'),
    attrdef_declaration: $ => seq(
      repeat($.doc_comment),
      'attrdef',
      field('name', $.at_type_ident),
      optional($.attribute_param_list),
      optional($.attributes),
      optional(seq(
        '=',
        $.attribute_list,
      )),
      ';'
    ),

    // Struct/Union
    // -------------------------
    _struct_or_union: _ => choice('struct', 'union'),

    _interface_impl: $ => choice(
      $.path_type_ident,
      $.generic_type_ident,
    ),
    interface_impl_list: $ => seq('(', commaSep($._interface_impl), ')'),

    identifier_list: $ => commaSep1($._decl_ident),

    struct_member_declaration: $ => choice(
      seq(repeat($.doc_comment), field('type', $.type), $.identifier_list, optional($.attributes), ';'),
      seq(repeat($.doc_comment), $._struct_or_union, optional($.ident), optional($.attributes), field('body', $.struct_body)),
      seq(
        repeat($.doc_comment),
        'bitstruct',
        optional($.ident),
        ':',
        alias($._type_no_generics, $.type),
        optional($.attributes),
        field('body', $.bitstruct_body)
      ),
      seq(repeat($.doc_comment), 'inline', field('type', $.type), optional($.ident), optional($.attributes), ';'),
    ),
    struct_body: $ => seq(
      '{',
      // NOTE Allowing empty struct to not be too strict.
      repeat($.struct_member_declaration),
      '}',
    ),
    struct_declaration: $ => seq(
      repeat($.doc_comment),
      $._struct_or_union,
      field('name', $.type_ident),
      optional($.generic_param_list),
      optional($.interface_impl_list),
      optional($.attributes),
      field('body', $.struct_body),
    ),

    // Bitstruct
    // -------------------------
    bitstruct_member_declaration: $ => seq(
      repeat($.doc_comment),
      field('type', $._base_type),
      $.ident,
      optional(seq(
        ':',
        $._expr,
        optional(seq(
          '..',
          $._expr,
        ))
      )),
      optional($.attributes),
      ';'
    ),
    bitstruct_body: $ => seq(
      '{',
      repeat($.bitstruct_member_declaration),
      '}',
    ),
    bitstruct_declaration: $ => seq(
      repeat($.doc_comment),
      'bitstruct',
      field('name', $.type_ident),
      optional($.generic_param_list),
      optional($.interface_impl_list),
      ':',
      alias($._type_no_generics, $.type),
      optional($.attributes),
      field('body', $.bitstruct_body),
    ),

    // Enum
    // -------------------------
    enum_arg: $ => seq('=', $._expr),
    enum_constant: $ => seq(
      repeat($.doc_comment),
      field('name', $.const_ident),
      optional($.attributes),
      field('args', optional($.enum_arg)),
    ),
    enum_param: $ => seq(
      optional('inline'),
      field('type', $.type),
      field('name', $.ident),
    ),
    enum_param_list: $ => seq('(', commaSepTrailing($.enum_param), ')'),
    enum_spec: $ => prec.right(seq(
      ':',
      choice(
        seq(
          optional('const'),
          optional('inline'),
          field('type', alias($._type_no_generics, $.type)),
          optional($.enum_param_list)
        ),
        $.enum_param_list,
      ),
    )),
    enum_body: $ => seq(
      '{',
      commaSepTrailing($.enum_constant),
      '}'
    ),
    enum_declaration: $ => seq(
      repeat($.doc_comment),
      'enum',
      field('name', $.type_ident),
      optional($.generic_param_list),
      optional($.interface_impl_list),
      optional($.enum_spec),
      optional($.attributes),
      field('body', $.enum_body),
    ),

    // Interface
    // -------------------------
    interface_body: $ => seq('{', repeat($.func_declaration), '}'),
    interface_declaration: $ => seq(
      repeat($.doc_comment),
      'interface',
      field('name', $.type_ident),
      optional($.generic_param_list),
      optional(seq(
        ':',
        commaSep1($.type_ident),
      )),
      field('body', $.interface_body),
    ),

    // Function/Macro
    // -------------------------
    func_header: $ => seq(
      field('return_type', $.type),
      optional(seq(field('method_type', $.type), '.')),
      field('name', $.ident),
      optional($.generic_param_list),
    ),

    macro_header: $ => seq(
      optional(field('return_type', $.type)), // Return type is optional for macros
      optional(seq(field('method_type', $.type), '.')),
      field('name', $._func_macro_ident),
      optional($.generic_param_list),
    ),

    func_param_list: $ => seq('(', optional($._parameters), ')'),

    func_declaration: $ => seq(
      repeat($.doc_comment),
      'fn',
      $.func_header,
      $.func_param_list,
      optional($.attributes),
      ';',
    ),

    func_definition: $ => prec.right(seq(
      repeat($.doc_comment),
      'fn',
      $.func_header,
      $.func_param_list,
      optional($.generic_param_list),
      optional($.attributes),
      // The body is made optional to improve error recovery for syntax highlighting (PR #41)
      field('body', optional($.macro_func_body)),
    )),

    trailing_block_param: $ => seq(
      $.at_ident,
      optional($.func_param_list),
    ),

    macro_param_list: $ => seq(
      '(',
      optional(
        choice(
          $._parameters,
          seq(
            optional($._parameters),
            ';',
            $.trailing_block_param,
          ),
        ),
      ),
      ')',
    ),

    implies_body: $ => seq('=>', field('body', $._expr)),

    macro_func_body: $ => choice(
      seq('=>', $.call_expr),
      seq($.implies_body, ';'),
      $.compound_stmt
    ),

    macro_declaration: $ => seq(
      repeat($.doc_comment),
      'macro',
      $.macro_header,
      $.macro_param_list,
      optional($.attributes),
      field('body', $.macro_func_body),
    ),

    // Lambda
    // -------------------------
    lambda_declaration: $ => seq(
      'fn',
      field('return_type', optional($.type)),
      $.func_param_list,
      optional($.attributes),
    ),

    ////////////////////////////
    // Statements
    // -------------------------
    _statement: $ => choice(
      $.compound_stmt,
      $.expr_stmt,
      $.declaration_stmt,
      $.var_stmt,
      $.return_stmt,
      $.continue_stmt,
      $.break_stmt,
      $.switch_stmt,
      $.nextcase_stmt,
      $.if_stmt,
      $.for_stmt,
      $.foreach_stmt,
      $.while_stmt,
      $.do_stmt,
      $.defer_stmt,
      $.assert_stmt,
      $.asm_block_stmt,

      $.ct_echo_stmt,
      $.ct_assert_stmt,
      $.ct_if_stmt,
      $.ct_switch_stmt,
      $.ct_foreach_stmt,
      $.ct_for_stmt,
      ';',
    ),

    // Labels
    // -------------------------
    label: $ => seq($.const_ident, ':'),
    label_target: $ => $.const_ident,

    // Compound Statement
    // -------------------------
    // Precedence over initializer list
    compound_stmt: $ => prec(1, seq('{', repeat($._statement), '}')),

    // Expr Statement
    // -------------------------
    expr_stmt: $ => seq($._expr, ';'),

    // Declaration Statement
    // -------------------------
    declaration_stmt: $ => seq($._declaration, ';'),

    // Var Statement
    // -------------------------
    var_declaration: $ => choice(
      seq(repeat($.doc_comment), 'var', field('name', $.ident), optional($.attributes), $._assign_right_expr),
      seq(repeat($.doc_comment), 'var', field('name', $.ct_ident), optional($.attributes), optional($._assign_right_expr)),
      seq(repeat($.doc_comment), 'var', field('name', $.ct_type_ident), optional($.attributes), optional($._assign_right_expr)),
    ),
    var_stmt: $ => seq($.var_declaration, ';'),

    // Return Statement
    // -------------------------
    return_stmt: $ => seq('return', optional($._expr), ';'),

    // Continue Statement
    // -------------------------
    continue_stmt: $ => seq('continue', optional($.label_target), ';'),

    // Break Statement
    // -------------------------
    break_stmt: $ => seq('break', optional($.label_target), ';'),

    // Defer Statement
    // -------------------------
    defer_catch_ident: $ => seq('(', 'catch', $.ident, ')'),
    defer_stmt: $ => seq(
      'defer',
      optional(choice(
        'try',
        'catch',
        $.defer_catch_ident,
      )),
      $._statement
    ),

    // Assert Statement
    // -------------------------
    assert_stmt: $ => seq('assert', '(', commaSep1($._expr), ')', ';'),

    // Declaration
    // -------------------------
    _decl_ident_or_identifier_list: $ => prec(1, choice(
      field('name', $._decl_ident),
      $.identifier_list,
    )),

    _decl_after_type: $ => seq(
      $._decl_ident_or_identifier_list,
      optional($.attributes),
      optional($._assign_right_expr),
    ),

    _decl_storage: $ => choice('static', 'tlocal'),
    declaration: $ => seq(
      optional($._decl_storage),
      field('type', $.type),
      $._decl_after_type,
    ),

    const_declaration: $ => seq(
      repeat($.doc_comment),
      'const',
      field('type', optional($.type)),
      field('name', $.const_ident),
      optional($.attributes),
      optional($._assign_right_expr),
    ),

    _declaration: $ => choice(
      $.declaration,
      $.const_declaration,
    ),

    global_declaration: $ => choice(
      seq(repeat($.doc_comment), 'extern', choice(seq($._declaration, ';'), $.func_declaration)),
      seq($._declaration, ';'),
      $.func_declaration,
    ),

    // Case Statement
    // -------------------------
    case_range: $ => seq($._expr, '..', $._expr),
    case_stmt: $ => seq(
      'case',
      field('value', choice(
        $._expr,
        $.case_range,
      )),
      ':',
      repeat($._statement),
    ),

    // Default Statement
    // -------------------------
    default_stmt: $ => seq(
      'default',
      ':',
      repeat($._statement),
    ),

    // Nextcase Statement
    // -------------------------
    nextcase_stmt: $ => seq(
      'nextcase',
      optional(
        seq(
          optional(seq($.label_target, ':')),
          field('target', choice($._expr, 'default')),
        ),
      ),
      ';'
    ),

    // Switch Statement
    // -------------------------
    switch_body: $ => seq(
      '{',
      repeat(choice(
        $.case_stmt,
        $.default_stmt,
      )),
      '}',
    ),
    switch_stmt: $ => seq(
      'switch',
      field('label', optional($.label)),
      field('condition', optional($.paren_cond)),
      optional($.attribute), // Only one @jump is allowed
      field('body', $.switch_body),
    ),

    // If-Catch
    // -------------------------
    catch_unwrap_list: $ => commaSep1($._expr),
    catch_unwrap: $ => prec(1, seq(
      'catch',
      optional(seq(optional($.type), $.ident, '=')),
      $.catch_unwrap_list,
    )),

    // If-Try
    // -------------------------
    // Precedence over &&
    try_unwrap: $ => prec(PREC.LOGICAL_AND + 1, seq(
      'try',
      optional(seq(optional($.type), $.ident, '=')),
      $._expr,
    )),

    _try_unwrap_chain: $ => seq(
      $.try_unwrap,
      repeat(prec(PREC.LOGICAL_AND + 1, seq('&&', choice($.try_unwrap, $._expr)))),
    ),

    // If Statement
    // -------------------------
    if_stmt: $ => seq(
      'if',
      optional($.label),
      field('condition', $.paren_cond),
      choice(
        field('body', $._statement),
        seq(field('body', $.compound_stmt), $.else_part),
      ),
    ),
    else_part: $ => seq(
      'else',
      choice(
        $.if_stmt,
        field('body', $.compound_stmt),
      ),
    ),

    // For Statement
    // -------------------------
    _single_decl_after_type: $ => seq(
      field('name', $._decl_ident),
      optional($.attributes),
      optional($._assign_right_expr)
    ),

    single_declaration: $ => seq(
      repeat($.doc_comment),
      field('type', $.type),
      $._single_decl_after_type
    ),

    _decl_or_expr: $ => choice(
      $.var_declaration,
      alias($.single_declaration, $.declaration),
      $._expr
    ),
    comma_decl_or_expr: $ => commaSep1($._decl_or_expr),

    _for_cond_inner: $ => seq(
      field('initializer', optional($.comma_decl_or_expr)),
      ';',
      field('condition', optional($._cond)),
      ';',
      field('update', optional($.comma_decl_or_expr)),
    ),

    for_cond: $ => seq(
      '(',
      $._for_cond_inner,
      ')',
    ),

    for_stmt: $ => seq(
      'for',
      optional($.label),
      $.for_cond,
      field('body', $._statement)
    ),

    // Foreach Statement
    // -------------------------
    foreach_var: $ => choice(
      seq(optional($.type), optional('&'), $.ident),
    ),
    foreach_cond: $ => seq(
      '(',
      optional(seq(field('index', $.foreach_var), ',')),
      field('value', $.foreach_var),
      ':',
      field('collection', $._expr),
      ')',
    ),
    foreach_stmt: $ => seq(
      choice('foreach', 'foreach_r'),
      optional($.label),
      $.foreach_cond,
      field('body', $._statement)
    ),

    // While Statement
    // -------------------------
    while_stmt: $ => seq(
      'while',
      optional($.label),
      field('condition', $.paren_cond),
      field('body', $._statement),
    ),

    // Do Statement
    // -------------------------
    do_stmt: $ => seq(
      'do',
      optional($.label),
      $.compound_stmt,
      seq(
        optional(
          seq(
            'while',
            field('condition', $.paren_expr),
          ),
        ),
        ';'
      ),
    ),

    // ASM Statement
    // -------------------------
    asm_instr: $ => seq(
      choice('int', $.ident),
      optional(seq('.', $.ident)),
    ),
    _additive_op: _ => choice('+', '-'),
    _shift_op: _ => choice('<<', '>>'),
    _asm_addr: $ => choice(
      $.asm_expr,
      seq(
        seq($.asm_expr, $._additive_op, $.asm_expr),
        optional(choice(
          seq('*', $.integer_literal, $._additive_op, $.integer_literal),
          seq(choice($._shift_op, $._additive_op), $.integer_literal),
        )),
      ),
    ),
    asm_addr: $ => seq('[', $._asm_addr, ']'),
    asm_expr: $ => choice(
      $.ct_ident,
      $.ct_const_ident,
      seq(optional('&'), $.ident),
      $.const_ident,
      seq(optional('-'), $.real_literal),
      seq(optional('-'), $.integer_literal),
      $.paren_expr,
      $.asm_addr,
    ),
    asm_stmt: $ => seq(
      $.asm_instr, commaSep($.asm_expr), ';',
    ),
    asm_block_stmt: $ => choice(
      seq('asm', '(', $._expr, ')', optional($.at_ident), ';'),
      seq('asm', optional($.at_ident), '{', repeat($.asm_stmt), '}'),
    ),


    ////////////////////////////
    // Compile Time Statements
    // -------------------------
    ct_stmt_body: $ => repeat1($._statement),

    // Compile Time Assert Statement
    // -------------------------
    ct_assert_stmt: $ => choice(
      seq(
        '$assert',
        $._expr,
        optional(seq(':', commaSep1($._expr))),
        ';'
      ),
      seq(
        '$error',
        $._expr,
        repeat(seq(',', $._expr)),
        ';'
      ),
    ),

    // Compile Time Include Statement
    // -------------------------
    ct_include_stmt: $ => seq('$include', $.string_expr, ';'),

    // Compile Time Exec Statement
    // -------------------------
    ct_exec_stmt: $ => seq('$exec', '(', commaSep($._expr), ')', optional($.attributes), ';'),

    // Compile Time Echo Statement
    // -------------------------
    ct_echo_stmt: $ => seq('$echo', $._expr, ';'),

    // Compile Time If Statement
    // -------------------------
    ct_if_cond: $ => seq($._expr, ':'),
    ct_else_stmt: $ => seq('$else', optional($.ct_stmt_body)),
    ct_if_stmt: $ => choice(
      seq('$if', $.ct_if_cond, optional($.ct_stmt_body), optional($.ct_else_stmt), '$endif'),
    ),

    // Compile Time Switch Statement
    // -------------------------
    ct_case_stmt: $ => seq(
      choice(
        seq('$case', $._expr, ':'),
        seq('$default', ':'),
      ),
      optional($.ct_stmt_body),
    ),
    ct_switch_cond: $ => seq($._expr),

    _ct_switch: $ => seq('$switch', optional($.ct_switch_cond), ':'),
    ct_switch_stmt: $ => seq(
      $._ct_switch,
      repeat($.ct_case_stmt),
      '$endswitch',
    ),

    // Compile Time For Statement
    // -------------------------
    ct_for_stmt: $ => seq(
      '$for',
      alias($._for_cond_inner, $.ct_for_cond),
      ':',
      optional($.ct_stmt_body),
      '$endfor'
    ),

    // Compile Time Foreach Statement
    // -------------------------
    ct_foreach_cond: $ => seq(
      optional(seq(field('index', $.ct_ident), ',')),
      field('value', $.ct_ident),
      ':',
      field('collection', $._expr),
    ),
    ct_foreach_stmt: $ => seq(
      '$foreach',
      $.ct_foreach_cond,
      ':',
      optional($.ct_stmt_body),
      '$endforeach'
    ),

    ////////////////////////////
    // Expressions
    // -------------------------
    _expr: $ => prec(0, choice(
      $.assignment_expr,
      $.ternary_expr,
      $.lambda_expr,
      $.elvis_orelse_expr,
      $.optional_expr,
      $.binary_expr,
      $.unary_expr,
      $.cast_expr,
      $.rethrow_expr,
      $.trailing_generic_expr,
      $.update_expr,
      $.call_expr,
      $.subscript_expr,
      $._base_expr,
    )),

    // Base Expression
    // -------------------------
    ident_expr: $ => choice(
      seq(optional($._module_path), $._expr_ident),
      $._local_expr_ident,
    ),

    _type_expr: $ => choice(
      $.type,
      alias($.type_paren_expr, $.paren_expr),
    ),
    type_paren_expr: $ => prec(2, seq('(', $._type_expr, ')')),

    _ct_call: $ => choice(
      '$alignof',
      '$extnameof',
      '$nameof',
      '$offsetof',
      '$qnameof',
    ),

    // Precedence over _expr
    flat_path: $ => prec(1, seq(
      $._base_expr,
      optional($.param_path),
    )),

    string_expr: $ => prec.right(repeat1(choice($.string_literal, $.raw_string_literal))),
    bytes_expr: $ => repeat1($.bytes_literal),
    paren_expr: $ => seq('(', $._expr, ')'),

    // Precedence over cast
    typed_initializer_list: $ => prec(3, seq('(', $._type_expr, ')', $.initializer_list)),

    _base_expr: $ => prec(2, choice(
      'true',
      'false',
      'null',
      $.builtin,
      $.builtin_const,
      $.integer_literal,
      $.real_literal,
      $.char_literal,
      $.string_literal,
      $.raw_string_literal,
      $.string_expr,
      $.bytes_expr,
      $.ident_expr,
      $._type_expr,

      $.initializer_list,
      $.typed_initializer_list,

      $.field_expr,
      $.maybe_deref_expr,
      $.type_access_expr,
      $.paren_expr,

      seq($.lambda_declaration, field('lambda_body', $.compound_stmt)),

      // Compile-time expressions
      '$vacount',
      '$vaconst',
      '$vaarg',
      '$vaexpr',
      seq($._ct_call, '(', $.flat_path, ')'),
      seq(
        choice(
          '$eval',
          '$is_const',
          '$sizeof',
          '$stringify',
          '$kindof'
        ),
        $.paren_expr,
      ),
      seq('$embed', '(', commaSep($._expr), ')'),
      seq('$defined', '(', commaSep($._decl_or_expr), ')'),
      seq('$feature', '(', $.const_ident, ')'),
      seq('$assignable', '(', $._expr, ',', $._expr, ')'), // Deprecated >= 0.7.4
    )),

    // Initializers
    // -------------------------
    // Precedence over _expr
    param_path_element: $ => prec(1, choice(
      seq('[', $._expr, ']'),
      seq('[', $._expr, '..', $._expr, ']'),
      seq('.', $._access_ident_expr),
    )),
    param_path: $ => repeat1($.param_path_element),

    initializer_element: $ => choice(
      seq($.param_path, $._assign_right_expr),
      $.param_path, // Bitstruct bool shorthand
      $._expr,
      // Splatting
      seq('$vasplat', optional(seq('[', $.range_expr, ']'))),
      seq('...', $._expr),
    ),

    initializer_list: $ => seq('{', commaSepTrailing($.initializer_element), '}'),

    // Assignment Expression
    // -------------------------
    _assignment_op: $ => choice(
      '=',
      '+=',
      '-=',
      '*=',
      '/=',
      '%=',
      '<<=',
      '>>=',
      '&=',
      '^=',
      '|=',
      '+++=',
    ),
    assignment_expr: $ => prec.right(PREC.ASSIGNMENT, choice(
      seq(
        field('left', $._expr),
        field('operator', $._assignment_op),
        field('right', $._expr),
      ),
      seq(
        field('left', $.ct_type_ident),
        field('operator', '='),
        field('right', $._expr),
      ),
    )),

    // Ternary Expression
    // -------------------------
    ternary_expr: $ => prec.right(PREC.TERNARY, choice(
      seq(
        field('condition', $._expr),
        choice('?', '???'),
        field('consequence', $._expr),
        ':',
        field('alternative', $._expr),
      ),
    )),

    // Lambda Expression
    // -------------------------
    lambda_expr: $ => prec.right(PREC.TERNARY, seq($.lambda_declaration, $.implies_body)),

    // Elvis/or-else (?:, ??) Expression
    // -------------------------
    elvis_orelse_expr: $ => prec.right(PREC.TERNARY, seq(
      field('condition', $._expr),
      field('operator', choice('?:', '??')),
      field('alternative', $._expr),
    )),

    // Optional Expression
    // -------------------------
    optional_expr: $ => prec.right(PREC.TERNARY, seq(
      field('argument', $._expr),
      field('operator', choice(
        '~',
        seq('~', '!'),
      )),
    )),

    // Cast Expression
    // -------------------------
    cast_expr: $ => prec(PREC.UNARY, seq(
      '(',
      field('type', $._type_expr),
      ')',
      field('value', $._expr),
    )),

    // Unary Expression
    // -------------------------
    _unary_op: $ => choice(
      '&',
      '&&',
      '*',
      '+',
      '-',
      '~',
      '!',
      '++',
      '--',
    ),
    unary_expr: $ => prec(PREC.UNARY, seq(
      field('operator', $._unary_op),
      field('argument', $._expr),
    )),

    // Binary Expression
    // -------------------------
    binary_expr: $ => {
      const table = [
        ['+', PREC.ADD],
        ['-', PREC.ADD],
        ['*', PREC.MULTIPLY],
        ['/', PREC.MULTIPLY],
        ['%', PREC.MULTIPLY],
        ['|', PREC.BITWISE],
        ['^', PREC.BITWISE],
        ['&', PREC.BITWISE],
        ['==', PREC.RELATIONAL],
        ['!=', PREC.RELATIONAL],
        ['>', PREC.RELATIONAL],
        ['>=', PREC.RELATIONAL],
        ['<=', PREC.RELATIONAL],
        ['<', PREC.RELATIONAL],
        ['<<', PREC.SHIFT],
        ['>>', PREC.SHIFT],
        ['||', PREC.LOGICAL_OR],
        ['&&', PREC.LOGICAL_AND],
        // Compile time operators
        ['|||', PREC.LOGICAL_OR],
        ['&&&', PREC.LOGICAL_AND],
        ['+++', PREC.ADD],
      ];

      return make_binary_expr($, table);
    },

    // Call Expression
    // -------------------------
    call_arg: $ => choice(
      $._expr,
      // Splatting
      seq('$vasplat', optional(seq('[', $.range_expr, ']'))),
      seq('...', $._expr),
      // Named arguments
      seq(field('name', $._arg_ident), ':', optional('...'), $._expr),
    ),

    _call_args: $ => choice(
      commaSepTrailing1($.call_arg),
      seq(
        commaSepTrailing($.call_arg),
        seq(';', optional($._parameters)),
      ),
    ),

    call_arg_list: $ => seq('(', optional($._call_args), ')'),

    // Right precedence for `@require foo() @pure` doc contract
    call_inline_attributes: $ => prec.right(repeat1(alias(choice('@pure', '@inline', '@noinline'), $.at_ident))),
    call_expr: $ => prec.right(PREC.TRAILING, seq(
      field('function', $._expr),
      field('arguments', $.call_arg_list),
      field('attributes', optional($.call_inline_attributes)),
      field('trailing', optional($.compound_stmt)),
    )),

    // Postfix Update Expression (--/++)
    // -------------------------
    update_expr: $ => prec.right(PREC.TRAILING, seq(
      field('argument', $._expr),
      field('operator', choice('--', '++')),
    )),

    // Rethrow Expression
    // -------------------------
    rethrow_expr: $ => prec.right(PREC.TRAILING, seq(
      field('argument', $._expr),
      field('operator', choice('!', '!!')),
    )),

    // Trailing Generic Expression
    // -------------------------
    trailing_generic_expr: $ => prec.right(PREC.TRAILING, seq(
      field('argument', $._expr),
      field('operator', $.generic_arg_list),
    )),

    // Range Expression
    // -------------------------
    _range_loc: $ => seq(
      optional('^'),
      $._expr,
    ),
    range_expr: $ => seq(
      field('left', optional($._range_loc)),
      field('operator', choice('..', ':')),
      field('right', optional($._range_loc))
    ),

    // Subscript Expression
    // -------------------------
    subscript_expr: $ => prec.right(PREC.SUBSCRIPT, seq(
      field('argument', $._expr),
      '[',
      choice(
        field('index', $._range_loc),
        field('range', $.range_expr),
      ),
      ']',
    )),

    // Field/Type-Access Expression
    // -------------------------
    access_eval: $ => seq('$eval', $.paren_expr),
    access_ident: $ => choice(
      $.ident,       // Field/method function
      $.at_ident,    // Method macro
      $.hash_ident,  // Hash
      $.const_ident, // Enum access
      $.access_eval, // $eval
    ),

    _access_ident_expr: $ => choice(
      field('field', $.access_ident),
      seq('(', $._access_ident_expr, ')'),
    ),

    field_expr: $ => seq(
      prec(PREC.FIELD, seq(
        field('argument', $._expr),
        '.',
      )),
      $._access_ident_expr,
    ),

    maybe_deref_expr: $ => seq(
      prec(PREC.FIELD, seq(
        field('argument', $._expr),
        '.',
      )),
      seq(
        '[',
        choice(
          field('index', $._range_loc),
          field('range', $.range_expr),
        ),
        ']',
      ),
    ),

    type_access_expr: $ => seq(
      prec(PREC.FIELD, seq(
        field('argument', $._type_expr),
        '.',
      )),
      $._access_ident_expr,
    ),

    ////////////////////////////
    // Types
    // -------------------------
    base_type_name: $ => choice(
      'void',
      'bool',
      'char',
      'ichar',
      'short',
      'ushort',
      'int',
      'uint',
      'long',
      'ulong',
      'int128',
      'uint128',
      'float',
      'double',
      'float16',
      'bfloat',
      'float128',
      'iptr',
      'uptr',
      'isz',
      'usz',
      'fault',
      'any',
      'typeid',
    ),

    _base_type: $ => prec.right(choice(
      $.base_type_name,
      $.path_type_ident,
      $.ct_type_ident,
      seq(
        choice(
          '$typeof',
          '$typefrom',
          '$evaltype', // Deprecated >= 0.7.2
        ),
        $.paren_expr,
      ),
      '$vatype', // Followed by type_suffix with index
    )),

    generic_type_ident: $ => seq(
      $.path_type_ident,
      $.generic_arg_list,
    ),

    type_suffix: $ => choice(
      '*',
      seq('[', $._expr, ']'),
      seq('[', ']'),
      seq('[', '*', ']'),
      seq('[<', $._expr, '>]', optional(alias('@simd', $.at_ident))),
      seq('[<', '*', '>]', optional(alias('@simd', $.at_ident))),
    ),

    type: $ => prec.right(seq(
      choice(
        $._base_type,
        $.generic_type_ident
      ),
      repeat($.type_suffix),
      optional(choice('~', '?')),
    )),
    _type_no_generics: $ => prec.right(seq(
      $._base_type,
      repeat($.type_suffix),
      optional(choice('~', '?')),
    )),
  }
});
