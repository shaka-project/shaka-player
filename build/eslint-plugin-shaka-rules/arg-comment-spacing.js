/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const assert = require('assert');

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Required spacing around argument comments',
      category: 'Best Practices',
      recommended: false,
    },
    fixable: 'code',
    schema: [],
  },
  create: (ctx) => {
    const source = ctx.getSourceCode();
    return {
      ':matches(CallExpression, NewExpression)': (node) => {
        for (const arg of node.arguments) {
          const comment = source.getCommentsBefore(arg).pop();
          if (!comment || comment.type != 'Block' ||
              !comment.value.includes('=')) {
            continue;
          }

          if (!/ \w+= /.exec(comment.value)) {
            ctx.report({
              node: comment,
              message: 'Bad spacing for argument comment',
              fix: (fixer) => {
                const newComment =
                    comment.value.replace(/\W*(\w+).*/, ' $1= ');
                return fixer.replaceText(comment, '/*' + newComment + '*/');
              },
            });
          }
        }
      },
    };
  },
};

