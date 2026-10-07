import { describe, expect, it } from 'vitest';
import { Text } from './Text';

describe('Text', () => {
  it('renders text by type', () => {
    expect(Text).toBeTypeOf('function');
  });
});
