import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Plugin } from 'vite';
import { contentPlugin, validateContentEager } from '../src/index';
import { z } from 'zod';

describe('content-plugin inert safety', () => {
  function makeServer(getModuleById: () => unknown = () => undefined) {
    const watcherAdd = vi.fn();
    const handlers: Record<string, (file: string) => void> = {};
    const on = vi.fn((event: string, cb: (file: string) => void) => {
      handlers[event] = cb;
    });
    const reloadModule = vi.fn(async () => {});
    const server = {
      watcher: { add: watcherAdd, on },
      moduleGraph: { getModuleById },
      config: { logger: { info: vi.fn(), error: vi.fn() } },
      reloadModule,
      ws: { send: vi.fn() },
    };
    return { server, watcherAdd, on, handlers, reloadModule };
  }

  it('does NOT call watcher.add when contentDir is absent', () => {
    const plugin = contentPlugin({ contentDir: 'src/content' });
    // @ts-expect-error minimal config stub
    plugin.configResolved?.({ root: '/tmp/nonexistent-app-root-xyz-absent' });
    const { server, watcherAdd } = makeServer();
    // @ts-expect-error minimal server stub
    plugin.configureServer?.(server);
    expect(watcherAdd).not.toHaveBeenCalled();
  });

  it('arms reload handlers even when contentDir is absent at boot, so late-created content hot-reloads', () => {
    const plugin = contentPlugin({ contentDir: 'src/content' });
    const root = '/tmp/nonexistent-app-root-xyz-late';
    // @ts-expect-error minimal config stub
    plugin.configResolved?.({ root });
    // Virtual module is already in the graph (page imported it before content existed).
    const getModuleById = vi.fn(() => ({}));
    const { server, on, handlers, reloadModule } = makeServer(getModuleById);
    // @ts-expect-error minimal server stub
    plugin.configureServer?.(server);

    // Handlers must be registered despite no src/content at boot.
    expect(on).toHaveBeenCalledWith('change', expect.any(Function));
    expect(on).toHaveBeenCalledWith('add', expect.any(Function));

    // A content file created later under contentDir triggers a reload.
    handlers.add?.(path.join(root, 'src/content/data/recipes.json'));
    expect(getModuleById).toHaveBeenCalled();
    expect(reloadModule).toHaveBeenCalled();
  });

  it('DOES call watcher.add when contentDir exists', async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'airo-inert-'));
    try {
      const contentDir = path.join(tmpRoot, 'src/content');
      await fs.mkdir(contentDir, { recursive: true });
      await fs.writeFile(path.join(contentDir, 'site.json'), '{}', 'utf8');

      const plugin = contentPlugin({ contentDir: 'src/content' });
      // @ts-expect-error minimal config stub
      plugin.configResolved?.({ root: tmpRoot });
      const { server, watcherAdd } = makeServer();
      // @ts-expect-error minimal server stub
      plugin.configureServer?.(server);
      expect(watcherAdd).toHaveBeenCalledWith(contentDir);
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    }
  });
});

const VIRTUAL_ID = 'virtual:content';
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;

async function mkTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'airo-content-'));
}

async function writeFile(p: string, contents: string): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, contents, 'utf8');
}

async function initPlugin(root: string): Promise<Plugin> {
  const plugin = contentPlugin();
  const config = { root } as any;
  if (typeof plugin.configResolved === 'function') {
    await (plugin.configResolved as any).call(plugin, config);
  }
  return plugin;
}

async function loadVirtual(plugin: Plugin): Promise<string> {
  const resolved = await (plugin.resolveId as any).call(plugin, VIRTUAL_ID);
  expect(resolved).toBe(RESOLVED_VIRTUAL_ID);
  const loaded = await (plugin.load as any).call(plugin, RESOLVED_VIRTUAL_ID);
  expect(typeof loaded).toBe('string');
  return loaded as string;
}

describe('contentPlugin', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkTempRoot();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('resolves the virtual module id', async () => {
    const plugin = await initPlugin(root);
    const resolved = await (plugin.resolveId as any).call(plugin, VIRTUAL_ID);
    expect(resolved).toBe(RESOLVED_VIRTUAL_ID);
    const unresolved = await (plugin.resolveId as any).call(plugin, 'some-other-id');
    expect(unresolved).toBeUndefined();
  });

  it('emits an empty module when no content exists', async () => {
    const plugin = await initPlugin(root);
    const code = await loadVirtual(plugin);
    expect(code.trim()).toBe(
      'if (import.meta.hot) {\n' +
      '  import.meta.hot.accept(() => {\n' +
      '    import.meta.hot.invalidate();\n' +
      '  });\n' +
      '}'
    );
  });

  it('discovers site.json and emits a typed export', async () => {
    await writeFile(
      path.join(root, 'src/content/site.json'),
      `{"brand":"Acme"}`,
    );
    const plugin = await initPlugin(root);
    const code = await loadVirtual(plugin);
    expect(code).toContain('export const site =');
    expect(code).toContain('"brand": "Acme"');
  });

  it('discovers pages and data in parallel', async () => {
    await writeFile(
      path.join(root, 'src/content/pages/home.json'),
      `{"hero":{"title":"Hello"}}`,
    );
    await writeFile(
      path.join(root, 'src/content/data/products.json'),
      `[{"id":"a","name":"A"}]`,
    );
    const plugin = await initPlugin(root);
    const code = await loadVirtual(plugin);
    expect(code).toContain('export const home =');
    expect(code).toContain('"title": "Hello"');
    expect(code).toContain('export const products =');
    expect(code).toContain('"id": "a"');
  });

  it('validates through schemas when schemas.ts exists', async () => {
    await writeFile(path.join(root, 'src/content/schemas.ts'), `export const schemas = {};`);
    await writeFile(
      path.join(root, 'src/content/site.json'),
      `{"brand":"Acme"}`,
    );
    const plugin = await initPlugin(root);
    const code = await loadVirtual(plugin);
    expect(code).toContain(`import { schemas } from '/src/content/schemas';`);
    expect(code).toContain('schemas.site ?? identity');
  });

  it('skips validation wrapping when schemas.ts is absent', async () => {
    await writeFile(
      path.join(root, 'src/content/site.json'),
      `{"brand":"Acme"}`,
    );
    const plugin = await initPlugin(root);
    const code = await loadVirtual(plugin);
    expect(code).not.toContain('schemas.site');
    expect(code).not.toContain('identity');
  });

  it('rejects invalid content keys (non-identifier filenames)', async () => {
    // Still fatal after D1: a non-identifier name is unquotable in the generated
    // .d.ts and unreachable by source-mapper attribution, so accepting it as a
    // nested key would render content that cannot be edited.
    await writeFile(
      path.join(root, 'src/content/pages/not valid.json'),
      `{"ok":true}`,
    );
    const plugin = await initPlugin(root);
    await expect(loadVirtual(plugin)).rejects.toThrow(/invalid content key/);
  });

  it('rejects a hyphenated filename, pointing at camelCase', async () => {
    await writeFile(path.join(root, 'src/content/data/blog-posts.json'), `[]`);
    const plugin = await initPlugin(root);
    await expect(loadVirtual(plugin)).rejects.toThrow(/invalid content key "blog-posts"/);
  });

  it('accepts a JS-reserved-word filename as a nested key instead of throwing (D1)', async () => {
    await writeFile(
      path.join(root, 'src/content/pages/export.json'),
      `{"ok":true}`,
    );
    const plugin = await initPlugin(root);
    const code = await loadVirtual(plugin);
    expect(code).toContain('"export":');
    expect(code).not.toContain('export const export ');
  });

  it('accepts other JS reserved words as nested keys (default, class, import) (D1)', async () => {
    for (const word of ['default', 'class', 'import']) {
      const r = await mkTempRoot();
      try {
        await writeFile(path.join(r, `src/content/data/${word}.json`), `{}`);
        const p = await initPlugin(r);
        const code = await loadVirtual(p);
        expect(code).toContain(`"${word}":`);
        expect(code).not.toContain(`export const ${word} `);
      } finally {
        await fs.rm(r, { recursive: true, force: true });
      }
    }
  });

  it('does not treat a shared bare name across pages/ and data/ as a collision (D4)', async () => {
    await writeFile(path.join(root, 'src/content/pages/dup.json'), `{"from":"pages"}`);
    await writeFile(path.join(root, 'src/content/data/dup.json'), `{}`);
    const plugin = await initPlugin(root);
    const code = await loadVirtual(plugin);
    expect(code).toContain('export const pages = {');
    expect(code).toContain('export const data = {');
    // Cross-namespace duplicates withhold the bare alias rather than throwing.
    expect(code).not.toContain('export const dup ');
  });

  it('still throws — and names both paths — when a file and directory collide inside the same namespace (D4)', async () => {
    await writeFile(path.join(root, 'src/content/data/dup.json'), `{}`);
    await fs.mkdir(path.join(root, 'src/content/data/dup'), { recursive: true });
    await fs.writeFile(path.join(root, 'src/content/data/dup/a.json'), `{}`, 'utf8');
    const plugin = await initPlugin(root);
    const err = await loadVirtual(plugin).catch((e: Error): Error => e);
    expect(err.message).toMatch(/duplicate content key "data\.dup"/);
    expect(err.message).toContain('src/content/data/dup.json');
    expect(err.message).toContain('src/content/data/dup/');
    expect(err.message).toContain('Delete or rename one of them');
  });

  it('surfaces malformed JSON as a parse error', async () => {
    await writeFile(
      path.join(root, 'src/content/data/products.json'),
      `{not json}`,
    );
    const plugin = await initPlugin(root);
    await expect(loadVirtual(plugin)).rejects.toThrow(/failed to parse/);
  });

  it('has enforce: "pre" so resolveId runs before Vite core plugins', async () => {
    const plugin = await initPlugin(root);
    expect(plugin.enforce).toBe('pre');
  });

  it('throws when a pages/ or data/ file is literally named site, pages, or data (D9, accepted break)', async () => {
    await writeFile(path.join(root, 'src/content/pages/data.json'), `{}`);
    const plugin = await initPlugin(root);
    await expect(loadVirtual(plugin)).rejects.toThrow(/reserved content key "data"/);
  });
});

describe('Task 2 — namespaced content keys', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkTempRoot();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('exports pages/ and data/ under their own namespaces', async () => {
    await writeFile(path.join(root, 'src/content/pages/blog.json'), `{"hero":"Writing"}`);
    await writeFile(path.join(root, 'src/content/data/blog/a.json'), `{"slug":"a"}`);
    const plugin = await initPlugin(root);
    const code = await loadVirtual(plugin);
    const m = (await evalModule(code)) as {
      pages: { blog: { hero: string } };
      data: { blog: Array<{ slug: string }> };
    };
    expect(m.pages.blog.hero).toBe('Writing');
    expect(m.data.blog.map((item) => item.slug)).toEqual(['a']);
  });

  it('still exports a bare alias when the bare name is unique', async () => {
    await writeFile(path.join(root, 'src/content/pages/home.json'), `{"hero":"Hi"}`);
    const plugin = await initPlugin(root);
    const code = await loadVirtual(plugin);
    const m = (await evalModule(code)) as { home: { hero: string }; pages: { home: { hero: string } } };
    expect(m.home).toEqual(m.pages.home);
  });

  it('withholds the bare alias for a cross-namespace collision instead of throwing', async () => {
    await writeFile(path.join(root, 'src/content/pages/blog.json'), `{"hero":"H"}`);
    await writeFile(path.join(root, 'src/content/data/blog.json'), `[]`);
    const plugin = await initPlugin(root);
    const code = await loadVirtual(plugin);
    const m = (await evalModule(code)) as Record<string, unknown>;
    expect(m.blog).toBeUndefined();
    expect((m.pages as { blog: unknown }).blog).toEqual({ hero: 'H' });
    expect((m.data as { blog: unknown }).blog).toEqual([]);
  });

  it('still throws when a file and a directory collide inside data/', async () => {
    await writeFile(path.join(root, 'src/content/data/blog/a.json'), `{"slug":"a"}`);
    await writeFile(path.join(root, 'src/content/data/blog.json'), `[]`);
    const plugin = await initPlugin(root);
    const err = await loadVirtual(plugin).catch((e: Error): Error => e);
    expect(err.message).toMatch(/duplicate content key "data\.blog"/);
    expect(err.message).toContain('src/content/data/blog/');
    expect(err.message).toContain('src/content/data/blog.json');
  });

  it('accepts a reserved word as a nested key', async () => {
    await writeFile(path.join(root, 'src/content/pages/new.json'), `{"hero":"New"}`);
    const plugin = await initPlugin(root);
    const code = await loadVirtual(plugin);
    const m = (await evalModule(code)) as { pages: { new: { hero: string } } };
    expect(m.pages.new.hero).toBe('New');
  });

  it('omits the flat fallback in the emitted expression for a colliding name', async () => {
    await writeFile(path.join(root, 'src/content/schemas.ts'), `export const schemas = {};`);
    await writeFile(path.join(root, 'src/content/pages/blog.json'), `{}`);
    await writeFile(path.join(root, 'src/content/data/blog.json'), `[]`);
    const code: string = await loadVirtual(await initPlugin(root));
    expect(code).toContain('schemas.pages?.blog ?? identity');
    expect(code).not.toContain('?? schemas.blog ??');
  });

  it('validates through either flat or nested schemas', async () => {
    await writeFile(path.join(root, 'src/content/schemas.ts'), `export const schemas = {};`);
    await writeFile(path.join(root, 'src/content/pages/home.json'), `{}`);
    const plugin = await initPlugin(root);
    const code = await loadVirtual(plugin);
    expect(code).toContain('schemas.pages?.home ?? schemas.home ?? identity');
  });

  it('site.json absent entirely: no throw, no site export', async () => {
    await writeFile(path.join(root, 'src/content/pages/home.json'), `{}`);
    const plugin = await initPlugin(root);
    const code = await loadVirtual(plugin);
    expect(code).not.toContain('export const site');
    const m = (await evalModule(code)) as Record<string, unknown>;
    expect(m.site).toBeUndefined();
  });

  it('a data/x.json file may hold an object rather than an array', async () => {
    await writeFile(path.join(root, 'src/content/data/settings.json'), `{"theme":"dark"}`);
    const plugin = await initPlugin(root);
    const code = await loadVirtual(plugin);
    const m = (await evalModule(code)) as { data: { settings: { theme: string } } };
    expect(m.data.settings).toEqual({ theme: 'dark' });
  });
});

describe('contentPlugin — resolveId block for direct JSON imports', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkTempRoot();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function callResolveId(
    plugin: Plugin,
    source: string,
    importer?: string,
  ): Promise<string | null | undefined> {
    return (plugin.resolveId as any).call(plugin, source, importer);
  }

  it('throws on an alias-resolved absolute path under src/content/', async () => {
    const plugin = await initPlugin(root);
    const abs = path.join(root, 'src/content/home.json');
    await expect(callResolveId(plugin, abs)).rejects.toThrow(
      /Direct import of .*home\.json is forbidden/,
    );
  });

  it('does NOT throw for the schemas module — the eager validator loads it via ssrLoadModule("/src/content/schemas")', async () => {
    const plugin = await initPlugin(root);
    // Extensionless, project-root-relative — exactly how validateContentEager
    // resolves it. Must pass through (load() then handles schemas.ts).
    await expect(callResolveId(plugin, '/src/content/schemas')).resolves.toBeUndefined();
  });

  it('does NOT throw for an absolute schemas.ts path', async () => {
    const plugin = await initPlugin(root);
    const abs = path.join(root, 'src/content/schemas.ts');
    await expect(callResolveId(plugin, abs)).resolves.toBeUndefined();
  });

  it('does NOT throw for virtual-content.d.ts under src/content (type-only, never a runtime import)', async () => {
    const plugin = await initPlugin(root);
    // content_scaffold emits this .d.ts INTO src/content/ (#5338); the guard
    // must let it pass — a type-declaration file is never a content-data import.
    await expect(callResolveId(plugin, '/src/content/virtual-content.d.ts')).resolves.toBeUndefined();
    const abs = path.join(root, 'src/content/virtual-content.d.ts');
    await expect(callResolveId(plugin, abs)).resolves.toBeUndefined();
  });

  it('still throws for a non-.d.ts, non-schemas file under src/content (e.g. a stray .ts)', async () => {
    const plugin = await initPlugin(root);
    const abs = path.join(root, 'src/content/helpers.ts');
    await expect(callResolveId(plugin, abs)).rejects.toThrow(/forbidden/);
  });

  it('throws on a relative import from a page that resolves under src/content/', async () => {
    const plugin = await initPlugin(root);
    const importer = path.join(root, 'src/pages/index.tsx');
    // From src/pages/ go up one to src/ then into content/
    await expect(
      callResolveId(plugin, '../content/home.json', importer),
    ).rejects.toThrow(/Direct import of .*home\.json is forbidden/);
  });

  it('throws on a project-root-relative import (/src/content/...)', async () => {
    const plugin = await initPlugin(root);
    await expect(
      callResolveId(plugin, '/src/content/pages/home.json'),
    ).rejects.toThrow(/forbidden/);
  });

  it('blocks imports with ?raw query suffix', async () => {
    const plugin = await initPlugin(root);
    const abs = path.join(root, 'src/content/site.json?raw');
    await expect(callResolveId(plugin, abs)).rejects.toThrow(/forbidden/);
  });

  it('blocks imports with ?url query suffix', async () => {
    const plugin = await initPlugin(root);
    const importer = path.join(root, 'src/pages/index.tsx');
    await expect(
      callResolveId(plugin, '../content/home.json?url', importer),
    ).rejects.toThrow(/forbidden/);
  });

  it('error message points at virtual:content as the correct pattern', async () => {
    const plugin = await initPlugin(root);
    const abs = path.join(root, 'src/content/site.json');
    await expect(callResolveId(plugin, abs)).rejects.toThrow(/virtual:content/);
  });

  it('still resolves virtual:content imports', async () => {
    const plugin = await initPlugin(root);
    const resolved = await callResolveId(plugin, 'virtual:content');
    expect(resolved).toBe(RESOLVED_VIRTUAL_ID);
  });

  it('does NOT block the virtual module\'s own schemas.ts import', async () => {
    const plugin = await initPlugin(root);
    const resolved = await callResolveId(plugin, '/src/content/schemas', RESOLVED_VIRTUAL_ID);
    expect(resolved).toBeUndefined();
  });

  it('blocks a .ts barrel file via relative import (non-JSON content bypass)', async () => {
    const plugin = await initPlugin(root);
    const importer = path.join(root, 'src/pages/index.tsx');
    await expect(
      callResolveId(plugin, '../content/index', importer),
    ).rejects.toThrow(/forbidden/);
  });

  it('blocks a .ts file via absolute path under src/content/', async () => {
    const plugin = await initPlugin(root);
    const abs = path.join(root, 'src/content/index.ts');
    await expect(callResolveId(plugin, abs)).rejects.toThrow(/forbidden/);
  });

  it('error message for non-JSON block points at virtual:content', async () => {
    const plugin = await initPlugin(root);
    const importer = path.join(root, 'src/pages/index.tsx');
    await expect(
      callResolveId(plugin, '../content/index', importer),
    ).rejects.toThrow(/virtual:content/);
  });

  it('does NOT block .json files outside src/content/', async () => {
    const plugin = await initPlugin(root);
    const abs = path.join(root, 'src/other/data.json');
    const resolved = await callResolveId(plugin, abs);
    expect(resolved).toBeUndefined();
  });

  it('does NOT block non-JSON sources', async () => {
    const plugin = await initPlugin(root);
    const resolved = await callResolveId(plugin, './some-component');
    expect(resolved).toBeUndefined();
  });

  it('does NOT block bare-specifier imports (node_modules packages)', async () => {
    const plugin = await initPlugin(root);
    const resolved = await callResolveId(plugin, 'some-pkg/content.json');
    expect(resolved).toBeUndefined();
  });

  it('resolves the @airo/content bare specifier to content-lib/src/index.ts under the project root', async () => {
    const plugin = await initPlugin(root);
    const resolved = await callResolveId(plugin, '@airo/content');
    const expected: string = path.resolve(root, 'content-lib/src/index.ts');
    expect(resolved).toBe(expected);
  });

  it('still resolves virtual:content imports (regression guard alongside @airo/content)', async () => {
    const plugin = await initPlugin(root);
    const resolved = await callResolveId(plugin, VIRTUAL_ID);
    expect(resolved).toBe(RESOLVED_VIRTUAL_ID);
  });

  it('does NOT resolve unrelated bare specifiers like "react"', async () => {
    const plugin = await initPlugin(root);
    const resolved = await callResolveId(plugin, 'react');
    expect(resolved).toBeUndefined();
  });
});

describe('contentPlugin — load hook guard for alias-resolved imports', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkTempRoot();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function callLoad(plugin: Plugin, id: string): Promise<string | null | undefined> {
    return (plugin.load as any).call(plugin, id);
  }

  it('blocks a resolved path under src/content/ that is not schemas.ts', async () => {
    const plugin = await initPlugin(root);
    const id = path.join(root, 'src/content/index.ts');
    await expect(callLoad(plugin, id)).rejects.toThrow(/forbidden/);
  });

  it('blocks a resolved path to a subdirectory file under src/content/', async () => {
    const plugin = await initPlugin(root);
    const id = path.join(root, 'src/content/helpers/utils.ts');
    await expect(callLoad(plugin, id)).rejects.toThrow(/forbidden/);
  });

  it('error message points at virtual:content', async () => {
    const plugin = await initPlugin(root);
    const id = path.join(root, 'src/content/index.ts');
    await expect(callLoad(plugin, id)).rejects.toThrow(/virtual:content/);
  });

  it('allows schemas.ts (imported by the virtual module)', async () => {
    const plugin = await initPlugin(root);
    const id = path.join(root, 'src/content/schemas.ts');
    const result = await callLoad(plugin, id);
    expect(result).toBeUndefined();
  });

  it('blocks a nested schemas.ts that is not the top-level schemas file', async () => {
    const plugin = await initPlugin(root);
    // pages/schemas.ts is NOT the real schemas file — must still be blocked
    const id = path.join(root, 'src/content/pages/schemas.ts');
    await expect(callLoad(plugin, id)).rejects.toThrow(/forbidden/);
  });

  it('allows the virtual module itself', async () => {
    await writeFile(path.join(root, 'src/content/site.json'), '{"brand":"x"}');
    const plugin = await initPlugin(root);
    const result = await callLoad(plugin, RESOLVED_VIRTUAL_ID);
    expect(typeof result).toBe('string');
  });

  it('does NOT block files outside src/content/', async () => {
    const plugin = await initPlugin(root);
    const id = path.join(root, 'src/pages/index.tsx');
    const result = await callLoad(plugin, id);
    expect(result).toBeUndefined();
  });
});

describe('contentPlugin — layout validator', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkTempRoot();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('throws when a JSON file sits directly at src/content/ (other than site.json)', async () => {
    await writeFile(path.join(root, 'src/content/home.json'), `{}`);
    await writeFile(path.join(root, 'src/content/pages/.keep'), '');
    const plugin = await initPlugin(root);
    await expect(loadVirtual(plugin)).rejects.toThrow(
      /Unexpected file src\/content\/home\.json/,
    );
  });

  it('error message names the correct pages/ and data/ subdirectories', async () => {
    await writeFile(path.join(root, 'src/content/home.json'), `{}`);
    const plugin = await initPlugin(root);
    await expect(loadVirtual(plugin)).rejects.toThrow(
      /src\/content\/pages\/home\.json[\s\S]*src\/content\/data\/home\.json/,
    );
  });

  it('accepts the canonical layout (site.json + pages/ + data/)', async () => {
    await writeFile(path.join(root, 'src/content/site.json'), `{"brand":"x"}`);
    await writeFile(path.join(root, 'src/content/pages/home.json'), `{"hero":{}}`);
    await writeFile(path.join(root, 'src/content/data/products.json'), `[]`);
    const plugin = await initPlugin(root);
    const code = await loadVirtual(plugin);
    expect(code).toContain('export const site =');
    expect(code).toContain('export const home =');
    expect(code).toContain('export const products =');
  });

  it('ignores non-JSON files at the top level (they are outside our enforcement scope)', async () => {
    await writeFile(path.join(root, 'src/content/site.json'), `{}`);
    await writeFile(path.join(root, 'src/content/README.md'), `# content`);
    const plugin = await initPlugin(root);
    await expect(loadVirtual(plugin)).resolves.toBeTruthy();
  });

  it('ignores subdirectories at the top level (they are our layout, not violations)', async () => {
    await writeFile(path.join(root, 'src/content/pages/home.json'), `{}`);
    await writeFile(path.join(root, 'src/content/data/products.json'), `[]`);
    const plugin = await initPlugin(root);
    await expect(loadVirtual(plugin)).resolves.toBeTruthy();
  });

  it('ignores a top-level .user-edits.json dotfile (CMS provenance sidecar, not content)', async () => {
    await writeFile(path.join(root, 'src/content/site.json'), `{"brand":"x"}`);
    await writeFile(
      path.join(root, 'src/content/.user-edits.json'),
      JSON.stringify({ lockedKeys: ['site.brand'] }),
    );
    const plugin = await initPlugin(root);
    const code = await loadVirtual(plugin);
    // No throw, and the dotfile is not emitted as a content export.
    expect(code).toContain('export const site =');
    expect(code).not.toContain('export const .user-edits');
    expect(code).not.toContain('user-edits');
  });

  it('still throws on a genuine stray top-level JSON file (home.json) even with a dotfile present', async () => {
    await writeFile(path.join(root, 'src/content/.user-edits.json'), `{"lockedKeys":[]}`);
    await writeFile(path.join(root, 'src/content/home.json'), `{}`);
    const plugin = await initPlugin(root);
    await expect(loadVirtual(plugin)).rejects.toThrow(
      /Unexpected file src\/content\/home\.json/,
    );
  });
});

async function evalModule(code: string): Promise<Record<string, unknown>> {
  const dataUrl: string = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  return import(dataUrl) as Promise<Record<string, unknown>>;
}

const RUNTIME_VIRTUAL_ID = 'virtual:content-runtime';
const RESOLVED_RUNTIME_VIRTUAL_ID = '\0' + RUNTIME_VIRTUAL_ID;

async function loadRuntimeModule(plugin: Plugin): Promise<string> {
  const resolved: unknown = await (plugin.resolveId as any).call(plugin, RUNTIME_VIRTUAL_ID);
  expect(resolved).toBe(RESOLVED_RUNTIME_VIRTUAL_ID);
  const loaded: unknown = await (plugin.load as any).call(plugin, RESOLVED_RUNTIME_VIRTUAL_ID);
  expect(typeof loaded).toBe('string');
  return loaded as string;
}

/**
 * The emitted runtime module imports the bare specifier `virtual:content`, which only Vite's
 * resolver understands. Splice in a `data:` URL wrapping the sibling `virtual:content` module's
 * own emitted code (itself eval-able, per `evalModule`) so the combined module is fully
 * resolvable by Node's ESM loader for the test.
 */
async function evalRuntimeModule(plugin: Plugin): Promise<Record<string, unknown>> {
  const contentCode: string = await loadVirtual(plugin);
  const runtimeCode: string = await loadRuntimeModule(plugin);
  const contentDataUrl: string = 'data:text/javascript;base64,' + Buffer.from(contentCode).toString('base64');
  const combinedCode: string = runtimeCode.replace(
    `import * as content from ${JSON.stringify('virtual:content')};`,
    `import * as content from ${JSON.stringify(contentDataUrl)};`,
  );
  expect(combinedCode).not.toBe(runtimeCode);
  return (await evalModule(combinedCode)) as unknown as Record<string, unknown>;
}

describe('virtual:content-runtime', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkTempRoot();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('resolves virtual:content-runtime', async () => {
    const plugin: Plugin = await initPlugin(root);
    const resolved: unknown = await (plugin.resolveId as any).call(plugin, RUNTIME_VIRTUAL_ID);
    expect(resolved).toBe(RESOLVED_RUNTIME_VIRTUAL_ID);
  });

  it('default-exports every content key as one object, including namespaced roots', async () => {
    await writeFile(path.join(root, 'src/content/pages/home.json'), `{"hero":{"title":"Hi"}}`);
    await writeFile(path.join(root, 'src/content/data/blog/a.json'), `{"slug":"a"}`);
    const plugin: Plugin = await initPlugin(root);
    const code: string = await loadRuntimeModule(plugin);
    expect(code).toContain('export default');
    expect(code).toContain('home');

    const mod = (await evalRuntimeModule(plugin)) as {
      default: {
        pages: { home: { hero: { title: string } } };
        data: { blog: Array<{ slug: string }> };
        home: { hero: { title: string } };
      };
    };
    expect(mod.default.pages.home.hero.title).toBe('Hi');
    expect(mod.default.data.blog.map((item) => item.slug)).toEqual(['a']);
    expect(mod.default.home).toEqual(mod.default.pages.home);
  });

  it('default-exports an empty object when there is no src/content', async () => {
    const pluginWithoutContent: Plugin = await initPlugin(root);
    const code: string = await loadRuntimeModule(pluginWithoutContent);
    expect(code).toContain('export default');
    const mod = (await evalRuntimeModule(pluginWithoutContent)) as { default: Record<string, unknown> };
    expect(mod.default).toEqual({});
  });
});

describe('virtual:content-runtime — collectionRoots', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkTempRoot();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('includes the canonical key and the bare alias for a directory-backed collection', async () => {
    await writeFile(path.join(root, 'src/content/data/blog/a.json'), `{"slug":"a"}`);
    const plugin: Plugin = await initPlugin(root);
    const mod = (await evalRuntimeModule(plugin)) as { collectionRoots: string[] };
    expect(mod.collectionRoots).toEqual(expect.arrayContaining(['data.blog', 'blog']));
  });

  it('excludes a file-backed data array (data/<name>.json is not directory-backed)', async () => {
    await writeFile(path.join(root, 'src/content/data/products.json'), `[]`);
    const plugin: Plugin = await initPlugin(root);
    const mod = (await evalRuntimeModule(plugin)) as { collectionRoots: string[] };
    expect(mod.collectionRoots).not.toContain('data.products');
    expect(mod.collectionRoots).not.toContain('products');
  });

  it('includes a collection whose bare name is a JS reserved word (proving aliasableNames, not exportableAliasNames)', async () => {
    // "new" cannot be an export binding (exportableAliasNames drops it), but it still
    // RESOLVES unambiguously, so the guard must cover it via aliasableNames instead.
    await writeFile(path.join(root, 'src/content/data/new/a.json'), `{"slug":"a"}`);
    const plugin: Plugin = await initPlugin(root);
    const mod = (await evalRuntimeModule(plugin)) as { collectionRoots: string[] };
    expect(mod.collectionRoots).toContain('data.new');
    expect(mod.collectionRoots).toContain('new');
  });
});

describe('collection-directory discovery', () => {
  async function makeRoot(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), 'airo-collection-'));
  }
  // loadVirtual + initPlugin helpers already exist in this file; reuse them.

  it('supports a route page and its collection sharing one name', async () => {
    // The original live repro: a /blog route wants its own hero/label copy AND
    // its posts. Both at once used to be a fatal duplicate-key build error.
    const root: string = await makeRoot();
    await fs.mkdir(path.join(root, 'src/content/pages'), { recursive: true });
    await fs.writeFile(path.join(root, 'src/content/pages/blog.json'), `{ "heading": "Latest" }`);
    await fs.mkdir(path.join(root, 'src/content/data/blog'), { recursive: true });
    await fs.writeFile(path.join(root, 'src/content/data/blog/a.json'), `{ "slug": "a" }`);
    const plugin = await initPlugin(root);
    const m = (await evalModule(await loadVirtual(plugin))) as {
      pages: { blog: { heading: string } };
      data: { blog: unknown[] };
    };
    expect(m.pages.blog.heading).toBe('Latest');
    expect(m.data.blog).toHaveLength(1);
  });

  it('emits a directory under data/ as an array keyed by the directory name', async () => {
    const root: string = await makeRoot();
    await fs.mkdir(path.join(root, 'src/content/data/blog'), { recursive: true });
    await fs.writeFile(path.join(root, 'src/content/data/blog/b.json'), `{ "slug": "b", "title": "B" }`);
    await fs.writeFile(path.join(root, 'src/content/data/blog/a.json'), `{ "slug": "a", "title": "A" }`);
    const plugin = await initPlugin(root);
    const mod: string = await loadVirtual(plugin);
    // deterministic filename order: a before b
    expect(mod).toContain('export const blog =');
    const blog = (await evalModule(mod)).blog as Array<{ slug: string }>;
    expect(blog.map((p) => p.slug)).toEqual(['a', 'b']);
  });

  it('throws on a directory name that is not a valid identifier', async () => {
    const root: string = await makeRoot();
    await fs.mkdir(path.join(root, 'src/content/data/blog-posts'), { recursive: true });
    await fs.writeFile(path.join(root, 'src/content/data/blog-posts/a.json'), `{ "slug": "a" }`);
    const plugin = await initPlugin(root);
    await expect(loadVirtual(plugin)).rejects.toThrow(/invalid content key/);
  });

  it('throws when a file and a directory both claim the same key', async () => {
    const root: string = await makeRoot();
    await fs.mkdir(path.join(root, 'src/content/data/blog'), { recursive: true });
    await fs.writeFile(path.join(root, 'src/content/data/blog/a.json'), `{ "slug": "a" }`);
    await fs.writeFile(path.join(root, 'src/content/data/blog.json'), `[]`);
    const plugin = await initPlugin(root);
    const err = await loadVirtual(plugin).catch((e: Error): Error => e);
    expect(err.message).toMatch(/duplicate content key "data\.blog"/);
    expect(err.message).toContain('src/content/data/blog/');
    expect(err.message).toContain('src/content/data/blog.json');
  });

  it('normalizes .md items to { ...frontmatter, content }', async () => {
    const root: string = await fs.mkdtemp(path.join(os.tmpdir(), 'airo-collection-md-'));
    await fs.mkdir(path.join(root, 'src/content/data/blog'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'src/content/data/blog/post.md'),
      `---\nslug: post\ntitle: Post\n---\n\n## Body\nhi`,
    );
    const plugin = await initPlugin(root);
    const blog = (await evalModule(await loadVirtual(plugin))).blog as Array<Record<string, unknown>>;
    expect(blog[0]).toEqual({ slug: 'post', title: 'Post', content: '## Body\nhi' });
  });

  it('supports a mix of .md and .json items in one collection', async () => {
    const root: string = await fs.mkdtemp(path.join(os.tmpdir(), 'airo-collection-mix-'));
    await fs.mkdir(path.join(root, 'src/content/data/blog'), { recursive: true });
    await fs.writeFile(path.join(root, 'src/content/data/blog/1-md.md'), `---\nslug: md\n---\nbody`);
    await fs.writeFile(path.join(root, 'src/content/data/blog/2-json.json'), `{ "slug": "json", "content": "c" }`);
    const plugin = await initPlugin(root);
    const blog = (await evalModule(await loadVirtual(plugin))).blog as Array<{ slug: string }>;
    expect(blog.map((p) => p.slug)).toEqual(['md', 'json']);
  });

  it('emits an existing-but-empty collection dir as []', async () => {
    const root: string = await fs.mkdtemp(path.join(os.tmpdir(), 'airo-collection-empty-'));
    await fs.mkdir(path.join(root, 'src/content/data/blog'), { recursive: true });
    const plugin = await initPlugin(root);
    const blog = (await evalModule(await loadVirtual(plugin))).blog;
    expect(blog).toEqual([]);
  });

  it('emits the blog collection shape lib/blog.ts consumes (id, slug, content, sorted by filename)', async () => {
    const root: string = await fs.mkdtemp(path.join(os.tmpdir(), 'airo-blog-contract-'));
    await fs.mkdir(path.join(root, 'src/content/data/blog'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'src/content/data/blog/morning-workout-benefits.md'),
      `---\nid: post-aaa\nslug: morning-workout-benefits\ntitle: Morning Workout\nexcerpt: e\npublishedAt: '2026-06-20T10:00:00Z'\npublished: true\n---\n\nBody copy.`,
    );
    await fs.writeFile(
      path.join(root, 'src/content/data/blog/another-post.json'),
      `{ "id": "post-bbb", "slug": "another-post", "title": "Another", "excerpt": "e", "publishedAt": "2026-06-21T10:00:00Z", "published": true, "content": "C" }`,
    );
    const plugin = await initPlugin(root);
    const blog = (await evalModule(await loadVirtual(plugin))).blog as Array<Record<string, unknown>>;
    expect(blog.map((p) => p.slug)).toEqual(['another-post', 'morning-workout-benefits']); // filename sort
    expect(blog.find((p) => p.slug === 'morning-workout-benefits')).toMatchObject({
      id: 'post-aaa', title: 'Morning Workout', content: 'Body copy.',
    });
  });

  it('derives slug from filename for a .md item with no slug in frontmatter', async () => {
    const root: string = await fs.mkdtemp(path.join(os.tmpdir(), 'airo-slug-md-'));
    await fs.mkdir(path.join(root, 'src/content/data/blog'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'src/content/data/blog/morning-workout.md'),
      `---\ntitle: Morning Workout\n---\n\nBody.`,
    );
    const plugin = await initPlugin(root);
    const blog = (await evalModule(await loadVirtual(plugin))).blog as Array<Record<string, unknown>>;
    expect(blog[0]?.slug).toBe('morning-workout');
  });

  it('derives slug from filename for a .json item with no slug field', async () => {
    const root: string = await fs.mkdtemp(path.join(os.tmpdir(), 'airo-slug-json-'));
    await fs.mkdir(path.join(root, 'src/content/data/blog'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'src/content/data/blog/my-post.json'),
      `{ "title": "My Post" }`,
    );
    const plugin = await initPlugin(root);
    const blog = (await evalModule(await loadVirtual(plugin))).blog as Array<Record<string, unknown>>;
    expect(blog[0]?.slug).toBe('my-post');
  });

  it('explicit slug in frontmatter/JSON overrides the filename-derived slug', async () => {
    const root: string = await fs.mkdtemp(path.join(os.tmpdir(), 'airo-slug-override-'));
    await fs.mkdir(path.join(root, 'src/content/data/blog'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'src/content/data/blog/2026-01-post.md'),
      `---\nslug: custom-slug\ntitle: Post\n---\n\nBody.`,
    );
    await fs.writeFile(
      path.join(root, 'src/content/data/blog/2026-02-post.json'),
      `{ "slug": "another-custom", "title": "Post 2" }`,
    );
    const plugin = await initPlugin(root);
    const blog = (await evalModule(await loadVirtual(plugin))).blog as Array<Record<string, unknown>>;
    expect(blog.find((p) => (p as Record<string, unknown>).title === 'Post')?.slug).toBe('custom-slug');
    expect(blog.find((p) => (p as Record<string, unknown>).title === 'Post 2')?.slug).toBe('another-custom');
  });
});

describe('self-review fixes', () => {
  it('Test A — pages/ subdir is ignored (no collection created, no throw)', async () => {
    const root: string = await fs.mkdtemp(path.join(os.tmpdir(), 'airo-sr-a-'));
    try {
      await fs.mkdir(path.join(root, 'src/content/pages/widgets'), { recursive: true });
      await fs.writeFile(path.join(root, 'src/content/pages/widgets/a.json'), `{"name":"a"}`);
      const plugin: Plugin = await initPlugin(root);
      const mod: string = await loadVirtual(plugin);
      const exports: Record<string, unknown> = await evalModule(mod);
      expect(exports.widgets).toBeUndefined();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('Test B — README.md and dotfiles are excluded inside a data/ collection', async () => {
    const root: string = await fs.mkdtemp(path.join(os.tmpdir(), 'airo-sr-b-'));
    try {
      await fs.mkdir(path.join(root, 'src/content/data/blog'), { recursive: true });
      await fs.writeFile(
        path.join(root, 'src/content/data/blog/post.md'),
        `---\nid: post-abc\nslug: post\ntitle: Real Post\nexcerpt: e\npublishedAt: '2026-01-01T00:00:00Z'\npublished: true\n---\n\nBody.`,
      );
      await fs.writeFile(path.join(root, 'src/content/data/blog/README.md'), `# ignore me`);
      await fs.writeFile(path.join(root, 'src/content/data/blog/.draft.md'), `draft content`);
      const plugin: Plugin = await initPlugin(root);
      const mod: string = await loadVirtual(plugin);
      const blog = (await evalModule(mod)).blog as Array<Record<string, unknown>>;
      expect(blog).toHaveLength(1);
      expect(blog[0]?.title).toBe('Real Post');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('Test C — value-with-colon frontmatter (URL colons are preserved)', async () => {
    const root: string = await fs.mkdtemp(path.join(os.tmpdir(), 'airo-sr-c-'));
    try {
      await fs.mkdir(path.join(root, 'src/content/data/blog'), { recursive: true });
      await fs.writeFile(
        path.join(root, 'src/content/data/blog/post.md'),
        `---\nid: post-xyz\nslug: post\ntitle: Colon Test\nexcerpt: e\npublishedAt: '2026-01-01T00:00:00Z'\npublished: true\nfeaturedImage: https://media.gettyimages.com/id/123/photo.jpg\n---\n\nBody.`,
      );
      const plugin: Plugin = await initPlugin(root);
      const mod: string = await loadVirtual(plugin);
      const blog = (await evalModule(mod)).blog as Array<Record<string, unknown>>;
      expect(blog[0]?.featuredImage).toBe('https://media.gettyimages.com/id/123/photo.jpg');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe('validateContentEager', () => {
  let root: string;
  let contentDir: string;
  const schemasImportPath = '/src/content/schemas';

  beforeEach(async () => {
    root = await mkTempRoot();
    contentDir = path.join(root, 'src/content');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const fakeServer = (schemas: Record<string, unknown> | undefined) => ({
    ssrLoadModule: async (_url: string) => ({ schemas }),
  });

  it('returns quietly when schemas.ts is absent (no validation to run)', async () => {
    await writeFile(path.join(contentDir, 'site.json'), `{"brand":"x"}`);
    const server = {
      ssrLoadModule: async () => {
        throw new Error('ssrLoadModule should not be called when schemas.ts is absent');
      },
    };
    await expect(
      validateContentEager(server, contentDir, schemasImportPath),
    ).resolves.toBeUndefined();
  });

  it('returns quietly when schemas.ts has no `schemas` export', async () => {
    await writeFile(path.join(contentDir, 'schemas.ts'), `export const other = 1;`);
    await writeFile(path.join(contentDir, 'site.json'), `{"brand":"x"}`);
    const server = fakeServer(undefined);
    await expect(
      validateContentEager(server, contentDir, schemasImportPath),
    ).resolves.toBeUndefined();
  });

  it('passes when every content file matches its schema', async () => {
    await writeFile(path.join(contentDir, 'schemas.ts'), `export const schemas = {};`);
    await writeFile(path.join(contentDir, 'site.json'), `{"brand":"Acme"}`);
    await writeFile(path.join(contentDir, 'pages/home.json'), `{"hero":{"title":"Hi"}}`);
    const server = fakeServer({
      site: z.object({ brand: z.string() }),
      home: z.object({ hero: z.object({ title: z.string() }) }),
    });
    await expect(
      validateContentEager(server, contentDir, schemasImportPath),
    ).resolves.toBeUndefined();
  });

  it('throws with the file path and the Zod error when content violates its schema', async () => {
    await writeFile(path.join(contentDir, 'schemas.ts'), `export const schemas = {};`);
    await writeFile(path.join(contentDir, 'site.json'), `{"brand": 42}`);
    const server = fakeServer({
      site: z.object({ brand: z.string() }),
    });
    await expect(
      validateContentEager(server, contentDir, schemasImportPath),
    ).rejects.toThrow(/site\.json does not match schemas\.site/);
  });

  it('validates through a nested schema when only the nested shape is registered', async () => {
    await writeFile(path.join(contentDir, 'schemas.ts'), `export const schemas = {};`);
    await writeFile(path.join(contentDir, 'pages/home.json'), `{"hero": 42}`);
    const server = fakeServer({
      pages: { home: z.object({ hero: z.string() }) },
    });
    await expect(
      validateContentEager(server, contentDir, schemasImportPath),
    ).rejects.toThrow(/does not match schemas\.home/);
  });

  it('ignores a flat schema when two entries claim the bare name', async () => {
    // A hand-written `schemas.blog` cannot say which of pages.blog / data.blog it describes.
    // Consulting it for both parsed the page object against the collection's array schema.
    await writeFile(path.join(contentDir, 'schemas.ts'), `export const schemas = {};`);
    await writeFile(path.join(contentDir, 'pages/blog.json'), `{"heading":"Latest"}`);
    await writeFile(path.join(contentDir, 'data/blog.json'), `[]`);
    const server = fakeServer({ blog: z.array(z.object({ id: z.string() })) });
    await expect(
      validateContentEager(server, contentDir, schemasImportPath),
    ).resolves.toBeUndefined();
  });

  it('still consults a flat schema when only one entry claims the name', async () => {
    await writeFile(path.join(contentDir, 'schemas.ts'), `export const schemas = {};`);
    await writeFile(path.join(contentDir, 'pages/solo.json'), `{"hero": 42}`);
    const server = fakeServer({ solo: z.object({ hero: z.string() }) });
    await expect(
      validateContentEager(server, contentDir, schemasImportPath),
    ).rejects.toThrow(/does not match schemas\.solo/);
  });

  it('accepts content that satisfies the nested schema', async () => {
    await writeFile(path.join(contentDir, 'schemas.ts'), `export const schemas = {};`);
    await writeFile(path.join(contentDir, 'pages/home.json'), `{"hero": "ok"}`);
    const server = fakeServer({
      pages: { home: z.object({ hero: z.string() }) },
    });
    await expect(
      validateContentEager(server, contentDir, schemasImportPath),
    ).resolves.toBeUndefined();
  });

  it('lets the nested schema govern when a flat one of the same name disagrees', async () => {
    await writeFile(path.join(contentDir, 'schemas.ts'), `export const schemas = {};`);
    await writeFile(path.join(contentDir, 'pages/home.json'), `{"hero": "ok"}`);
    // Flat schema would reject this content; the nested one accepts it. If the
    // nested lookup were dropped, the flat fallback would throw.
    const server = fakeServer({
      pages: { home: z.object({ hero: z.string() }) },
      home: z.object({ hero: z.number() }),
    });
    await expect(
      validateContentEager(server, contentDir, schemasImportPath),
    ).resolves.toBeUndefined();
  });

  it('skips content files whose key has no registered schema (pass-through by design)', async () => {
    await writeFile(path.join(contentDir, 'schemas.ts'), `export const schemas = {};`);
    await writeFile(path.join(contentDir, 'site.json'), `{"brand":"x"}`);
    await writeFile(path.join(contentDir, 'data/extras.json'), `["anything"]`);
    const server = fakeServer({
      site: z.object({ brand: z.string() }),
      // `extras` intentionally missing — should be tolerated
    });
    await expect(
      validateContentEager(server, contentDir, schemasImportPath),
    ).resolves.toBeUndefined();
  });

  it('surfaces an ssrLoadModule failure with the schemas.ts path', async () => {
    await writeFile(path.join(contentDir, 'schemas.ts'), `broken syntax {{{`);
    const server = {
      ssrLoadModule: async () => {
        throw new Error('syntax error');
      },
    };
    await expect(
      validateContentEager(server, contentDir, schemasImportPath),
    ).rejects.toThrow(/failed to evaluate .*schemas\.ts.*syntax error/s);
  });

  it('skips non-Zod schema entries without throwing (guard against non-parse exports)', async () => {
    await writeFile(path.join(contentDir, 'schemas.ts'), `export const schemas = {};`);
    await writeFile(path.join(contentDir, 'site.json'), `{"brand":"x"}`);
    // Pass a plain object without .parse — should not throw "schema.parse is not a function"
    const server = fakeServer({ site: { notASchema: true } as unknown as { parse: (v: unknown) => unknown } });
    await expect(
      validateContentEager(server, contentDir, schemasImportPath),
    ).resolves.toBeUndefined();
  });

  describe('collection schema validation', () => {
    it('validates a collection array against schemas.<key> = z.array(...)', async () => {
      await fs.mkdir(path.join(contentDir, 'data/blog'), { recursive: true });
      await writeFile(path.join(contentDir, 'schemas.ts'), `export const schemas = {};`);
      await writeFile(path.join(contentDir, 'data/blog/a.json'), `{ "slug": "a", "title": "A" }`);
      const server = fakeServer({
        blog: z.array(z.object({ slug: z.string(), title: z.string() })),
      });
      await expect(
        validateContentEager(server, contentDir, schemasImportPath),
      ).resolves.toBeUndefined();
    });

    it('throws with the collection key when an item violates the schema', async () => {
      await fs.mkdir(path.join(contentDir, 'data/blog'), { recursive: true });
      await writeFile(path.join(contentDir, 'schemas.ts'), `export const schemas = {};`);
      await writeFile(path.join(contentDir, 'data/blog/a.json'), `{ "slug": 123 }`);
      const server = fakeServer({
        blog: z.array(z.object({ slug: z.string() })),
      });
      await expect(
        validateContentEager(server, contentDir, schemasImportPath),
      ).rejects.toThrow(/schemas\.blog/);
    });
  });

  describe('stripped-field drift detection', () => {
    it('reports a root-level field that is in the JSON but absent from the schema, naming the path and file', async () => {
      await writeFile(path.join(contentDir, 'schemas.ts'), `export const schemas = {};`);
      const homePath = path.join(contentDir, 'pages/home.json');
      await writeFile(homePath, `{"hero":{"title":"Hi"},"newField":"oops"}`);
      const server = fakeServer({
        pages: { home: z.object({ hero: z.object({ title: z.string() }) }) },
      });
      const err: Error = await validateContentEager(server, contentDir, schemasImportPath).catch(
        (e: Error): Error => e,
      );
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('newField');
      expect(err.message).toContain(homePath);
      expect(err.message).toContain('schemas.ts');
      expect(err.message).toContain('content_scaffold');
      expect(err.message).not.toContain('not present in the content layer');
    });

    it('reports a field stripped from inside an array item, with a bracket index path', async () => {
      await writeFile(path.join(contentDir, 'schemas.ts'), `export const schemas = {};`);
      await writeFile(
        path.join(contentDir, 'pages/home.json'),
        `{"items":[{"caption":"c","alt":"a"}]}`,
      );
      const server = fakeServer({
        pages: { home: z.object({ items: z.array(z.object({ caption: z.string() })) }) },
      });
      const err: Error = await validateContentEager(server, contentDir, schemasImportPath).catch(
        (e: Error): Error => e,
      );
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('items[0].alt');
    });

    it('does not report anything when content matches its schema exactly', async () => {
      await writeFile(path.join(contentDir, 'schemas.ts'), `export const schemas = {};`);
      await writeFile(path.join(contentDir, 'pages/home.json'), `{"hero":{"title":"Hi"}}`);
      const server = fakeServer({
        pages: { home: z.object({ hero: z.object({ title: z.string() }) }) },
      });
      await expect(
        validateContentEager(server, contentDir, schemasImportPath),
      ).resolves.toBeUndefined();
    });

    it('does not false-positive when a schema transform legitimately reshapes the value', async () => {
      await writeFile(path.join(contentDir, 'schemas.ts'), `export const schemas = {};`);
      await writeFile(path.join(contentDir, 'site.json'), `{"brand":"acme"}`);
      const server = fakeServer({
        site: z.object({ brand: z.string() }).transform((v: { brand: string }): string => v.brand),
      });
      await expect(
        validateContentEager(server, contentDir, schemasImportPath),
      ).resolves.toBeUndefined();
    });
  });
});
