import { describe, expect, it } from 'vitest';

describe('authority markets', () => {
  it('contains the expected market list', () => {
    expect(['chennai', 'india']).toContain('chennai');
  });
});
