import { createElement, type CSSProperties, type ReactElement } from 'react';

import { resolveContentValue, shouldWithholdEditing, type ContentResolution } from './content-runtime';

/**
 * Semantic tags `<Text>` may render as. `a` is deliberately absent — use `<Link>` for editable
 * hrefs. `button` and `label` are deliberately absent too: `<Text>` takes only `k` / `as` /
 * `className` / `style` and never spreads props, so a button rendered this way can never carry
 * `type` or `onClick`, and a label can never carry `htmlFor` — neither can be functional through
 * this primitive.
 */
export type TextTag =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'p'
  | 'span'
  | 'li'
  | 'blockquote'
  | 'div';

/**
 * Props for `<Text>`: `k` is the dotted content key, `as` selects the rendered tag (default
 * `span`), and `className` / `style` style the rendered element. `style` is an explicit prop rather
 * than a spread — the no-spread invariant stands, so no event handler or attribute can reach the
 * element through it.
 */
export interface TextProps {
  readonly k: string;
  readonly as?: TextTag;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/**
 * Renders the resolved content value inside the requested semantic tag, tagged
 * with `data-dev-content-key` so the shipped inline-edit path can pick it up.
 *
 * Contract:
 * - A miss (unresolvable key, or a resolved value that isn't a string/number) renders an empty
 *   keyed element in production, with no telemetry — `console.*` is unavailable in this tree, and
 *   a reporting channel is out of scope for this layer. A key that drifts after publish is a
 *   permanently blank element that nobody is signaled about.
 * - `data-dev-content-key` is set unconditionally at runtime, including in production builds, so
 *   it reaches published customer HTML — unlike `source-mapper`'s `data-dev-*` attributes, which
 *   are stripped whenever `NODE_ENV === 'production'`. This is deliberate: a preview built in
 *   production mode must stay editable, and gating this attribute the same way would reproduce a
 *   known "nothing is editable" failure. The accepted cost is that published HTML carries the
 *   content-key namespace; a future layer that wants it stripped at publish only must gate on a
 *   publish-vs-preview signal (`VITE_ENABLE_SOURCE_MAPPING` is a candidate), not on production mode.
 * - `data-dev-content-readonly` is set (unconditionally, same as `data-dev-content-key`) whenever
 *   `shouldWithholdEditing` says so — which includes a key that does not resolve, and a resolved
 *   value that is not a string or number, not just its structural withhold rules. The element keeps
 *   its content key — it still renders — but the editor honors the marker and declines to offer text
 *   editing.
 * - The unresolved/wrong-type cases throw in development, so they reach a render only in a
 *   production build, where the element would otherwise carry a bare content key and be offered for
 *   editing while any write to it fails server-side.
 */
export function Text({ k, as = 'span', className, style }: TextProps): ReactElement {
  const resolution: ContentResolution = resolveContentValue(k);
  const attrs: Record<string, string | CSSProperties | undefined> = {
    className,
    style,
    'data-dev-content-key': k,
  };
  if (shouldWithholdEditing(k, resolution)) {
    attrs['data-dev-content-readonly'] = '';
  }

  if (!resolution.found) {
    if (import.meta.env.DEV) {
      throw new Error(`[airo-content] <Text k="${k}"> did not resolve: ${resolution.reason}`);
    }
    return createElement(as, attrs);
  }

  const value: unknown = resolution.value;
  if (typeof value !== 'string' && typeof value !== 'number') {
    if (import.meta.env.DEV) {
      throw new Error(
        `[airo-content] <Text k="${k}"> renders strings and numbers only; got ${typeof value}`,
      );
    }
    return createElement(as, attrs);
  }

  return createElement(as, attrs, String(value));
}
