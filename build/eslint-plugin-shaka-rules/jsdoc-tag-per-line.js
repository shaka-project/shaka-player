/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Block tags that get their own line when they follow another tag.  The list
// is closed on purpose: an unknown "@word" after a tag is most likely part of
// a description, not an annotation.
const BLOCK_TAGS = new Set([
  'abstract',
  'const',
  'constructor',
  'define',
  'deprecated',
  'enum',
  'export',
  'exportDoc',
  'exportInterface',
  'extends',
  'final',
  'implements',
  'interface',
  'override',
  'package',
  'private',
  'protected',
  'public',
  'record',
  'return',
  'struct',
  'suppress',
  'template',
  'this',
  'type',
  'typedef',
]);

/**
 * Splits the text of a JSDoc line that starts with a block tag into one piece
 * per block tag.  Braces are tracked so that nothing inside a type expression
 * is treated as a tag.
 *
 * @param {string} text
 * @return {!Array<string>}
 */
const splitTags = (text) => {
  const pieces = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c == '{') {
      depth++;
    } else if (c == '}') {
      depth = Math.max(0, depth - 1);
    } else if (c == '@' && depth == 0 && i > start && /\s/.test(text[i - 1])) {
      const name = /^@([A-Za-z]+)(?![A-Za-z])/.exec(text.substr(i));
      // Only split when the current piece is a bare tag with at most a type,
      // so a description that mentions "@private" is left alone.
      const current = text.substring(start, i).trim();
      if (name && BLOCK_TAGS.has(name[1]) &&
          /^@[A-Za-z]+(\s*\{.*\})?$/.test(current)) {
        pieces.push(text.substring(start, i).trim());
        start = i;
      }
    }
  }
  pieces.push(text.substr(start).trim());
  return pieces;
};

/**
 * @param {string} piece
 * @return {?string} The tag name, if the piece starts with a block tag.
 */
const tagName = (piece) => {
  const match = /^@([A-Za-z]+)/.exec(piece);
  return match ? match[1] : null;
};

export default {
  meta: {
    type: 'layout',
    docs: {
      description: 'Require one block tag per JSDoc line, and no @const ' +
          'next to @enum (enums are already constant)',
      category: 'Stylistic Issues',
      recommended: false,
    },
    fixable: 'code',
    schema: [],
  },
  create: (ctx) => {
    const source = ctx.getSourceCode();

    /**
     * Returns the fixed comment text, or null if the comment is fine.
     *
     * @param {!Object} comment
     * @return {?{text: string, message: string}}
     */
    const fixComment = (comment) => {
      const rawLines = comment.value.split('\n');

      // Break every line into a prefix (the leading " * ") and its content.
      const lines = rawLines.map((raw, index) => {
        if (index == 0) {
          // The first line follows "/*", so it starts with the second "*".
          return {prefix: null, content: raw.substr(1).trim()};
        }
        const match = /^(\s*\*?\s?)(.*)$/.exec(raw);
        return {prefix: match[1], content: match[2]};
      });

      let split = false;
      for (const line of lines) {
        line.pieces = line.content.startsWith('@') ?
            splitTags(line.content) : [line.content];
        if (line.pieces.length > 1) {
          split = true;
        }
      }

      const allPieces = lines.flatMap((line) => line.pieces);
      const hasEnum = allPieces.some((piece) => tagName(piece) == 'enum');
      let removedConst = false;
      if (hasEnum) {
        for (const line of lines) {
          const kept = line.pieces.filter((piece) => piece != '@const');
          if (kept.length != line.pieces.length) {
            removedConst = true;
            line.pieces = kept;
            line.removed = kept.length == 0;
          }
        }
      }

      if (!split && !removedConst) {
        return null;
      }

      const message = split ?
          'Put each JSDoc block tag on its own line' :
          'Remove @const from @enum, enums are already constant';
      const indent = ' '.repeat(comment.loc.start.column);
      const prefix = indent + ' * ';

      if (rawLines.length == 1) {
        const pieces = lines[0].pieces;
        if (pieces.length == 1) {
          return {text: '/** ' + pieces[0] + ' */', message};
        }
        const body = pieces.map((piece) => prefix + piece).join('\n');
        return {text: '/**\n' + body + '\n' + indent + ' */', message};
      }

      const out = [];
      for (const [index, line] of lines.entries()) {
        if (line.removed) {
          continue;
        }
        if (index == 0) {
          if (line.pieces.length == 1) {
            out.push(rawLines[0]);
          } else {
            // Tags right after "/**": keep "/**" alone on its line.
            out.push('*');
            for (const piece of line.pieces) {
              out.push(prefix + piece);
            }
          }
        } else if (line.pieces.length == 1 &&
            line.pieces[0] == line.content) {
          out.push(rawLines[index]);
        } else {
          for (const piece of line.pieces) {
            out.push(line.prefix + piece);
          }
        }
      }
      return {text: '/*' + out.join('\n') + '*/', message};
    };

    return {
      Program: () => {
        for (const comment of source.getAllComments()) {
          // Only JSDoc-style comments carry block tags.
          if (comment.type != 'Block' || !comment.value.startsWith('*')) {
            continue;
          }
          const result = fixComment(comment);
          if (!result) {
            continue;
          }

          // A one-line comment that shares its line with code can't be
          // expanded into several lines without breaking the layout.
          const lineStart = source.getIndexFromLoc(
              {line: comment.loc.start.line, column: 0});
          const before = source.text.substring(lineStart, comment.range[0]);
          const canFix = before.trim() == '' ||
              !result.text.includes('\n');

          const fix = (fixer) => fixer.replaceText(comment, result.text);
          ctx.report({
            loc: comment.loc,
            message: result.message,
            ...(canFix ? {fix} : {}),
          });
        }
      },
    };
  },
};
