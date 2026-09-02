/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Functional', () => {
  const Functional = shaka.util.Functional;
  describe('promiseWithTimeout', () => {
    it('resolves if asyncProcess resolves within the timeout', async () => {
      const asyncProcess = new Promise((resolve) =>
        setTimeout(() => resolve('success'), 100),
      );
      const result = await Functional.promiseWithTimeout(1, asyncProcess);
      expect(result).toBe('success');
    });

    it('rejects if asyncProcess rejects', async () => {
      const asyncProcess = new Promise((_, reject) =>
        setTimeout(() => reject('error'), 100),
      );
      const promise = Functional.promiseWithTimeout(1, asyncProcess);
      await expectAsync(promise).toBeRejectedWith('error');
    });

    it('rejects if asyncProcess takes longer than the timeout', async () => {
      const asyncProcess = new Promise((resolve) =>
        setTimeout(() => resolve('success'), 2000),
      );
      const promise = Functional.promiseWithTimeout(1, asyncProcess);
      await expectAsync(promise).toBeRejected();
    });
  });
});
