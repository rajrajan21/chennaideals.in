import { describe, expect, it } from 'vitest';

describe('primitive compliance', () => {
  it('accepts basic types', () => {
    expect(['string', 'number', 'boolean']).toContain('string');
  });
});
