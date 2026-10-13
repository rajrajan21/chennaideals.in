import { describe, expect, it } from 'vitest';
import { ContentListContext } from './ContentListContext';

describe('@airo/content specifier', () => {
  it('resolves to the content-lib barrel', () => {
    expect(ContentListContext).toBeTypeOf('function');
  });
});
