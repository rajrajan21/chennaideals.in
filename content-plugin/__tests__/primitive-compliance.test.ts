import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  assertContentAuthority,
  gatedModulePath,
  isComponentPath,
  isFrameworkExemptPath,
  isGatedPath,
  classifyFileSource,
  enforcedSites,
  measurePrimitiveCompliance,
  type ComplianceReport,
  type I18nSite,
  type UnboundSite,
} from '../src/primitive-compliance';

const PAGE: string = 'src/pages/index.tsx';

function page(body: string, imports: string = "import { Text } from '@airo/content';"): string {
  return `${imports}\nexport default function Home() {\n  return (\n    <section>\n${body}\n    </section>\n  );\n}\n`;
}

function siteAt(sites: readonly UnboundSite[], kind: UnboundSite['kind']): UnboundSite | undefined {
  return sites.find((site: UnboundSite): boolean => site.kind === kind);
}

describe('attribute severity', () => {
  const ATTRIBUTE_PAGE: string = page(
    [
      '      <Text as="h1" k="pages.home.hero.title" />',
      '      <img src="/hero.jpg" alt="Sunlit dining room" />',
      '      <input placeholder="Your email" title="Email address" />',
      '      <input value="Send" />',
    ].join('\n'),
  );

  it('does not block a build whose only unbound strings are text attributes', () => {
    expect(() => assertContentAuthority(ATTRIBUTE_PAGE, PAGE)).not.toThrow();
  });

  it('still reports those attributes so the compliance measurement stays honest', () => {
    const report: ComplianceReport = classifyFileSource(ATTRIBUTE_PAGE, PAGE);
    expect(report.sites.map((site: UnboundSite): string => site.kind).sort()).toEqual([
      'alt',
      'input-value',
      'placeholder',
      'title',
    ]);
    expect(report.unbound).toBe(4);
    expect(report.bound).toBe(1);
  });

  it('blocks a build on unbound JSX text', () => {
    const source: string = page('      <h1>hello world</h1>');
    expect(() => assertContentAuthority(source, PAGE)).toThrow(/1 user-visible string/);
  });

  it('blocks a build on a literal JSX expression and a module-local string map', () => {
    const literal: string = page('      <p>{"hard-coded"}</p>');
    expect(() => assertContentAuthority(literal, PAGE)).toThrow(/not bound to content/);

    const localMap: string = page('      <p>{COPY.body}</p>', [
      "import { Text } from '@airo/content';",
      "const COPY = { body: 'From a local map' };",
    ].join('\n'));
    expect(() => assertContentAuthority(localMap, PAGE)).toThrow(/not bound to content/);
  });

  it('names only the enforced sites when text and attributes are both unbound', () => {
    const mixed: string = page([
      '      <h1>hello world</h1>',
      '      <img src="/hero.jpg" alt="Sunlit dining room" />',
    ].join('\n'));

    let message: string = '';
    try {
      assertContentAuthority(mixed, PAGE);
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('1 user-visible string');
    expect(message).toContain('hello world');
    expect(message).not.toContain('Sunlit dining room');
  });

  // Deliberately inverted. This asserted the opposite — that remediation must NOT mention
  // `virtual:content`, "the virtual module the write gate rejects" — which resolved the disagreement
  // between the gate and the authoring guidance in the wrong direction: it changed the correction to
  // match the gate instead of asking whether the gate was right. It was not. A page reading
  // `virtual:content` is the documented, inline-editable form, the linter always allowed it, and the
  // gate refusing it is what discarded index.tsx writes and roughly doubled dev build time.
  it('points remediation at the module the authoring guidance teaches', () => {
    let message: string = '';
    try {
      assertContentAuthority(page('      <h1>hello world</h1>'), PAGE);
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('virtual:content');
    expect(message).not.toContain('<Text');
  });
});

describe('enforcedSites', () => {
  it('keeps text kinds and drops attribute kinds', () => {
    const source: string = page([
      '      <h1>hello world</h1>',
      '      <img src="/hero.jpg" alt="Sunlit dining room" />',
      '      <input placeholder="Your email" />',
    ].join('\n'));
    const report: ComplianceReport = classifyFileSource(source, PAGE);

    expect(report.sites).toHaveLength(3);
    const enforced: readonly UnboundSite[] = enforcedSites(report.sites);
    expect(enforced).toHaveLength(1);
    expect(enforced[0]?.kind).toBe('jsx-text');
    expect(siteAt(enforced, 'alt')).toBeUndefined();
  });

  it('returns an empty list for an attribute-only page', () => {
    const report: ComplianceReport = classifyFileSource(
      page('      <img src="/hero.jpg" alt="Sunlit dining room" />'),
      PAGE,
    );
    expect(enforcedSites(report.sites)).toHaveLength(0);
  });
});

describe('i18n visibility', () => {
  const I18N_PAGE: string = page(
    [
      '      <Text as="h1" k="pages.home.hero.title" />',
      "      <p>{t('home.hero.subtitle')}</p>",
    ].join('\n'),
    "import { Text } from '@airo/content';\nimport { useTranslation } from 'react-i18next';",
  );

  it('records a translation call as an i18n site, not an unbound one', () => {
    const report: ComplianceReport = classifyFileSource(I18N_PAGE, PAGE);
    expect(report.sites).toEqual([]);
    expect(report.i18nSites).toHaveLength(1);
    expect(report.i18nSites[0]).toMatchObject({
      file: PAGE,
      callee: 't',
      key: 'home.hero.subtitle',
    });
  });

  it('leaves bound, unbound, and compliance untouched by i18n sites', () => {
    const report: ComplianceReport = classifyFileSource(I18N_PAGE, PAGE);
    expect(report.bound).toBe(1);
    expect(report.unbound).toBe(0);
    expect(report.compliance).toBe(1);
  });

  it('does not block a build on a translation call', () => {
    expect(() => assertContentAuthority(I18N_PAGE, PAGE)).not.toThrow();
  });

  it('records the i18n site of a member callee', () => {
    const source: string = page("      <p>{i18n.t('home.tagline')}</p>");
    const report: ComplianceReport = classifyFileSource(source, PAGE);
    expect(report.i18nSites).toHaveLength(1);
    expect(report.i18nSites[0]).toMatchObject({ callee: 'i18n.t', key: 'home.tagline' });
  });

  it('records an i18n site with no key when the translation key is not a literal', () => {
    const source: string = page('      <p>{t(headingKey)}</p>');
    const report: ComplianceReport = classifyFileSource(source, PAGE);
    expect(report.i18nSites).toHaveLength(1);
    expect(report.i18nSites[0].key).toBeUndefined();
  });

  it('reads a template-literal translation key the same way literal JSX text is read', () => {
    const source: string = page('      <p>{t(`home.tagline`)}</p>');
    const report: ComplianceReport = classifyFileSource(source, PAGE);
    expect(report.i18nSites).toHaveLength(1);
    expect(report.i18nSites[0].key).toBe('home.tagline');
  });

  // `rootIdentifier` in the same checker already treats optional chaining as equivalent to the
  // plain form, so a translation call must not become invisible for wearing a `?.`.
  it('records an optionally-called translation', () => {
    const source: string = page("      <p>{t?.('home.tagline')}</p>");
    const report: ComplianceReport = classifyFileSource(source, PAGE);
    expect(report.i18nSites).toHaveLength(1);
    expect(report.i18nSites[0]).toMatchObject({ callee: 't', key: 'home.tagline' });
  });

  it('records a translation reached through an optional member', () => {
    const source: string = page("      <p>{i18n?.t('home.tagline')}</p>");
    const report: ComplianceReport = classifyFileSource(source, PAGE);
    expect(report.i18nSites).toHaveLength(1);
    expect(report.i18nSites[0]).toMatchObject({ callee: 'i18n.t', key: 'home.tagline' });
  });

  it('leaves a non-translation call out of the i18n bucket', () => {
    const source: string = page('      <p>{formatLabel(lang)}</p>');
    const report: ComplianceReport = classifyFileSource(source, PAGE);
    expect(report.i18nSites).toEqual([]);
    expect(report.sites).toEqual([]);
  });

  it('still refuses a literal that sits beside a translation call', () => {
    const source: string = page(
      ["      <p>{t('home.hero.subtitle')}</p>", '      <p>Contact us</p>'].join('\n'),
    );
    const report: ComplianceReport = classifyFileSource(source, PAGE);
    expect(report.i18nSites).toHaveLength(1);
    expect(enforcedSites(report.sites).map((site: UnboundSite): string => site.text)).toEqual([
      'Contact us',
    ]);
    expect(() => assertContentAuthority(source, PAGE)).toThrow(/1 user-visible string/);
  });

  it('records a translation call in a gated attribute', () => {
    const source: string = page('      <input placeholder={t(\'home.email\')} />');
    const report: ComplianceReport = classifyFileSource(source, PAGE);
    expect(report.i18nSites).toHaveLength(1);
    expect(report.i18nSites[0]).toMatchObject({ callee: 't', key: 'home.email' });
    expect(report.sites).toEqual([]);
  });

  it('accumulates i18n sites across a directory scan', async () => {
    const dir: string = await fs.mkdtemp(path.join(tmpdir(), 'i18n-scan-'));
    await fs.mkdir(path.join(dir, 'src', 'pages'), { recursive: true });
    await fs.writeFile(
      path.join(dir, 'src', 'pages', 'index.tsx'),
      page("      <p>{t('home.hero.subtitle')}</p>"),
    );
    await fs.writeFile(
      path.join(dir, 'src', 'pages', 'about.tsx'),
      page("      <p>{t('about.body')}</p>"),
    );

    const report: ComplianceReport = await measurePrimitiveCompliance(dir);

    expect(report.filesScanned).toBe(2);
    expect(report.i18nSites.map((site: I18nSite): string | undefined => site.key).sort()).toEqual([
      'about.body',
      'home.hero.subtitle',
    ]);
    expect(report.unbound).toBe(0);
  });

  it('says it refuses unbound literal text rather than claiming v9 has no unbound-text state', () => {
    const source: string = page('      <h1>hello world</h1>');
    expect(() => assertContentAuthority(source, PAGE)).toThrow(/unbound literal text/);
    expect(() => assertContentAuthority(source, PAGE)).not.toThrow(/no unbound-text state/);
  });
});

describe('scan completeness', () => {
  async function scanDir(files: Readonly<Record<string, string>>): Promise<ComplianceReport> {
    const dir: string = await fs.mkdtemp(path.join(tmpdir(), 'scan-errors-'));
    await fs.mkdir(path.join(dir, 'src', 'pages'), { recursive: true });
    for (const [name, source] of Object.entries(files)) {
      await fs.writeFile(path.join(dir, 'src', 'pages', name), source);
    }
    return measurePrimitiveCompliance(dir);
  }

  it('surfaces an unparseable file in scanErrors', async () => {
    const report: ComplianceReport = await scanDir({
      'index.tsx': page('      <h1>Unbound headline</h1>'),
      'broken.tsx': 'export default function Broken() { return ( <div> }',
    });

    expect(report.scanErrors).toHaveLength(1);
    expect(report.scanErrors?.[0]).toContain('src/pages/broken.tsx');
  });

  it('reports no scanErrors when every file parses', async () => {
    const report: ComplianceReport = await scanDir({
      'index.tsx': page('      <Text as="h1" k="pages.home.hero.title" />'),
    });

    expect(report.scanErrors).toEqual([]);
  });
});

describe('literals reached through an expression', () => {
  it.each([
    ['a conditional', "      <p>{signedIn ? 'Welcome back' : 'Welcome'}</p>", ['Welcome back', 'Welcome']],
    ['a logical fallback', "      <p>{name || 'Guest user'}</p>", ['Guest user']],
    ['a concatenation', "      <p>{'Hello ' + name}</p>", ['Hello ']],
    ['an interpolated template', '      <p>{`Hello ${name} again`}</p>', ['Hello ', ' again']],
  ])('refuses %s in child text', (_label: string, body: string, expected: readonly string[]) => {
    const source: string = page(body);
    const report: ComplianceReport = classifyFileSource(source, PAGE);

    expect(enforcedSites(report.sites).map((site: UnboundSite): string => site.text)).toEqual(expected);
    expect(() => assertContentAuthority(source, PAGE)).toThrow(/unbound literal text/);
  });

  it('counts a conditional literal attribute without refusing it', () => {
    const source: string = page("      <img src=\"/a.jpg\" alt={big ? 'Large photo' : 'Small photo'} />");
    const report: ComplianceReport = classifyFileSource(source, PAGE);

    expect(report.sites.map((site: UnboundSite): string => site.kind)).toEqual(['alt', 'alt']);
    expect(enforcedSites(report.sites)).toEqual([]);
    expect(() => assertContentAuthority(source, PAGE)).not.toThrow();
  });

  it('leaves a fully dynamic expression alone', () => {
    const source: string = page('      <p>{name}</p>');
    const report: ComplianceReport = classifyFileSource(source, PAGE);

    expect(report.sites).toEqual([]);
  });

  it('does not treat a conditional as a single translation key', () => {
    const source: string = page("      <p>{t(cond ? 'a.key' : 'b.key')}</p>");
    const report: ComplianceReport = classifyFileSource(source, PAGE);

    expect(report.i18nSites).toHaveLength(1);
    expect(report.i18nSites[0]?.key).toBeUndefined();
  });
});

describe('content import resolution', () => {
  it('treats an aliased Text import as bound', () => {
    const source: string = page('      <Copy as="h1" k="pages.home.hero.title" />', "import { Text as Copy } from '@airo/content';");
    const report: ComplianceReport = classifyFileSource(source, PAGE);

    expect(report.bound).toBe(1);
    expect(report.sites).toEqual([]);
  });

  it('does not treat a same-named Text from another module as bound', () => {
    const source: string = page('      <Text as="h1">Hardcoded headline</Text>', "import { Text } from './ui/Text';");
    const report: ComplianceReport = classifyFileSource(source, PAGE);

    expect(report.bound).toBe(0);
    expect(enforcedSites(report.sites).map((site: UnboundSite): string => site.text)).toEqual([
      'Hardcoded headline',
    ]);
  });
});

describe('aggregate scan honours the framework exemption', () => {
  async function scanWith(files: Readonly<Record<string, string>>): Promise<ComplianceReport> {
    const dir: string = await fs.mkdtemp(path.join(tmpdir(), 'exempt-scan-'));
    for (const [rel, source] of Object.entries(files)) {
      const full: string = path.join(dir, rel);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, source);
    }
    return measurePrimitiveCompliance(dir);
  }

  it('excludes a named framework file from the measurement', async () => {
    const report: ComplianceReport = await scanWith({
      'src/layouts/Dashboard.tsx': page('      <p>Log out</p>'),
      'src/pages/index.tsx': page('      <Text as="h1" k="pages.home.hero.title" />'),
    });

    expect(report.unbound).toBe(0);
    expect(report.bound).toBe(1);
    expect(report.compliance).toBe(1);
    expect(report.filesScanned).toBe(1);
  });

  it('excludes an underscore-prefixed page from the measurement', async () => {
    const report: ComplianceReport = await scanWith({
      'src/pages/_404.tsx': page('      <p>Page not found</p>'),
      'src/pages/index.tsx': page('      <Text as="h1" k="pages.home.hero.title" />'),
    });

    expect(report.unbound).toBe(0);
    expect(report.filesScanned).toBe(1);
  });

  it('still measures a non-exempt page in the same tree', async () => {
    const report: ComplianceReport = await scanWith({
      'src/layouts/Dashboard.tsx': page('      <p>Log out</p>'),
      'src/components/Footer.tsx': page('      <p>All rights reserved</p>'),
    });

    expect(report.unbound).toBe(1);
    expect(report.sites.map((site: UnboundSite): string => site.text)).toEqual(['All rights reserved']);
  });
});

describe('template literal interpolations', () => {
  it('refuses a conditional wrapped in a template with no static text', () => {
    const source: string = page("      <p>{`${signedIn ? 'Welcome back' : 'Welcome'}`}</p>");
    const report: ComplianceReport = classifyFileSource(source, PAGE);

    expect(enforcedSites(report.sites).map((site: UnboundSite): string => site.text)).toEqual([
      'Welcome back',
      'Welcome',
    ]);
    expect(() => assertContentAuthority(source, PAGE)).toThrow(/unbound literal text/);
  });

  it('reports a static quasi and an interpolated branch in source order', () => {
    const source: string = page("      <p>{`Level: ${isPro ? 'Pro' : 'Free'}`}</p>");
    const report: ComplianceReport = classifyFileSource(source, PAGE);

    expect(enforcedSites(report.sites).map((site: UnboundSite): string => site.text)).toEqual([
      'Level: ',
      'Pro',
      'Free',
    ]);
  });

  it('does not refuse a template whose only static text is decorative', () => {
    const source: string = page('      <p>{`— ${name}`}</p>');
    const report: ComplianceReport = classifyFileSource(source, PAGE);

    expect(report.sites).toEqual([]);
  });
});

describe('src/layouts is gated', () => {
  const HEADER: string = 'src/layouts/parts/Header.tsx';
  const FOOTER: string = 'src/layouts/parts/Footer.tsx';

  it.each([HEADER, 'src/layouts/Website.tsx'])('gates %s', (rel: string) => {
    expect(isGatedPath(rel)).toBe(true);
  });

  // Dashboard chrome ("Profile", "Settings", "Log out") is framework copy, not the customer's, and it
  // was exempt before this root was gated. Widening the root must not change that.
  it('leaves src/layouts/Dashboard.tsx exempt', () => {
    expect(isFrameworkExemptPath('src/layouts/Dashboard.tsx')).toBe(true);
    expect(isGatedPath('src/layouts/Dashboard.tsx')).toBe(false);
  });

  // A layout MUST be able to read `virtual:content`, or gating this root deadlocks the agent: the
  // copy is refused inline and the only binding is refused too. `isComponentPath` is deliberately
  // narrower than `isGatedPath` for exactly this reason — do not widen it to layouts.
  it('does not treat a layout as a component', () => {
    expect(isComponentPath(HEADER)).toBe(false);
    expect(isComponentPath('src/components/Hero.tsx')).toBe(true);
  });

  // The shapes actually shipped in the template, which are the argument for gating this root: six
  // enforced sites across two files, and the nav array read twice in Header.
  it('refuses the shipped Header shape: a brand literal plus a nav array read twice', () => {
    const header: string = [
      "import { Link } from 'react-router';",
      'export default function Header() {',
      "  const navItems = [{ href: '/', label: 'Home' }, { href: '/about', label: 'About' }];",
      '  return (',
      '    <header>',
      '      <Link to="/">App</Link>',
      '      <nav>{navItems.map((i) => <Link key={i.href} to={i.href}>{i.label}</Link>)}</nav>',
      '      <div>{navItems.map((i) => <Link key={i.href} to={i.href}>{i.label}</Link>)}</div>',
      '    </header>',
      '  );',
      '}',
      '',
    ].join('\n');

    const sites: readonly UnboundSite[] = enforcedSites(classifyFileSource(header, HEADER).sites);

    expect(sites).toHaveLength(3);
    expect(sites.filter((s: UnboundSite): boolean => s.kind === 'local-map')).toHaveLength(2);
    expect(siteAt(sites, 'jsx-text')?.text).toBe('App');
    expect(() => assertContentAuthority(header, HEADER)).toThrow(/unbound literal text/);
  });

  it('refuses the shipped Footer shape: a copyright line and two link labels', () => {
    const footer: string = [
      "import { Link } from 'react-router';",
      'export default function Footer() {',
      '  const currentYear = new Date().getFullYear();',
      '  return (',
      '    <footer>',
      '      <div>© {currentYear} App. All rights reserved.</div>',
      '      <Link to="/privacy">Privacy</Link>',
      '      <Link to="/terms">Terms</Link>',
      '    </footer>',
      '  );',
      '}',
      '',
    ].join('\n');

    const sites: readonly UnboundSite[] = enforcedSites(classifyFileSource(footer, FOOTER).sites);

    expect(sites).toHaveLength(3);
    expect(sites.map((s: UnboundSite): string => s.kind)).toEqual(['jsx-text', 'jsx-text', 'jsx-text']);
    expect(() => assertContentAuthority(footer, FOOTER)).toThrow(/unbound literal text/);
  });

  // The exact shape `skills/content-system/skill.md` now prescribes for nav. A remedy the gate would
  // refuse is worse than no remedy: that mismatch between gate and guidance is what made the agent
  // rewrite the same page once per turn in #9661.
  // The shape the authoring guidance prescribes, and it must be one that can actually run. An interim
  // revision replaced it with a bare `.map()` on the premise that `@airo/content` has no bundler alias
  // and so fails at runtime. It does resolve: `contentPlugin`'s own `resolveId` maps the bare specifier
  // to `content-lib/src/index.ts`, which `SYNC_MANIFEST` force-syncs into every app, verified by
  // building a probe entry through the real `vite.config.ts` against an unresolvable control.
  //
  // The gate accepting it is necessary but not sufficient — a remedy the gate accepts and the bundler
  // rejects is worse than no remedy, because the agent follows it and then improvises when it breaks.
  // Runnability is not something this suite can assert; it is the reason the probe above was run.
  it('accepts the Collection-based nav the authoring guidance prescribes', () => {
    const remedy: string = [
      "import { Link } from 'react-router';",
      "import { Collection, Text } from '@airo/content';",
      "import { site } from 'virtual:content';",
      'export default function Header() {',
      '  return (',
      '    <header>',
      '      <Text k="site.brand" as="span" />',
      '      <nav>',
      '        <Collection k="site.nav">',
      '          {(item) => (',
      "            <Link to={String(item.value('href'))}>",
      '              <Text k={item.k(\'label\')} as="span" />',
      '            </Link>',
      '          )}',
      '        </Collection>',
      '      </nav>',
      '    </header>',
      '  );',
      '}',
      '',
    ].join('\n');

    const report: ComplianceReport = classifyFileSource(remedy, HEADER);

    expect(enforcedSites(report.sites)).toHaveLength(0);
    expect(report.bound).toBe(2);
    expect(() => assertContentAuthority(remedy, HEADER)).not.toThrow();
  });

  // A layout bound the documented way passes. `to={…}` is not a recognized site kind, so nav
  // destinations riding along in content are not a violation in either direction.
  it('accepts a layout that reads copy from the site key', () => {
    const bound: string = [
      "import { Link } from 'react-router';",
      "import { site } from 'virtual:content';",
      'export default function Header() {',
      '  return (',
      '    <header>',
      '      <Link to="/">{site.brand}</Link>',
      '      <nav>{site.nav.map((i) => <Link key={i.href} to={i.href}>{i.label}</Link>)}</nav>',
      '    </header>',
      '  );',
      '}',
      '',
    ].join('\n');

    expect(enforcedSites(classifyFileSource(bound, HEADER).sites)).toHaveLength(0);
    expect(() => assertContentAuthority(bound, HEADER)).not.toThrow();
  });
});

describe('only source modules are gated', () => {
  // The write gate rejects an unparseable file at `shape: 'file'`, and markdown does not parse as JS,
  // so a gated root that ignores the extension turns any write to a doc into a refusal naming no legal
  // fix. `isScannableSourceFile` already draws this line for the aggregate scan and `gatedModulePath`;
  // its own contract says the three callers must agree, and the write gate was the one that did not.
  //
  // `src/layouts/Website.md` is load-bearing here: this change gates `src/layouts`, which ships three
  // markdown docs, so without the extension guard a write to any of them would be refused as
  // unparseable.
  // `src/layouts/Website.md` is a forward guard, not coverage of this commit: `src/layouts` is not in
  // `GATED_ROOTS` yet, so it returns false with or without the guard. It becomes load-bearing when that
  // root is gated, which is why the template's three layout docs are the motivating case.
  it.each(['src/pages/notes.md', 'src/pages/index.mdx', 'src/layouts/Website.md'])(
    'does not gate %s',
    (rel: string) => {
      expect(isGatedPath(rel)).toBe(false);
    },
  );

  it.each(['src/pages/index.tsx', 'src/components/Hero.jsx', 'src/pages/about.ts', 'src/pages/legacy.js'])(
    'still gates %s',
    (rel: string) => {
      expect(isGatedPath(rel)).toBe(true);
    },
  );

  // The extension guard flipped a bare root from true to false. Unreachable today — all four callers
  // pass real filenames — but pinned so a future caller reading `isGatedPath` as "is this root gated"
  // finds the answer documented rather than surprising.
  it.each(['src/pages', 'src/components', 'src/layouts'])('treats the bare root %s as not a file', (rel: string) => {
    expect(isGatedPath(rel)).toBe(false);
  });

  // `assertContentAuthority` is the BUILD gate, and it already returned early on `parseError`, so
  // markdown never threw here with or without this change. The regression this fixes belongs to the
  // WRITE gate and is covered directly in `content-authority-gate.test.ts`. Kept only to pin that the
  // build gate still refuses a real gated module, so the extension guard did not widen the exemption.
  it('still refuses unbound copy in a gated module', () => {
    const unbound: string = 'export default function P(){return <h1>Book a table</h1>;}\n';

    expect(() => assertContentAuthority(unbound, 'src/pages/index.tsx')).toThrow(/unbound literal text/);
  });
});

describe('assertContentAuthority boundaries', () => {
  it('ignores a path outside the gated roots', () => {
    const source: string = page('      <h1>Unbound headline</h1>');

    expect(() => assertContentAuthority(source, 'src/lib/helpers.tsx')).not.toThrow();
    expect(() => assertContentAuthority(source, PAGE)).toThrow(/unbound literal text/);
  });

  it('defers an unparseable file to the bundler rather than refusing it', () => {
    const broken: string = 'export default function Broken() { return ( <div> }';

    expect(() => assertContentAuthority(broken, PAGE)).not.toThrow();
    expect(classifyFileSource(broken, PAGE).parseError).toBeDefined();
  });
});

describe('measurement covers every extension the gates check', () => {
  it('measures a .jsx page, which gatedModulePath would refuse', async () => {
    const dir: string = await fs.mkdtemp(path.join(tmpdir(), 'ext-scan-'));
    await fs.mkdir(path.join(dir, 'src', 'pages'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'pages', 'legacy.jsx'), page('      <p>Contact us</p>'));

    const report: ComplianceReport = await measurePrimitiveCompliance(dir);

    expect(report.filesScanned).toBe(1);
    expect(report.sites.map((site: UnboundSite): string => site.text)).toEqual(['Contact us']);
  });

  it('still skips a colocated test file', async () => {
    const dir: string = await fs.mkdtemp(path.join(tmpdir(), 'ext-skip-'));
    await fs.mkdir(path.join(dir, 'src', 'pages'), { recursive: true });
    await fs.writeFile(path.join(dir, 'src', 'pages', 'index.test.tsx'), page('      <p>Contact us</p>'));
    await fs.writeFile(path.join(dir, 'src', 'pages', 'about.test.jsx'), page('      <p>Contact us</p>'));

    const report: ComplianceReport = await measurePrimitiveCompliance(dir);

    expect(report.filesScanned).toBe(0);
    expect(report.sites).toEqual([]);
  });
});

describe('describeUnboundSites truncation', () => {
  it('names the overflow count once past the listing cap', () => {
    const many: string = page(
      Array.from({ length: 25 }, (_v: unknown, i: number): string => `      <p>Headline ${i}</p>`).join('\n'),
    );

    expect(() => assertContentAuthority(many, PAGE)).toThrow(/\b5 more\b/);
  });

  it('does not mention more sites when everything fits', () => {
    const few: string = page('      <p>Only headline</p>');

    expect(() => assertContentAuthority(few, PAGE)).toThrow(/Only headline/);
    expect(() => assertContentAuthority(few, PAGE)).not.toThrow(/more/);
  });
});

describe('test modules are recognized identically by the gates and the scanner', () => {
  const ROOT: string = path.join(path.sep, 'app');

  it.each(['about.test.ts', 'about.test.tsx', 'about.test.js', 'about.test.jsx'])(
    'exempts %s from both gates',
    (fileName: string) => {
      const rel: string = `src/pages/${fileName}`;
      const source: string = page('      <p>Fixture copy</p>');

      expect(isFrameworkExemptPath(rel)).toBe(true);
      expect(gatedModulePath(path.join(ROOT, 'src', 'pages', fileName), ROOT)).toBeUndefined();
      expect(() => assertContentAuthority(source, rel)).not.toThrow();
    },
  );

  it('still gates ordinary .jsx source', () => {
    const rel: string = 'src/pages/about.jsx';
    const source: string = page('      <p>Real copy</p>');

    expect(isFrameworkExemptPath(rel)).toBe(false);
    expect(gatedModulePath(path.join(ROOT, 'src', 'pages', 'about.jsx'), ROOT)).toBe(rel);
    expect(() => assertContentAuthority(source, rel)).toThrow(/unbound literal text/);
  });
});

describe('file-local copy bindings are caught at every scope', () => {
  // The rule collected module-scope declarations only, so the identical array inside the component
  // function was invisible. An agent refused for a literal could satisfy the gate by hoisting the
  // string into a function-local const — a refusal that teaches the wrong fix is worse than none.
  it.each([
    [
      'module scope',
      "const items = [{ title: 'Sourdough loaf' }];\nexport default function P() {\n  return <ul>{items.map((i) => <li>{i.title}</li>)}</ul>;\n}\n",
    ],
    [
      'function scope',
      "export default function P() {\n  const items = [{ title: 'Sourdough loaf' }];\n  return <ul>{items.map((i) => <li>{i.title}</li>)}</ul>;\n}\n",
    ],
    [
      'function scope, destructured map param',
      "export default function P() {\n  const items = [{ title: 'Sourdough loaf' }];\n  return <ul>{items.map(({ title }) => <li>{title}</li>)}</ul>;\n}\n",
    ],
  ])('refuses a local-map read declared at %s', (_label: string, source: string) => {
    const report: ComplianceReport = classifyFileSource(source, PAGE);

    expect(siteAt(report.sites, 'local-map')).toBeDefined();
    expect(enforcedSites(report.sites)).toHaveLength(1);
    expect(() => assertContentAuthority(source, PAGE)).toThrow(/not bound to content/);
  });

  // The cheapest evasion of all: name the string, then render the name.
  it.each([
    ['a string const', "export default function P() {\n  const title = 'Book a table';\n  return <h1>{title}</h1>;\n}\n"],
    ['a substitution-free template literal', 'export default function P() {\n  const title = `Book a table`;\n  return <h1>{title}</h1>;\n}\n'],
  ])('refuses text read from %s', (_label: string, source: string) => {
    const report: ComplianceReport = classifyFileSource(source, PAGE);

    expect(siteAt(report.sites, 'local-const')).toBeDefined();
    expect(enforcedSites(report.sites)).toHaveLength(1);
    expect(() => assertContentAuthority(source, PAGE)).toThrow(/not bound to content/);
  });

  it('names the declaration line so the refusal points at the string, not just the render', () => {
    const source: string = "export default function P() {\n  const title = 'Book a table';\n  return <h1>{title}</h1>;\n}\n";

    const site: UnboundSite | undefined = siteAt(classifyFileSource(source, PAGE).sites, 'local-const');

    expect(site?.declaredLine).toBe(2);
    expect(site?.line).toBe(3);
  });

  // A named decorative string must land where the inline one does, or it is refused for having a
  // name and the only fix the message names is inlining the character the rule elsewhere permits.
  it.each([
    ['an em dash', "export default function P() {\n  const sep = '\u2014';\n  return <h1>{sep}</h1>;\n}\n"],
    ['an empty string', "export default function P() {\n  const s = '';\n  return <h1>{s}</h1>;\n}\n"],
  ])('leaves %s read from a const alone, exactly as the inline form is left alone', (
    _label: string,
    source: string,
  ) => {
    expect(enforcedSites(classifyFileSource(source, PAGE).sites)).toHaveLength(0);
    expect(() => assertContentAuthority(source, PAGE)).not.toThrow();
  });

  // The object/array negative branch had no real control: `variants={fadeUp}` passes because the
  // attribute is not gated, so `bindingKind` could return 'local-map' unconditionally and stay green.
  // Read as child text, a string-free container is the only input that exercises it.
  it('leaves a string-free object read as child text alone', () => {
    const source: string =
      'export default function P() {\n  const counts = { visits: 3 };\n  return <h1>{counts.visits}</h1>;\n}\n';

    expect(enforcedSites(classifyFileSource(source, PAGE).sites)).toHaveLength(0);
  });

  // Two same-named bindings collapse into one entry, so neither declaration line can be trusted.
  // Naming the first would send the author to 'Book a table' to fix a violation about 'kg', and the
  // refusal offers no other location.
  it('names no declaration line when the same name is declared in two scopes', () => {
    const source: string = [
      "const label = 'Book a table';",
      'export default function A() {',
      '  return <h1>{label}</h1>;',
      '}',
      'export function B() {',
      "  const label = 'kg';",
      '  return <span>{label}</span>;',
      '}',
      '',
    ].join('\n');

    const sites: readonly UnboundSite[] = enforcedSites(classifyFileSource(source, PAGE).sites);

    expect(sites).toHaveLength(2);
    for (const site of sites) expect(site.declaredLine).toBeUndefined();
    expect(() => assertContentAuthority(source, PAGE)).toThrow(/declared in more than one scope/);
  });

  // A mixed-kind pair has no right answer: the entry is keyed by bare name, so neither declaration
  // can be shown to own a given read. First-declaration-wins is the chosen behaviour rather than an
  // incidental one, pinned here because `kind` is what the by-kind ramp breakdown counts. Both
  // members are enforced, so only the label moves, never the verdict.
  it('attributes a mixed-kind shadowed pair to the first declaration', () => {
    const source: string = [
      "const label = [{ t: 'Sourdough loaf' }];",
      'export default function A() {',
      '  return <h1>{label}</h1>;',
      '}',
      'export function B() {',
      "  const label = 'Book a table';",
      '  return <span>{label}</span>;',
      '}',
      '',
    ].join('\n');

    const sites: readonly UnboundSite[] = enforcedSites(classifyFileSource(source, PAGE).sites);

    expect(sites).toHaveLength(2);
    for (const site of sites) expect(site.kind).toBe('local-map');
  });

  it.each([
    ['a class name', "import { Text } from '@airo/content';\nexport default function P() {\n  const cls = 'text-lg';\n  return <Text k=\"a.b\" as=\"h1\" className={cls} />;\n}\n"],
    ['an animation variant object', "import { Text } from '@airo/content';\nexport default function P() {\n  const fadeUp = { ease: 'easeOut' };\n  return <div variants={fadeUp}><Text k=\"a.b\" /></div>;\n}\n"],
    ['a value derived from props', 'export default function P({ d }) {\n  const t = d.title;\n  return <h1>{t}</h1>;\n}\n'],
    ['a template literal with a substitution', 'export default function P({ n }) {\n  const t = `Hi ${n}`;\n  return <h1>{t}</h1>;\n}\n'],
  ])('leaves %s alone, because it never reaches a gated text position as a fixed string', (
    _label: string,
    source: string,
  ) => {
    expect(enforcedSites(classifyFileSource(source, PAGE).sites)).toHaveLength(0);
  });
});

describe('a local binding read into an attribute stays counted, never refused', () => {
  // Refusing `alt={x}` while accepting `alt="…"` left an unbound alt with no legal fix but to inline
  // the string — the shape the rule exists to discourage. Attributes have no binding primitive, so a
  // local read there is recorded under the attribute's own counted-only kind.
  it.each([
    ['alt', "export default function P() {\n  const a = 'A plated dish';\n  return <img src=\"/x.png\" alt={a} />;\n}\n", 'alt'],
    ['placeholder', "export default function P() {\n  const ph = 'Your email';\n  return <input placeholder={ph} />;\n}\n", 'placeholder'],
    ['title', "export default function P() {\n  const t = 'Open in a new tab';\n  return <a href=\"/x\" title={t} />;\n}\n", 'title'],
    [
      'alt from a local map',
      "const alts = { hero: 'A plated dish' };\nexport default function P() {\n  return <img src=\"/x.png\" alt={alts.hero} />;\n}\n",
      'alt',
    ],
  ])('records %s read from a local binding as its attribute kind', (_label: string, source: string, kind: string) => {
    const report: ComplianceReport = classifyFileSource(source, PAGE);

    expect(siteAt(report.sites, kind as UnboundSite['kind'])).toBeDefined();
    expect(enforcedSites(report.sites)).toHaveLength(0);
    expect(() => assertContentAuthority(source, PAGE)).not.toThrow();
  });
});
