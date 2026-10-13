import { describe, expect, it } from 'vitest';
import { ContentListContext } from '@airo/content';

// Guards the `@airo/content` bare specifier resolving through vitest's
// resolver (a separate concern from the Vite build's content-plugin
// resolveId branch, and from tsconfig `paths` used by `tsc --noEmit`).
describe('@airo/content specifier', () => {
  it('resolves to the content-lib barrel', () => {
    expect(ContentListContext).toBeTypeOf('function');
  });
});
