/**
 * Copyright 2015 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @fileoverview Task unit tests.
 */

goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.Task');

describe('Task', function() {
  var t;

  beforeAll(function() {
    // Hijack assertions and convert failed assertions into failed tests.
    assertsToFailures.install();
  });

  beforeEach(function() {
    t = new shaka.util.Task();
  });

  afterAll(function() {
    // Restore normal assertion behavior.
    assertsToFailures.uninstall();
  });

  describe('append', function() {
    it('fails after start', function() {
      t.start();
      var caught;
      try {
        t.append(function() {});
      } catch (exception) {
        caught = exception;
      }
      expect(caught).toBeTruthy();
    });
  });

  describe('start', function() {
    it('is fully asynchronous', function(done) {
      var stageRan = false;
      t.append(function() {
        stageRan = true;
      });
      // Nothing has run yet.
      expect(stageRan).toBe(false);

      t.start();
      // Still nothing has run yet, since it is async.
      expect(stageRan).toBe(false);

      t.getPromise().then(function() {
        expect(stageRan).toBe(true);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('fails if called twice', function() {
      t.start();
      var caught;
      try {
        t.start();
      } catch (exception) {
        caught = exception;
      }
      expect(caught).toBeTruthy();
    });

    it('resolves the Promise with zero stages', function(done) {
      t.start();
      t.getPromise().then(function() {
        // Silence Jasmine warning about no expectations.
        expect(true).toBe(true);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });

  describe('stage', function() {
    it('executes in the correct order', function(done) {
      var stages = [];
      t.append(function() { stages.push(0); });
      t.append(function() { stages.push(1); });
      t.append(function() { stages.push(2); });
      t.start();
      t.getPromise().then(function() {
        expect(stages).toEqual([0, 1, 2]);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });

    it('executes at the correct time', function(done) {
      var stages = [];
      var p0 = new shaka.util.PublicPromise();
      var p1 = new shaka.util.PublicPromise();
      var p2 = new shaka.util.PublicPromise();
      var complete = false;

      t.append(function() { stages.push(0); return [p0]; });
      t.append(function() { stages.push(1); return [p1]; });
      t.append(function() { stages.push(2); return [p2]; });

      t.start();

      setTimeout(function() {
        expect(stages).toEqual([0]);
      }, 10);
      setTimeout(function() {
        expect(stages).toEqual([0]);
        p0.resolve();
      }, 20);

      setTimeout(function() {
        expect(stages).toEqual([0, 1]);
      }, 30);
      setTimeout(function() {
        expect(stages).toEqual([0, 1]);
        p1.resolve();
      }, 40);

      setTimeout(function() {
        expect(stages).toEqual([0, 1, 2]);
        // We've run the final stage, but it's not done until p2 is resolved.
        expect(complete).toBe(false);
      }, 50);
      setTimeout(function() {
        expect(stages).toEqual([0, 1, 2]);
        expect(complete).toBe(false);
        p2.resolve();
      }, 60);

      t.getPromise().then(function() {
        complete = true;
        expect(stages).toEqual([0, 1, 2]);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });

  describe('abort', function() {
    it('stops the task before completing the stage', function(done) {
      var stages = [];
      var p0 = new shaka.util.PublicPromise();
      var a0 = p0.reject;
      // We don't know if abort() will resolve before or after the Task
      // runs all catches.
      var aborted = false;
      var completed = false;

      t.append(function() { stages.push(0); return [p0, a0]; });
      t.append(function() { fail('This stage hould not execute!'); });

      p0.then(function() { fail('p0 should not resolve!'); }).
          catch(function() {});

      t.start();

      setTimeout(function() {
        // Stage 1 hasn't executed.
        expect(stages).toEqual([0]);
      }, 10);
      setTimeout(function() {
        expect(stages).toEqual([0]);

        t.abort().then(function() {
          expect(stages).toEqual([0]);

          aborted = true;
          if (completed) done();
        }).catch(function() {
          fail('Abort returns a Promise which should never be rejected!');
          done();
        });

        // The abort function for stage 0 rejects p0, so this should have no
        // effect.
        p0.resolve();
      }, 20);

      t.getPromise().then(function() {
        fail('The task should not complete!');
        done();
      }).catch(function(error) {
        // This should be the 'aborted' error, not the error caused by the
        // abort function a0 itself.
        expect(error).toBeTruthy();
        expect(error.type).toBe('aborted');

        completed = true;
        if (aborted) done();
      });
    });

    it('stops the task after completing the stage', function(done) {
      var stages = [];
      var p0 = new shaka.util.PublicPromise();
      // We don't know if abort() will resolve before or after the Task
      // runs all catches.
      var aborted = false;
      var completed = false;

      t.append(function() { stages.push(0); return [p0]; });
      t.append(function() { fail('This stage hould not execute!'); });

      t.start();

      setTimeout(function() {
        // Stage 1 hasn't executed.
        expect(stages).toEqual([0]);
      }, 10);

      setTimeout(function() {
        expect(stages).toEqual([0]);

        // Complete stage 0 first.
        p0.resolve();

        // Now abort stage 1.
        t.abort().then(function() {
          // This happens after the 'catch' below.
          expect(stages).toEqual([0]);

          aborted = true;
          if (completed) done();
        }).catch(function() {
          fail('Abort returns a Promise which should never be rejected!');
          done();
        });
      }, 20);

      t.getPromise().then(function() {
        fail('The task should not complete!');
        done();
      }).catch(function(error) {
        // This should be the 'aborted' error, not the error caused by the
        // abort function a0 itself.
        expect(error).toBeTruthy();
        expect(error.type).toBe('aborted');

        completed = true;
        if (aborted) done();
      });
    });
  });

  describe('end', function() {
    it('stops the task early without failing it', function(done) {
      var stages = [];

      t.append(function() { stages.push(0); t.end(); });
      t.append(function() { stages.push(1); });
      t.append(function() { stages.push(2); });

      t.start();

      t.getPromise().then(function() {
        expect(stages).toEqual([0]);
        done();
      }).catch(function(error) {
        fail(error);
        done();
      });
    });
  });
});

