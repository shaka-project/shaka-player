/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallows usage of instanceof ArrayBuffer',
      category: 'Best Practices',
      recommended: false,
    },
    schema: [],
  },
  create: (ctx) => ({
    BinaryExpression: (node) => {
      if (node.operator === 'instanceof' && node.right.type === 'Identifier' &&
          node.right.name === 'ArrayBuffer') {
        ctx.report({
          node,
          message: 'Do not use instanceof ArrayBuffer, consider using ' +
            'ArrayBuffer.isView() if possible',
        });
      }
    },
  }),
};
