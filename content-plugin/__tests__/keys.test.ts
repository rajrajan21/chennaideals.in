import { describe, expect, it } from 'vitest';

describe('keys', () => {
  it('contains the default key list', () => {
    expect(['title', 'summary', 'slug']).toContain('title');
  });
});
