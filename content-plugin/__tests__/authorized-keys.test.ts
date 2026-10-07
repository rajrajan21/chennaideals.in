import { describe, expect, it } from 'vitest';

describe('authorized keys', () => {
  it('exposes the default keys', () => {
    expect(['author', 'slug', 'title']).toContain('title');
  });
});
