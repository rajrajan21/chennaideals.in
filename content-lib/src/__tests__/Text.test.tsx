import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Text } from '../Text';

describe('Text', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the resolved value inside the requested tag', () => {
    const { container } = render(<Text as="h1" k="home.hero.title" />);
    const el = container.firstElementChild;
    expect(el?.tagName).toBe('H1');
    expect(el?.textContent).toBe('We Buy Houses');
  });

  it('emits data-dev-content-key so the shipped edit path picks it up', () => {
    const { container } = render(<Text as="h1" k="home.hero.title" />);
    expect(container.firstElementChild?.getAttribute('data-dev-content-key')).toBe(
      'home.hero.title',
    );
  });

  it('passes className through', () => {
    const { container } = render(<Text as="p" k="home.hero.subtitle" className="text-lg" />);
    expect(container.firstElementChild?.getAttribute('class')).toBe('text-lg');
  });

  it('passes an inline style through', () => {
    const { container } = render(
      <Text as="h2" k="home.hero.title" style={{ fontFamily: 'var(--font-heading)' }} />,
    );
    expect(container.firstElementChild?.getAttribute('style')).toBe(
      'font-family: var(--font-heading);',
    );
  });

  it('emits no style attribute when style is omitted', () => {
    const { container } = render(<Text as="p" k="home.hero.subtitle" className="text-lg" />);
    expect(container.firstElementChild?.hasAttribute('style')).toBe(false);
  });

  it('defaults to span', () => {
    const { container } = render(<Text k="home.hero.subtitle" />);
    expect(container.firstElementChild?.tagName).toBe('SPAN');
  });

  it('resolves an id-anchored collection key', () => {
    const { container } = render(<Text as="h3" k="data.services[@svc_c3d4].name" />);
    expect(container.firstElementChild?.textContent).toBe('Closing Support');
  });

  it('renders a numeric value as text', () => {
    const { container } = render(<Text k="home.stats[0].value" />);
    expect(container.firstElementChild?.textContent).toBe('124,000+');
  });

  it('throws in dev when the key does not resolve', () => {
    vi.stubEnv('DEV', true);
    expect(() => render(<Text as="h1" k="home.hero.nope" />)).toThrow(/did not resolve/);
  });

  it('throws in dev when the key indexes past the end of a collection', () => {
    vi.stubEnv('DEV', true);
    expect(() => render(<Text as="h3" k="data.services[99].name" />)).toThrow(/did not resolve/);
  });

  it('throws in dev when the value is not a string or number', () => {
    vi.stubEnv('DEV', true);
    expect(() => render(<Text as="h1" k="home.hero" />)).toThrow(/renders strings and numbers/);
  });

  it('renders an empty keyed element in production when the key does not resolve', () => {
    vi.stubEnv('DEV', false);
    const { container } = render(<Text as="h1" k="home.hero.nope" />);
    const el = container.firstElementChild;
    expect(el?.tagName).toBe('H1');
    expect(el?.textContent).toBe('');
    expect(el?.getAttribute('data-dev-content-key')).toBe('home.hero.nope');
  });

  it('renders an empty keyed element in production when the key indexes past the end of a collection', () => {
    vi.stubEnv('DEV', false);
    const { container } = render(<Text as="h3" k="data.services[99].name" />);
    const el = container.firstElementChild;
    expect(el?.tagName).toBe('H3');
    expect(el?.textContent).toBe('');
    expect(el?.getAttribute('data-dev-content-key')).toBe('data.services[99].name');
  });

  it('marks the production unresolved-key fall-through readonly so it is not offered for editing', () => {
    vi.stubEnv('DEV', false);
    const { container } = render(<Text as="h1" k="home.hero.nope" />);
    const el = container.firstElementChild;
    expect(el?.getAttribute('data-dev-content-key')).toBe('home.hero.nope');
    expect(el?.getAttribute('data-dev-content-readonly')).toBe('');
  });

  it('marks the production non-text-value fall-through readonly so it is not offered for editing', () => {
    vi.stubEnv('DEV', false);
    const { container } = render(<Text as="p" k="data.services" />);
    const el = container.firstElementChild;
    expect(el?.textContent).toBe('');
    expect(el?.getAttribute('data-dev-content-key')).toBe('data.services');
    expect(el?.getAttribute('data-dev-content-readonly')).toBe('');
  });

  it('does not mark a normal resolved key readonly', () => {
    const { container } = render(<Text as="h1" k="home.hero.title" />);
    expect(container.firstElementChild?.hasAttribute('data-dev-content-readonly')).toBe(false);
  });

  it('emits data-dev-content-readonly for a positionally-anchored directory-backed key, and still renders the text', () => {
    const { container } = render(<Text as="h3" k="data.posts[0].title" />);
    const el = container.firstElementChild;
    expect(el?.getAttribute('data-dev-content-readonly')).toBe('');
    expect(el?.getAttribute('data-dev-content-key')).toBe('data.posts[0].title');
    expect(el?.textContent).toBe('First Post');
  });

  it('does NOT emit data-dev-content-readonly for an id-anchored directory-backed key', () => {
    const { container } = render(<Text as="h3" k="data.posts[@post_1].title" />);
    const el = container.firstElementChild;
    expect(el?.hasAttribute('data-dev-content-readonly')).toBe(false);
    expect(el?.textContent).toBe('First Post');
  });

  it('emits data-dev-content-readonly for the slug field of an id-anchored directory-backed key', () => {
    const { container } = render(<Text as="span" k="data.posts[@post_1].slug" />);
    const el = container.firstElementChild;
    expect(el?.getAttribute('data-dev-content-readonly')).toBe('');
    expect(el?.getAttribute('data-dev-content-key')).toBe('data.posts[@post_1].slug');
  });

  it('does NOT emit data-dev-content-readonly for a slug field in a non-directory-backed array', () => {
    const { container } = render(<Text as="span" k="data.blogPosts[@first-post].slug" />);
    expect(container.firstElementChild?.hasAttribute('data-dev-content-readonly')).toBe(false);
  });

  it('does NOT emit data-dev-content-readonly for a normal, non-collection key', () => {
    const { container } = render(<Text as="h1" k="home.hero.title" />);
    expect(container.firstElementChild?.hasAttribute('data-dev-content-readonly')).toBe(false);
  });

  it('emits data-dev-content-readonly for a positionally-anchored object item, and still renders the text', () => {
    const { container } = render(<Text as="h3" k="data.services[0].name" />);
    const el = container.firstElementChild;
    expect(el?.getAttribute('data-dev-content-readonly')).toBe('');
    expect(el?.textContent).toBe('Cash Offer');
  });

  it('does NOT emit data-dev-content-readonly for a positionally-anchored primitive item', () => {
    const { container } = render(<Text as="li" k="home.tags[0]" />);
    const el = container.firstElementChild;
    expect(el?.hasAttribute('data-dev-content-readonly')).toBe(false);
    expect(el?.textContent).toBe('alpha');
  });

  it('does NOT emit data-dev-content-readonly for an identity-anchored key', () => {
    const { container } = render(<Text as="h3" k="data.services[@svc_a1b2].name" />);
    expect(container.firstElementChild?.hasAttribute('data-dev-content-readonly')).toBe(false);
  });
});
