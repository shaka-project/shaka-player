/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Matches the global "Iterator" type, but not "IteratorLike",
// "IteratorIterable", or a namespaced "foo.Iterator".
const ITERATOR_TYPE = /(?<!\.)\bIterator\b/g;

// Matches a JSDoc type expression in braces.  Nested braces (record types)
// are not balanced, but the match still covers the text we need to scan.
const TYPE_EXPRESSION = /\{[^}]*\}/g;

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require IteratorLike instead of Iterator in type ' +
          'annotations, for compatibility with ES2025 iterator helpers ' +
          'in the Closure Compiler externs',
      category: 'Best Practices',
      recommended: false,
    },
    fixable: 'code',
    schema: [],
  },
  create: (ctx) => {
    const source = ctx.getSourceCode();
    return {
      Program: () => {
        for (const comment of source.getAllComments()) {
          // Only JSDoc-style comments carry type annotations.
          if (comment.type != 'Block' || !comment.value.startsWith('*')) {
            continue;
          }

          // Offset of comment.value within the source text.
          const valueStart = comment.range[0] + 2;

          for (const typeMatch of comment.value.matchAll(TYPE_EXPRESSION)) {
            for (const match of typeMatch[0].matchAll(ITERATOR_TYPE)) {
              const start = valueStart + typeMatch.index + match.index;
              const end = start + match[0].length;
              ctx.report({
                loc: {
                  start: source.getLocFromIndex(start),
                  end: source.getLocFromIndex(end),
                },
                message: 'Use IteratorLike instead of Iterator in type ' +
                    'annotations',
                fix: (fixer) => {
                  return fixer.replaceTextRange([start, end], 'IteratorLike');
                },
              });
            }
          }
        }
      },
    };
  },
};
