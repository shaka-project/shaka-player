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
  });
});
