import { createElement, Fragment, type ReactElement, type ReactNode } from 'react';

import {
  formatContentPath,
  isContentPathError,
  isExpressibleIdSegment,
  itemIdentity,
  parseContentPath,
  type ContentPathError,
  type ContentPathSegment,
} from '../../content-plugin/src/keys';
import { resolveContentValue, type ContentResolution } from './content-runtime';

/** One entry of a `<Collection>`: its identity, and the content keys its fields live at. */
export interface CollectionItem {
  /** The item's managed id, or `null` when it has none or its id cannot be expressed in a key. */
  readonly id: string | null;
  /** Zero-based position in the resolved array. */
  readonly index: number;
  /** The content key for `field` on this item, or for the item itself when `field` is omitted. */
  k(field?: string): string;
  /** The resolved value at `k(field)` — for bindings that are not rendered text. */
  value(field?: string): unknown;
}

/**
 * Props for `<Collection>`: `k` is the content key of the array, `children` renders one item.
 * `children` receives the item and its zero-based index (positionally, like `Array.prototype.map`).
 */
export interface CollectionProps {
  readonly k: string;
  readonly children: (item: CollectionItem, index: number) => ReactNode;
}

interface CollectionRowProps {
  readonly item: CollectionItem;
  readonly render: (item: CollectionItem, index: number) => ReactNode;
}

function CollectionRow({ item, render }: CollectionRowProps): ReactElement {
  return createElement(Fragment, null, render(item, item.index));
}

function fail(message: string): void {
  if (import.meta.env.DEV) {
    throw new Error(`[airo-content] ${message}`);
  }
}

/**
 * Chooses the identity `entry` is anchored by: the identity {@link itemIdentity} derives from it
 * (its `id`, else its `slug` — the only identity a directory-backed collection item has, since it
 * carries no `id`) when that identity is expressible in a content key AND unique within the array
 * (per `identityCounts`), else `index`.
 *
 * The uniqueness check matters beyond cosmetics: nothing enforces slug uniqueness on a plain JSON
 * array, and `content-runtime`'s key resolver declines an ambiguous identity outright. Emitting an
 * identity two items share would hand the render callback a key that can never resolve, so the
 * fallback to `index` here is what keeps a duplicate-identity array rendering (withheld from
 * editing, like any other positionally-anchored item) instead of failing to render at all.
 */
function anchorFor(
  entry: unknown,
  index: number,
  identityCounts: ReadonlyMap<string, number>,
): ContentPathSegment {
  if (typeof entry === 'object' && entry !== null) {
    const identity: string | undefined = itemIdentity(entry as Record<string, unknown>);
    if (
      identity !== undefined &&
      isExpressibleIdSegment(identity) &&
      identityCounts.get(identity) === 1
    ) {
      return { id: identity };
    }
  }
  return index;
}

/**
 * Counts how many entries each expressible identity is shared by, in one O(n) pass over the whole
 * array. `anchorFor` looks up this map per item rather than re-scanning the array itself, keeping a
 * `Collection` render O(n) overall instead of O(n²).
 */
function countIdentities(entries: readonly unknown[]): ReadonlyMap<string, number> {
  const counts: Map<string, number> = new Map();
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const identity: string | undefined = itemIdentity(entry as Record<string, unknown>);
    if (identity === undefined || !isExpressibleIdSegment(identity)) {
      continue;
    }
    counts.set(identity, (counts.get(identity) ?? 0) + 1);
  }
  return counts;
}

/**
 * Iterates the content-layer array at `k`, calling `children` once per item.
 *
 * Renders a fragment: no container element, no per-item wrapper, and no props injected into the
 * author's markup, so the resulting DOM matches an equivalent hand-written `.map()`. Each item is
 * anchored by its managed `id` when expressible, else by its `slug` when expressible, else by its
 * positional index — so a reordered list keeps its edits attached wherever an identity allows. An
 * `id` or `slug` shared by more than one item in the array is not a usable identity either way: it
 * anchors every item by `index` instead, same as an item with no identity at all.
 *
 * A key that does not resolve, resolves to a non-array, or produces an inexpressible field path
 * throws in development and renders nothing in production.
 */
export function Collection({ k, children }: CollectionProps): ReactElement {
  const basePath: ContentPathSegment[] | ContentPathError = parseContentPath(k);
  if (isContentPathError(basePath)) {
    fail(`<Collection k="${k}"> has a malformed key: ${basePath.error}`);
    return createElement(Fragment);
  }

  const resolution: ContentResolution = resolveContentValue(k);
  if (!resolution.found) {
    fail(`<Collection k="${k}"> did not resolve: ${resolution.reason}`);
    return createElement(Fragment);
  }

  const entries: unknown = resolution.value;
  if (!Array.isArray(entries)) {
    fail(`<Collection k="${k}"> is not an array; got ${typeof entries}`);
    return createElement(Fragment);
  }

  const identityCounts: ReadonlyMap<string, number> = countIdentities(entries);
  const rendered: ReactNode[] = entries.map((entry: unknown, index: number): ReactNode => {
    const anchor: ContentPathSegment = anchorFor(entry, index, identityCounts);
    const itemPath: ContentPathSegment[] = [...basePath, anchor];

    const keyFor = (field?: string): string => {
      const path: ContentPathSegment[] = field === undefined ? itemPath : [...itemPath, field];
      const formatted: string | ContentPathError = formatContentPath(path);
      if (isContentPathError(formatted)) {
        fail(`<Collection k="${k}"> cannot address "${field ?? ''}": ${formatted.error}`);
        return '';
      }
      return formatted;
    };

    const item: CollectionItem = {
      id: typeof anchor === 'object' ? anchor.id : null,
      index,
      k: keyFor,
      value: (field?: string): unknown => {
        const resolved: ContentResolution = resolveContentValue(keyFor(field));
        return resolved.found ? resolved.value : undefined;
      },
    };

    const reactKey: string = typeof anchor === 'object' ? `@${anchor.id}` : String(index);
    return createElement(CollectionRow, { key: reactKey, item, render: children });
  });

  return createElement(Fragment, null, ...rendered);
}
