import { describe, expect, it } from 'vitest';
import { Collection } from '../Collection';

describe('Collection', () => {
  it('creates a list of items', () => {
    const items = new Collection(['a', 'b']);
    expect(items.toArray()).toEqual(['a', 'b']);
  });
});
