/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview A workflow tool to maintain GitHub issues.
 */

const core = require('@actions/core');
const { Issue, Milestone } = require('./issues.js');

const TYPE_BUG = 'type: bug';
const TYPE_CI = 'type: CI';
const TYPE_CODE_HEALTH = 'type: code health';
const TYPE_DOCS = 'type: docs';
const TYPE_ENHANCEMENT = 'type: enhancement';
const TYPE_PERFORMANCE = 'type: performance';
const TYPE_QUESTION = 'type: question';

const STATUS_ARCHIVED = 'status: archived';
const STATUS_WAITING = 'status: waiting on response';

const FLAG_IGNORE = 'flag: bot ignore';

const LABELS_FOR_NEXT_MILESTONE = [
  TYPE_BUG,
  TYPE_DOCS,
];

const LABELS_FOR_BACKLOG = [
  TYPE_CI,
  TYPE_CODE_HEALTH,
  TYPE_ENHANCEMENT,
  TYPE_PERFORMANCE,
];

const PING_QUESTION_TEXT =
    'Does this answer all your questions? ' +
    'If so, would you please close the issue?';

const CLOSE_STALE_TEXT =
    'Closing due to inactivity. If this is still an issue for you or if you ' +
    'have further questions, the OP can ask shaka-bot to reopen it by ' +
    'including `@shaka-bot reopen` in a comment.';

const PING_INACTIVE_QUESTION_DAYS = 4;
const CLOSE_AFTER_WAITING_DAYS = 7;
const ARCHIVE_AFTER_CLOSED_DAYS = 60;


async function archiveOldIssues(issue) {
  // If the issue has been closed for a while, archive it.
  // Exclude locked issues, so that this doesn't conflict with unarchiveIssues
  // below.
  if (!issue.locked && issue.closed &&
      issue.closedDays >= ARCHIVE_AFTER_CLOSED_DAYS) {
    await issue.addLabel(STATUS_ARCHIVED);
    await issue.lock();
  }
}

async function unarchiveIssues(issue) {
  // If the archive label is removed from an archived issue, unarchive it.
  if (issue.locked && !issue.hasLabel(STATUS_ARCHIVED)) {
    await issue.unlock();
    await issue.reopen();
  }
}

async function reopenIssues(issue) {
  // If the original author wants an issue reopened, reopen it.
  if (issue.closed && !issue.hasLabel(STATUS_ARCHIVED)) {
    // Important: only load comments if prior filters pass!
    // If we loaded them on every issue, we could exceed our query quota!
    await issue.loadComments();

    for (const comment of issue.comments) {
      body = comment.body.toLowerCase();
      if (comment.author == issue.author &&
          comment.createdAt >= issue.closedAt &&
          body.includes('@shaka-bot') &&
          (body.includes('reopen') || body.includes('re-open'))) {
        core.notice(`Found reopen request for issue #${issue.number}`);
        await issue.reopen();
        break;
      }
    }
  }
}

async function manageWaitingIssues(issue) {
  // Find all waiting issues.
  if (!issue.closed && issue.hasLabel(STATUS_WAITING)) {
    const labelAgeInDays = await issue.getLabelAgeInDays(STATUS_WAITING);

    // If an issue has been replied to, remove the waiting tag.
    // Important: only load comments if prior filters pass!
    // If we loaded them on every issue, we could exceed our query quota!
    await issue.loadComments();

    const latestNonTeamComment = issue.comments.find(c => !c.fromTeam);
    if (latestNonTeamComment &&
        latestNonTeamComment.ageInDays < labelAgeInDays) {
      await issue.removeLabel(STATUS_WAITING);
      return;
    }

    // If an issue has been in a waiting state for too long, close it as stale.
    if (labelAgeInDays >= CLOSE_AFTER_WAITING_DAYS) {
      await issue.postComment(CLOSE_STALE_TEXT);
      await issue.close();
    }
  }
}

async function cleanUpIssueTags(issue) {
  // If an issue with the waiting tag was closed, remove the tag.
  if (issue.closed && issue.hasLabel(STATUS_WAITING)) {
    await issue.removeLabel(STATUS_WAITING);
  }
}

async function pingQuestions(issue) {
  // If a question hasn't been responded to recently, ping it.
  if (!issue.closed &&
      issue.hasLabel(TYPE_QUESTION) &&
      !issue.hasLabel(STATUS_WAITING)) {
    // Important: only load comments if prior filters pass!
    // If we loaded them on every issue, we could exceed our query quota!
    await issue.loadComments();

    // Most recent ones are first.
    const lastComment = issue.comments[0];
    if (lastComment &&
        lastComment.fromTeam &&
        // If the last comment was from the team, but not from the OP (in case
        // the OP was a member of the team).
        lastComment.author != issue.author &&
        lastComment.ageInDays >= PING_INACTIVE_QUESTION_DAYS) {
      await issue.postComment(`@${issue.author} ${PING_QUESTION_TEXT}`);
      await issue.addLabel(STATUS_WAITING);
    }
  }
}

async function maintainMilestones(issue, nextMilestone, backlog) {
  // Set or remove milestones based on type labels.
  if (!issue.closed) {
    if (issue.hasAnyLabel(LABELS_FOR_NEXT_MILESTONE)) {
      if (!issue.milestone) {
        await issue.setMilestone(nextMilestone);
      }
    } else if (issue.hasAnyLabel(LABELS_FOR_BACKLOG)) {
      if (!issue.milestone) {
        await issue.setMilestone(backlog);
      }
    } else {
      if (issue.milestone) {
        await issue.removeMilestone();
      }
    }
  }
}


const ALL_ISSUE_TASKS = [
  archiveOldIssues,
  unarchiveIssues,
  reopenIssues,
  manageWaitingIssues,
  cleanUpIssueTags,
  pingQuestions,
  maintainMilestones,
];

async function main() {
  const milestones = await Milestone.getAll();
  const issues = await Issue.getAll();

  const backlog = milestones.find(m => m.isBacklog());
  if (!backlog) {
    core.error('No backlog milestone found!');
    process.exit(1);
  }

  milestones.sort(Milestone.compare);
  const nextMilestone = milestones[0];
  if (nextMilestone.version == null) {
    core.error('No version milestone found!');
    process.exit(1);
  }

  let failed = false;
  for (const issue of issues) {
    if (issue.hasLabel(FLAG_IGNORE)) {
      core.info(`Ignoring issue #${issue.number}`);
      continue;
    }

    core.info(`Processing issue #${issue.number}`);

    for (const task of ALL_ISSUE_TASKS) {
      try {
        await task(issue, nextMilestone, backlog);
      } catch (error) {
        // Make this show up in the Actions UI without needing to search the
        // logs.
        core.error(
            `Failed to process issue #${issue.number} in task ${task.name}: ` +
            `${error}\n${error.stack}`);
        failed = true;
      }
    }
  }

  if (failed) {
    process.exit(1);
  }
}

main();
