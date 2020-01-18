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
          const filter = (c) => c.type == 'Block' && !c.value.includes('@');
          const beforeComments = source.getCommentsBefore(arg).filter(filter);
          if (beforeComments.length > 1) {
            ctx.report({
              node: beforeComments[0],
              message: 'Multiple comments around arguments',
            });
            continue;
          }

          const afterComments = source.getCommentsAfter(arg).filter(filter);
          if (afterComments.length > 0) {
            ctx.report({
              node: afterComments[0],
              message: 'Argument comment should appear before argument',
              fix: (fixer) => {
                return [
                  fixer.remove(afterComments[0]),
                  fixer.insertTextBefore(
                      arg, '/*' + afterComments[0].value + '*/ '),
                ];
              },
            });
            continue;
          }

          const comment = beforeComments.pop();
          if (!comment) {
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

