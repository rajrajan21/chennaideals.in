import { describe, expect, it } from 'vitest';
import { Collection } from './Collection';

describe('Collection', () => {
  it('creates and exposes values', () => {
    const items = new Collection(['a', 'b', 'c']);
    expect(items.toArray()).toEqual(['a', 'b', 'c']);
  });
});
