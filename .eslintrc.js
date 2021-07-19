// vim: foldmethod=marker:foldmarker={{{,}}}
/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// ESlint config

// This is a matcher (usable in no-restricted-syntax) that matches either a
// test or a before/after block.
const testNameRegex =
    '/^([fx]?it|(drm|quarantined)It|(before|after)(Each|All))$/';
const testCall = `CallExpression[callee.name=${testNameRegex}]`;

const commonNoRestrictedSyntax = [
  {
    'selector':
        'MemberExpression[object.name="goog"][property.name="inherits"]',
    'message': 'Don\'t use goog.inherits.',
  },
  {
    'selector': ':not(MethodDefinition) > FunctionExpression',
    'message': 'Use arrow functions instead of "function" functions.',
  },
  {
    'selector': 'CallExpression[callee.property.name="forEach"] >' +
                ':function[params.length=1]',
    'message': 'Use for-of instead of forEach',
  },
  {
    // NOTE: prefer-spread rule covers .apply() already.
    'selector': 'CallExpression[callee.property.name=/^(bind|call)$/]',
    'message': 'Don\'t use Function bind/call.',
  },
  {
    'selector': 'MemberExpression[property.name="prototype"]',
    'message': 'Use ES6 classes not .prototype.',
  },
  {
    'selector': 'BinaryExpression[operator=/^([<>!=]=?)$/] > ' +
                'CallExpression[callee.property.name=indexOf]',
    'message': 'Use Array.includes instead of indexOf.',
  },
];

module.exports = {
  'env': {
    'browser': true,
    'es6': true,
  },
  'parserOptions': {
    'ecmaVersion': 2017,
  },
  'extends': ['eslint:recommended', 'google', 'plugin:shaka-rules/config'],
  'rules': {
    // Things the compiler already takes care of, with more precision: {{{
    'no-console': 'off',
    'no-eq-null': 'off',
    'no-eval': 'off',
    'no-undef': 'off',
    'valid-jsdoc': 'off',
    // }}}

    // Things we should probably fix, but in stages in multiple commits: {{{

    // These could catch real bugs
    'default-case': 'off',
    // TODO: Enable no-loop-func in next eslint release.  We can't use it
    // now since it doesn't allow capturing "const" variables, which is safe
    'no-loop-func': 'off',
    'no-unused-expressions': 'off',  // Conflicts with some Closure declarations
    'prefer-promise-reject-errors': 'off',

    // These could improve readability
    'complexity': 'off',
    'no-negated-condition': 'off',
    'no-shadow': 'off',
    // }}}

    // "Possible error" rules: {{{
    'no-async-promise-executor': 'error',
    'no-await-in-loop': 'error',
    'no-empty': ['error', {'allowEmptyCatch': true}],
    'no-misleading-character-class': 'error',
    'no-template-curly-in-string': 'error',
    // TODO: Try to re-enable this if possible.  Right now, it produces way too
    // many false-positives with eslint 7.  It worked well enough in eslint 5.
    // 'require-atomic-updates': 'error',
    // }}}

    // "Best practices" rules: {{{
    'accessor-pairs': 'error',
    'array-callback-return': 'error',
    // causes issues when implementing an interface
    'class-methods-use-this': 'off',
    'consistent-return': 'error',
    'dot-location': ['error', 'property'],
    'dot-notation': 'off',  // We use bracket notation in tests on purpose
    'eqeqeq': 'off',        // Compiler handles type checking in advance
    'guard-for-in': 'off',
    'no-alert': 'error',
    'no-caller': 'error',
    'no-div-regex': 'error',
    'no-extend-native': 'error',  // May conflict with future polyfills
    'no-extra-label': 'error',
    'no-floating-decimal': 'error',
    'no-implicit-coercion': ['error', {'allow': ['!!']}],
    'no-implied-eval': 'error',
    'no-invalid-this': 'error',
    'no-iterator': 'error',
    'no-labels': 'error',
    'no-lone-blocks': 'error',
    'no-multi-spaces': ['error', {'ignoreEOLComments': true}],
    'no-multi-str': 'error',
    'no-new': 'error',
    'no-new-func': 'error',
    'no-new-wrappers': 'error',
    'no-octal-escape': 'error',
    'no-proto': 'error',
    'no-return-assign': 'error',
    'no-return-await': 'error',
    'no-script-url': 'error',
    'no-self-compare': 'error',
    'no-sequences': 'error',
    'no-throw-literal': 'error',
    'no-unmodified-loop-condition': 'error',
    'no-unused-vars': 'off',  // Interface impls may not require all args
    'no-useless-call': 'error',
    'no-useless-catch': 'error',
    'no-useless-concat': 'error',
    'no-useless-return': 'error',
    'no-void': 'error',
    'no-warning-comments': 'off',  // TODO and FIXME are fine
    'radix': ['error', 'always'],
    'require-await': 'error',
    'wrap-iife': ['error', 'inside'],
    'yoda': ['error', 'never'],
    // }}}

    // "Variables" rules: {{{
    'no-label-var': 'error',
    'no-shadow-restricted-names': 'error',
    'no-undef-init': 'off',  // Sometimes necessary with hacky compiler casts
    'no-undefined': 'off',   // We use undefined in many places, legitimately
    // Does not know when things are executed, false positives
    'no-use-before-define': 'off',
    // }}}

    // "Stylistic Issues" rules: {{{
    'array-bracket-newline': ['error', 'consistent'],
    'block-spacing': ['error', 'always'],
    'brace-style': ['error', '1tbs', {'allowSingleLine': true}],
    'id-denylist': ['error', 'async'],
    'lines-between-class-members': 'error',
    'max-statements-per-line': ['error', {'max': 1}],
    'new-parens': 'error',
    'no-mixed-operators': [
      'error', {
        'groups': [['&', '|', '^', '~', '<<', '>>', '>>>', '&&', '||']],
        'allowSamePrecedence': false,
      },
    ],
    'no-restricted-syntax': [
      'error',
      ...commonNoRestrictedSyntax,
    ],
    'no-whitespace-before-property': 'error',
    'nonblock-statement-body-position': ['error', 'below'],
    'operator-assignment': 'error',
    'spaced-comment': ['error', 'always', {
      // Characters which may be glued to the start of a comment block, but
      // which do not violate the rule.  The "*" is for jsdoc's "/**" syntax,
      // and the "!" is for the "/*!" of license headers which are passed
      // verbatim through the compiler.
      'markers': ['*', '!'],
    }],
    'require-jsdoc': ['error', {
      'require': {
        'FunctionDeclaration': true,
        'MethodDefinition': true,
        'ClassDeclaration': true,
      },
    }],
    // }}}

    // "ECMAScript 6" rules: {{{
    'arrow-spacing': 'error',
    'no-useless-constructor': 'error',
    'prefer-arrow-callback': 'error',
    'prefer-const': ['error', {'ignoreReadBeforeAssign': true}],
    // }}}
  },
  'overrides': [
    {
      'rules': {
        'no-restricted-syntax': [
          'error',
          {
            'selector': 'CallExpression[callee.name="beforeAll"] ' +
                        ':matches(' +
                        'CallExpression[callee.property.name="createSpy"],' +
                        'CallExpression[callee.name="spyOn"])',
            'message': 'Create spies in beforeEach, not beforeAll.',
          },
          {
            'selector': testCall + ' > :function[params.length>0]',
            'message': 'Use async instead of "done" in tests.',
          },
          {
            'selector': testCall + ' > CallExpression',
            'message': 'Use filterDescribe instead of checkAndRun calls',
          },
          {
            'selector': 'CatchClause',
            'message': 'Use expect.toThrow or expectAsync.toBeRejected',
          },
          {
            'selector': 'CallExpression[callee.name=expect] >' +
                        'CallExpression[callee.property.name=count]' +
                        '[callee.object.property.name=calls]',
            'message': 'Use expect.toHaveBeenCalledTimes',
          },
          {
            'selector':
                'CallExpression[callee.property.name=toHaveBeenCalledTimes] >' +
                'Literal[value=0]',
            'message': 'Use expect.not.toHaveBeenCalled',
          },
          ...commonNoRestrictedSyntax,
        ],
      },
      'files': [
        'test/**/*.js',
      ],
    },
    {
      'rules': {
        'no-restricted-syntax': 'off',
      },
      'files': [
        'demo/load.js',
        'externs/**/*.js',
        'test/test/externs/*.js',
        'ui/externs/*.js',
      ],
    },
    {
      'rules': {
        'no-var': 'off',
      },
      'files': [
        // Closure requires using var in externs.
        'ui/externs/*.js',
        'externs/**/*.js',
        'test/test/externs/*.js',
        // Use var in load.js so it works in old browsers.  We'll use
        // compiled mode for the main library and the demo.
        'demo/load.js',
      ],
    },
    {
      'rules': {
        'prefer-rest-params': 'off',
      },
      'files': [
        // Test code should still use "arguments", since the alternate
        // "rest parameter" syntax won't work in uncompiled code on IE.
        'test/**/*.js',
        // These two files use "arguments" to patch over functions.  It
        // is difficult to reason about whether or not these instances
        // would always work with rest parameters, so just allow them to
        // use "arguments".
        'demo/log_section.js',
        'lib/debug/asserts.js',
      ],
    },
    {
      'rules': {
        // Disable rules on useless constructors so we can use ES6 classes in
        // externs.
        'no-useless-constructor': 'off',
      },
      'files': ['externs/**/*.js'],
    },
    {
      'rules': {
        // JSDoc is not strictly required in externs, tests, and in load.js.
        'require-jsdoc': 'off',
      },
      'files': [
        'demo/load.js',
        'externs/**/*.js',
        'test/**/*.js',
      ],
    },
    {
      'rules': {
        // Externs naturally redeclare things eslint knows about.
        'no-redeclare': 'off',
      },
      'files': [
        'ui/externs/*.js',
        'externs/**/*.js',
        'test/test/externs/*.js',
      ],
    },
  ],
};
