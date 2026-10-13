import { describe, it, expect } from 'vitest';
import {
  canonicalKeyFor, parseCanonicalKey, candidatePathsFor,
  aliasableNames, findFatalDuplicates, assertSafeExportName,
  classifyDirents, isCollectionItem, type KeyedEntry, type DirentLike,
  isContentPathError, isIdRef, parseContentPath, type ContentPathSegment,
  type ContentPathError, formatContentPath, isExpressibleIdSegment,
  itemIdentity, normalizeCollectionItem,
} from '../src/keys';

const entry = (over: Partial<KeyedEntry>): KeyedEntry => ({
  canonicalKey: 'pages.blog', bareName: 'blog', subdir: 'pages',
  kind: 'file', relPath: 'pages/blog.json', ...over,
});

describe('canonicalKeyFor', () => {
  it('prefixes with the subdir and leaves site alone', () => {
    expect(canonicalKeyFor('pages', 'blog')).toBe('pages.blog');
    expect(canonicalKeyFor('data', 'posts')).toBe('data.posts');
    expect(canonicalKeyFor(null, 'site')).toBe('site');
  });
});

describe('parseCanonicalKey', () => {
  it('splits a namespaced key into root, name, and field path', () => {
    expect(parseCanonicalKey('pages.blog.hero.title')).toEqual({
      root: 'pages', bareName: 'blog', path: ['hero', 'title'],
    });
  });

  it('treats site as its own root with no bare-name segment', () => {
    expect(parseCanonicalKey('site.brand')).toEqual({
      root: 'site', bareName: 'site', path: ['brand'],
    });
  });

  it('rejects an empty key', () => {
    expect(parseCanonicalKey('')).toMatchObject({ error: 'invalid-key' });
  });

  it('reports a legacy bare key as bare rather than invalid', () => {
    expect(parseCanonicalKey('home.hero')).toEqual({
      root: null, bareName: 'home', path: ['hero'],
    });
  });

  it('reports a bare key with no field path', () => {
    expect(parseCanonicalKey('home')).toEqual({ root: null, bareName: 'home', path: [] });
  });

  it('rejects a bare name that is not a JS identifier', () => {
    expect(parseCanonicalKey('blog-posts.title')).toMatchObject({ error: 'invalid-key' });
  });

  it('reads a leading pages/data segment as the namespace, never as a bare name', () => {
    // D9 reserves site/pages/data as content file names, so this is unambiguous
    expect(parseCanonicalKey('pages.hero')).toEqual({
      root: 'pages', bareName: 'hero', path: [],
    });
  });
});

describe('candidatePathsFor', () => {
  it('gives exactly one file candidate plus the collection dir for a data key', () => {
    expect(candidatePathsFor('data.posts')).toEqual({
      relPaths: ['data/posts.json', 'data/posts'],
    });
  });

  it('gives one candidate for a pages key — no cross-namespace probing', () => {
    expect(candidatePathsFor('pages.blog')).toEqual({ relPaths: ['pages/blog.json'] });
  });

  it('refuses a bare key — those resolve through discovery, not a path guess', () => {
    expect(candidatePathsFor('home')).toMatchObject({ error: expect.stringMatching(/discovery/) });
  });
});

describe('aliasableNames', () => {
  it('aliases a name owned by exactly one entry', () => {
    const names = aliasableNames([entry({}), entry({
      canonicalKey: 'data.posts', bareName: 'posts', subdir: 'data', relPath: 'data/posts',
      kind: 'collection',
    })]);
    expect([...names].sort()).toEqual(['blog', 'posts']);
  });

  it('withholds the alias when two namespaces claim one name', () => {
    const names = aliasableNames([entry({}), entry({
      canonicalKey: 'data.blog', subdir: 'data', relPath: 'data/blog', kind: 'collection',
    })]);
    expect(names.has('blog')).toBe(false);
  });
});

describe('classifyDirents', () => {
  const d = (name: string, isDirectory: boolean = false): DirentLike => ({ name, isDirectory });

  it('classifies a .json file as a file entry keyed by its stem', () => {
    expect(classifyDirents('pages', [d('blog.json')])).toEqual([{
      canonicalKey: 'pages.blog', bareName: 'blog', subdir: 'pages',
      kind: 'file', relPath: 'pages/blog.json',
    }]);
  });

  it('classifies a directory under data/ as a collection', () => {
    expect(classifyDirents('data', [d('posts', true)])).toEqual([{
      canonicalKey: 'data.posts', bareName: 'posts', subdir: 'data',
      kind: 'collection', relPath: 'data/posts',
    }]);
  });

  it('ignores a directory under pages/ — collections are data/-only', () => {
    expect(classifyDirents('pages', [d('blog', true)])).toEqual([]);
  });

  it('ignores non-json files', () => {
    expect(classifyDirents('data', [d('notes.txt'), d('README.md')])).toEqual([]);
  });

  it('treats a .json-named directory as a file entry so the caller surfaces the read error', () => {
    const out: KeyedEntry[] = classifyDirents('pages', [d('home.json', true)]);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('file');
  });
});

describe('isCollectionItem', () => {
  it('accepts .json and .md items', () => {
    expect(isCollectionItem('a.json')).toBe(true);
    expect(isCollectionItem('a.md')).toBe(true);
  });

  it('rejects dotfiles, README.md, and other extensions', () => {
    expect(isCollectionItem('.keep')).toBe(false);
    expect(isCollectionItem('README.md')).toBe(false);
    expect(isCollectionItem('cover.png')).toBe(false);
  });
});

describe('reserved roots (D9)', () => {
  it('rejects a content file that shadows a namespace export', () => {
    expect(() => assertSafeExportName('data', 'data.json')).toThrow(/reserved/);
    expect(() => assertSafeExportName('pages', 'pages.json')).toThrow(/reserved/);
    expect(() => assertSafeExportName('site', 'site.json')).toThrow(/reserved/);
  });

  it('still rejects JS reserved words and non-identifiers', () => {
    expect(() => assertSafeExportName('class', 'class.json')).toThrow();
    expect(() => assertSafeExportName('blog-posts', 'blog-posts.json')).toThrow();
  });

  it('never aliases a reserved root even if it is unique', () => {
    const names = aliasableNames([entry({
      canonicalKey: 'pages.data', bareName: 'data', relPath: 'pages/data.json',
    })]);
    expect(names.has('data')).toBe(false);
  });
});

describe('findFatalDuplicates', () => {
  it('flags a file and a directory claiming one key inside data/', () => {
    const pairs = findFatalDuplicates([
      entry({ canonicalKey: 'data.blog', subdir: 'data', relPath: 'data/blog.json' }),
      entry({ canonicalKey: 'data.blog', subdir: 'data', relPath: 'data/blog', kind: 'collection' }),
    ]);
    expect(pairs).toHaveLength(1);
  });

  it('does not flag the same name across pages/ and data/', () => {
    expect(findFatalDuplicates([entry({}), entry({
      canonicalKey: 'data.blog', subdir: 'data', relPath: 'data/blog', kind: 'collection',
    })])).toEqual([]);
  });
});

describe('parseContentPath', () => {
  it('tokenizes a dotted path', () => {
    const result: ContentPathSegment[] | ContentPathError = parseContentPath('home.hero.title');
    expect(result).toEqual(['home', 'hero', 'title']);
  });

  it('tokenizes a positional index', () => {
    const result: ContentPathSegment[] | ContentPathError = parseContentPath('data.services[2].name');
    expect(result).toEqual(['data', 'services', 2, 'name']);
  });

  it('tokenizes an id-anchored reference', () => {
    const result: ContentPathSegment[] | ContentPathError = parseContentPath('data.services[@svc_a1b2].name');
    expect(result).toEqual(['data', 'services', { id: 'svc_a1b2' }, 'name']);
  });

  it('identifies an id segment with isIdRef', () => {
    const result: ContentPathSegment[] | ContentPathError = parseContentPath('data.services[@abc].name');
    if (isContentPathError(result)) throw new Error('expected segments');
    const segment: ContentPathSegment | undefined = result[2];
    expect(segment !== undefined && isIdRef(segment)).toBe(true);
  });

  it('rejects a reserved segment', () => {
    const result: ContentPathSegment[] | ContentPathError = parseContentPath('home.__proto__.title');
    expect(isContentPathError(result)).toBe(true);
  });

  it('rejects an unclosed bracket', () => {
    const result: ContentPathSegment[] | ContentPathError = parseContentPath('data.services[2.name');
    expect(isContentPathError(result)).toBe(true);
  });

  it('rejects an index beyond the safe integer range, matching formatContentPath', () => {
    const result: ContentPathSegment[] | ContentPathError = parseContentPath('data.services[9007199254740993].name');
    expect(isContentPathError(result)).toBe(true);
  });

  it('rejects a trailing dot', () => {
    expect(isContentPathError(parseContentPath('home.hero.'))).toBe(true);
  });

  it('rejects an empty key', () => {
    expect(isContentPathError(parseContentPath(''))).toBe(true);
  });

  it('rejects a key that does not start with a named root', () => {
    expect(isContentPathError(parseContentPath('[0].name'))).toBe(true);
  });
});

describe('formatContentPath', () => {
  it('serializes a plain dotted path', () => {
    expect(formatContentPath(['home', 'hero', 'title'])).toBe('home.hero.title');
  });

  it('serializes a numeric index', () => {
    expect(formatContentPath(['home', 'stats', 0, 'value'])).toBe('home.stats[0].value');
  });

  it('serializes an id reference', () => {
    expect(formatContentPath(['data', 'services', { id: 'svc_a1b2' }, 'name'])).toBe(
      'data.services[@svc_a1b2].name',
    );
  });

  it('serializes a bracket segment as the terminal segment', () => {
    expect(formatContentPath(['home', 'tags', 2])).toBe('home.tags[2]');
    expect(formatContentPath(['data', 'services', { id: 'svc_a1b2' }])).toBe(
      'data.services[@svc_a1b2]',
    );
  });

  it('serializes consecutive bracket segments', () => {
    expect(formatContentPath(['a', 'b', 0, 1])).toBe('a.b[0][1]');
  });

  it('rejects an empty segment list', () => {
    const result = formatContentPath([]);
    expect(isContentPathError(result)).toBe(true);
  });

  it('rejects a leading non-named segment', () => {
    expect(isContentPathError(formatContentPath([0, 'name']))).toBe(true);
    expect(isContentPathError(formatContentPath([{ id: 'x' }]))).toBe(true);
  });

  it('rejects an id outside the id charset', () => {
    expect(isContentPathError(formatContentPath(['a', 'b', { id: 'has.dot' }]))).toBe(true);
    expect(isContentPathError(formatContentPath(['a', 'b', { id: 'has]bracket' }]))).toBe(true);
    expect(isContentPathError(formatContentPath(['a', 'b', { id: '' }]))).toBe(true);
  });

  it('rejects a named segment that is not expressible', () => {
    expect(isContentPathError(formatContentPath(['a', 'has-hyphen']))).toBe(true);
    expect(isContentPathError(formatContentPath(['a', 'has.dot']))).toBe(true);
    expect(isContentPathError(formatContentPath(['a', '']))).toBe(true);
  });

  it('rejects a reserved named segment', () => {
    expect(isContentPathError(formatContentPath(['a', '__proto__']))).toBe(true);
    expect(isContentPathError(formatContentPath(['a', 'constructor']))).toBe(true);
    expect(isContentPathError(formatContentPath(['a', 'prototype']))).toBe(true);
  });

  it('rejects a negative or non-integer index', () => {
    expect(isContentPathError(formatContentPath(['a', 'b', -1]))).toBe(true);
    expect(isContentPathError(formatContentPath(['a', 'b', 1.5]))).toBe(true);
    expect(isContentPathError(formatContentPath(['a', 'b', Number.NaN]))).toBe(true);
  });

  it('rejects an index that would not stringify as a plain integer', () => {
    expect(isContentPathError(formatContentPath(['a', 'b', 1e21]))).toBe(true);
    expect(isContentPathError(formatContentPath(['a', 'b', Number.MAX_SAFE_INTEGER + 2]))).toBe(true);
  });

  it('round-trips every key parseContentPath accepts', () => {
    const keys: readonly string[] = [
      'home',
      'home.hero.title',
      'home.stats[0].value',
      'data.services[@svc_a1b2].name',
      'data.services[@a-b_c].name',
      'a.b[0][1]',
      'a.b[10].c[@d].e',
    ];
    for (const key of keys) {
      const segments = parseContentPath(key);
      expect(isContentPathError(segments)).toBe(false);
      if (isContentPathError(segments)) continue;
      const formatted = formatContentPath(segments);
      expect(formatted).toBe(key);
      expect(parseContentPath(formatted as string)).toEqual(segments);
    }
  });

  it('round-trips segments back through the parser', () => {
    const segments: ContentPathSegment[] = ['data', 'services', { id: 'svc_a1b2' }, 'name'];
    const formatted = formatContentPath(segments);
    expect(isContentPathError(formatted)).toBe(false);
    expect(parseContentPath(formatted as string)).toEqual(segments);
  });
});

describe('isExpressibleIdSegment', () => {
  it('accepts the minted-id charset', () => {
    expect(isExpressibleIdSegment('svc_a1b2')).toBe(true);
    expect(isExpressibleIdSegment('day-4')).toBe(true);
    expect(isExpressibleIdSegment('V1StGXR8_Z5jdHi6B-myT')).toBe(true);
  });

  it('rejects ids that would not parse back', () => {
    expect(isExpressibleIdSegment('')).toBe(false);
    expect(isExpressibleIdSegment('has.dot')).toBe(false);
    expect(isExpressibleIdSegment('has]bracket')).toBe(false);
    expect(isExpressibleIdSegment('has space')).toBe(false);
  });
});

describe('itemIdentity', () => {
  it('prefers a string id over a string slug', () => {
    expect(itemIdentity({ id: 'blog-post-7k2m9x1qab3d', slug: 'ignored' })).toBe('blog-post-7k2m9x1qab3d');
  });

  it('falls back to slug when id is absent', () => {
    expect(itemIdentity({ slug: 'custom-slug', title: 'x' })).toBe('custom-slug');
  });

  it('returns undefined when neither id nor slug is a string', () => {
    expect(itemIdentity({ title: 'x' })).toBeUndefined();
    expect(itemIdentity({ id: 42, slug: null })).toBeUndefined();
  });

  it('agrees with normalizeCollectionItem: a frontmatter id wins over the filename-derived slug', () => {
    const raw = '---\nid: blog-post-7k2m9x1qab3d\ntitle: Real Shaped\n---\nBody.\n';
    const item = normalizeCollectionItem('real-shaped.md', raw);
    expect(itemIdentity(item)).toBe('blog-post-7k2m9x1qab3d');
  });

  it('agrees with normalizeCollectionItem: falls back to the filename-derived slug with no declared identity', () => {
    const raw = '---\ntitle: Plain\n---\nBody.\n';
    const item = normalizeCollectionItem('plain-item.md', raw);
    expect(itemIdentity(item)).toBe('plain-item');
  });
});
