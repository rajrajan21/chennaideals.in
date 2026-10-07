/// <reference path="./virtual-content-runtime.d.ts" />
import content, { collectionRoots } from 'virtual:content-runtime';

import {
  isContentPathError,
  isIdRef,
  parseContentPath,
  type ContentPathError,
  type ContentPathSegment,
} from '../../content-plugin/src/keys';

/** The outcome of resolving a dotted content key: the value found, or why it was not. */
export type ContentResolution =
  | { readonly found: true; readonly value: unknown }
  | { readonly found: false; readonly reason: string };

/** Walks the content namespace for `key` (e.g. `home.hero.title`), returning a miss rather than throwing. */
export function resolveContentValue(key: string): ContentResolution {
  const segments: ContentPathSegment[] | ContentPathError = parseContentPath(key);
  if (isContentPathError(segments)) {
    return { found: false, reason: segments.error };
  }

  return walkSegments(segments, key);
}

/** An own string-typed property read off `item`, or `undefined` when absent or not a string. */
function ownStringProperty(item: unknown, property: string): string | undefined {
  if (typeof item !== 'object' || item === null) {
    return undefined;
  }
  if (!Object.prototype.hasOwnProperty.call(item, property)) {
    return undefined;
  }
  const value: unknown = (item as Record<string, unknown>)[property];
  return typeof value === 'string' ? value : undefined;
}

/** The outcome of matching `[@target]` against an array's items. */
type IdentityMatch =
  | { readonly kind: 'found'; readonly value: unknown }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'ambiguous'; readonly count: number };

/**
 * Matches `[@target]` against `array`'s items: an item's `id` or `slug` equals `target`, with `id`
 * checked first and preferred whenever it alone resolves uniquely. Each tier collects every match
 * before deciding — a tier with more than one match is ambiguous and is never narrowed to "the
 * first", since a caller doing that would silently show one item's content on another's identity.
 */
function matchIdentity(array: readonly unknown[], target: string): IdentityMatch {
  const idMatches: unknown[] = array.filter(
    (item: unknown): boolean => ownStringProperty(item, 'id') === target,
  );
  if (idMatches.length === 1) {
    return { kind: 'found', value: idMatches[0] };
  }
  if (idMatches.length > 1) {
    return { kind: 'ambiguous', count: idMatches.length };
  }

  const slugMatches: unknown[] = array.filter(
    (item: unknown): boolean => ownStringProperty(item, 'slug') === target,
  );
  if (slugMatches.length === 1) {
    return { kind: 'found', value: slugMatches[0] };
  }
  if (slugMatches.length > 1) {
    return { kind: 'ambiguous', count: slugMatches.length };
  }
  return { kind: 'not-found' };
}

function walkSegments(segments: readonly ContentPathSegment[], key: string): ContentResolution {
  let cursor: unknown = content;

  for (const segment of segments) {
    if (cursor === null || cursor === undefined) {
      return { found: false, reason: `"${key}" resolved to nothing` };
    }

    if (isIdRef(segment)) {
      if (!Array.isArray(cursor)) {
        return { found: false, reason: `"${key}" uses an id reference on a non-array` };
      }
      const match: IdentityMatch = matchIdentity(cursor, segment.id);
      if (match.kind === 'ambiguous') {
        return {
          found: false,
          reason: `"${key}" matches ${match.count} items with identity "${segment.id}"`,
        };
      }
      if (match.kind === 'not-found') {
        return { found: false, reason: `"${key}" has no item with id "${segment.id}"` };
      }
      cursor = match.value;
      continue;
    }

    if (typeof segment === 'number') {
      if (!Array.isArray(cursor)) {
        return { found: false, reason: `"${key}" indexes a non-array` };
      }
      if (!Object.prototype.hasOwnProperty.call(cursor, segment)) {
        return { found: false, reason: `"${key}" has no item at index ${segment}` };
      }
      cursor = cursor[segment]; // nosemgrep: javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop - read-only, hasOwnProperty-gated above
      continue;
    }

    if (typeof cursor !== 'object') {
      return { found: false, reason: `"${key}" reads a property of a non-object` };
    }
    if (!Object.prototype.hasOwnProperty.call(cursor, segment)) {
      return {
        found: false,
        reason: `"${key}" is not present in the content layer (if it exists in the content JSON, ` +
          `it may have been stripped by src/content/schemas.ts — regenerate that file)`,
      };
    }
    cursor = (cursor as Record<string, unknown>)[segment]; // nosemgrep: javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop - read-only, hasOwnProperty-gated above
  }

  return { found: true, value: cursor };
}

/**
 * True when `key` addresses an object array item by positional index rather than by id, at any
 * segment along the path (e.g. `data.services[0].name`, or the `[1]` in `a.b[1].c[0].d`). Such a
 * key's anchor is the item's placement rather than the item itself: reordering the array or adding
 * an element silently re-points every edit at a different object. A primitive array item addressed
 * positionally (`home.tags[0]`) is unaffected — position is its only expressible identity, so it
 * stays editable.
 */
export function isPositionalObjectKey(
  key: string,
  segments: ContentPathSegment[] | ContentPathError = parseContentPath(key),
): boolean {
  if (isContentPathError(segments)) {
    return false;
  }

  for (let i: number = 0; i < segments.length; i += 1) {
    const segment: ContentPathSegment = segments[i];
    if (typeof segment !== 'number') {
      continue;
    }

    const prefix: ContentPathSegment[] = segments.slice(0, i);
    const resolution: ContentResolution = walkSegments(prefix, key);
    if (!resolution.found || !Array.isArray(resolution.value)) {
      continue;
    }

    const array: unknown[] = resolution.value;
    if (!Object.prototype.hasOwnProperty.call(array, segment)) {
      continue;
    }

    const element: unknown = array[segment];
    if (typeof element === 'object' && element !== null) {
      return true;
    }
  }

  return false;
}

/** The entry in `collectionRoots` that `key` addresses, or `undefined` if none does. */
function matchingCollectionRoot(key: string): string | undefined {
  return collectionRoots.find((root: string): boolean => {
    return key === root || key.startsWith(`${root}.`) || key.startsWith(`${root}[`);
  });
}

/**
 * True when `key` addresses a value inside a directory-backed collection (`src/content/data/<name>/`).
 * Each item in such a collection is its own file, identified by that file's name. Most fields on
 * such an item resolve and write like any other content key; only the derived `slug` field and a
 * field nested more than one segment deep are special (see {@link shouldWithholdEditing}), so this
 * alone does not decide editability.
 */
export function isDirectoryBackedKey(key: string): boolean {
  return matchingCollectionRoot(key) !== undefined;
}

function isDirectoryBackedSlugKey(
  root: string | undefined,
  segments: ContentPathSegment[] | ContentPathError,
): boolean {
  if (root === undefined || isContentPathError(segments)) {
    return false;
  }

  const lastSegment: ContentPathSegment | undefined = segments[segments.length - 1];
  return lastSegment === 'slug';
}

function isDirectoryBackedDeepKey(
  root: string | undefined,
  segments: ContentPathSegment[] | ContentPathError,
): boolean {
  if (root === undefined || isContentPathError(segments)) {
    return false;
  }

  const rootSegmentCount: number = root.split('.').length;
  const remaining: ContentPathSegment[] = segments.slice(rootSegmentCount + 1);
  return remaining.length > 1;
}

/**
 * True when `key` should be withheld from text editing: it addresses the `slug` field of a
 * directory-backed collection item, a field nested more than one segment into a directory-backed
 * collection item, an object array item by positional index, or (when `resolution` is supplied) a
 * key that does not resolve or resolves to something other than a string or number. The single
 * entry point callers use, so a new withhold reason only needs adding here.
 *
 * `resolution` is optional context, not a re-resolve: pass the caller's already-computed
 * {@link resolveContentValue} result to fold its unresolved/wrong-type cases into this one check.
 * Omitting it (as callers that only care about the structural rules do) skips that part of the
 * check rather than resolving `key` again.
 */
export function shouldWithholdEditing(key: string, resolution?: ContentResolution): boolean {
  if (resolution !== undefined) {
    if (!resolution.found) {
      return true;
    }
    if (typeof resolution.value !== 'string' && typeof resolution.value !== 'number') {
      return true;
    }
  }

  const segments: ContentPathSegment[] | ContentPathError = parseContentPath(key);
  const root: string | undefined = matchingCollectionRoot(key);

  return (
    isDirectoryBackedSlugKey(root, segments) ||
    isDirectoryBackedDeepKey(root, segments) ||
    isPositionalObjectKey(key, segments)
  );
}
