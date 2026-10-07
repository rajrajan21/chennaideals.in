import { describe, it, expect } from 'vitest';
import {
  collectAuthoredKeys,
  type AuthoredField,
  type AuthoredKey,
  type AuthoredKeyReport,
} from '../src/authored-keys';

function keysOf(report: AuthoredKeyReport): readonly string[] {
  return report.keys.map((authored: { key: string }): string => authored.key);
}

describe('resolveContentValue collection', () => {
  it('collects a key from the imported resolver', () => {
    const report: AuthoredKeyReport = collectAuthoredKeys(
      "import { resolveContentValue } from '@airo/content';\nexport const a = resolveContentValue('pages.home.title');\n",
    );

    expect(keysOf(report)).toEqual(['pages.home.title']);
    expect(report.keys[0]?.use).toBe('resolve');
  });

  it('collects a key from an aliased import', () => {
    const report: AuthoredKeyReport = collectAuthoredKeys(
      "import { resolveContentValue as content } from '@airo/content';\nexport const a = content('pages.home.title');\n",
    );

    expect(keysOf(report)).toEqual(['pages.home.title']);
  });

  it('ignores a same-named local helper that is not the content resolver', () => {
    const report: AuthoredKeyReport = collectAuthoredKeys(
      "function resolveContentValue(k: string) { return k; }\nexport const a = resolveContentValue('not.a.content.key');\n",
    );

    expect(keysOf(report)).toEqual([]);
  });

  it('records a non-literal argument as skipped rather than dropping it', () => {
    const report: AuthoredKeyReport = collectAuthoredKeys(
      "import { resolveContentValue } from '@airo/content';\nexport const a = resolveContentValue(dynamicKey);\n",
    );

    expect(keysOf(report)).toEqual([]);
    expect(report.skipped).toHaveLength(1);
  });
});

const IMPORTS: string = "import { Text, Collection, resolveContentValue } from '@airo/content';";

function collect(body: string, imports: string = IMPORTS): AuthoredKeyReport {
  return collectAuthoredKeys(`${imports}\nexport default function P() { return (${body}); }`);
}

describe('collectAuthoredKeys — literal keys', (): void => {
  it('collects a <Text> key and records its use', (): void => {
    const r: AuthoredKeyReport = collect('<Text as="h1" k="pages.home.hero.headline" />');
    expect(r.keys).toEqual([{ key: 'pages.home.hero.headline', line: 2, use: 'text' }]);
    expect(r.fields).toEqual([]);
    expect(r.skipped).toEqual([]);
  });

  it('collects a <Collection> key as a collection use', (): void => {
    const r: AuthoredKeyReport = collect('<Collection k="pages.home.menu.items">{(item) => <div />}</Collection>');
    expect(r.keys).toEqual([{ key: 'pages.home.menu.items', line: 2, use: 'collection' }]);
  });

  it('collects a resolveContentValue key', (): void => {
    const r: AuthoredKeyReport = collect('<img alt={resolveContentValue("pages.home.hero.alt")} />');
    expect(r.keys).toEqual([{ key: 'pages.home.hero.alt', line: 2, use: 'resolve' }]);
  });

  it('reads a key through a braced string literal', (): void => {
    const r: AuthoredKeyReport = collect('<Text k={"pages.home.a.b"} />');
    expect(r.keys.map((k: AuthoredKey): string => k.key)).toEqual(['pages.home.a.b']);
  });

  it('honours an import alias', (): void => {
    const r: AuthoredKeyReport = collect(
      '<Copy k="pages.home.hero.headline" />',
      "import { Text as Copy } from '@airo/content';",
    );
    expect(r.keys).toEqual([{ key: 'pages.home.hero.headline', line: 2, use: 'text' }]);
  });

  it('ignores a <Text> that did not come from @airo/content', (): void => {
    const r: AuthoredKeyReport = collect('<Text k="pages.home.a" />', "import { Text } from './local-text';");
    expect(r.keys).toEqual([]);
    expect(r.skipped).toEqual([]);
  });
});

describe('collectAuthoredKeys — collection-relative fields', (): void => {
  it('resolves item.k() against its enclosing Collection', (): void => {
    const r: AuthoredKeyReport = collect(
      '<Collection k="pages.home.menu.items">{(item) => <Text k={item.k("name")} />}</Collection>',
    );
    expect(r.fields).toEqual([
      { root: 'pages.home.menu.items', chain: [], field: 'name', line: 2, use: 'text' },
    ]);
  });

  it('threads a nested Collection through its parent field', (): void => {
    const r: AuthoredKeyReport = collect(
      [
        '<Collection k="pages.home.schedule.days">{(day) => (',
        '  <Collection k={day.k("classes")}>{(cls) => <Text k={cls.k("name")} />}</Collection>',
        ')}</Collection>',
      ].join('\n'),
    );
    const leaf: AuthoredField | undefined = r.fields.find((f: AuthoredField): boolean => f.field === 'name');
    expect(leaf).toEqual({
      root: 'pages.home.schedule.days',
      chain: ['classes'],
      field: 'name',
      line: 3,
      use: 'text',
    });
  });

  it('reports the nested collection root itself as a field to check', (): void => {
    const r: AuthoredKeyReport = collect(
      [
        '<Collection k="pages.home.schedule.days">{(day) => (',
        '  <Collection k={day.k("classes")}>{(cls) => <Text k={cls.k("name")} />}</Collection>',
        ')}</Collection>',
      ].join('\n'),
    );
    expect(r.fields).toContainEqual({
      root: 'pages.home.schedule.days',
      chain: [],
      field: 'classes',
      line: 3,
      use: 'collection',
    });
  });

  it('does not resolve a nested collection root against itself', (): void => {
    // Both callbacks bind `item`. The `k={item.k('classes')}` prop is lexically outside the inner
    // callback, so it must resolve against the OUTER collection, not the one it sits on.
    const r: AuthoredKeyReport = collect(
      [
        '<Collection k="pages.home.schedule.days">{(item) => (',
        '  <Collection k={item.k("classes")}>{(item) => <Text k={item.k("name")} />}</Collection>',
        ')}</Collection>',
      ].join('\n'),
    );
    expect(r.fields).toContainEqual({
      root: 'pages.home.schedule.days',
      chain: [],
      field: 'classes',
      line: 3,
      use: 'collection',
    });
    expect(r.fields).toContainEqual({
      root: 'pages.home.schedule.days',
      chain: ['classes'],
      field: 'name',
      line: 3,
      use: 'text',
    });
  });

  it('attributes an outer item read from inside a nested collection to the OUTER root', (): void => {
    // The row shows the day's label beside each class name. `day.k('label')` is lexically inside the
    // inner collection but binds to the outer one; attributing it to the nearest <Collection> would
    // check `label` against class items and report a phantom missing key.
    const r: AuthoredKeyReport = collect(
      [
        '<Collection k="pages.home.schedule.days">{(day) => (',
        '  <Collection k={day.k("classes")}>{(cls) => (',
        '    <><Text k={day.k("label")} /><Text k={cls.k("name")} /></>',
        '  )}</Collection>',
        ')}</Collection>',
      ].join('\n'),
    );
    expect(r.fields).toContainEqual({
      root: 'pages.home.schedule.days',
      chain: [],
      field: 'label',
      line: 4,
      use: 'text',
    });
    expect(r.fields).toContainEqual({
      root: 'pages.home.schedule.days',
      chain: ['classes'],
      field: 'name',
      line: 4,
      use: 'text',
    });
  });

  it('takes the nearest enclosing binding when two collections shadow a name', (): void => {
    const r: AuthoredKeyReport = collect(
      [
        '<Collection k="pages.home.outer">{(item) => (',
        '  <Collection k="pages.home.inner">{(item) => <Text k={item.k("title")} />}</Collection>',
        ')}</Collection>',
      ].join('\n'),
    );
    expect(r.fields).toEqual([
      { root: 'pages.home.inner', chain: [], field: 'title', line: 3, use: 'text' },
    ]);
  });

  it('skips an item.k() with no enclosing Collection', (): void => {
    const r: AuthoredKeyReport = collect('<Text k={item.k("name")} />');
    expect(r.fields).toEqual([]);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]!.text).toContain('item.k("name")');
  });
});

describe('collectAuthoredKeys — what it cannot check', (): void => {
  it('skips a computed key rather than dropping it', (): void => {
    const r: AuthoredKeyReport = collect('<Text k={someVar} />');
    expect(r.keys).toEqual([]);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]!.text).toContain('someVar');
  });

  it('skips an interpolated template literal', (): void => {
    const r: AuthoredKeyReport = collect('<Text k={`pages.home.${section}.title`} />');
    expect(r.keys).toEqual([]);
    expect(r.skipped).toHaveLength(1);
  });

  it('skips item.k() with a computed field', (): void => {
    const r: AuthoredKeyReport = collect(
      '<Collection k="pages.home.items">{(item) => <Text k={item.k(fieldName)} />}</Collection>',
    );
    expect(r.fields).toEqual([]);
    expect(r.skipped).toHaveLength(1);
  });

  it('reports a parse error instead of an empty result', (): void => {
    const r: AuthoredKeyReport = collectAuthoredKeys('export default function P( {');
    expect(r.parseError).toBeDefined();
    expect(r.keys).toEqual([]);
  });

  it('caps skipped source text so one long expression cannot flood a report', (): void => {
    const long: string = `someHelper(${'a'.repeat(150)})`;
    const r: AuthoredKeyReport = collect(`<Text k={${long}} />`);
    expect(r.parseError).toBeUndefined();
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]!.text.length).toBeLessThanOrEqual(80);
  });
});
