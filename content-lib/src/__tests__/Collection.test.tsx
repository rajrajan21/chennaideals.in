import { useState, type Dispatch, type ReactElement, type SetStateAction } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import { Collection, type CollectionItem } from '../Collection';
import { Text } from '../Text';

describe('Collection', () => {
  it('yields one item per array entry', () => {
    const seen: string[] = [];
    render(
      <Collection k="data.services">
        {(item) => {
          seen.push(item.k('name'));
          return null;
        }}
      </Collection>,
    );
    expect(seen).toEqual(['data.services[@svc_a1b2].name', 'data.services[@svc_c3d4].name']);
  });

  it('injects no DOM of its own', () => {
    const { container } = render(
      <Collection k="data.services">
        {(item) => <Text as="li" k={item.k('name')} />}
      </Collection>,
    );
    expect(container.children.length).toBe(2);
    expect(Array.from(container.children).map((el) => el.tagName)).toEqual(['LI', 'LI']);
    expect(container.querySelector('div')).toBeNull();
  });

  it('renders resolved values through Text', () => {
    const { container } = render(
      <Collection k="data.services">
        {(item) => <Text as="li" k={item.k('name')} />}
      </Collection>,
    );
    expect(Array.from(container.children).map((el) => el.textContent)).toEqual([
      'Cash Offer',
      'Closing Support',
    ]);
  });

  it('exposes the item id and index', () => {
    const rows: Array<{ id: string | null; index: number }> = [];
    render(
      <Collection k="data.services">
        {(item) => {
          rows.push({ id: item.id, index: item.index });
          return null;
        }}
      </Collection>,
    );
    expect(rows).toEqual([
      { id: 'svc_a1b2', index: 0 },
      { id: 'svc_c3d4', index: 1 },
    ]);
  });

  it('keys the item itself when k() is called with no field', () => {
    const keys: string[] = [];
    render(
      <Collection k="data.services">
        {(item) => {
          keys.push(item.k());
          return null;
        }}
      </Collection>,
    );
    expect(keys).toEqual(['data.services[@svc_a1b2]', 'data.services[@svc_c3d4]']);
  });

  it('passes the zero-based index positionally as the second argument, matching item.index', () => {
    const indices: number[] = [];
    render(
      <Collection k="data.services">
        {(item, index) => {
          indices.push(index);
          expect(index).toBe(item.index);
          return null;
        }}
      </Collection>,
    );
    expect(indices).toEqual([0, 1]);
  });

  it('still renders correctly when the callback is declared with only (item)', () => {
    function renderName(item: CollectionItem): ReactElement {
      return <Text as="li" k={item.k('name')} />;
    }
    const { container } = render(<Collection k="data.services">{renderName}</Collection>);
    expect(Array.from(container.children).map((el: Element): string | null => el.textContent)).toEqual([
      'Cash Offer',
      'Closing Support',
    ]);
  });

  it('falls back to a positional index when an item has no id', () => {
    const keys: string[] = [];
    render(
      <Collection k="data.noIds">
        {(item) => {
          keys.push(item.k('name'));
          return null;
        }}
      </Collection>,
    );
    expect(keys).toEqual(['data.noIds[0].name', 'data.noIds[1].name']);
  });

  it('falls back to a positional index when an id would not round-trip', () => {
    const keys: string[] = [];
    render(
      <Collection k="data.oddIds">
        {(item) => {
          keys.push(item.k('name'));
          return null;
        }}
      </Collection>,
    );
    expect(keys).toEqual(['data.oddIds[0].name', 'data.oddIds[@fine_1].name']);
  });

  it('anchors by slug when an item has no id, reporting the slug as item.id', () => {
    const rows: Array<{ key: string; id: string | null }> = [];
    render(
      <Collection k="data.blogPosts">
        {(item) => {
          rows.push({ key: item.k('title'), id: item.id });
          return null;
        }}
      </Collection>,
    );
    expect(rows).toEqual([
      { key: 'data.blogPosts[@first-post].title', id: 'first-post' },
      { key: 'data.blogPosts[@second-post].title', id: 'second-post' },
      { key: 'data.blogPosts[2].title', id: null },
    ]);
  });

  it('reports a null id for an item that cannot be id-anchored', () => {
    const ids: Array<string | null> = [];
    render(
      <Collection k="data.oddIds">
        {(item) => {
          ids.push(item.id);
          return null;
        }}
      </Collection>,
    );
    expect(ids).toEqual([null, 'fine_1']);
  });

  it('handles an array of primitives via k() with no field', () => {
    const { container } = render(
      <Collection k="home.tags">{(item) => <Text as="li" k={item.k()} />}</Collection>,
    );
    expect(Array.from(container.children).map((el) => el.textContent)).toEqual(['alpha', 'beta']);
    expect(Array.from(container.children).map((el) => el.getAttribute('data-dev-content-key'))).toEqual([
      'home.tags[0]',
      'home.tags[1]',
    ]);
  });

  it('withholds editing for an item that lacks an expressible id, while still rendering its text', () => {
    const { container } = render(
      <Collection k="data.noIds">{(item) => <Text as="li" k={item.k('name')} />}</Collection>,
    );
    const items: Element[] = Array.from(container.children);
    expect(items.map((el) => el.textContent)).toEqual(['First', 'Second']);
    expect(items.map((el) => el.getAttribute('data-dev-content-readonly'))).toEqual(['', '']);
  });

  it('renders leaves with a content key and no readonly marker for a directory-backed collection', () => {
    const { container } = render(
      <Collection k="data.posts">{(item) => <Text as="li" k={item.k('title')} />}</Collection>,
    );
    const items: Element[] = Array.from(container.children);
    expect(items.map((el) => el.textContent)).toEqual(['First Post', 'Second Post']);
    expect(items.map((el) => el.getAttribute('data-dev-content-key'))).toEqual([
      'data.posts[@post_1].title',
      'data.posts[@post_2].title',
    ]);
    expect(items.map((el) => el.hasAttribute('data-dev-content-readonly'))).toEqual([
      false,
      false,
    ]);
  });

  it('falls back to index when two items share an identity-bearing slug, keeping both readable and withheld', () => {
    const { container } = render(
      <Collection k="data.duplicateSlugItems">
        {(item) => <Text as="li" k={item.k('name')} />}
      </Collection>,
    );
    const items: Element[] = Array.from(container.children);
    expect(items.map((el) => el.textContent)).toEqual(['Alpha', 'Beta']);
    expect(items.map((el) => el.getAttribute('data-dev-content-key'))).toEqual([
      'data.duplicateSlugItems[0].name',
      'data.duplicateSlugItems[1].name',
    ]);
    expect(items.map((el) => el.hasAttribute('data-dev-content-readonly'))).toEqual([true, true]);
  });

  it('falls back to index when two items share an identity-bearing id, keeping both readable and withheld', () => {
    const { container } = render(
      <Collection k="data.duplicateIdItems">
        {(item) => <Text as="li" k={item.k('title')} />}
      </Collection>,
    );
    const items: Element[] = Array.from(container.children);
    expect(items.map((el) => el.textContent)).toEqual(['A', 'B']);
    expect(items.map((el) => el.getAttribute('data-dev-content-key'))).toEqual([
      'data.duplicateIdItems[0].title',
      'data.duplicateIdItems[1].title',
    ]);
    expect(items.map((el) => el.hasAttribute('data-dev-content-readonly'))).toEqual([true, true]);
  });

  it('still anchors by identity when every item in the array has a unique slug', () => {
    const keys: string[] = [];
    render(
      <Collection k="data.blogPosts">
        {(item) => {
          keys.push(item.k('title'));
          return null;
        }}
      </Collection>,
    );
    expect(keys).toEqual([
      'data.blogPosts[@first-post].title',
      'data.blogPosts[@second-post].title',
      'data.blogPosts[2].title',
    ]);
  });

  it('composes nested collections through item.k()', () => {
    const inner: string[] = [];
    render(
      <Collection k="data.nested">
        {(outer) => (
          <Collection k={outer.k('items')}>
            {(item) => {
              inner.push(item.k('label'));
              return null;
            }}
          </Collection>
        )}
      </Collection>,
    );
    expect(inner).toEqual(['data.nested[@n1].items[@n1a].label']);
  });

  it('renders nothing for an empty array', () => {
    const { container } = render(
      <Collection k="data.nested">
        {(outer) => <Collection k={outer.k('items')}>{() => <span>x</span>}</Collection>}
      </Collection>,
    );
    expect(container.querySelectorAll('span').length).toBe(1);
  });

  it('exposes raw values for non-text uses', () => {
    const values: unknown[] = [];
    render(
      <Collection k="data.services">
        {(item) => {
          values.push(item.value('blurb'));
          return null;
        }}
      </Collection>,
    );
    expect(values).toEqual(['No repairs needed', 'Pick your date']);
  });

  it('value() with no field returns the whole item', () => {
    const values: unknown[] = [];
    render(
      <Collection k="data.noIds">
        {(item) => {
          values.push(item.value());
          return null;
        }}
      </Collection>,
    );
    expect(values).toEqual([{ name: 'First' }, { name: 'Second' }]);
  });

  it('throws in dev when the key does not resolve', () => {
    expect(() =>
      render(<Collection k="data.missing">{() => null}</Collection>),
    ).toThrow(/did not resolve/);
  });

  it('throws in dev when the key resolves to a non-array', () => {
    expect(() =>
      render(<Collection k="data.notAnArray">{() => null}</Collection>),
    ).toThrow(/is not an array/);
  });

  it('throws in dev for a field name that is not expressible', () => {
    expect(() =>
      render(
        <Collection k="data.services">
          {(item) => <span>{item.k('not-a-valid-segment')}</span>}
        </Collection>,
      ),
    ).toThrow(/not expressible/);
  });

  it('throws in dev when the collection key itself is malformed', () => {
    expect(() => render(<Collection k="data.services[">{() => null}</Collection>)).toThrow();
  });

  it('keeps per-item hooks stable across an array-length change on rerender', () => {
    function ItemRow({ item }: { readonly item: CollectionItem }): ReactElement {
      const [mounted]: [boolean, Dispatch<SetStateAction<boolean>>] = useState(true);
      return <li>{item.k('name')}-{String(mounted)}</li>;
    }
    const { container, rerender } = render(
      <Collection k="data.services">{(item) => <ItemRow item={item} />}</Collection>,
    );
    expect(container.children.length).toBe(2);

    expect(() =>
      rerender(<Collection k="home.stats">{(item) => <ItemRow item={item} />}</Collection>),
    ).not.toThrow();
    expect(container.children.length).toBe(1);

    expect(() =>
      rerender(<Collection k="data.services">{(item) => <ItemRow item={item} />}</Collection>),
    ).not.toThrow();
    expect(container.children.length).toBe(2);
  });

  it('isolates per-item state: incrementing one item does not affect another', () => {
    function Counter({ item }: { readonly item: CollectionItem }): ReactElement {
      const [count, setCount]: [number, Dispatch<SetStateAction<number>>] = useState<number>(0);
      const label: string = item.id ?? String(item.index);
      return (
        <li>
          <span>{label}:{count}</span>
          <button onClick={() => setCount((previous: number): number => previous + 1)}>
            inc-{label}
          </button>
        </li>
      );
    }
    const { getByText } = render(
      <Collection k="data.services">{(item) => <Counter item={item} />}</Collection>,
    );
    fireEvent.click(getByText('inc-svc_a1b2'));
    expect(getByText('svc_a1b2:1')).toBeTruthy();
    expect(getByText('svc_c3d4:0')).toBeTruthy();
  });
});
