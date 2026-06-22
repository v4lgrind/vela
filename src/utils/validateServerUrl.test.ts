import { describe, it, expect } from 'vitest';
import { validateServerUrl } from './validateServerUrl';

describe('validateServerUrl', () => {
  it('accepts http and https URLs', () => {
    expect(validateServerUrl('http://192.168.1.10:8096')).toBeNull();
    expect(validateServerUrl('https://example.com')).toBeNull();
  });

  it('rejects non-http(s) protocols with a protocol-specific message', () => {
    expect(validateServerUrl('ftp://example.com')).toBe(
      'Server URL must use http:// or https://',
    );
    expect(validateServerUrl('file:///etc/passwd')).toBe(
      'Server URL must use http:// or https://',
    );
  });

  it('rejects unparseable input with a format hint', () => {
    expect(validateServerUrl('not a url')).toMatch(/valid server URL/);
    expect(validateServerUrl('')).toMatch(/valid server URL/);
  });
});
