/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const assert = require('assert');

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require correct naming of @private members',
      category: 'Best Practices',
      recommended: false,
    },
    fixable: 'code',
    schema: [],
  },
  create: (ctx) => {
    const fixComment = (comment, addPrivate) => {
      // The "value" field contains the *body* of the comment; so it will look
      // like '* foo\n    * bar\n  '.  This return value needs to be the
      // code to inject, so we need to add the /* and */ back.
      assert.equal(comment.type, 'Block');
      assert(comment.value.startsWith('*'));
      let lines = comment.value.split('\n');
      const firstIndent = ' '.repeat(comment.loc.start.column);
      const prefix = firstIndent + ' * ';

      if (lines.length == 1) {
        if (addPrivate) {
          // /** Foobar */
          // =>
          // /**
          //  * Foobar
          //  * @private
          //  */
          const body = lines[0].substr(1).trim();
          return '/**\n' + prefix + body + '\n' + prefix + '@private\n' +
              firstIndent + ' */';
        } else {
          // /** @override @private */
          // =>
          // /** @override */
          return '/** ' + lines[0].substr(1).replace('@private', '').trim() +
              ' */';
        }
      }

      if (addPrivate) {
        lines.splice(lines.length - 1, 0, prefix + '@private');
      } else {
        lines = lines.filter((line) => {
          if (line.includes('@private')) {
            // Assert the @private is on its own line.
            assert(line.startsWith(prefix));
            assert.equal(
                line.substr(prefix.length).replace('@private', '').trim(), '');
            return false;
          }
          return true;
        });
      }
      return '/*' + lines.join('\n') + '*/';
    };

    const source = ctx.getSourceCode();
    return {
      'ClassBody > MethodDefinition': (node) => {
        const comment = source.getCommentsBefore(node).pop();
        const nameIsPrivate = node.key.name.endsWith('_');
        if (!comment) {
          if (nameIsPrivate) {
            ctx.report({
              node: node,
              message: 'Missing @private annotation on private member@',
              fix: (fixer) => {
                const indent = ' '.repeat(node.loc.start.column);
                return fixer.insertTextBefore(
                    node, '/** @private */\n' + indent);
              },
            });
          }
          return;
        }

        const docHasPrivate = comment.value.includes('@private');
        if (nameIsPrivate && !docHasPrivate) {
          ctx.report({
            node: node,
            message: 'Missing @private annotation on private member',
            fix: (fixer) => {
              return fixer.replaceText(comment, fixComment(comment, true));
            },
          });
        } else if (!nameIsPrivate && docHasPrivate) {
          ctx.report({
            node: node,
            message: 'Invalid name for private member',
            fix: (fixer) => {
              return fixer.replaceText(comment, fixComment(comment, false));
            },
          });
        }
      },
    };
  },
};
