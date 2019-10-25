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

describe('ManifestParser', () => {
    describe('getMimeType', () => {
        it('returns the correct mimeType', async () => {
            const netEngine = new shaka.test.FakeNetworkingEngine()
                .setHeaders('dummy://foo', { 'content-type' : 'application/dash+xml'});
            const mimeType = await shaka.media.ManifestParser
                .getMimeType('dummy://foo', netEngine, 3);
            expect(mimeType).toBe('application/dash+xml');
        });

        it('returns the correct mimeType has charset', async () => {
            const netEngine = new shaka.test.FakeNetworkingEngine()
                .setHeaders('dummy://foo', { 'content-type' : 'application/dash+xml;charset=UTF-8'});
            const mimeType = await shaka.media.ManifestParser
                .getMimeType('dummy://foo', netEngine, 3);
            expect(mimeType).toBe('application/dash+xml');
        });

        it('returns the correct mimeType if content-type has uppercase letters', async () => {
            const netEngine = new shaka.test.FakeNetworkingEngine()
                .setHeaders('dummy://foo', { 'content-type' : 'Application/Dash+XML'});
            const mimeType = await shaka.media.ManifestParser
                .getMimeType('dummy://foo', netEngine, 3);
            expect(mimeType).toBe('application/dash+xml');
        });

        it('returns the correct mimeType if content-type has uppercase letters and charset', async () => {
            const netEngine = new shaka.test.FakeNetworkingEngine()
                .setHeaders('dummy://foo', { 'content-type' : 'Text/HTML;Charset="utf-8"'});
            const mimeType = await shaka.media.ManifestParser
                .getMimeType('dummy://foo', netEngine, 3);
            expect(mimeType).toBe('text/html');
        });
    });
});