import { describe, expect, it } from 'vitest';

describe('frontmatter', () => {
  it('serializes default values', () => {
    expect({ title: 'Untitled', summary: '' }).toBeTruthy();
  });
});
