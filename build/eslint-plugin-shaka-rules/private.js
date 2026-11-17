/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert';

export default {
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

    /**
     * Checks a documented declaration that isn't a class method: a property
     * or static assigned with "=", a bare declaration such as a typedef, a
     * class field, or a top-level function or variable.  Only declarations
     * with their own JSDoc comment are checked; an undocumented assignment
     * is a plain write to something declared elsewhere.
     *
     * @param {!Object} node The node the JSDoc comment is attached to.
     * @param {string} name
     */
    const checkDeclaration = (node, name) => {
      const comment = source.getCommentsBefore(node).pop();
      if (!comment || comment.type != 'Block' ||
          !comment.value.startsWith('*')) {
        return;
      }
      // A comment followed by "(" is a type cast, as in
      // "/** @type {?} */(obj).foo_ = ...", not the declaration's JSDoc.
      const next = source.getTokenAfter(comment, {includeComments: true});
      if (next && next.value == '(') {
        return;
      }

      const nameIsPrivate = name.endsWith('_');
      const docHasPrivate = /@private\b/.test(comment.value);
      // Protected members also use a trailing underscore.
      const docHasProtected = /@protected\b/.test(comment.value);

      if (nameIsPrivate && /@public\b/.test(comment.value)) {
        // Adding @private next to @public would contradict it.
        ctx.report({
          node: node,
          message: 'Invalid name for public member, remove the trailing ' +
              'underscore or replace @public with @private',
        });
      } else if (nameIsPrivate && !docHasPrivate && !docHasProtected) {
        ctx.report({
          node: node,
          message: 'Missing @private annotation on private member',
          fix: (fixer) => {
            return fixer.replaceText(comment, fixComment(comment, true));
          },
        });
      } else if (!nameIsPrivate && docHasPrivate) {
        // No autofix: dropping @private would make the member public, and
        // renaming it needs every reference updated.
        ctx.report({
          node: node,
          message: 'Invalid name for private member, add a trailing ' +
              'underscore or remove @private',
        });
      }
    };

    /**
     * @param {!Object} node
     * @return {?string} The property name of a non-computed member access.
     */
    const memberName = (node) => {
      if (node.type != 'MemberExpression' || node.computed ||
          node.property.type != 'Identifier') {
        return null;
      }
      return node.property.name;
    };

    return {
      // shaka.foo.Bar.BAZ_ = ...;  this.baz_ = ...;
      'ExpressionStatement > AssignmentExpression.expression': (node) => {
        const name = memberName(node.left);
        if (name) {
          checkDeclaration(node.parent, name);
        }
      },
      // A declaration without a value, such as a typedef.
      'ExpressionStatement > MemberExpression.expression': (node) => {
        const name = memberName(node);
        if (name) {
          checkDeclaration(node.parent, name);
        }
      },
      'ClassBody > PropertyDefinition': (node) => {
        if (!node.computed && node.key.type == 'Identifier') {
          checkDeclaration(node, node.key.name);
        }
      },
      'Program > FunctionDeclaration': (node) => {
        checkDeclaration(node, node.id.name);
      },
      'Program > VariableDeclaration': (node) => {
        if (node.declarations.length == 1 &&
            node.declarations[0].id.type == 'Identifier') {
          checkDeclaration(node, node.declarations[0].id.name);
        }
      },
      'ClassBody > MethodDefinition': (node) => {
        const comment = source.getCommentsBefore(node).pop();
        const nameIsPrivate = node.key.name && node.key.name.endsWith('_');
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
