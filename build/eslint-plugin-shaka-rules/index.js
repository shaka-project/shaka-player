/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import argCommentSpacing from './arg-comment-spacing.js';
import arrayNoInstanceof from './array-no-instanceof.js';
import buffersourceNoInstanceof from './buffersource-no-instanceof.js';
import jsdocTagPerLine from './jsdoc-tag-per-line.js';
import noIteratorType from './no-iterator-type.js';
import preferPrivate from './prefer-private.js';
import privateRule from './private.js';

const index = {
  rules: {
    'arg-comment-spacing': argCommentSpacing,
    'array-no-instanceof': arrayNoInstanceof,
    'buffersource-no-instanceof': buffersourceNoInstanceof,
    'jsdoc-tag-per-line': jsdocTagPerLine,
    'no-iterator-type': noIteratorType,
    'prefer-private': preferPrivate,
    'private': privateRule,
  },
  configs: {
    config: {
      plugins: {},
      rules: {},
    },
  },
};

index.configs.config.plugins['shaka-rules'] = index;

for (const rule of Object.keys(index.rules)) {
  index.configs.config.rules['shaka-rules/' + rule] = 'error';
}

export default index;
