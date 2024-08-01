/**
 * @file C3 grammar for tree-sitter
 * @author Christian Buttner
 * @license MIT
 */

// Reference grammar: https://github.com/c3lang/c3c/blob/master/resources/grammar/grammar.y

// Note that this grammar is not as strict the original specification.
// For example, it allows some expressions where the compiler requires parenthesis.

const B64 = /[ \t\v\n\f]?[A-Za-z0-9+/][ \t\v\n\fA-Za-z0-9+/=]+/;
const HEX = /[ \t\v\n\f]?[A-Fa-f0-9][ \t\v\n\fA-Fa-f0-9]+/;
const INT = /[0-9](_?[0-9])*/;
const HINT = /[a-fA-F0-9](_?[a-fA-F0-9])*/;
const OINT = /[0-7](_?[0-7])*/;
const BINT = /[0-1](_?[0-1])*/;
const INTTYPE = /[ui](8|16|32|64|128)|[Uu][Ll]?|[Ll]/;
const IDENT       = /_*[a-z][_a-zA-Z0-9]*/;
const TYPE_IDENT  = /_*[A-Z][_A-Z0-9]*[a-z][_a-zA-Z0-9]*/;
const CONST_IDENT = /_*[A-Z][_A-Z0-9]*/;

// https://c3lang.github.io/c3-web/references/docs/precedence/
const PREC = {
  // Expressions
  ASSIGNMENT: -2,
  TERNARY: -1,
  // Binary expressions
  LOGICAL_OR: 1,
  LOGICAL_AND: 2,
  RELATIONAL: 3,
  ADD: 4,
  BITWISE: 5,
  SHIFT: 6,
  MULTIPLY: 7,
  // Unary expressions
  UNARY: 8,
  // Trailing expressions
  TRAILING: 10,
  FIELD: 11,
  SUBSCRIPT: 12,
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

function make_binary_expr($, table) {
  return choice(...table.map(([operator, precedence]) => {
    return prec.left(precedence, seq(
      field('left', $._expr),
      field('operator', operator),
      field('right', $._expr),
    ));
  }));
}

module.exports = grammar({
  name: 'c3',

  extras: $ => [
    /\s|\r?\n/, // White space and line endings
    $.line_comment,
    $.block_comment,
    $.doc_comment,
  ],

  externals: $ => [
    $.block_comment_text,
    $.doc_comment_text,
    $.real_literal,
  ],

  inline: $ => [
    $._statement,
    $._top_level_item,
    $._ct_call,
    $._ct_analyse,
    $._ct_arg,
    $._asm_addr,
  ],

  word: $ => $.ident,

  rules: {
    // File
    // -------------------------
    source_file: $ => repeat($._top_level_item),

    // Literals
    // -------------------------
    integer_literal: _ => {
      return token(seq(
        choice(
          seq(INT),
          seq(/0[xX]/, HINT),
          seq(/0[oO]/, OINT),
          seq(/0[bB]/, BINT),
        ),
        optional(INTTYPE),
      ));
    },

    escape_sequence: _ => token(prec(1, seq(
      '\\',
      choice(
        /[0abefnrtv\'\"\\]/,
        /x[0-9a-fA-F]{2}/,
        /u[0-9a-fA-F]{4}/,
        /U[0-9a-fA-F]{8}/,
      ),
    ))),

    char_literal: $ => seq(
      '\'',
      choice(
        $.escape_sequence,
        alias(token.immediate(/[^\n']/), $.character),
      ),
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
      seq('x\'', repeat1(HEX), '\''),
      seq('x"',  repeat1(HEX), '"'),
      seq('x`',  repeat1(HEX), '`'),
      seq('b64\'', repeat1(B64), '\''),
      seq('b64"',  repeat1(B64), '"'),
      seq('b64`',  repeat1(B64), '`'),
    )),

    // Comments
    // -------------------------
    line_comment: $ => choice(
      token(seq('//', /([^\n])*/)),
    ),

    doc_comment: $ => seq(
      '/**',
      $.doc_comment_text,
      '*/',
    ),

    block_comment: $ => seq(
      '/*',
      $.block_comment_text,
      '*/',
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
    builtin: $ => token(seq('$$', choice(CONST_IDENT, IDENT))),

    // Module Paths
    // -------------------------
    module_resolution: $ => prec.left(seq(
      $.ident,
      '::',
    )),
    _module_path: $ => repeat1($.module_resolution),
    path_ident: $ => seq(optional($._module_path), $.ident),
    path_type_ident: $ => seq(optional($._module_path), $.type_ident),
    path_const_ident: $ => seq(optional($._module_path), $.const_ident),
    path_at_ident: $ => seq(optional($._module_path), $.at_ident),
    path_at_type_ident: $ => seq(optional($._module_path), $.at_type_ident),

    // Generic Parameters
    // -------------------------
    _generic_arg_list: $ => commaSep1(choice(
      $._expr,
      $.type,
    )),
    generic_arguments: $ => seq('(<', $._generic_arg_list, '>)'),

    // Helpers
    // -------------------------
    _assign_right_expr: $ => seq('=', field('right', $._expr)),
    _assign_right_constant_expr: $ => seq('=', field('right', $._constant_expr)),

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
      seq($.type, $.ident, optional($.attributes)),
      seq($.type, '...', $.ident, optional($.attributes)),
      seq($.type, '...', $.ct_ident),
      seq($.type, $.ct_ident),
      seq($.type, '...', optional($.attributes)),
      seq($.type, $.hash_ident, optional($.attributes)),
      seq($.type, '&', $.ident, optional($.attributes)),
      seq($.type, optional($.attributes)),
      seq('&', $.ident, optional($.attributes)),
      seq($.hash_ident, optional($.attributes)),
      '...',
      seq($.ident, optional($.attributes)),
      seq($.ident, '...', optional($.attributes)),
      $.ct_ident,
      seq($.ct_ident, '...'),
    ),

    parameter_default: $ => $._assign_right_expr,
    parameter: $ => seq($._parameter, optional($.parameter_default)),
    _parameters: $ => commaSepTrailing1(seq($.parameter)),

    // Attributes
    // -------------------------
    _attribute_name: $ => choice(
      $.at_ident,
      $.path_at_type_ident,
    ),

    _attribute_operator_expr: $ => choice(
      seq('&', '[', ']'),
      seq('[', ']', '='),
      seq('[', ']'),
    ),

    attr_param: $ => choice($._attribute_operator_expr, $._constant_expr),

    attribute_param_list: $ => seq('(', commaSep1($.attr_param), ')'),
    attribute: $ => seq(
      field('name', $._attribute_name),
      optional($.attribute_param_list),
    ),
    attributes: $ => repeat1($.attribute),

    // Storage Specifiers
    // -------------------------
    local_decl_storage: $ => choice('static', 'tlocal'),
    global_storage: $ => 'tlocal',


    ////////////////////////////
    // Top Level
    // -------------------------
    _top_level_item: $ => choice(
      $.module,
      $.import_declaration,
      seq(optional('extern'), $.func_declaration),
      seq(optional('extern'), $.func_definition),
      seq(optional('extern'), $.const_declaration),
      seq(optional('extern'), $.global_declaration),

      $.ct_assert_stmt,
      $.ct_echo_stmt,
      $.ct_include_stmt,
      $.ct_exec_stmt,

      $.struct_declaration,
      $.fault_declaration,
      $.enum_declaration,
      $.macro_declaration,
      $.define_declaration,
      $.bitstruct_declaration,
      $.distinct_declaration,
      $.interface_declaration,
    ),

    // Module
    // -------------------------
    _module_param: $ => choice($.const_ident, $.type_ident),
    generic_module_parameters: $ => seq('(<', commaSep1($._module_param), '>)'),
    module: $ => seq(
      'module',
      field('path', $.path_ident),
      optional(alias($.generic_module_parameters, $.generic_parameters)),
      optional($.attributes),
      ';'
    ),

    // Import
    // -------------------------
    import_declaration: $ => seq(
      'import',
      field('path', commaSep1($.path_ident)),
      optional($.attributes),
      ';'
    ),

    // Def
    // -------------------------
    func_typedef: $ => seq(
      'fn',
      $._type_or_optional_type,
      $.fn_parameter_list
    ),
    typedef_type: $ => choice($.func_typedef, $.type),
    define_attribute: $ => seq(
      field('name', $.at_type_ident),
      seq(
        optional(seq('(', $._parameters, ')')),
        optional($.attributes),
        '=',
        '{',
        optional($.attributes),
        '}',
      ),
    ),
    define_ident: $ => seq(
      choice(
        seq($.ident, '=', $.path_ident),
        seq($.const_ident, '=', $.path_const_ident),
        seq($.at_ident, '=', $.path_at_ident),
      ),
      optional($.generic_arguments),
    ),
    define_declaration: $ => seq(
      'def',
      choice(
        $.define_ident,
        $.define_attribute,
        seq(
          $.type_ident,
          optional($.attributes),
          '=',
          $.typedef_type,
        ),
      ),
      optional($.attributes),
      ';'
    ),

    // Distinct
    // -------------------------
    distinct_declaration: $ => seq(
      'distinct',
      $.type_ident,
      optional($.interface_impl),
      optional($.attributes),
      '=',
      optional('inline'),
      $.type,
      ';'
    ),

    // Const
    // -------------------------
    const_declaration: $ => seq(
      'const',
      field('type', optional($.type)),
      $.const_ident,
      optional($.attributes),
      optional($._assign_right_expr),
      ';'
    ),

    // Global
    // -------------------------
    multi_declaration: $ => seq(',', commaSep1($.ident)),
    global_declaration: $ => seq(
      optional($.global_storage),
      field('type', optional($._type_or_optional_type)),
      $.ident,
      choice(
        seq(
          optional($.multi_declaration),
          optional($.attributes),
        ),
        seq(
          optional($.attributes),
          optional($._assign_right_expr),
        ),
      ),
      ';'
    ),

    // Struct/Union
    // -------------------------
    _struct_or_union: _ => choice('struct', 'union'),

    interface: $ => seq(
      $.path_type_ident,
      optional($.generic_arguments),
    ),
    interface_impl: $ => seq('(', commaSep($.interface), ')'),

    identifier_list: $ => commaSep1($.ident),

    struct_member_declaration: $ => choice(
      seq(field('type', $.type), $.identifier_list, optional($.attributes), ';'),
      seq($._struct_or_union, optional($.ident), optional($.attributes), field('body', $.struct_body)),
      seq('bitstruct', optional($.ident), ':', $.type, optional($.attributes), field('body', $.bitstruct_body)),
      seq('inline', field('type', $.type), optional($.ident), optional($.attributes), ';'),
    ),
    struct_body: $ => seq(
      '{',
      // NOTE Allowing empty struct to not be too strict.
      repeat($.struct_member_declaration),
      '}',
    ),
    struct_declaration: $ => seq(
      $._struct_or_union,
      field('name', $.type_ident),
      optional($.interface_impl),
      optional($.attributes),
      field('body', $.struct_body),
    ),

    // Bitstruct
    // -------------------------
    bitstruct_member_declaration: $ => seq(
      $.base_type,
      $.ident,
      ':',
      $._constant_expr,
      optional(seq(
        '..',
        $._constant_expr,
      )),
      ';'
    ),
    bitstruct_simple_def: $ => seq(
      $.base_type,
      $.ident,
      ';'
    ),
    _bitstruct_defs: $ => repeat1($.bitstruct_member_declaration),
    _bitstruct_simple_defs: $ => repeat1(alias($.bitstruct_simple_def, $.bitstruct_member_declaration)),
    bitstruct_body: $ => seq(
      '{',
      optional(choice($._bitstruct_defs, $._bitstruct_simple_defs)),
      '}',
    ),
    bitstruct_declaration: $ => seq(
      'bitstruct',
      field('name', $.type_ident),
      optional($.interface_impl),
      ':',
      $.type,
      optional($.attributes),
      $.bitstruct_body,
    ),

    // Fault
    // -------------------------
    fault_body: $ => seq(
      '{',
      commaSepTrailing1($.const_ident),
      '}'
    ),
    fault_declaration: $ => seq(
      'fault',
      field('name', $.type_ident),
      optional($.interface_impl),
      optional($.attributes),
      field('body', $.fault_body),
    ),

    // Enum
    // -------------------------
    // Precedence over initializer list, but it's actually ambiguous and depends on the number of enum parameters
    enum_arg: $ => prec(1, choice(
      seq('=', $.arg),                              // >= 0.6.0
      seq('=', '{', commaSepTrailing1($.arg), '}'), // >= 0.6.0
    )),
    enum_constant: $ => seq(
      field('name', $.const_ident),
      optional($.attributes),
      field('args', optional($.enum_arg)),
    ),
    enum_param_declaration: $ => seq(
      field('type', $.type),
      $.ident,
    ),
    enum_param_list: $ => seq('(', commaSep($.enum_param_declaration), ')'),
    enum_spec: $ => prec.right(seq(
      ':',
      field('type', optional($.type)),
      optional($.enum_param_list),
    )),
    enum_body: $ => seq(
      '{',
      commaSepTrailing1($.enum_constant),
      '}'
    ),
    enum_declaration: $ => seq(
      'enum',
      field('name', $.type_ident),
      optional($.interface_impl),
      optional($.enum_spec),
      optional($.attributes),
      field('body', $.enum_body),
    ),

    // Interface
    // -------------------------
    interface_body: $ => seq('{', repeat($.func_declaration), '}'),
    interface_declaration: $ => seq(
      'interface',
      field('name', $.type_ident),
      field('body', $.interface_body),
    ),

    // Function/Macro
    // -------------------------
    _func_macro_name: $ => choice($.ident, $.at_ident),

    fn_parameter_list: $ => seq('(', optional($._parameters), ')'),

    func_header: $ => seq(
      field('return_type', $._type_or_optional_type),
      optional(seq(field('method_type', $.type), '.')),
      field('name', $._func_macro_name),
    ),

    macro_header: $ => seq(
      optional(seq(field('method_type', $.type), '.')),
      field('name', $._func_macro_name),
    ),

    implies_body: $ => seq('=>', field('body', $._expr)),

    macro_func_body: $ => choice(
      seq($.implies_body, ';'),
      $.compound_stmt
    ),

    func_declaration: $ => seq(
      'fn',
      $.func_header,
      $.fn_parameter_list,
      optional($.attributes),
      ';',
    ),
    func_definition: $ => seq(
      'fn',
      $.func_header,
      $.fn_parameter_list,
      optional($.attributes),
      field('body', $.macro_func_body),
    ),

    trailing_block_param: $ => seq(
      $.at_ident,
      optional($.fn_parameter_list),
    ),
    macro_parameter_list: $ => seq(
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
    macro_declaration: $ => seq(
      'macro',
      choice($.func_header, $.macro_header),
      $.macro_parameter_list,
      optional($.attributes),
      field('body', $.macro_func_body),
    ),

    // Lambda
    // -------------------------
    lambda_declaration: $ => seq(
      'fn',
      optional($._type_or_optional_type),
      $.fn_parameter_list,
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

    // Var Statement
    // -------------------------
    var_decl: $ => choice(
      seq('var', $.ident, $._assign_right_expr),
      seq('var', $.ct_ident, optional($._assign_right_expr)),
      seq('var', $.ct_type_ident, optional(seq('=', $.type))),
    ),
    var_stmt: $ => seq($.var_decl, ';'),

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
    defer_stmt: $ => seq('defer', optional(choice('try', 'catch')), $._statement),

    // Assert Statement
    // -------------------------
    assert_stmt: $ => seq('assert', '(', commaSep1($._expr), ')', ';'),

    // Declaration Statement
    // -------------------------
    local_decl_after_type: $ => choice(
      seq(field('name', $.ident), optional($.attributes), optional($._assign_right_expr)),
      seq(field('name', $.ct_ident), optional($._assign_right_constant_expr)),
    ),
    _decl_statement_after_type: $ => commaSep1($.local_decl_after_type),

    declaration_stmt: $ => choice(
      $.const_declaration,
      seq(
        optional($.local_decl_storage),
        field('type', $._type_or_optional_type),
        $._decl_statement_after_type,
        ';'
      ),
    ),

    // Case Statement
    // -------------------------
    case_range: $ => seq($._expr, '..', $._expr),
    case_stmt: $ => seq(
      'case',
      field('value', choice(
        $._expr,
        $.case_range,
        $.type,
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
          field('target', choice($._expr, $.type, 'default')),
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
    catch_unwrap_list: $ => commaSep1($._relational_expr),
     // Precedence over assignment expression
    catch_unwrap: $ => prec(1, seq(
      'catch',
      choice(
        $.catch_unwrap_list,
        seq(optional($.type), $.ident, '=', $.catch_unwrap_list),
      ),
    )),

    // If-Try
    // -------------------------
    _rel_or_lambda_expr: $ => choice(
      $._relational_expr,
      seq($.lambda_declaration, '=>', $._relational_expr),
    ),

    // Precedence over assignment expression
    try_unwrap: $ => prec(1, seq(
      'try',
      choice(
        $._rel_or_lambda_expr,
        seq(optional($.type), $.ident, '=', $._rel_or_lambda_expr),
      ),
    )),

    _try_unwrap_chain: $ => seq(
      $.try_unwrap,
      repeat(seq('&&', choice($.try_unwrap, $._rel_or_lambda_expr))),
    ),

    // If Statement
    // -------------------------
    _if_body: $ => choice(
      field('body', $._statement),
      seq(field('body', $.compound_stmt), $.else_part),
      seq(field('body', $.switch_body), optional($.else_part)),
    ),
    if_stmt: $ => seq(
      'if',
      optional($.label),
      field('condition', $.paren_cond),
      $._if_body,
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
    _decl_or_expr: $ => choice(
      $.var_decl,
      seq($._type_or_optional_type, $.local_decl_after_type),
      $._expr
    ),
    comma_decl_or_expr: $ => commaSep1($._decl_or_expr),

    for_cond: $ => seq(
      '(',
      field('initializer', optional($.comma_decl_or_expr)),
      ';',
      field('condition', optional($._cond)),
      ';',
      field('update', optional($.comma_decl_or_expr)),
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
      seq(optional($._type_or_optional_type), optional('&'), $.ident),
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
          seq($._shift_op, $.integer_literal),
          seq($._additive_op, $.integer_literal),
        )),
      ),
    ),
    asm_addr: $ => seq('[', $._asm_addr, ']'),
    asm_expr: $ => choice(
      $.ct_ident,
      $.ct_const_ident,
      seq(optional('&'), $.ident),
      $.const_ident,
      $.real_literal,
      $.integer_literal,
      $.paren_expr,
      $.asm_addr,
    ),
    asm_stmt: $ => seq(
      $.asm_instr, commaSep($.asm_expr), ';',
    ),
    asm_block_stmt: $ => choice(
      seq('asm', '(', $._constant_expr, ')', optional($.at_ident), ';'),
      seq('asm', optional($.at_ident), '{', repeat($.asm_stmt), '}'),
    ),


    ////////////////////////////
    // Compile Time Statements
    // -------------------------
    ct_stmt_body: $ => repeat1($._statement),

    // Compile Time Assert Statement
    // -------------------------
    ct_assert_stmt: $ => choice(
      seq('$assert', $._constant_expr, optional(seq(':', $._constant_expr)), ';'),
      seq('$error', $._constant_expr, ';'),
    ),

    // Compile Time Include Statement
    // -------------------------
    ct_include_stmt: $ => seq('$include', $.string_expr, ';'),

    // Compile Time Exec Statement
    // -------------------------
    ct_exec_stmt: $ => seq('$exec', '(', commaSep($._constant_expr), ')', ';'),

    // Compile Time Echo Statement
    // -------------------------
    ct_echo_stmt: $ => seq('$echo', $._constant_expr, ';'),

    // Compile Time If Statement
    // -------------------------
    ct_if_cond: $ => seq($._constant_expr, ':'),
    ct_if_stmt: $ => choice(
      seq('$if', $.ct_if_cond, optional($.ct_stmt_body), '$endif'),
      seq('$if', $.ct_if_cond, optional($.ct_stmt_body), '$else', optional($.ct_stmt_body), '$endif'),
    ),

    // Compile Time Switch Statement
    // -------------------------
    ct_case_stmt: $ => seq(
      choice(
        seq('$case', $._constant_expr, ':'),
        seq('$case', $.type, ':'),
        seq('$default', ':'),
      ),
      optional($.ct_stmt_body),
    ),
    ct_switch_cond: $ => seq('(', choice($._constant_expr, $.type), ')'),

    _ct_switch: $ => seq('$switch', optional($.ct_switch_cond)),
    _ct_switch_body: $ => repeat1($.ct_case_stmt),
    ct_switch_stmt: $ => seq(
      $._ct_switch,
      $._ct_switch_body,
      '$endswitch',
    ),

    // Compile Time For Statement
    // -------------------------
    ct_for_stmt: $ => seq(
      '$for',
      $.for_cond,
      optional($.ct_stmt_body),
      '$endfor'
    ),

    // Compile Time Foreach Statement
    // -------------------------
    ct_foreach_cond: $ => seq(
      '(',
      optional(seq(field('index', $.ct_ident), ',')),
      field('value', $.ct_ident),
      ':',
      field('collection', $._expr),
      ')',
    ),
    ct_foreach_stmt: $ => seq(
      '$foreach',
      $.ct_foreach_cond,
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
      $.suffix_expr,
      $.binary_expr,
      $.unary_expr,
      $.cast_expr,
      $.rethrow_expr,
      $.trailing_generic_expr,
      $.update_expr,
      $.call_expr,
      $.subscript_expr,
      $.initializer_list,
      $._base_expr,
    )),

    _constant_expr: $ => prec(1, choice(
      $.ternary_expr,
      $.lambda_expr,
      $.elvis_orelse_expr,
      $.suffix_expr,
      $.binary_expr,
      $.unary_expr,
      $.cast_expr,
      $.rethrow_expr,
      $.trailing_generic_expr,
      $.update_expr,
      $.call_expr,
      $.subscript_expr,
      $.initializer_list,
      $._base_expr,
    )),

    // NOTE This deviates original grammar by including && and ||.
    _relational_expr: $ => prec(2, choice(
      $.binary_expr,
      $.unary_expr,
      $.cast_expr,
      $.rethrow_expr,
      $.trailing_generic_expr,
      $.update_expr,
      $.call_expr,
      $.subscript_expr,
      $.initializer_list,
      $._base_expr,
    )),

    // One more level for more accurate errors
    _trailing_expr: $ => prec(3, choice(
      $.rethrow_expr,
      $.trailing_generic_expr,
      $.update_expr,
      $.call_expr,
      $.subscript_expr,

      $.initializer_list,
      $._base_expr,
    )),

    // Base Expression
    // -------------------------
    _ident_expr: $ => choice(
      $.const_ident,
      $.ident,
      $.at_ident,
    ),
    _local_ident_expr: $ => choice(
      $.ct_ident,
      $.hash_ident,
    ),
    _ct_call: $ => choice(
      '$alignof',
      '$extnameof',
      '$nameof',
      '$offsetof',
      '$qnameof',
    ),
    _ct_analyse: $ => choice(
      '$eval',
      '$defined',
      '$sizeof',
      '$stringify',
      '$is_const',
    ),
    _ct_arg: $ => choice(
      '$vaconst',
      '$vaarg',
      '$varef',
      '$vaexpr',
    ),

    // Precedence over _trailing_expr
    flat_path: $ => prec(4, choice(
      seq($._base_expr, $.param_path),
      $.type,
      $._base_expr,
    )),

    string_expr: $ => repeat1(choice($.string_literal, $.raw_string_literal)),
    bytes_expr: $ => repeat1($.bytes_literal),
    paren_expr: $ => seq('(', $._expr, ')'),

    _base_expr: $ => prec(5, choice(
      'true',
      'false',
      'null',
      $.builtin,
      $.integer_literal,
      $.real_literal,
      $.char_literal,
      $.string_literal,
      $.raw_string_literal,
      $.string_expr,
      $.bytes_expr,

      $._ident_expr,
      $._local_ident_expr,

      $.initializer_list,
      seq($.type, $.initializer_list),

      $.module_ident_expr,
      $.field_expr,
      $.type_access_expr,
      $.paren_expr,
      $.expr_block,

      '$vacount',
      seq($._ct_call, '(', $.flat_path, ')'),
      seq($._ct_arg, '(', $._expr, ')'),
      seq($._ct_analyse, '(', $.comma_decl_or_expr, ')'),
      seq('$feature', '(', $.const_ident, ')'),
      seq('$and', '(', $.comma_decl_or_expr, ')'),
      seq('$or', '(', $.comma_decl_or_expr, ')'),
      seq('$assignable', '(', $._expr, ',', $.type, ')'),
      seq('$embed', '(', commaSep($._constant_expr), ')'),
      seq('$concat', '(', commaSep($._constant_expr), ')'),
      seq('$append', '(', commaSep($._constant_expr), ')'),

      seq($.lambda_declaration, field('lambda_body', $.compound_stmt)),
    )),

    // Module Ident
    // -------------------------
    module_ident_expr: $ => seq(
      $._module_path,
      field('ident', $._ident_expr),
    ),
    module_type_ident: $ => seq(
      $._module_path,
      $.type_ident,
    ),

    // Initializer List
    // -------------------------
    initializer_list: $ => seq(
      '{',
      commaSepTrailing($.arg),
      '}',
    ),

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
        field('right', $.type),
      ),
    )),

    // Ternary Expression
    // -------------------------
    ternary_expr: $ => prec.right(PREC.TERNARY, choice(
      seq(
        // field('condition', $._constant_expr),
        field('condition', $._relational_expr), // TODO
        '?',
        field('consequence', $._expr),
        ':',
        field('alternative', $._constant_expr),
      ),
    )),

    // Lambda Expression
    // -------------------------
    lambda_expr: $ => prec.right(PREC.TERNARY, seq($.lambda_declaration, $.implies_body)),

    // Elvis/or-else (?:, ??) Expression
    // -------------------------
    elvis_orelse_expr: $ => prec.right(PREC.TERNARY, seq(
      $._constant_expr, choice('?:', '??'), $._constant_expr,
    )),

    // Suffix Expression
    // -------------------------
    suffix_expr: $ => prec.right(PREC.TERNARY, seq(
      field('argument', $._relational_expr),
      field('operator', choice(
        '?',
        seq('?', '!'),
      )),
    )),

    // Cast Expression
    // -------------------------
    cast_expr: $ => prec(PREC.UNARY, seq(
      '(',
      field('type', $.type),
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
      ];

      return make_binary_expr($, table);
    },

    // Arguments
    // -------------------------
    // Precedence over _trailing_expr
    param_path_element: $ => prec(4, choice(
      seq('[', $._expr, ']'),
      seq('[', $._expr, '..', $._expr, ']'),
      seq('.', $._base_expr),
    )),
    param_path: $ => repeat1($.param_path_element),

    arg: $ => choice(
      seq($.param_path),
      seq($.param_path, '=', choice($._expr, $.type)),
      $.type,
      $._expr,
      seq('$vasplat', '(', optional($.range_expr), ')'),
      seq('...', $._expr),
    ),

    // Call Expression
    // -------------------------
    _call_arg_list: $ => choice(
      commaSepTrailing1($.arg),
      seq(
        commaSepTrailing($.arg),
        seq(';', optional($._parameters)),
      ),
    ),

    call_inline_attributes: $ => repeat1($.at_ident),
    call_invocation: $ => seq(
      '(',
      optional($._call_arg_list),
      ')',
      optional($.call_inline_attributes),
    ),
    call_expr: $ => prec.right(PREC.TRAILING, seq(
      field('function', $._trailing_expr),
      field('arguments', $.call_invocation),
      field('trailing', optional($.compound_stmt)),
    )),

    // Postfix Update Expression (--/++)
    // -------------------------
    update_expr: $ => prec.right(PREC.TRAILING, seq(
      field('argument', $._trailing_expr),
      field('operator', choice('--', '++')),
    )),

    // Rethrow Expression
    // -------------------------
    rethrow_expr: $ => prec.right(PREC.TRAILING, seq(
      field('argument', $._trailing_expr),
      field('operator', choice('!', '!!')),
    )),

    // Trailing Generic Expression
    // -------------------------
    trailing_generic_expr: $ => prec.right(PREC.TRAILING, seq(
      field('argument', $._trailing_expr),
      field('operator', $.generic_arguments),
    )),

    // Range Expression
    // -------------------------
    _range_loc: $ => seq(
      optional('^'),
      $._expr,
    ),
    range_expr: $ => choice(
      seq($._range_loc, choice('..', ':'), $._range_loc),
      seq($._range_loc, choice('..', ':')),
      seq(choice('..', ':'), $._range_loc),
      '..',
    ),

    // Subscript Expression
    // -------------------------
    subscript_expr: $ => prec.right(PREC.SUBSCRIPT, seq(
      field('argument', $._trailing_expr),
      '[',
      choice(
        field('index', $._range_loc),
        field('range', $.range_expr),
      ),
      ']',
    )),

    // Field Expression
    // -------------------------
    field_expr: $ => seq(
      prec(PREC.FIELD, seq(
        field('argument', $._expr),
        '.',
      )),
      field('field', $.access_ident),
    ),

    // Access Expression
    // -------------------------
    access_ident: $ => choice(
      $.ident,
      $.at_ident,
      $.hash_ident,
      seq('$eval', '(', $._expr, ')'),
      'typeid',
    ),
    type_access_expr: $ => seq(
      prec(PREC.FIELD, seq(
        field('argument', $.type),
        '.',
      )),
      field('field', choice($.access_ident, $.const_ident)),
    ),

    // Expression Block
    // -------------------------
    expr_block: $ => seq(
      '{|',
      repeat($._statement),
      '|}',
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
      'bfloat16',
      'float128',
      'iptr',
      'uptr',
      'isz',
      'usz',
      'anyfault',
      'any',
      'typeid',
    ),

    base_type: $ => choice(
      $.base_type_name,
      seq($.type_ident, optional($.generic_arguments)),
      seq($.module_type_ident, optional($.generic_arguments)),
      $.ct_type_ident,
      seq('$typeof', '(', $._expr, ')'),
      seq('$typefrom', '(', $._constant_expr, ')'),
      seq('$vatype', '(', $._constant_expr, ')'),
      seq('$evaltype', '(', $._constant_expr, ')'),
    ),

    type_suffix: $ => choice(
      '*',
      seq('[', $._constant_expr, ']'),
      seq('[', ']'),
      seq('[', '*', ']'),
      seq('[<', $._constant_expr, '>]'),
      seq('[<', '*', '>]'),
    ),
    type: $ => prec.right(seq(
      $.base_type,
      repeat($.type_suffix),
    )),

    _type_or_optional_type: $ => choice($.type, $.optional_type),
    optional_type: $ => prec(-1, seq(
      $.type,
      optional('!'),
    )),
  }
});
