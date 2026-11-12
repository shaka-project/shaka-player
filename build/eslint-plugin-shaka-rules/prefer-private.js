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
