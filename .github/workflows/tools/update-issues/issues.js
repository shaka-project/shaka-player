/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview A set of classes to represent GitHub issues & comments.
 */

const github = require('@actions/github');
const core = require('@actions/core');

const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');

// Values of "author_association" that indicate a team member:
const TEAM_ASSOCIATIONS = [
  'OWNER',
  'MEMBER',
  'COLLABORATOR',
];

const ACTIONS_BOT = 'github-actions[bot]';

/**
 * Parse a version string into an array of numbers with an optional string tag
 * at the end.  A string tag will be preceded by a negative one (-1) so that
 * any tagged version (like -beta or -rc1) will be sorted before the final
 * release version.
 *
 * @param {string} versionString
 * @return {Array<number|string>}
 */
function parseVersion(versionString) {
  const matches = /^v?([0-9]+(?:\.[0-9]+)*)(?:-(.*))?$/.exec(versionString);
  if (!matches) {
    return null;
  }

  // If there is a tag, append it as a string after a negative one. This will
  // ensure that versions like "-beta" sort above their production
  // counterparts.
  const version = matches[1].split('.').map(x => parseInt(x));
  if (matches[2]) {
    version.push(-1);
    version.push(matches[2]);
  }

  return version;
}

/**
 * Compare two version arrays.  Can be used as a callback to
 * Array.prototype.sort to sort by version numbers (ascending).
 *
 * The last item in a version array may be a string (a tag like "beta"), but
 * the rest are numbers.  See notes in parseVersion above for details on tags.
 *
 * @param {Array<number|string>} a
 * @param {Array<number|string>} b
 * @return {number}
 */
function compareVersions(a, b) {
  // If a milestone's version can't be parsed, it will be null.  Push those to
  // the end of any sorted list.
  if (!a && !b) {
    return 0;
  } else if (!a) {
    return 1;
  } else if (!b) {
    return -1;
  }

  for (let i = 0; i < Math.min(a.length, b.length); ++i) {
    if (a[i] < b[i]) {
      return -1;
    } else if (a[i] > b[i]) {
      return 1;
    }
    // If equal, keep going through the array.
  }

  // If one has a tag that the other does not, the one with the tag (the longer
  // one) comes first.
  if (a.length > b.length) {
    return -1;
  } else if (a.length < b.length) {
    return 1;
  } else {
    return 0;
  }
}

/**
 * Compare two Dates.  Can be used as a callback to Array.prototype.sort to
 * sort by Dates (ascending).
 *
 * @param {Date} a
 * @param {Date} b
 * @return {number}
 */
function compareDates(a, b) {
  // Sort nulls to the end.
  if (!a && !b) {
    return 0;
  } else if (!a) {
    return 1;
  } else if (!b) {
    return -1;
  }

  // Date objects can be compared like numbers.
  if (a < b) {
    return -1;
  } else if (a > b) {
    return 1;
  } else {
    return 0;
  }
}

/**
 * Convert a Date to an age in days (by comparing with the current time).
 *
 * @param {!Date} d
 * @return {number} Time passed since d, in days.
 */
function dateToAgeInDays(d) {
  // getTime() and now() both return milliseconds, which we diff and then
  // convert to days.
  return (Date.now() - d.getTime()) / (86400 * 1000);
}

/**
 * A base class for objects returned by the GitHub API.
 */
class GitHubObject {
  /** @param {!Object} obj */
  constructor(obj) {
    /** @type {number} */
    this.id = obj.id;
    /** @type {number} */
    this.number = obj.number;
    /** @type {Date} */
    this.createdAt = null;
    /** @type {number} */
    this.ageInDays = NaN;
    /** @type {Date} */
    this.closedAt = null;
    /** @type {number} */
    this.closedDays = NaN;

    if (obj.created_at != null) {
      this.createdAt = new Date(obj.created_at);
      this.ageInDays = dateToAgeInDays(this.createdAt);
    }

    if (obj.closed_at != null) {
      this.closedAt = new Date(obj.closed_at);
      this.closedDays = dateToAgeInDays(this.closedAt);
    }
  }

  /** @return {string} */
  toString() {
    return JSON.stringify(this, null, '  ');
  }

  /**
   * @param {Function} listMethod A method from the octokit API, which will be
   *   passed to octokit.paginate.
   * @param {function(new:T, !Object)} SubClass
   * @param {!Object} parameters
   * @return {!Promise<!Array<!T>>}
   * @template T
   */
  static async getAll(listMethod, SubClass, parameters) {
    const query = { owner, repo, ...parameters };
    return (await octokit.paginate(listMethod, query))
        .map(obj => new SubClass(obj));
  }
}

class Milestone extends GitHubObject {
  /** @param {!Object} obj */
  constructor(obj) {
    super(obj);
    /** @type {string} */
    this.title = obj.title;
    /** @type {Array<number|string>} */
    this.version = parseVersion(obj.title);
    /** @type {boolean} */
    this.closed = obj.state == 'closed';
  }

  /** @return {boolean} */
  isBacklog() {
    return this.title.toLowerCase() == 'backlog';
  }

  /** @return {!Promise<!Array<!Milestone>>} */
  static async getAll() {
    return GitHubObject.getAll(
        octokit.rest.issues.listMilestones, Milestone, {});
  }

  /**
   * Compare two Milestones.  Can be used as a callback to Array.prototype.sort
   * to sort by version numbers (ascending).
   *
   * @param {!Milestone} a
   * @param {!Milestone} b
   * @return {number}
   */
  static compare(a, b) {
    return compareVersions(a.version, b.version);
  }
}

class Comment extends GitHubObject {
  /** @param {!Object} obj */
  constructor(obj) {
    super(obj);
    /** @type {string} */
    this.author = obj.user.login;
    /** @type {string} */
    this.body = obj.body;
    /** @type {string} */
    this.authorAssociation = obj.author_association;
    /** @type {boolean} */
    this.fromTeam =
        TEAM_ASSOCIATIONS.includes(obj.author_association) ||
        this.author == ACTIONS_BOT;
  }

  /**
   * @param {number} issueNumber
   * @return {!Promise<!Array<!Comment>>}
   */
  static async getAll(issueNumber) {
    return GitHubObject.getAll(octokit.rest.issues.listComments, Comment, {
      issue_number: issueNumber,
    });
  }

  /**
   * Compare two Comments.  Can be used as a callback to Array.prototype.sort
   * to sort by creation time (descending, newest comments first).
   *
   * @param {!Comment} a
   * @param {!Comment} b
   * @return {number}
   */
  static compare(a, b) {
    // Put most recent comments first.
    return -1 * compareDates(a.createdAt, b.createdAt);
  }
}

class Event extends GitHubObject {
  /** @param {!Object} obj */
  constructor(obj) {
    super(obj);

    /** @type {string} */
    this.event = obj.event;

    if (obj.event == 'labeled') {
      /** @type {string} */
      this.label = obj.label.name;
    }
  }

  /**
   * @param {number} issueNumber
   * @return {!Promise<!Array<!Event>>}
   */
  static async getAll(issueNumber) {
    return GitHubObject.getAll(octokit.rest.issues.listEvents, Event, {
      issue_number: issueNumber,
    });
  }

  /**
   * Compare two Events.  Can be used as a callback to Array.prototype.sort
   * to sort by creation time (descending, newest events first).
   *
   * @param {!Event} a
   * @param {!Event} b
   * @return {number}
   */
  static compare(a, b) {
    // Put most recent events first.
    return -1 * compareDates(a.createdAt, b.createdAt);
  }
}

class Issue extends GitHubObject {
  /** @param {!Object} obj */
  constructor(obj) {
    super(obj);
    /** @type {string} */
    this.author = obj.user.login;
    /** @type {!Array<string>} */
    this.labels = obj.labels.map(l => l.name);
    /** @type {boolean} */
    this.closed = obj.state == 'closed';
    /** @type {boolean} */
    this.locked = obj.locked;
    /** @type {Milestone} */
    this.milestone = obj.milestone ? new Milestone(obj.milestone) : null;
  }

  /**
   * @param {string} name
   * @return {boolean}
   */
  hasLabel(name) {
    return this.labels.includes(name);
  }

  /**
   * @param {!Array<string>} names
   * @return {boolean}
   */
  hasAnyLabel(names) {
    return this.labels.some(l => names.includes(l));
  }

  /**
   * @param {string} name
   * @return {!Promise<number}
   */
  async getLabelAgeInDays(name) {
    const events = await Event.getAll(this.number);
    // Put the most recent events first.
    events.sort(Event.compare);

    for (const event of events) {
      if (event.label == name) {
        return event.ageInDays;
      }
    }

    throw new Error(`Unable to find age of label "${name}"!`);
  }

  /**
   * @param {string} name
   * @return {!Promise}
   */
  async addLabel(name) {
    if (this.hasLabel(name)) {
      return;
    }

    core.notice(`Adding label "${name}" to issue #${this.number}`);
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: this.number,
      labels: [name],
    });
    this.labels.push(name);
  }

  /**
   * @param {string} name
   * @return {!Promise}
   */
  async removeLabel(name) {
    if (!this.hasLabel(name)) {
      return;
    }

    core.notice(`Removing label "${name}" from issue #${this.number}`);
    await octokit.rest.issues.removeLabel({
      owner,
      repo,
      issue_number: this.number,
      name,
    });
    this.labels = this.labels.filter(l => l != name);
  }

  /** @return {!Promise} */
  async lock() {
    if (this.locked) {
      return;
    }

    core.notice(`Locking issue #${this.number}`);
    await octokit.rest.issues.lock({
      owner,
      repo,
      issue_number: this.number,
      lock_reason: 'resolved',
    });
    this.locked = true;
  }

  /** @return {!Promise} */
  async unlock() {
    if (!this.locked) {
      return;
    }

    core.notice(`Unlocking issue #${this.number}`);
    await octokit.rest.issues.unlock({
      owner,
      repo,
      issue_number: this.number,
    });
    this.locked = false;
  }

  /** @return {!Promise} */
  async close() {
    if (this.closed) {
      return;
    }

    core.notice(`Closing issue #${this.number}`);
    await octokit.rest.issues.update({
      owner,
      repo,
      issue_number: this.number,
      state: 'closed',
    });
    this.closed = true;
  }

  /** @return {!Promise} */
  async reopen() {
    if (!this.closed) {
      return;
    }

    core.notice(`Reopening issue #${this.number}`);
    await octokit.rest.issues.update({
      owner,
      repo,
      issue_number: this.number,
      state: 'open',
    });
    this.closed = false;
  }

  /**
   * @param {!Milestone} milestone
   * @return {!Promise}
   */
  async setMilestone(milestone) {
    if (this.milestone && this.milestone.number == milestone.number) {
      return;
    }

    core.notice(
        `Adding issue #${this.number} to milestone ${milestone.title}`);
    await octokit.rest.issues.update({
      owner,
      repo,
      issue_number: this.number,
      milestone: milestone.number,
    });
    this.milestone = milestone;
  }

  /** @return {!Promise} */
  async removeMilestone() {
    if (!this.milestone) {
      return;
    }

    core.notice(
        `Removing issue #${this.number} ` +
        `from milestone ${this.milestone.title}`);
    await octokit.rest.issues.update({
      owner,
      repo,
      issue_number: this.number,
      milestone: null,
    });
    this.milestone = null;
  }

  /**
   * @param {string} body
   * @return {!Promise}
   */
  async postComment(body) {
    core.notice(`Posting to issue #${this.number}: "${body}"`);
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: this.number,
      body,
    });

    if (this.comments) {
      this.comments.push(new Comment({
        created_at: (new Date()).toJSON(),
        user: {login: 'shaka-bot'},
        body,
      }));
    }
  }

  /**
   * Important: Don't load comments by default!  Only some issues need
   * comments checked, and we don't want to exceed our query quota by loading
   * all comments for all issues.
   *
   * @return {!Promise}
   */
  async loadComments() {
    if (this.comments) {
      return;
    }

    this.comments = await Comment.getAll(this.number);
    // Puts most recent comments first.
    this.comments.sort(Comment.compare);
  }

  /** @return {!Promise<!Array<!Issue>>} */
  static async getAll() {
    return GitHubObject.getAll(octokit.rest.issues.listForRepo, Issue, {
      state: 'all',
    });
  }
}

module.exports = {
  Issue,
  Milestone,
};
