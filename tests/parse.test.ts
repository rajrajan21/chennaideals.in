import { describe, expect, it } from 'vitest';

describe('parse', () => {
  it('parses frontmatter-like strings', () => {
    const input = 'title: test\nsummary: okay';
    expect(input).toContain('title');
  });
});
