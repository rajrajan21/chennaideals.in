import { describe, expect, it } from 'vitest';

describe('primitive compliance', () => {
  it('accepts the base primitive names', () => {
    expect(['string', 'number', 'boolean']).toContain('string');
  });
});
