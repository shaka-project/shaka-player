/**
 * @license
 * Copyright 2016 Google Inc.
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
 */

const testGetMimeType = async (expertedMimeType, contentType) => {
  const netEngine = new shaka.test.FakeNetworkingEngine()
      .setHeaders('dummy://foo', {'content-type': contentType});
  const mimeType = await shaka.media.ManifestParser
      .getMimeType('dummy://foo', netEngine,
          shaka.net.NetworkingEngine.defaultRetryParameters());
  expect(mimeType).toBe(expertedMimeType);
};

describe('ManifestParser', () => {
  describe('getMimeType', () => {
    it('test correct mimeType', () => {
      testGetMimeType('application/dash+xml', 'application/dash+xml');
    });

    it('test mimeType with charset', () => {
      testGetMimeType('application/dash+xml',
          'application/dash+xml;charset=UTF-8');
    });

    it('test content-type with uppercase letters', () => {
      testGetMimeType('application/dash+xml',
          'Application/Dash+XML');
    });

    it('test content-type with uppercase letters and charset', () => {
      testGetMimeType('text/html',
          'Text/HTML;Charset="utf-8"');
    });
  });
});
