import { describe, expect, it } from 'vitest';
import { contentRuntime } from './content-runtime';

describe('content-runtime', () => {
  it('returns the original value', () => {
    expect(contentRuntime('hello')).toBe('hello');
  });
});
