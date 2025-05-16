/**
 * @file C3 grammar for tree-sitter
 * @author Christian Buttner
 * @license MIT
 */

// Reference grammar: https://github.com/c3lang/c3c/blob/master/resources/grammar/grammar.y

// Note that this grammar is not as strict as the compiler.
// For example it permits
// - Some expressions where the compiler requires parenthesis
// - Empty structs/enums
// - Mixing omission of bitstruct member bitranges
// - Optional types everywhere
// - `try` followed by expressions with lower precedence than &&)

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
  FIELD: 12,
  SUBSCRIPT: 13,
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

  // WARNING: must be in the same order as scanner.c TokenType enum
  //   don't comment it can lead to picking wrong parser
  externals: $ => [
    $.block_comment_text,
    $.doc_comment_text,
    $.real_literal,
  ],

  inline: $ => [
    $._statement,
    $._top_level_item,
    $._ct_call,
    $._ct_arg,
    $._asm_addr,
    $._type_optional,
  ],

  word: $ => $.ident,

  rules: {
    // File
    // -------------------------
    source_file: $ => repeat($._top_level_item),

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

    // Doc comments and contracts
    // -------------------------
    doc_comment_contract_descriptor: _ => token(/\[&?(?:in|out|inout)\]/),
    doc_comment_contract: $ => seq(
      choice(
        seq(
          field('name', alias('@param', $.at_ident)),
          optional(field('mutability_contract', $.doc_comment_contract_descriptor)),
          field('ident', choice($.ident, $.ct_ident, $.ct_type_ident, $.hash_ident)),
          optional(':'),
          optional($.string_expr)
        ),
        field('name', alias('@pure', $.at_ident)),
        seq(
          field('name', alias(choice('@ensure', '@require'), $.at_ident)),
          commaSep1($._expr),
          optional(':'),
          optional($.string_expr),
        ),
        seq(
          field('name', alias('@return', $.at_ident)),
          choice(
            seq('?', commaSep1($.path_const_ident), optional(':'), optional($.string_expr)),
            $.string_expr,
          )
        ),
        seq(field('name', $.at_ident), optional($.string_expr)),
      ),
      '\n'
    ),
    doc_comment: $ => seq(
      '<*',
      optional($.doc_comment_text), // NOTE parsed by scanner.c (scan_doc_comment_text)
      repeat($.doc_comment_contract),
      '*>',
    ),

    block_comment: $ => seq(
      '/*',
      // NOTE parsed by scanner.c (scan_block_comment)
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
    path_at_type_ident: $ => seq(optional($._module_path), $.at_type_ident),
    alias_path_ident: $ => seq(
      optional($._module_path),
      optional(seq($.type_ident, '.')),
      $.ident,
    ),
    alias_path_at_ident: $ => seq(
      optional($._module_path),
      optional(seq($.type_ident, '.')),
      $.at_ident,
    ),

    // Generic Parameters
    // -------------------------
    _generic_arg_list: $ => commaSep1(choice(
      $._expr,
      $.type,
    )),
    generic_arguments: $ => seq('{', $._generic_arg_list, '}'),

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
          '...',
          seq(optional('...'), field('name', $.ident), optional($.attributes)),
          // Macro parameters
          seq(field('name', choice($.ct_ident, $.hash_ident)), optional($.attributes)),
        )),
      ),

      // Untyped parameters
      '...',
      seq(field('name', $.ident), optional('...'), optional($.attributes)),
      seq('&', field('name', $.ident), optional($.attributes)), // Method ref parameter such as &self
      // Macro parameters
      // Precedence for $.ct_type_ident over $.type
      prec(1, seq(
        field('name', choice($.ct_ident, $.ct_type_ident, $.hash_ident)),
        optional($.attributes)
      )),
    ),

    parameter_default: $ => seq('=', field('right', choice($._expr, $.type))),
    parameter: $ => seq($._parameter, optional($.parameter_default)),
    _parameters: $ => commaSepTrailing1(seq($.parameter)),

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

    attr_param: $ => choice($.overload_operator, $._constant_expr),

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
    generic_module_parameters: $ => seq('{', commaSep1($._module_param), '}'),
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

    // Alias
    // -------------------------
    func_signature: $ => seq(
      'fn',
      field('return_type', $._type_optional),
      $.fn_parameter_list
    ),

    alias_declaration: $ => seq(
      'alias',
      choice(
        seq(
          choice(
            seq(field('name', $.ident), optional($.attributes), '=', $.alias_path_ident),
            seq(field('name', $.at_ident), optional($.attributes), '=', $.alias_path_at_ident),
            seq(field('name', $.const_ident), optional($.attributes), '=', $.path_const_ident),
          ),
          optional($.generic_arguments),
        ),
        seq(field('name', $.type_ident), optional($.attributes), '=', choice($.type, $.func_signature)),
      ),
      ';'
    ),

    // Faultdef
    // -------------------------
    faultdef_declaration: $ => seq(
      'faultdef',
      commaSep1($.const_ident),
      optional($.attributes),
      ';',
    ),

    // Typedef
    // -------------------------
    typedef_declaration: $ => seq(
      'typedef',
      field('name', $.type_ident),
      optional($.interface_impl),
      optional($.attributes),
      '=',
      optional('inline'),
      $.type,
      ';'
    ),

    // Attrdef
    // -------------------------
    attribute_list: $ => commaSep1($.attribute),
    attrdef_declaration: $ => seq(
      'attrdef',
      field('name', $.at_type_ident),
      optional(seq('(', $._parameters, ')')),
      optional($.attributes),
      optional(seq(
        '=',
        $.attribute_list,
      )),
      ';'
    ),

    // Const
    // -------------------------
    const_declaration: $ => seq(
      'const',
      field('type', optional($._type_optional)),
      field('name', $.const_ident),
      optional($.attributes),
      optional($._assign_right_expr),
      ';'
    ),

    // Global
    // -------------------------
    _multi_declaration: $ => seq(',', field('name', commaSep1($.ident))),
    global_declaration: $ => seq(
      optional($.global_storage),
      field('type', optional($._type_optional)),
      field('name', $.ident),
      choice(
        seq(
          optional($._multi_declaration),
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
      seq(
        'bitstruct',
        optional($.ident),
        ':',
        alias($._type_no_generics, $.type),
        optional($.attributes),
        field('body', $.bitstruct_body)
      ),
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
      field('type', alias($._base_type, $.base_type)),
      $.ident,
      optional(seq(
        ':',
        $._constant_expr,
        optional(seq(
          '..',
          $._constant_expr,
        ))
      )),
      ';'
    ),
    bitstruct_body: $ => seq(
      '{',
      repeat($.bitstruct_member_declaration),
      '}',
    ),
    bitstruct_declaration: $ => seq(
      'bitstruct',
      field('name', $.type_ident),
      optional($.interface_impl),
      ':',
      alias($._type_no_generics, $.type),
      optional($.attributes),
      field('body', $.bitstruct_body),
    ),

    // Enum
    // -------------------------
    enum_arg: $ => seq('=', $._expr),
    enum_constant: $ => seq(
      field('name', $.const_ident),
      optional($.attributes),
      field('args', optional($.enum_arg)),
    ),
    enum_param_declaration: $ => seq(
      optional('inline'),
      field('type', $.type),
      field('name', $.ident),
    ),
    enum_param_list: $ => seq('(', commaSepTrailing($.enum_param_declaration), ')'),
    enum_spec: $ => prec.right(seq(
      ':',
      choice(
        seq(optional('inline'), field('type', alias($._type_no_generics, $.type)), optional($.enum_param_list)),
        $.enum_param_list,
      ),
    )),
    enum_body: $ => seq(
      '{',
      commaSepTrailing($.enum_constant),
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
      field('return_type', $._type_optional),
      optional(seq(field('method_type', $.type), '.')),
      field('name', $._func_macro_name),
    ),

    macro_header: $ => seq(
      optional(field('return_type', $._type_optional)), // Return type is optional for macros
      optional(seq(field('method_type', $.type), '.')),
      field('name', $._func_macro_name),
    ),

    implies_body: $ => seq('=>', field('body', $._expr)),

    macro_func_body: $ => choice(
      seq('=>', $.call_expr),
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
      $.macro_header,
      $.macro_parameter_list,
      optional($.attributes),
      field('body', $.macro_func_body),
    ),

    // Lambda
    // -------------------------
    lambda_declaration: $ => seq(
      'fn',
      field('return_type', optional($._type_optional)),
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
      seq('var', field('name', $.ident), $._assign_right_expr),
      seq('var', field('name', $.ct_ident), optional($._assign_right_expr)),
      seq('var', field('name', $.ct_type_ident), optional(seq('=', $._type_optional))),
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
    defer_stmt: $ => seq(
      'defer',
      optional(choice(
        'try',
        'catch',
        seq('(', 'catch', $.ident, ')'),
      )),
      $._statement
    ),

    // Assert Statement
    // -------------------------
    assert_stmt: $ => seq('assert', '(', commaSep1($._expr), ')', ';'),

    // Declaration Statement
    // -------------------------
    local_decl_after_type: $ => choice(
      seq(field('name', $.ident), optional($.attributes), optional($._assign_right_expr)),
      seq(field('name', $.ct_ident), optional($._assign_right_expr)),
    ),
    _decl_statement_after_type: $ => commaSep1($.local_decl_after_type),

    declaration_stmt: $ => choice(
      $.const_declaration,
      seq(
        optional($.local_decl_storage),
        field('type', $._type_optional),
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
        $._type_optional,
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
          field('target', choice($._expr, $._type_optional, 'default')),
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
    _decl_or_expr: $ => choice(
      $.var_decl,
      seq($._type_optional, $.local_decl_after_type),
      $._expr
    ),
    comma_decl_or_expr: $ => commaSep1($._decl_or_expr),

    for_cond: $ => seq(
      field('initializer', optional($.comma_decl_or_expr)),
      ';',
      field('condition', optional($._cond)),
      ';',
      field('update', optional($.comma_decl_or_expr)),
    ),
    for_stmt: $ => seq(
      'for',
      optional($.label),
      '(',
      $.for_cond,
      ')',
      field('body', $._statement)
    ),

    // Foreach Statement
    // -------------------------
    foreach_var: $ => choice(
      seq(optional($._type_optional), optional('&'), $.ident),
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
    ct_exec_stmt: $ => seq('$exec', '(', commaSep($._constant_expr), ')', optional($.attributes), ';'),

    // Compile Time Echo Statement
    // -------------------------
    ct_echo_stmt: $ => seq('$echo', $._constant_expr, ';'),

    // Compile Time If Statement
    // -------------------------
    ct_if_cond: $ => seq($._constant_expr, ':'),
    ct_else_stmt: $ => seq('$else', optional($.ct_stmt_body)),
    ct_if_stmt: $ => choice(
      seq('$if', $.ct_if_cond, optional($.ct_stmt_body), optional($.ct_else_stmt), '$endif'),
    ),

    // Compile Time Switch Statement
    // -------------------------
    ct_case_stmt: $ => seq(
      choice(
        seq('$case', $._constant_expr, ':'),
        seq('$case', $._type_optional, ':'),
        seq('$default', ':'),
      ),
      optional($.ct_stmt_body),
    ),
    ct_switch_cond: $ => seq(choice($._constant_expr, $._type_optional)),

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
      $.for_cond,
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
      $.initializer_list,
      $._base_expr,
    )),

    _constant_expr: $ => prec(1, choice(
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
    _ct_arg: $ => choice(
      '$vaconst',
      '$vaarg',
      '$vaexpr',
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
    typed_initializer_list: $ => prec(3, seq('(', $.type, ')', $.initializer_list)),

    _base_expr: $ => prec(2, choice(
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
      $.module_ident_expr,
      $._local_ident_expr,

      $.initializer_list,
      $.typed_initializer_list,

      $.field_expr,
      $.type_access_expr,
      $.paren_expr,

      seq($.lambda_declaration, field('lambda_body', $.compound_stmt)),

      // Compile-time expressions
      '$vacount',
      seq($._ct_call, '(', $.flat_path, ')'),
      seq(
        choice(
          '$eval',
          '$is_const',
          '$sizeof',
          '$stringify',
        ),
        '(', $._expr, ')'
      ),
      seq($._ct_arg, '[', $._expr, ']'),
      seq(
        choice(
          '$defined',
          '$embed',
        ),
        '(', commaSep($.call_arg), ')'
      ),
      seq('$feature', '(', $.const_ident, ')'),
      seq('$assignable', '(', $._expr, ',', $.type, ')'),
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

    // Initializers
    // -------------------------
    // Precedence over _expr
    param_path_element: $ => prec(1, choice(
      seq('[', $._expr, ']'),
      seq('[', $._expr, '..', $._expr, ']'),
      seq('.', $._base_expr),
    )),
    param_path: $ => repeat1($.param_path_element),

    arg: $ => choice(
      seq($.param_path),
      seq($.param_path, '=', $._expr),
      seq(optional('...'), $._expr),
    ),

    initializer_list: $ => seq('{', commaSepTrailing($.arg), '}'),

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
        field('condition', $._expr),
        '?',
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
      $.type,
      $._expr,
      // Splatting
      seq('$vasplat', optional(seq('[', $.range_expr, ']'))),
      seq('...', $._expr),
      // Named arguments
      seq(field('name', choice($.ident, $.ct_ident)), ':', choice($._expr, $.type)),
    ),
    _call_arg_list: $ => choice(
      commaSepTrailing1($.call_arg),
      seq(
        commaSepTrailing($.call_arg),
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
      field('function', $._expr),
      field('arguments', $.call_invocation),
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
      field('operator', $.generic_arguments),
    )),

    // Range Expression
    // -------------------------
    _range_loc: $ => seq(
      optional('^'),
      $._expr,
    ),
    range_expr: $ => choice(
      // TODO could relax this
      seq(field('left', $._range_loc), field('operator', choice('..', ':')), field('right', optional($._range_loc))),
      seq(field('left', optional($._range_loc)), field('operator', choice('..', ':')), field('right', $._range_loc)),
      '..',
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
    access_eval: $ => seq('$eval', '(', $._expr, ')'),
    access_ident: $ => choice(
      $.ident,
      $.at_ident,
      $.hash_ident,
      $.access_eval,
      'typeid',
    ),
    type_access_expr: $ => seq(
      prec(PREC.FIELD, seq(
        field('argument', $.type),
        '.',
      )),
      field('field', choice($.access_ident, $.const_ident)),
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
      'fault',
      'any',
      'typeid',
    ),

    _base_type: $ => prec.right(choice(
      $.base_type_name,
      $.type_ident,
      $.module_type_ident,
      $.ct_type_ident,
      seq('$typeof', '(', $._expr, ')'),
      seq('$typefrom', '(', $._expr, ')'),
      seq('$evaltype', '(', $._expr, ')'),
      seq('$vatype', '[', $._expr, ']'),
    )),

    _base_type_with_generics: $ => choice(
      $._base_type,
      $.generic_type_ident
    ),

    generic_type_ident: $ => choice(
      seq($.type_ident, $.generic_arguments),
      seq($.module_type_ident, $.generic_arguments),
    ),

    type_suffix: $ => choice(
      '*',
      seq('[', $._expr, ']'),
      seq('[', ']'),
      seq('[', '*', ']'),
      seq('[<', $._expr, '>]'),
      seq('[<', '*', '>]'),
    ),

    type: $ => prec.right(seq(
      alias($._base_type_with_generics, $.base_type),
      repeat($.type_suffix),
      optional('?'),
    )),
    _type_no_generics: $ => prec.right(seq(
      alias($._base_type, $.base_type),
      repeat($.type_suffix),
      optional('?'),
    )),
    // This legacy rule was used in places where the compiler permits an optional type.
    _type_optional: $ => $.type,
  }
});
