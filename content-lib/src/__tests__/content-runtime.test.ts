import { describe, expect, it } from 'vitest';
import {
  isDirectoryBackedKey,
  isPositionalObjectKey,
  resolveContentValue,
  shouldWithholdEditing,
  type ContentResolution,
} from '../content-runtime';

describe('resolveContentValue', () => {
  it('resolves a dotted path', () => {
    const result: ContentResolution = resolveContentValue('home.hero.title');
    expect(result).toEqual({ found: true, value: 'We Buy Houses' });
  });

  it('resolves an id-anchored collection item field', () => {
    const result: ContentResolution = resolveContentValue('data.services[@svc_c3d4].name');
    expect(result).toEqual({ found: true, value: 'Closing Support' });
  });

  it('resolves a positional collection item field', () => {
    const result: ContentResolution = resolveContentValue('data.services[0].name');
    expect(result).toEqual({ found: true, value: 'Cash Offer' });
  });

  it('reports a miss for an absent field rather than throwing', () => {
    const result: ContentResolution = resolveContentValue('home.hero.tagline');
    expect(result.found).toBe(false);
  });

  it("points an absent field's miss reason at schema stripping, the cause it cannot distinguish", () => {
    const result: ContentResolution = resolveContentValue('home.hero.tagline');
    expect(result.found).toBe(false);
    if (result.found) throw new Error('expected a miss');
    expect(result.reason).toContain('src/content/schemas.ts');
  });

  it('reports a miss for an unknown item id', () => {
    const result: ContentResolution = resolveContentValue('data.services[@nope].name');
    expect(result.found).toBe(false);
  });

  it('reports a miss for a malformed key', () => {
    const result: ContentResolution = resolveContentValue('home.hero.');
    expect(result.found).toBe(false);
  });

  it('does not walk into inherited properties', () => {
    const result: ContentResolution = resolveContentValue('home.hero.toString');
    expect(result.found).toBe(false);
  });

  it('refuses a reserved segment', () => {
    const result: ContentResolution = resolveContentValue('home.__proto__.polluted');
    expect(result.found).toBe(false);
  });

  it('reports a miss when an id reference is applied to a non-array', () => {
    const result: ContentResolution = resolveContentValue('home.hero[@svc_a1b2].name');
    expect(result.found).toBe(false);
  });

  it('reports a miss for an out-of-range numeric index as the terminal segment', () => {
    const result: ContentResolution = resolveContentValue('data.services[5]');
    expect(result.found).toBe(false);
  });

  it('reports a miss for an out-of-range numeric index as a non-terminal segment', () => {
    const result: ContentResolution = resolveContentValue('data.services[5].name');
    expect(result.found).toBe(false);
  });

  it('reports a miss when a numeric index is applied to a non-array', () => {
    const result: ContentResolution = resolveContentValue('home.hero[0].title');
    expect(result.found).toBe(false);
  });

  it('reports a miss for a sparse-array hole', () => {
    const result: ContentResolution = resolveContentValue('data.sparseServices[0].name');
    expect(result.found).toBe(false);
  });

  it('resolves an item via slug when it has no id', () => {
    const result: ContentResolution = resolveContentValue('data.blogPosts[@first-post].title');
    expect(result).toEqual({ found: true, value: 'First Post' });
  });

  it('prefers an id match over a differing slug match on another item', () => {
    const result: ContentResolution = resolveContentValue('data.idOverSlugItems[@winner].title');
    expect(result).toEqual({ found: true, value: 'By Id' });
  });

  it('reports a miss when two items share the same id, rather than resolving the first', () => {
    const result: ContentResolution = resolveContentValue('data.duplicateIdItems[@dup].title');
    expect(result.found).toBe(false);
  });

  it('reports a miss for a key referencing a slug containing a dot (unexpressible in [@…])', () => {
    const result: ContentResolution = resolveContentValue('data.blogPosts[@has.dot].title');
    expect(result.found).toBe(false);
  });
});

describe('isDirectoryBackedKey', () => {
  it('is true for the collection root itself', () => {
    expect(isDirectoryBackedKey('data.posts')).toBe(true);
  });

  it('is true for an id-anchored field on a collection item', () => {
    expect(isDirectoryBackedKey('data.posts[@x].title')).toBe(true);
  });

  it('is true for a positional field on a collection item', () => {
    expect(isDirectoryBackedKey('data.posts[0]')).toBe(true);
  });

  it('is true for the bare alias form', () => {
    expect(isDirectoryBackedKey('posts.title')).toBe(true);
  });

  it('is false for a sibling key sharing the root as a text prefix, not a path segment', () => {
    expect(isDirectoryBackedKey('data.postsOther')).toBe(false);
  });

  it('is false for a key under an unrelated namespace', () => {
    expect(isDirectoryBackedKey('home.hero.title')).toBe(false);
  });

  it('is false for a file-backed data array', () => {
    expect(isDirectoryBackedKey('data.services[0].name')).toBe(false);
  });
});

describe('isPositionalObjectKey', () => {
  it('is true for a field on an object item addressed by index', () => {
    expect(isPositionalObjectKey('data.services[0].name')).toBe(true);
  });

  it('is true for an object item itself addressed by index, with no field', () => {
    expect(isPositionalObjectKey('data.services[1]')).toBe(true);
  });

  it('is true for a positional index nested under an id-anchored prefix', () => {
    expect(isPositionalObjectKey('data.nested[@n1].items[0].label')).toBe(true);
  });

  it('is false for a primitive array item addressed by index', () => {
    expect(isPositionalObjectKey('home.tags[0]')).toBe(false);
  });

  it('is false for an identity-anchored key', () => {
    expect(isPositionalObjectKey('data.services[@svc_a1b2].name')).toBe(false);
  });

  it('is false for a key with no index at all', () => {
    expect(isPositionalObjectKey('home.hero.title')).toBe(false);
  });

  it('is false for a malformed key', () => {
    expect(isPositionalObjectKey('home.hero.')).toBe(false);
  });

  it('is false for an out-of-range index', () => {
    expect(isPositionalObjectKey('data.services[5]')).toBe(false);
  });

  it('is false for a sparse-array hole', () => {
    expect(isPositionalObjectKey('data.sparseServices[0].name')).toBe(false);
  });
});

describe('shouldWithholdEditing', () => {
  it('is true for a positionally-anchored directory-backed key (via the positional rule)', () => {
    expect(shouldWithholdEditing('data.posts[0]')).toBe(true);
  });

  it('is true for a positional object key', () => {
    expect(shouldWithholdEditing('data.services[0].name')).toBe(true);
  });

  it('is false for a plain resolvable key', () => {
    expect(shouldWithholdEditing('home.hero.title')).toBe(false);
  });

  it('is false for an id-anchored directory-backed key', () => {
    expect(shouldWithholdEditing('data.posts[@post_1].title')).toBe(false);
  });

  it('is true for the slug field of an id-anchored directory-backed key', () => {
    expect(shouldWithholdEditing('data.posts[@post_1].slug')).toBe(true);
  });

  it('is false for a slug field inside a non-directory-backed (file-backed) array', () => {
    expect(shouldWithholdEditing('data.blogPosts[@first-post].slug')).toBe(false);
  });

  it('is true for a field nested more than one segment into a directory-backed collection item', () => {
    expect(shouldWithholdEditing('data.posts[@first-post].tags[0]')).toBe(true);
  });

  it('is false for a field one segment into a directory-backed collection item', () => {
    expect(shouldWithholdEditing('data.posts[@first-post].title')).toBe(false);
  });

  it('is unaffected by the deep-nesting rule for a two-segment path in a non-directory collection', () => {
    expect(shouldWithholdEditing('data.services[@svc_a1b2].nested.deep')).toBe(false);
  });
});
