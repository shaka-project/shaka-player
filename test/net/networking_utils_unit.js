/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const testGetMimeType = async (expertedMimeType, contentType) => {
  const netEngine = new shaka.test.FakeNetworkingEngine()
      .setHeaders('dummy://foo', {'content-type': contentType});
  const mimeType = await shaka.net.NetworkingUtils
      .getMimeType('dummy://foo', netEngine,
          shaka.net.NetworkingEngine.defaultRetryParameters());
  expect(mimeType).toBe(expertedMimeType);
};

describe('NetworkingUtils', () => {
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

  describe('getExtension', () => {
    it('should return the extension in lowercase', () => {
      const uri = 'https://example.com/file.TXT';
      const result = shaka.net.NetworkingUtils.getExtension(uri);
      expect(result).toBe('txt');
    });

    it('should return empty string if there is no extension', () => {
      const uri = 'https://example.com/file';
      const result = shaka.net.NetworkingUtils.getExtension(uri);
      expect(result).toBe('');
    });

    it('should handle multiple dots correctly', () => {
      const uri = 'https://example.com/archive.tar.gz';
      const result = shaka.net.NetworkingUtils.getExtension(uri);
      expect(result).toBe('gz');
    });

    it('should return empty string for trailing slash', () => {
      const uri = 'https://example.com/path/';
      const result = shaka.net.NetworkingUtils.getExtension(uri);
      expect(result).toBe('');
    });

    it('should return empty string for empty path', () => {
      const uri = 'https://example.com/';
      const result = shaka.net.NetworkingUtils.getExtension(uri);
      expect(result).toBe('');
    });

    it('should return correct extension for local file path', () => {
      const uri = 'file:///C:/Users/Alvaro/Documents/report.pdf';
      const result = shaka.net.NetworkingUtils.getExtension(uri);
      expect(result).toBe('pdf');
    });

    it('should ignore query parameters when extracting extension', () => {
      const uri = 'https://example.com/image.jpeg?size=large';
      const result = shaka.net.NetworkingUtils.getExtension(uri);
      expect(result).toBe('jpeg');
    });

    it('should ignore hash fragments when extracting extension', () => {
      const uri = 'https://example.com/video.mp4#section1';
      const result = shaka.net.NetworkingUtils.getExtension(uri);
      expect(result).toBe('mp4');
    });

    it('should handle both query and hash together', () => {
      const uri = 'https://example.com/document.docx?download=true#top';
      const result = shaka.net.NetworkingUtils.getExtension(uri);
      expect(result).toBe('docx');
    });

    it('should return extension from relative URL with filename', () => {
      const uri = './assets/image.PNG';
      const result = shaka.net.NetworkingUtils.getExtension(uri);
      expect(result).toBe('png');
    });

    it('should return extension from relative URL with nested path', () => {
      const uri = '../downloads/archive.zip';
      const result = shaka.net.NetworkingUtils.getExtension(uri);
      expect(result).toBe('zip');
    });

    it('should return empty string from relative URL without extension', () => {
      const uri = './scripts/run';
      const result = shaka.net.NetworkingUtils.getExtension(uri);
      expect(result).toBe('');
    });

    it('should return extension from relative URL with query params', () => {
      const uri = './data/file.json?version=2';
      const result = shaka.net.NetworkingUtils.getExtension(uri);
      expect(result).toBe('json');
    });

    it('should return extension from relative URL with hash', () => {
      const uri = './docs/manual.pdf#page=3';
      const result = shaka.net.NetworkingUtils.getExtension(uri);
      expect(result).toBe('pdf');
    });

    it('should ignore dots in query parameter values', () => {
      const uri =
          'https://cdn.example.com/media/en.cmft' +
          '?host=app.example.com&signature=abc.def';
      const result = shaka.net.NetworkingUtils.getExtension(uri);
      expect(result).toBe('cmft');
    });

    it('should handle signed URLs with dots in query params', () => {
      const uri =
          'https://cdn.example.com/media/subtitle.vtt' +
          '?algorithm=HMAC-SHA256&credential=key1234' +
          '&signed-headers=host&signature=abcdef.1234567890' +
          '&filename=subtitle.en.vtt';
      const result = shaka.net.NetworkingUtils.getExtension(uri);
      expect(result).toBe('vtt');
    });

    it('should handle query with hostname-like values', () => {
      const uri = 'https://example.com/video.mp4?origin=cdn.example.co.uk';
      const result = shaka.net.NetworkingUtils.getExtension(uri);
      expect(result).toBe('mp4');
    });

    it('should handle query with dotted filename and no path extension', () => {
      const uri = 'https://example.com/stream?file=video.mp4';
      const result = shaka.net.NetworkingUtils.getExtension(uri);
      expect(result).toBe('');
    });

    it('should handle fragment with dots', () => {
      const uri = 'https://example.com/file.mp3#t=1.5';
      const result = shaka.net.NetworkingUtils.getExtension(uri);
      expect(result).toBe('mp3');
    });
  });
});
