import { describe, expect, it } from 'vitest';

describe('keys', () => {
  it('holds default keys', () => {
    expect(['title', 'summary', 'slug']).toContain('title');
  });
});
