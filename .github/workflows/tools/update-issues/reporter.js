/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview A custom Jasmine reporter for GitHub Actions.
 */

const core = require('@actions/core');

class GitHubActionsReporter {
  constructor() {
    // In the Actions environment, log through the Actions toolkit.
    if (process.env.GITHUB_ACTIONS) {
      this.logger = core;
    } else {
      this.logger = console;
    }

    // Escape sequence for ANSI blue.
    this.blue = '\u001b[36m';
    // Escape sequence for ANSI red.
    this.red = '\u001b[31m';
    // Escape sequence for ANSI color reset.  Not needed in GitHub Actions
    // environment, but useful for local testing to reset the terminal to
    // defaults.
    this.reset = '\u001b[0m';
  }

  specStarted(result) {
    // Escape sequence is for ANSI bright blue on a black background.
    this.logger.info(`\n${this.blue}  -- ${result.fullName} --${this.reset}`);
  }

  specDone(result) {
    for (const failure of result.failedExpectations) {
      // The text in error() is bubbled up in GitHub Actions to the top level,
      // but at that level, the color escape sequences are not understood.  So
      // those are done before and after in info() calls.
      this.logger.info(this.red);
      this.logger.error(`${result.fullName} FAILED`);
      this.logger.info(this.reset);

      // This only appears in the logs of the job.
      const indentedMessage = failure.message.replaceAll('\n', '\n  ');
      this.logger.info(`  ${indentedMessage}`);
    }
  }
}

module.exports = {
  GitHubActionsReporter,
};
