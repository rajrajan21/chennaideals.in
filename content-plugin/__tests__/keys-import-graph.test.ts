import { promises as fs } from 'node:fs'
import { builtinModules } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// content-lib/src/content-runtime.ts imports keys.ts by relative path,
// bypassing content-plugin's package `exports` map (which only publishes
// `./keys`). That import runs in the browser, so every file keys.ts can
// reach — walked here from the real files on disk, not a hand-maintained
// list — must stay free of Node builtins.
const SRC_DIR: string = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')
const ENTRY_FILE: string = path.join(SRC_DIR, 'keys.ts')

const NAMED_OR_EXPORT_FROM_PATTERN: RegExp = /\bfrom\s+['"]([^'"]+)['"]/g
const BARE_SIDE_EFFECT_IMPORT_PATTERN: RegExp = /\bimport\s+['"]([^'"]+)['"]/g
const DYNAMIC_IMPORT_CALL_PATTERN: RegExp = /\bimport\s*\(\s*['"]([^'"]+)['"]/g
const REQUIRE_CALL_PATTERN: RegExp = /\brequire\s*\(\s*['"]([^'"]+)['"]/g

const IMPORT_SPECIFIER_PATTERNS: readonly RegExp[] = [
  NAMED_OR_EXPORT_FROM_PATTERN,
  BARE_SIDE_EFFECT_IMPORT_PATTERN,
  DYNAMIC_IMPORT_CALL_PATTERN,
  REQUIRE_CALL_PATTERN,
]

function extractImportSpecifiers(source: string): string[] {
  const specifiers: Set<string> = new Set<string>()
  for (const template of IMPORT_SPECIFIER_PATTERNS) {
    const pattern: RegExp = new RegExp(template)
    let match: RegExpExecArray | null = pattern.exec(source)
    while (match !== null) {
      const specifier: string | undefined = match[1]
      if (specifier !== undefined) specifiers.add(specifier)
      match = pattern.exec(source)
    }
  }
  return [...specifiers]
}

function isBuiltinSpecifier(specifier: string): boolean {
  const bareName: string = specifier.startsWith('node:') ? specifier.slice('node:'.length) : specifier
  return (builtinModules as readonly string[]).includes(bareName)
}

/** Resolve a relative import specifier to the source file it points at, or null if none exists on disk. */
async function resolveRelativeImport(fromFile: string, specifier: string): Promise<string | null> {
  const fromDir: string = path.dirname(fromFile)
  const withoutExtension: string = specifier.replace(/\.js$/, '')
  const basePath: string = path.resolve(fromDir, withoutExtension)
  const candidates: string[] = [`${basePath}.ts`, `${basePath}.tsx`, path.join(basePath, 'index.ts')]
  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      continue
    }
  }
  return null
}

describe('extractImportSpecifiers', () => {
  it.each([
    ['a bare side-effect import', "import 'node:fs'"],
    ['a dynamic import call', "await import('node:fs')"],
    ['a require call', "const x = require('node:fs')"],
  ])('catches %s', (_label: string, source: string) => {
    expect(extractImportSpecifiers(source)).toContain('node:fs')
  })

  it('does not double-count a specifier matched by more than one pattern', () => {
    expect(extractImportSpecifiers("import fs from 'node:fs'")).toEqual(['node:fs'])
  })
})

describe('keys.ts transitive import graph', () => {
  it('stays free of Node builtins reachable from its own source files', async () => {
    const visited: Set<string> = new Set<string>()
    const builtinHits: string[] = []
    const unresolvedRelativeImports: string[] = []
    const queue: string[] = [ENTRY_FILE]

    for (;;) {
      const currentFile: string | undefined = queue.shift()
      if (currentFile === undefined) break
      if (visited.has(currentFile)) continue
      visited.add(currentFile)

      const source: string = await fs.readFile(currentFile, 'utf8')
      const specifiers: string[] = extractImportSpecifiers(source)

      for (const specifier of specifiers) {
        if (isBuiltinSpecifier(specifier)) {
          builtinHits.push(`${path.relative(SRC_DIR, currentFile)} -> ${specifier}`)
          continue
        }
        if (!specifier.startsWith('.')) continue // third-party package: outside this graph walk's scope

        const resolved: string | null = await resolveRelativeImport(currentFile, specifier)
        if (resolved === null) {
          unresolvedRelativeImports.push(`${path.relative(SRC_DIR, currentFile)} -> ${specifier}`)
          continue
        }
        if (!visited.has(resolved)) queue.push(resolved)
      }
    }

    expect(unresolvedRelativeImports).toEqual([])
    expect(builtinHits).toEqual([])
    // Sanity check that the walk actually traversed beyond the entry file itself
    // (e.g. into frontmatter.ts) rather than vacuously passing on an empty graph.
    expect(visited.size).toBeGreaterThan(1)
  })
})
