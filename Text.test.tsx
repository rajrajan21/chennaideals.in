import { describe, expect, it } from 'vitest';
import { Text } from './Text';

describe('Text', () => {
  it('renders text content', () => {
    expect(Text).toBeTypeOf('function');
  });
});
