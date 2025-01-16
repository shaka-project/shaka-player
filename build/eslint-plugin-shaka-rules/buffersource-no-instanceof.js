/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallows usage of instanceof on BufferSource objects',
      category: 'Best Practices',
      recommended: false,
    },
    schema: [],
  },
  create: (ctx) => ({
    BinaryExpression: (node) => {
      const buffers = [
        'ArrayBuffer',
        'DataView',
        'Uint8Array',
        'Uint8ClampedArray',
        'Int8Array',
        'Uint16Array',
        'Int16Array',
        'Uint32Array',
        'Int32Array',
        'Float32Array',
        'Float64Array',
      ];
      if (node.operator === 'instanceof' && node.right.type === 'Identifier' &&
          buffers.includes(node.right.name)) {
        ctx.report({
          node,
          message: `Do not use instanceof ${node.right.name}, consider using ` +
            'ArrayBuffer.isView() if possible',
        });
      }
    },
  }),
};
