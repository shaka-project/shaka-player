/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Test cases for the update-issues tool.
 */

// Bogus values to satisfy load-time calls in issues.js.
process.env.GITHUB_TOKEN = 'asdf';
process.env.GITHUB_REPOSITORY = 'foo/someproject';

// Always execute tests in a consistent order.
jasmine.getEnv().configure({
  random: false,
});

// Report results through GitHub Actions when possible.
const {GitHubActionsReporter} = require('./reporter.js');
jasmine.getEnv().clearReporters();
jasmine.getEnv().addReporter(new GitHubActionsReporter());

const {
  MockMilestone,
  MockComment,
  MockIssue,
} = require('./mocks.js');

const {
  Milestone,
} = require('./issues.js');

const {
  processIssues,
  TYPE_ACCESSIBILITY,
  TYPE_ANNOUNCEMENT,
  TYPE_BUG,
  TYPE_CODE_HEALTH,
  TYPE_DOCS,
  TYPE_ENHANCEMENT,
  TYPE_PROCESS,
  TYPE_QUESTION,
  PRIORITY_P0,
  PRIORITY_P1,
  PRIORITY_P2,
  PRIORITY_P3,
  PRIORITY_P4,
  STATUS_ARCHIVED,
  STATUS_WAITING,
  FLAG_IGNORE,
} = require('./main.js');

describe('update-issues tool', () => {
  const nextMilestone = new MockMilestone({
    title: 'v5.1',
    version: [5, 1],
  });

  const backlog = new MockMilestone({
    title: 'Backlog',
    isBacklog: () => true,
  });

  const teamCommentOld = new MockComment({
    author: 'SomeTeamMember',
    fromTeam: true,
    ageInDays: 100,
  });

  const teamCommentNew = new MockComment({
    author: 'SomeTeamMember',
    fromTeam: true,
    ageInDays: 0,
  });

  const externalCommentOld = new MockComment({
    author: 'SomeUser',
    fromTeam: false,
    ageInDays: 1000,
  });

  const externalCommentNew = new MockComment({
    author: 'SomeUser',
    fromTeam: false,
    ageInDays: 0,
  });

  it('archives old issues', async () => {
    const matchingIssues = [
      new MockIssue({
        closed: true,
        closedDays: 60,
      }),
      new MockIssue({
        closed: true,
        closedDays: 100,
      }),
      // This has the "archived" label, but is not locked.  It should still get
      // locked.
      new MockIssue({
        closed: true,
        closedDays: 100,
        labels: [STATUS_ARCHIVED],
      }),
    ];

    const nonMatchingIssues = [
      new MockIssue({
        closed: false,
      }),
      new MockIssue({
        closed: true,
        closedDays: 1,
      }),
      // This is already locked, but doesn't have the "archived" label.
      // The unarchive task will unlock this one, but the archive task won't
      // label it.
      new MockIssue({
        closed: true,
        closedDays: 100,
        locked: true,
      }),
    ];

    const issues = matchingIssues.concat(nonMatchingIssues);

    await processIssues(issues, nextMilestone, backlog);

    for (const issue of matchingIssues) {
      expect(issue.addLabel).toHaveBeenCalledWith(STATUS_ARCHIVED);
      expect(issue.lock).toHaveBeenCalled();
      // Show that there is no conflict with the task to unarchive issues.
      expect(issue.unlock).not.toHaveBeenCalled();
      expect(issue.reopen).not.toHaveBeenCalled();
    }
    for (const issue of nonMatchingIssues) {
      expect(issue.addLabel).not.toHaveBeenCalled();
      expect(issue.lock).not.toHaveBeenCalled();
    }
  });

  it('unarchives issues', async () => {
    const matchingIssues = [
      // Closed and locked, but the "archived" label has been removed.
      new MockIssue({
        closed: true,
        locked: true,
      }),
    ];

    const nonMatchingIssues = [
      // Closed and locked, and with the "archived" label still in place.
      new MockIssue({
        closed: true,
        locked: true,
        labels: [STATUS_ARCHIVED],
      }),
    ];

    const issues = matchingIssues.concat(nonMatchingIssues);

    await processIssues(issues, nextMilestone, backlog);

    for (const issue of matchingIssues) {
      expect(issue.unlock).toHaveBeenCalled();
      expect(issue.reopen).toHaveBeenCalled();
    }
    for (const issue of nonMatchingIssues) {
      expect(issue.unlock).not.toHaveBeenCalled();
      expect(issue.reopen).not.toHaveBeenCalled();
      // Show that there is no conflict with the task to archive issues.
      expect(issue.lock).not.toHaveBeenCalled();
      expect(issue.addLabel).not.toHaveBeenCalled();
    }
  });

  it('removes "waiting" label', async () => {
    const matchingIssues = [
      new MockIssue({
        labels: [STATUS_WAITING],
        labelAgeInDays: 1,
        comments: [externalCommentNew],
      }),
      new MockIssue({
        labels: [STATUS_WAITING],
        labelAgeInDays: 1,
        // Most recent comments go first.
        comments: [externalCommentNew, teamCommentOld],
      }),
      new MockIssue({
        labels: [TYPE_BUG, STATUS_WAITING],
        labelAgeInDays: 1,
        // Most recent comments go first.
        comments: [externalCommentNew, teamCommentOld],
      }),
    ];

    const nonMatchingIssues = [
      new MockIssue({
        labels: [STATUS_WAITING],
        labelAgeInDays: 1,
        comments: [teamCommentOld],
      }),
      new MockIssue({
        labels: [STATUS_WAITING],
        labelAgeInDays: 1,
        // Most recent comments go first.
        comments: [teamCommentNew, externalCommentOld],
      }),
    ];

    const issues = matchingIssues.concat(nonMatchingIssues);

    await processIssues(issues, nextMilestone, backlog);

    for (const issue of matchingIssues) {
      expect(issue.removeLabel).toHaveBeenCalledWith(STATUS_WAITING);
    }
    for (const issue of nonMatchingIssues) {
      expect(issue.removeLabel).not.toHaveBeenCalled();
    }
  });

  it('closes stale issues', async () => {
    const matchingIssues = [
      new MockIssue({
        labels: [STATUS_WAITING],
        labelAgeInDays: 100,
      }),
      new MockIssue({
        labels: [STATUS_WAITING],
        labelAgeInDays: 100,
        comments: [teamCommentOld],
      }),
    ];

    const nonMatchingIssues = [
      new MockIssue({
        labels: [STATUS_WAITING],
        labelAgeInDays: 1,
      }),
      new MockIssue({
        labels: [STATUS_WAITING],
        labelAgeInDays: 100,
        closed: true,
      }),
    ];

    const issues = matchingIssues.concat(nonMatchingIssues);

    await processIssues(issues, nextMilestone, backlog);

    for (const issue of matchingIssues) {
      expect(issue.postComment).toHaveBeenCalled();
      expect(issue.close).toHaveBeenCalled();
    }
    for (const issue of nonMatchingIssues) {
      expect(issue.postComment).not.toHaveBeenCalled();
      expect(issue.close).not.toHaveBeenCalled();
    }
  });

  it('cleans up labels on closed issues', async () => {
    const matchingIssues = [
      new MockIssue({
        closed: true,
        labels: [STATUS_WAITING],
      }),
    ];

    const nonMatchingIssues = [
      new MockIssue({
        labels: [STATUS_WAITING],
      }),
    ];

    const issues = matchingIssues.concat(nonMatchingIssues);

    await processIssues(issues, nextMilestone, backlog);

    for (const issue of matchingIssues) {
      expect(issue.removeLabel).toHaveBeenCalledWith(STATUS_WAITING);
    }
    for (const issue of nonMatchingIssues) {
      expect(issue.removeLabel).not.toHaveBeenCalled();
    }
  });

  it('pings questions waiting for a response', async () => {
    const matchingIssues = [
      new MockIssue({
        labels: [TYPE_QUESTION],
        comments: [teamCommentOld],
      }),
      new MockIssue({
        labels: [TYPE_QUESTION],
        // Most recent comments go first.
        comments: [teamCommentOld, externalCommentOld],
      }),
    ];

    const nonMatchingIssues = [
      // Won't be touched because it's closed.
      new MockIssue({
        closed: true,
        labels: [TYPE_QUESTION],
        comments: [teamCommentOld],
      }),
      // Won't be touched because it's not a "question" type.
      new MockIssue({
        labels: [TYPE_BUG],
        comments: [teamCommentOld],
      }),
      // Won't be touched because the team comment is too new.
      new MockIssue({
        labels: [TYPE_QUESTION],
        comments: [teamCommentNew],
      }),
      // Won't be touched because the most recent comment was external.
      new MockIssue({
        labels: [TYPE_QUESTION],
        // Most recent comments go first.
        comments: [externalCommentOld, teamCommentOld],
      }),
    ];

    const issues = matchingIssues.concat(nonMatchingIssues);

    await processIssues(issues, nextMilestone, backlog);

    for (const issue of matchingIssues) {
      expect(issue.postComment).toHaveBeenCalled();
      expect(issue.addLabel).toHaveBeenCalledWith(STATUS_WAITING);
    }
    for (const issue of nonMatchingIssues) {
      expect(issue.postComment).not.toHaveBeenCalled();
      expect(issue.addLabel).not.toHaveBeenCalled();
    }
  });

  it('sets an appropriate milestone', async () => {
    const nextMilestoneIssues = [
      // Bugs go to the next milestone.  (If the priority is P0-P2 or unset.)
      new MockIssue({
        labels: [TYPE_BUG],
      }),
      new MockIssue({
        labels: [TYPE_BUG, PRIORITY_P0],
      }),
      new MockIssue({
        labels: [TYPE_BUG, PRIORITY_P1],
      }),
      new MockIssue({
        labels: [TYPE_BUG, PRIORITY_P2],
      }),
      // Docs issues also go to the next milestone.  (Same priority rules.)
      new MockIssue({
        labels: [TYPE_DOCS],
      }),
      new MockIssue({
        labels: [TYPE_DOCS, PRIORITY_P2],
      }),
      // A11y issues also go to the next milestone.  (Same priority rules.)
      new MockIssue({
        labels: [TYPE_ACCESSIBILITY],
      }),
      new MockIssue({
        labels: [TYPE_ACCESSIBILITY, PRIORITY_P2],
      }),
    ];

    const backlogIssues = [
      // Low priority bugs/docs/a11y issues go the backlog.
      new MockIssue({
        labels: [TYPE_BUG, PRIORITY_P3],
      }),
      new MockIssue({
        labels: [TYPE_BUG, PRIORITY_P4],
      }),
      new MockIssue({
        labels: [TYPE_DOCS, PRIORITY_P4],
      }),
      new MockIssue({
        labels: [TYPE_ACCESSIBILITY, PRIORITY_P4],
      }),
      // Enhancements go to the backlog, regardless of priority.
      new MockIssue({
        labels: [TYPE_ENHANCEMENT],
      }),
      new MockIssue({
        labels: [TYPE_ENHANCEMENT, PRIORITY_P1],
      }),
      // Code health issues also go to the backlog.
      new MockIssue({
        labels: [TYPE_CODE_HEALTH],
      }),
    ];

    const clearMilestoneIssues = [
      // Some issue types are always removed from milestones.
      new MockIssue({
        labels: [TYPE_QUESTION],
        milestone: backlog,
      }),
      new MockIssue({
        labels: [TYPE_PROCESS],
        milestone: nextMilestone,
      }),
    ];

    const nonMatchingIssues = [
      // Issue types that _can_ have milestones should always keep their
      // milestones once assigned manually, even if they are not the default
      // for that type.
      new MockIssue({
        labels: [TYPE_BUG],
        milestone: backlog,
      }),
      new MockIssue({
        labels: [TYPE_DOCS],
        milestone: backlog,
      }),
      new MockIssue({
        labels: [TYPE_CODE_HEALTH],
        milestone: nextMilestone,
      }),
      new MockIssue({
        labels: [TYPE_ENHANCEMENT],
        milestone: nextMilestone,
      }),
      // Once closed, issues are never assigned to a milestone regardless of
      // type.
      new MockIssue({
        labels: [TYPE_BUG],
        closed: true,
      }),
      new MockIssue({
        labels: [TYPE_ENHANCEMENT],
        closed: true,
      }),
    ];

    const issues = nextMilestoneIssues
        .concat(backlogIssues)
        .concat(clearMilestoneIssues)
        .concat(nonMatchingIssues);

    await processIssues(issues, nextMilestone, backlog);

    for (const issue of nextMilestoneIssues) {
      expect(issue.setMilestone).toHaveBeenCalledWith(nextMilestone);
    }
    for (const issue of backlogIssues) {
      expect(issue.setMilestone).toHaveBeenCalledWith(backlog);
    }
    for (const issue of clearMilestoneIssues) {
      expect(issue.removeMilestone).toHaveBeenCalled();
    }
    for (const issue of nonMatchingIssues) {
      expect(issue.setMilestone).not.toHaveBeenCalled();
      expect(issue.removeMilestone).not.toHaveBeenCalled();
    }
  });

  it('parses and sorts milestone versions', () => {
    const milestones = [
      new Milestone({title: 'v1.0'}),
      new Milestone({title: 'Backlog'}),
      new Milestone({title: 'v1.1'}),
      new Milestone({title: 'v11.0'}),
      new Milestone({title: 'v11.0-beta'}),
      new Milestone({title: 'v10.0'}),
      new Milestone({title: 'v2.0'}),
    ];

    expect(milestones.map(m => m.version)).toEqual([
      [1, 0],
      null,
      [1, 1],
      [11, 0],
      [11, 0, -1, 'beta'],
      [10, 0],
      [2, 0],
    ]);

    milestones.sort(Milestone.compare);

    expect(milestones.map(m => m.title)).toEqual([
      'v1.0',
      'v1.1',
      'v2.0',
      'v10.0',
      'v11.0-beta',
      'v11.0',
      'Backlog',
    ]);
  });
});
