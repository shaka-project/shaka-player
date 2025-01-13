import js from '@eslint/js';
import google from 'eslint-config-google';
import globals from 'globals';
import local from './build/eslint-plugin-shaka-rules/index.js';

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
    ignores: ['!**/eslint.config.js'],
  },
  js.configs.recommended,
  google,
  {
    languageOptions: {
      globals: globals.browser,
      ecmaVersion: 2017,
    },

    plugins: {'shaka-rules': local},

    rules: {
      // shaka rules
      'shaka-rules/arg-comment-spacing': 'error',
      'shaka-rules/array-no-instanceof': 'error',
      'shaka-rules/buffersource-no-instanceof': 'error',
      'shaka-rules/private': 'error',
      // shaka rules end
      'no-console': 'off',
      'no-eq-null': 'off',
      'no-eval': 'off',
      'no-undef': 'off',
      'default-case': 'off',
      'no-loop-func': 'off',
      'no-unused-expressions': 'off',
      'prefer-promise-reject-errors': 'off',
      'complexity': 'off',
      'no-negated-condition': 'off',
      'no-shadow': 'off',
      'no-async-promise-executor': 'error',
      'no-await-in-loop': 'error',

      'no-empty': ['error', {
        allowEmptyCatch: true,
      }],

      'no-misleading-character-class': 'error',
      'no-template-curly-in-string': 'error',

      'no-fallthrough': [
        'error',
        {
          allowEmptyCase: true,
        },
      ],

      'accessor-pairs': 'error',
      'array-callback-return': 'error',
      'class-methods-use-this': 'off',
      'consistent-return': 'error',
      'dot-location': ['error', 'property'],
      'dot-notation': 'off',
      'eqeqeq': 'off',
      'guard-for-in': 'off',
      'no-alert': 'error',
      'no-caller': 'error',
      'no-div-regex': 'error',
      'no-extend-native': 'error',
      'no-extra-label': 'error',
      'no-floating-decimal': 'error',

      'no-implicit-coercion': [
        'error',
        {
          allow: ['!!'],
        },
      ],

      'no-implied-eval': 'error',
      'no-invalid-this': 'error',
      'no-iterator': 'error',
      'no-labels': 'error',
      'no-lone-blocks': 'error',

      'no-multi-spaces': [
        'error',
        {
          ignoreEOLComments: true,
        },
      ],

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
      'no-unused-vars': 'off',
      'no-useless-call': 'error',
      'no-useless-catch': 'error',
      'no-useless-concat': 'error',
      'no-useless-return': 'error',
      'no-void': 'error',
      'no-warning-comments': 'off',
      'radix': ['error', 'always'],
      'require-await': 'error',
      'wrap-iife': ['error', 'inside'],
      'yoda': ['error', 'never'],
      'no-label-var': 'error',
      'no-shadow-restricted-names': 'error',
      'no-undef-init': 'off',
      'no-undefined': 'off',
      'no-use-before-define': 'off',
      'array-bracket-newline': ['error', 'consistent'],
      'block-spacing': ['error', 'always'],

      'brace-style': ['error', '1tbs', {
        allowSingleLine: true,
      }],

      'id-denylist': ['error', 'async'],
      'lines-between-class-members': 'error',

      'max-statements-per-line': ['error', {
        max: 1,
      }],

      'new-parens': 'error',

      'no-mixed-operators': ['error', {
        groups: [['&', '|', '^', '~', '<<', '>>', '>>>', '&&', '||']],
        allowSamePrecedence: false,
      }],

      'no-restricted-syntax': [
        'error',
        ...commonNoRestrictedSyntax,
      ],

      'no-whitespace-before-property': 'error',
      // cspell:ignore nonblock
      'nonblock-statement-body-position': ['error', 'below'],
      'operator-assignment': 'error',

      'spaced-comment': ['error', 'always', {
        markers: ['*', '!'],
      }],

      'arrow-spacing': 'error',
      'no-useless-constructor': 'error',
      'prefer-arrow-callback': 'error',

      'prefer-const': ['error', {
        ignoreReadBeforeAssign: true,
      }],
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
      'demo/load.js',
      'externs/**/*.js',
      'test/test/externs/*.js',
      'ui/externs/*.js',
    ],

    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: [
      'ui/externs/*.js',
      'externs/**/*.js',
      'test/test/externs/*.js',
      'demo/load.js',
    ],

    rules: {
      'no-var': 'off',
    },
  },
  {
    files: ['test/**/*.js', 'demo/log_section.js', 'lib/debug/asserts.js'],

    rules: {
      'prefer-rest-params': 'off',
    },
  },
  {
    files: ['externs/**/*.js'],

    rules: {
      'no-useless-constructor': 'off',
    },
  },
  {
    files: ['ui/externs/*.js', 'externs/**/*.js', 'test/test/externs/*.js'],

    rules: {
      'no-redeclare': 'off',
    },
  },
];
