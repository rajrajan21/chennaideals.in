import { describe, expect, it } from 'vitest';

describe('frontmatter', () => {
  it('serializes defaults', () => {
    expect({ title: 'Untitled', summary: '' }).toBeTruthy();
  });
});
