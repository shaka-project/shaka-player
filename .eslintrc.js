// vim: foldmethod=marker:foldmarker={{{,}}}
module.exports = {
    "env": {
        "browser": true,
        "es6": true
    },
    "extends": "eslint:recommended",
    "rules": {
        // Things the compiler already takes care of, with more precision: {{{
        "no-console": "off",
        "no-eq-null": "off",
        "no-eval": "off",
        "no-undef": "off",
        "valid-jsdoc": "off",
        // }}}

        // Things we should probably fix, but in stages in multiple commits: {{{

        // In many cases, we should change scoped var to let.
        "block-scoped-var": "off",
        "no-inner-declarations": "off",
        "no-redeclare": "off",
        "no-shadow": "off",

        // Google style now requires dangling commas (5.2.1)
        "comma-dangle": "error",  // Should be ["error", "always"]
        // Google style requires curly braces for single-line branches (4.1.1)
        "curly": "off",
        // Google style discourages horizontal alignment (4.6.3)
        "no-multi-spaces": "off",  // Should be "error"

        // These could catch real bugs
        "consistent-return": "off",
        "default-case": "off",
        "no-extra-bind": "off",
        "no-loop-func": "off",
        "no-unused-expressions": "off",  // Conflicts with some Closure declarations
        "prefer-promise-reject-errors": "off",

        // These could improve readability
        "complexity": "off",
        "dot-location": "off",
        // }}}

        // "Possible error" rules in "eslint:recommended" that need options: {{{
	"no-empty": ["error", {"allowEmptyCatch": true}],
        // }}}

        // "Possible error" rules we should be able to pass, but are not part of "eslint:recommended": {{{
        "for-direction": "error",
        "getter-return": "error",
        "no-await-in-loop": "error",
        "no-template-curly-in-string": "error",
        // }}}

        // "Best practices" rules we should be able to pass, but are not part of "eslint:recommended": {{{
        "accessor-pairs": "error",
        "array-callback-return": "error",
        "class-methods-use-this": "error",
        "no-alert": "error",
        "no-caller": "error",
        "no-catch-shadow": "error",
        "no-extend-native": "error",  // May conflict with future polyfills
        "no-extra-label": "error",
        "no-floating-decimal": "error",
        "no-implied-eval": "error",
        "no-invalid-this": "error",
        "no-iterator": "error",
        "no-label-var": "error",
        "no-labels": "error",
        "no-lone-blocks": "error",
        "no-multi-str": "error",
        "no-new": "error",
        "no-new-func": "error",
        "no-new-wrappers": "error",
        "no-octal-escape": "error",
        "no-proto": "error",
        "no-return-assign": "error",
        "no-return-await": "error",
        "no-script-url": "error",
        "no-self-compare": "error",
        "no-sequences": "error",
        "no-throw-literal": "error",
        "no-unmodified-loop-condition": "error",
        "no-useless-call": "error",
        "no-useless-concat": "error",
        "no-useless-return": "error",
        "no-void": "error",
        "no-with": "error",
        "radix": ["error", "always"],
        "require-await": "error",
        "wrap-iife": ["error", "inside"],
        // }}}

        // Style rules we don't need: {{{
        "dot-notation": "off",  // We use bracket notation in tests on purpose
        "eqeqeq": "off",  // Compiler handles type checking in advance
        "guard-for-in": "off",
        "no-div-regex": "off",  // Conflicts with no-useless-escape
        "no-undef-init": "off",  // Sometimes necessary with hacky compiler casts
        "no-undefined": "off",  // We use undefined in many places, legitimately
        "no-unused-vars": "off",  // Interface impls may not require all args
        "no-use-before-define": "off",  // Does not know when things are executed, false positives
        "no-warning-comments": "off",  // TODO and FIXME are fine
        "vars-on-top": "off",
        "yoda": ["error", "never"],
        // }}}

        // Style rules derived by eslint after analyzing v2.3.0 sources: {{{
        "array-bracket-newline": "off",
        "array-bracket-spacing": [
            "error",
            "never"
        ],
        "array-element-newline": "off",
        "arrow-body-style": "error",
        "arrow-parens": "error",
        "arrow-spacing": "error",
        "block-spacing": "off",
        "brace-style": "off",
        "camelcase": "off",
        "capitalized-comments": "off",
        "comma-spacing": "off",
        "comma-style": [
            "error",
            "last"
        ],
        "computed-property-spacing": [
            "error",
            "never"
        ],
        "consistent-this": "off",
        "eol-last": "error",
        "func-call-spacing": "error",
        "func-name-matching": "error",
        "func-names": [
            "error",
            "never"
        ],
        "func-style": "off",
        "function-paren-newline": "off",
        "generator-star-spacing": "error",
        "id-blacklist": "error",
        "id-length": "off",
        "id-match": "error",
        "implicit-arrow-linebreak": "error",
        "indent": "off",
        "indent-legacy": "off",
        "init-declarations": "off",
        "jsx-quotes": "error",
        "key-spacing": "off",
        "keyword-spacing": [
            "error",
            {
                "after": true,
                "before": true
            }
        ],
        "line-comment-position": "off",
        "linebreak-style": [
            "error",
            "unix"
        ],
        "lines-around-comment": "off",
        "lines-around-directive": "off",
        "lines-between-class-members": "error",
        "max-depth": "off",
        "max-len": "off",
        "max-lines": "off",
        "max-nested-callbacks": "error",
        "max-params": "off",
        "max-statements": "off",
        "max-statements-per-line": "off",
        "multiline-comment-style": "off",
        "multiline-ternary": "off",
        "new-parens": "error",
        "newline-after-var": "off",
        "newline-before-return": "off",
        "newline-per-chained-call": "off",
        "no-array-constructor": "error",
        "no-bitwise": "off",
        "no-confusing-arrow": "error",
        "no-continue": "off",
        "no-duplicate-imports": "error",
        "no-implicit-globals": "off",
        "no-inline-comments": "off",
        "no-lonely-if": "off",
        "no-mixed-operators": "off",
        "no-multi-assign": "off",
        "no-multiple-empty-lines": "off",
        "no-native-reassign": "error",
        "no-negated-condition": "off",
        "no-negated-in-lhs": "error",
        "no-nested-ternary": "off",
        "no-new-object": "error",
        "no-plusplus": "off",
        "no-restricted-imports": "error",
        "no-restricted-syntax": "error",
        "no-spaced-func": "error",
        "no-tabs": "error",
        "no-ternary": "off",
        "no-trailing-spaces": "error",
        "no-underscore-dangle": "off",
        "no-unneeded-ternary": "error",
        "no-useless-computed-key": "error",
        "no-useless-constructor": "error",
        "no-useless-rename": "error",
        "no-var": "off",
        "no-whitespace-before-property": "error",
        "nonblock-statement-body-position": [
            "error",
            "any"
        ],
        "object-curly-newline": "off",
        "object-curly-spacing": "off",
        "object-property-newline": "off",
        "object-shorthand": "off",
        "one-var": "off",
        "one-var-declaration-per-line": [
            "error",
            "initializations"
        ],
        "operator-assignment": [
            "error",
            "always"
        ],
        "operator-linebreak": [
            "error",
            "after"
        ],
        "padded-blocks": "off",
        "padding-line-between-statements": "error",
        "prefer-arrow-callback": "off",
        "prefer-const": "error",
        "prefer-destructuring": "off",
        "prefer-numeric-literals": "error",
        "prefer-reflect": "off",
        "prefer-rest-params": "off",
        "prefer-spread": "off",
        "prefer-template": "off",
        "quote-props": "off",
        "quotes": "off",
        "require-jsdoc": "off",
        "rest-spread-spacing": "error",
        "semi": "error",
        "semi-spacing": [
            "error",
            {
                "after": true,
                "before": false
            }
        ],
        "semi-style": [
            "error",
            "last"
        ],
        "sort-imports": "error",
        "sort-keys": "off",
        "sort-vars": "off",
        "space-before-blocks": "error",
        "space-before-function-paren": "off",
        "space-in-parens": [
            "error",
            "never"
        ],
        "space-infix-ops": "error",
        "space-unary-ops": [
            "error",
            {
                "nonwords": false,
                "words": false
            }
        ],
        "spaced-comment": "off",
        "strict": "off",
        "switch-colon-spacing": "error",
        "symbol-description": "error",
        "template-curly-spacing": "error",
        "template-tag-spacing": "error",
        "unicode-bom": [
            "error",
            "never"
        ],
        "wrap-regex": "off",
        "yield-star-spacing": "error",
        // }}}
    }
};
