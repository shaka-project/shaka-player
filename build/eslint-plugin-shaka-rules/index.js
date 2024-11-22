/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

module.exports = {
  rules: {},
  configs: {
    config: {
      plugins: ['shaka-rules'],
      rules: {},
    },
  },
};

const RULES = [
  'arg-comment-spacing',
  'array-no-instanceof',
  'arraybuffer-no-instanceof',
  'private',
];
for (const rule of RULES) {
  module.exports.rules[rule] = require('./' + rule);
  module.exports.configs.config.rules['shaka-rules/' + rule] = 'error';
}
