/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Mocks for the classes in issues.js
 */

function randomInt() {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}
let nextIssueNumber = 1;

class MockGitHubObject {
  constructor(subclassDefaults, params) {
    const defaults = {
      id: randomInt(),
      ageInDays: 0,
      closedDays: 0,

      ...subclassDefaults,
    };

    const mergedParams = {
      ...defaults,
      ...params,
    };

    for (const k in mergedParams) {
      this[k] = mergedParams[k];
    }
  }

  toString() {
    return JSON.stringify(this, null, '  ');
  }
}

class MockMilestone extends MockGitHubObject {
  constructor(params) {
    const defaults = {
      title: 'MockMilestone',
      version: null,
      closed: false,
      isBacklog: () => false,
    };

    super(defaults, params);
  }
}

class MockComment extends MockGitHubObject {
  constructor(params) {
    const defaults = {
      author: 'SomeUser',
      body: 'Howdy!',
      authorAssociation: 'NONE',
      fromTeam: false,
    };

    super(defaults, params);
  }
}

class MockIssue extends MockGitHubObject {
  constructor(params) {
    const defaults = {
      number: nextIssueNumber++,
      author: 'SomeUser',
      labels: [],
      closed: false,
      locked: false,
      milestone: null,
      comments: [],
    };

    super(defaults, params);

    this.getLabelAgeInDays =
        jasmine.createSpy('getLabelAgeInDays')
            .and.returnValue(params.labelAgeInDays || 0);
    this.addLabel = jasmine.createSpy('addLabel').and.callFake((name) => {
      console.log(`Adding label ${name}`);
    });
    this.removeLabel = jasmine.createSpy('removeLabel').and.callFake((name) => {
      console.log(`Removing label ${name}`);
    });
    this.lock = jasmine.createSpy('lock').and.callFake(() => {
      console.log('Locking');
    });
    this.unlock = jasmine.createSpy('unlock').and.callFake(() => {
      console.log('Unlocking');
    });
    this.close = jasmine.createSpy('close').and.callFake(() => {
      console.log('Closing');
    });
    this.reopen = jasmine.createSpy('reopen').and.callFake(() => {
      console.log('Reopening');
    });
    this.setMilestone =
        jasmine.createSpy('setMilestone').and.callFake((milestone) => {
          console.log(`Setting milestone to "${milestone.title}"`);
        });
    this.removeMilestone =
        jasmine.createSpy('removeMilestone').and.callFake(() => {
          console.log('Removing milestone.');
        });
    this.postComment = jasmine.createSpy('postComment').and.callFake((body) => {
      console.log(`Posting comment: ${body}`);
    });
    this.loadComments = jasmine.createSpy('loadComments');
  }

  hasLabel(name) {
    return this.labels.includes(name);
  }

  hasAnyLabel(names) {
    return this.labels.some(l => names.includes(l));
  }
}

module.exports = {
  MockMilestone,
  MockComment,
  MockIssue,
};
