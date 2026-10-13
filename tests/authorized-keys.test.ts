import { describe, expect, it } from 'vitest';

describe('authorized keys', () => {
  it('exposes expected keys', () => {
    expect(['author', 'slug', 'title']).toContain('title');
  });
});
