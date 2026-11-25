/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

// Where to look for other references.  Docs and tutorials count, since they
// can show app code using a name.
const SEARCH_DIRS = ['lib', 'ui', 'test', 'demo', 'externs', 'build', 'docs'];
const SEARCH_EXTENSIONS = new Set(['.js', '.mjs', '.md', '.html']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'api', 'third_party']);

// Tags that already make the visibility of a symbol explicit, or that tie it
// to something outside of this file.
const SKIP_TAGS = /@(private|protected|package|export\w*|override|define)\b/;

// Tags of documentation that is not part of the interface of a file.
const SKIP_PRIVATE_TAGS = /@private\b/;

/**
 * The text of every file that could reference a symbol, by absolute path.
 * Built once per process, since the rule needs it for every file it lints.
 *
 * @type {!Map<string, !Map<string, string>>}
 */
const filesByRoot = new Map();

/**
 * @param {string} root
 * @return {!Map<string, string>}
 */
const getFiles = (root) => {
  if (!filesByRoot.has(root)) {
    filesByRoot.set(root, readFiles(root));
  }
  return filesByRoot.get(root);
};

/**
 * @param {string} root
 * @return {!Map<string, string>}
 */
const readFiles = (root) => {
  const files = new Map();
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, {withFileTypes: true});
    } catch (e) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          walk(full);
        }
      } else if (SEARCH_EXTENSIONS.has(path.extname(entry.name))) {
        files.set(full, fs.readFileSync(full, 'utf8'));
      }
    }
  };
  for (const dir of SEARCH_DIRS) {
    walk(path.join(root, dir));
  }
  // Top-level files, such as shaka-player.uncompiled.js.
  for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
    if (entry.isFile() && SEARCH_EXTENSIONS.has(path.extname(entry.name))) {
      const full = path.join(root, entry.name);
      files.set(full, fs.readFileSync(full, 'utf8'));
    }
  }
  return files;
};

/**
 * Escapes a dotted name for a regular expression.  Long references are often
 * wrapped before a dot, so whitespace is allowed around each one.
 *
 * @param {string} text
 * @return {string}
 */
const escapeRegExp = (text) => {
  return text.replace(/[*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\./g, '\\s*\\.\\s*');
};

/**
 * @param {!Object} node
 * @return {?string} The dotted name, such as "shaka.util.Foo.BAR".
 */
const qualifiedName = (node) => {
  if (node.type == 'Identifier') {
    return node.name;
  }
  if (node.type == 'MemberExpression' && !node.computed &&
      node.property.type == 'Identifier') {
    const object = qualifiedName(node.object);
    return object ? object + '.' + node.property.name : null;
  }
  return null;
};

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require @private on static members that are only used ' +
          'in the file that defines them',
      category: 'Best Practices',
      recommended: false,
    },
    schema: [],
  },
  create: (ctx) => {
    const source = ctx.getSourceCode();
    const filename = path.resolve(ctx.filename);
    const root = ctx.cwd;
    const relative = path.relative(root, filename);

    // Only library code: tests, the demo and tooling have no API to keep
    // private, and externs describe symbols defined elsewhere.
    if (!/^(lib|ui)[\\/]/.test(relative) ||
        /^ui[\\/]externs[\\/]/.test(relative)) {
      return {};
    }

    const provided = new Set();
    for (const match of source.text.matchAll(/goog\.provide\('([^']+)'\)/g)) {
      provided.add(match[1]);
    }

    /**
     * Whether a comment documents a declaration of the file: a top level
     * statement, a method, or a field set in a constructor.  A type cast or
     * the type of a local variable is not part of the interface of the file.
     *
     * @param {!Object} comment
     * @return {boolean}
     */
    const documentsDeclaration = (comment) => {
      const token = source.getTokenAfter(comment, {includeComments: true});
      if (!token || token.type == 'Block' || token.value == '(') {
        return false;
      }
      // The outermost node that starts where the comment ends.
      let node = source.getNodeByRangeIndex(token.range[0]);
      while (node && node.parent && node.parent.range[0] == token.range[0]) {
        node = node.parent;
      }
      if (!node) {
        return false;
      }
      if (node.type == 'MethodDefinition' ||
          node.type == 'PropertyDefinition') {
        return true;
      }
      if (node.type != 'ExpressionStatement') {
        return false;
      }
      if (node.parent.type == 'Program') {
        return true;
      }
      // this.foo = ... in a constructor.
      const expression = node.expression;
      if (expression.type != 'AssignmentExpression' ||
          expression.left.type != 'MemberExpression' ||
          expression.left.object.type != 'ThisExpression') {
        return false;
      }
      let parent = node.parent;
      while (parent && parent.type != 'MethodDefinition') {
        parent = parent.parent;
      }
      return !!parent && parent.kind == 'constructor';
    };

    /**
     * @param {!Object} node The node the JSDoc comment is attached to.
     * @param {string} name The full name of the symbol.
     */
    const check = (node, name) => {
      if (!name.startsWith('shaka.') || name.includes('.prototype.') ||
          provided.has(name)) {
        return;
      }
      const parts = name.split('.');
      const member = parts[parts.length - 1];
      if (member.endsWith('_')) {
        return;
      }

      const comment = source.getCommentsBefore(node).pop();
      const doc = comment && comment.type == 'Block' ? comment.value : '';
      if (SKIP_TAGS.test(doc)) {
        return;
      }

      // A type named in the documentation of a declaration that is not
      // private, such as the parameter of a public method, is part of its
      // interface, even if only this file uses it.
      const typeUsage = new RegExp(
          '[{<|(,!?]\\s*' + escapeRegExp(name) + '(?![\\w$])');
      for (const other of source.getAllComments()) {
        if (other != comment && other.type == 'Block' &&
            !SKIP_PRIVATE_TAGS.test(other.value) &&
            typeUsage.test(other.value) && documentsDeclaration(other)) {
          return;
        }
      }

      // Other files reach a symbol by its full name or through an alias of
      // its parent, as in "const Utils = shaka.util.FooUtils;  Utils.BAR".
      // The parent's own short name counts too, since docs often use it.
      const parent = parts.slice(0, -1).join('.');
      const usage = new RegExp('\\b(' + escapeRegExp(name) + '|' +
          escapeRegExp(parts[parts.length - 2] + '.' + member) +
          ')(?![\\w$])');
      const aliasDeclaration = new RegExp(
          '\\b(?:const|let|var)\\s+(\\w+)\\s*=\\s*' + escapeRegExp(parent) +
          '\\s*;', 'g');
      for (const [file, text] of getFiles(root)) {
        if (file == filename) {
          continue;
        }
        if (usage.test(text)) {
          return;
        }
        if (!text.includes(parent)) {
          continue;
        }
        for (const match of text.matchAll(aliasDeclaration)) {
          const aliasUsage = new RegExp('\\b' + escapeRegExp(match[1]) +
              '\\.' + escapeRegExp(member) + '(?![\\w$])');
          if (aliasUsage.test(text)) {
            return;
          }
        }
      }

      ctx.report({
        node: node,
        message: '{{name}} is only used in this file, so it should be ' +
            '@private and end with an underscore',
        data: {name},
      });
    };

    const topLevel = 'Program > ExpressionStatement';
    const staticMethod = topLevel + ' > AssignmentExpression > ' +
        'ClassExpression.right > ClassBody > MethodDefinition[static=true]';

    return {
      // shaka.foo.Bar.BAZ = ...;
      [topLevel + ' > AssignmentExpression.expression']: (node) => {
        // Classes are types other code may extend or reference; they are
        // left alone.
        if (node.right.type == 'ClassExpression') {
          return;
        }
        const name = qualifiedName(node.left);
        if (name) {
          check(node.parent, name);
        }
      },
      // A declaration without a value, such as a typedef.
      [topLevel + ' > MemberExpression.expression']: (node) => {
        const name = qualifiedName(node);
        if (name) {
          check(node.parent, name);
        }
      },
      // static foo() {...} in shaka.foo.Bar = class {...};
      [staticMethod]: (node) => {
        const assignment = node.parent.parent.parent;
        const className = qualifiedName(assignment.left);
        if (className && !node.computed && node.key.type == 'Identifier') {
          check(node, className + '.' + node.key.name);
        }
      },
    };
  },
};
