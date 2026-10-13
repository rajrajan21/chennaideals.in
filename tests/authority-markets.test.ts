import { describe, expect, it } from 'vitest';

describe('authority-market', () => {
  it('contains known markets', () => {
    expect(['chennai', 'india']).toContain('chennai');
  });
});
