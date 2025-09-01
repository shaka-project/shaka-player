/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// ESlint config

import js from '@eslint/js';
import stylisticJs from '@stylistic/eslint-plugin-js';
import google from 'eslint-config-google';
import jsdoc from 'eslint-plugin-jsdoc';
import shakaRules from 'eslint-plugin-shaka-rules';
import globals from 'globals';

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

export default [
  {
    ignores: ['!**/eslint.config.mjs', 'build/wrapper.template.js'],
  },
  js.configs.recommended,
  jsdoc.configs['flat/recommended-error'],
  google,
  shakaRules.configs.config,
  stylisticJs.configs['disable-legacy'],
  {
    languageOptions: {
      globals: globals.browser,
      ecmaVersion: 2017,
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    plugins: {
      '@stylistic': stylisticJs,
    },
    settings: {
      jsdoc: {
        mode: 'closure',
        preferredTypes: {
          '.<>': '<>',
          'object': 'Object',
          'symbol': 'Symbol',
        },
        tagNamePreference: {
          augments: 'extends',
          constant: 'const',
          constructor: 'constructor',
          file: 'fileoverview',
          returns: 'return',
        },
      },
    },
    rules: {
      // Things the compiler already takes care of, with more precision: {{{
      'no-eq-null': 'off',
      'no-eval': 'off',
      'no-undef': 'off',
      // }}}

      // Things we should probably fix, but in stages in multiple commits: {{{

      // These could catch real bugs
      'default-case': 'off',
      // TODO: Enable no-loop-func in next eslint release.  We can't use it
      // now since it doesn't allow capturing "const" variables, which is safe
      'no-loop-func': 'off',
      // Conflicts with some Closure declarations
      'no-unused-expressions': 'off',
      'prefer-promise-reject-errors': 'off',
      // These could improve readability
      'complexity': 'off',
      'no-negated-condition': 'off',
      'no-shadow': 'off',
      // }}}

      // "Possible error" rules: {{{
      'no-async-promise-executor': 'error',
      'no-await-in-loop': 'error',
      'no-empty': ['error', {
        allowEmptyCatch: true,
      }],
      'no-misleading-character-class': 'error',
      'no-template-curly-in-string': 'error',
      'no-fallthrough': ['error', {
        allowEmptyCase: true,
      }],
      // TODO: Try to re-enable this if possible.  Right now, it produces way
      // too many false-positives with eslint 7.
      // It worked well enough in eslint 5.
      // 'require-atomic-updates': 'error',
      // }}}

      // "Best practices" rules: {{{
      'accessor-pairs': 'error',
      'array-callback-return': 'error',
      // causes issues when implementing an interface
      'class-methods-use-this': 'off',
      'consistent-return': 'error',
      'dot-notation': 'off', // We use bracket notation in tests on purpose
      'eqeqeq': 'off',       // Compiler handles type checking in advance
      'guard-for-in': 'off',
      'no-alert': 'error',
      'no-caller': 'error',
      'no-console': 'error',
      'no-div-regex': 'error',
      'no-extend-native': 'error', // May conflict with future polyfills
      'no-extra-label': 'error',
      'no-implicit-coercion': ['error', {
        allow: ['!!'],
      }],
      'no-implied-eval': 'error',
      'no-invalid-this': 'error',
      'no-iterator': 'error',
      'no-labels': 'error',
      'no-lone-blocks': 'error',
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
      // Interface implementations may not require all args
      'no-unused-vars': 'off',
      'no-useless-call': 'error',
      'no-useless-catch': 'error',
      'no-useless-concat': 'error',
      'no-useless-return': 'error',
      'no-void': 'error',
      'no-warning-comments': 'off', // TODO and FIXME are fine
      'radix': ['error', 'always'],
      'require-await': 'error',
      'yoda': ['error', 'never'],
      // }}}

      // "Variables" rules: {{{
      'no-label-var': 'error',
      'no-shadow-restricted-names': 'error',
      'no-undef-init': 'off', // Sometimes necessary with hacky compiler casts
      'no-undefined': 'off',  // We use undefined in many places, legitimately
      // Does not know when things are executed, false positives
      'no-use-before-define': 'off',
      // }}}

      // "Stylistic Issues" rules: {{{
      '@stylistic/array-bracket-newline': ['error', 'consistent'],
      '@stylistic/array-bracket-spacing': ['error', 'never'],
      '@stylistic/array-element-newline': 'off',
      '@stylistic/arrow-spacing': 'error',
      '@stylistic/arrow-parens': ['error', 'always'],
      '@stylistic/block-spacing': ['error', 'always'],
      '@stylistic/brace-style': ['error', '1tbs', {
        allowSingleLine: true,
      }],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/comma-spacing': 'error',
      '@stylistic/comma-style': 'error',
      '@stylistic/computed-property-spacing': 'error',
      '@stylistic/dot-location': ['error', 'property'],
      '@stylistic/eol-last': 'error',
      '@stylistic/func-call-spacing': 'error',
      '@stylistic/indent': [
        'error', 2, {
          'CallExpression': {
            'arguments': 2,
          },
          'FunctionDeclaration': {
            'body': 1,
            'parameters': 2,
          },
          'FunctionExpression': {
            'body': 1,
            'parameters': 2,
          },
          'MemberExpression': 2,
          'ObjectExpression': 1,
          'SwitchCase': 1,
          'ignoredNodes': [
            'ConditionalExpression',
          ],
        },
      ],
      '@stylistic/key-spacing': 'error',
      '@stylistic/keyword-spacing': 'error',
      '@stylistic/linebreak-style': 'error',
      '@stylistic/lines-between-class-members': 'error',
      '@stylistic/max-len': ['error', {
        code: 80,
        tabWidth: 2,
        ignoreUrls: true,
        ignorePattern: 'goog.(module|require)',
      }],
      '@stylistic/max-statements-per-line': ['error', {
        max: 1,
      }],
      '@stylistic/new-parens': 'error',
      '@stylistic/no-floating-decimal': 'error',
      '@stylistic/no-mixed-operators': ['error', {
        groups: [['&', '|', '^', '~', '<<', '>>', '>>>', '&&', '||']],
        allowSamePrecedence: false,
      }],
      '@stylistic/no-mixed-spaces-and-tabs': 'error',
      '@stylistic/no-multiple-empty-lines': ['error', {max: 2}],
      '@stylistic/no-multi-spaces': ['error', {
        ignoreEOLComments: true,
      }],
      '@stylistic/no-tabs': 'error',
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/no-whitespace-before-property': 'error',
      // cspell:ignore nonblock
      '@stylistic/nonblock-statement-body-position': ['error', 'below'],
      '@stylistic/object-curly-spacing': 'error',
      '@stylistic/operator-linebreak': ['error', 'after'],
      '@stylistic/padded-blocks': ['error', 'never'],
      '@stylistic/quote-props': ['error', 'consistent'],
      '@stylistic/quotes': ['error', 'single', {allowTemplateLiterals: true}],
      '@stylistic/rest-spread-spacing': 'error',
      '@stylistic/semi': 'error',
      '@stylistic/semi-spacing': 'error',
      '@stylistic/space-before-blocks': 'error',
      '@stylistic/space-before-function-paren': ['error', {
        asyncArrow: 'always',
        anonymous: 'never',
        named: 'never',
      }],
      '@stylistic/spaced-comment': ['error', 'always', {
        // Characters which may be glued to the start of a comment block, but
        // which do not violate the rule.  The "*" is for jsdoc's "/**" syntax,
        // and the "!" is for the "/*!" of license headers which are passed
        // verbatim through the compiler.
        markers: ['*', '!'],
      }],
      '@stylistic/switch-colon-spacing': 'error',
      '@stylistic/wrap-iife': ['error', 'inside'],
      'id-denylist': ['error', 'async'],
      'no-restricted-syntax': [
        'error',
        ...commonNoRestrictedSyntax,
      ],
      // }}}

      // "ECMAScript 6" rules: {{{
      'no-useless-constructor': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-const': ['error', {
        ignoreReadBeforeAssign: true,
      }],
      // }}}

      // jsdoc rules {{{
      'jsdoc/check-tag-names': ['error', {
        definedTags: ['exportDoc', 'exportInterface'],
      }],
      // Do not check license, authors, etc
      'jsdoc/check-values': 'off',
      // This should be checked by the compiler
      'jsdoc/no-undefined-types': 'off',
      'jsdoc/require-jsdoc': ['error', {
        exemptEmptyConstructors: true,
        require: {
          ClassDeclaration: true,
          MethodDefinition: true,
        },
      }],
      // Some params/props/returns are self-explanatory
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-property-description': 'off',
      'jsdoc/require-returns-description': 'off',
      'jsdoc/tag-lines': 'off',
      // It throws syntax error on @suppress {missingReturn}
      'jsdoc/valid-types': 'off',
      // }}}
    },
  },
  {
    files: ['test/**/*.js'],
    rules: {
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
  },
  {
    files: [
      // Closure requires using var in externs.
      'ui/externs/*.js',
      'externs/**/*.js',
      'test/test/externs/*.js',
      // Use var in load.js so it works in old browsers.  We'll use
      // compiled mode for the main library and the demo.
      'demo/load.js',
    ],
    rules: {
      'no-restricted-syntax': 'off',
      'no-var': 'off',
      'jsdoc/require-returns-check': 'off',
    },
  },
  {
    files: [
      // Test code should still use "arguments", since the alternate
      // "rest parameter" syntax won't work in uncompiled code on IE.
      'test/**/*.js',
      // These two files use "arguments" to patch over functions.  It
      // is difficult to reason about whether or not these instances
      // would always work with rest parameters, so just allow them to
      'demo/log_section.js',
      'lib/debug/asserts.js',
    ],
    rules: {
      'prefer-rest-params': 'off',
    },
  },
  {
    files: ['externs/**/*.js'],
    rules: {
      // Disable rules on useless constructors so we can use ES6 classes in
      // externs.
      'no-useless-constructor': 'off',
    },
  },
  {
    files: ['ui/externs/*.js', 'externs/**/*.js', 'test/test/externs/*.js'],
    rules: {
      // Externs naturally redeclare things eslint knows about.
      'no-redeclare': 'off',
    },
  },
  {
    files: [
      'demo/load.js',
      'externs/**/*.js',
      'test/**/*.js',
    ],
    rules: {
      // JSDoc is not strictly required in externs, tests, and in load.js.
      'jsdoc/require-jsdoc': 'off',
    },
  },
  {
    files: [
      'karma.conf.js',
      'build/**/*.js',
      'demo/**/*.js',
      'lib/debug/asserts.js',
      'lib/debug/log.js',
      'test/**/**.js',
    ],
    rules: {
      'no-console': 'off',
    },
  },
];
