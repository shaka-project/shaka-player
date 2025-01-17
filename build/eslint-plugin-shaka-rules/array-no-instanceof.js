/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Usage of Array.isArray() instead of instanceof Array',
      category: 'Best Practices',
      recommended: false,
    },
    fixable: 'code',
    schema: [],
  },
  create: (ctx) => ({
    BinaryExpression: (node) => {
      if (node.operator === 'instanceof' &&
          node.right.type === 'Identifier' && node.right.name === 'Array') {
        ctx.report({
          node,
          message: 'Do not use instanceof Array',
          fix: (fixer) => {
            const source = ctx.sourceCode;
            const text = source.getText();
            const leftSide = text.slice(node.left.start, node.left.end);
            return fixer.replaceText(node, `Array.isArray(${leftSide})`);
          },
        });
      }
    },
  }),
};
