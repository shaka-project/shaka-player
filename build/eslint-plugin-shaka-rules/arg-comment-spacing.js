/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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

