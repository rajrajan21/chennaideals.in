import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ENFORCEMENT_MARKER_PATH,
  ENROLLMENT_MARKER_PATH,
  enforcementEnabled,
} from '../src/authority-marker';

let root: string;

beforeEach(async (): Promise<void> => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'marker-'));
  await fs.mkdir(path.join(root, 'src', 'content'), { recursive: true });
});

describe('marker paths', () => {
  it('places both markers beside the content they govern', () => {
    expect(ENROLLMENT_MARKER_PATH).toBe('src/content/.content-authority');
    expect(ENFORCEMENT_MARKER_PATH).toBe('src/content/.content-authority-enforce');
  });

  it('keeps enrollment and enforcement distinct', () => {
    expect(ENFORCEMENT_MARKER_PATH).not.toBe(ENROLLMENT_MARKER_PATH);
  });
});

describe('enforcementEnabled', () => {
  it('is true when the enforcement marker is a file', async () => {
    await fs.writeFile(path.join(root, ENFORCEMENT_MARKER_PATH), '');
    expect(enforcementEnabled(root)).toBe(true);
  });

  it('treats a zero-byte marker as armed, because existence is the whole signal', async () => {
    await fs.writeFile(path.join(root, ENFORCEMENT_MARKER_PATH), '');
    expect((await fs.stat(path.join(root, ENFORCEMENT_MARKER_PATH))).size).toBe(0);
    expect(enforcementEnabled(root)).toBe(true);
  });

  it('is false when absent', () => {
    expect(enforcementEnabled(root)).toBe(false);
  });

  it('is false when the enrollment marker exists but enforcement does not', async () => {
    await fs.writeFile(path.join(root, ENROLLMENT_MARKER_PATH), '');
    expect(enforcementEnabled(root)).toBe(false);
  });

  it('is false when the marker path is a directory', async () => {
    await fs.mkdir(path.join(root, ENFORCEMENT_MARKER_PATH), { recursive: true });
    expect(enforcementEnabled(root)).toBe(false);
  });

  it('is false when src/content does not exist at all', async () => {
    const bare: string = await fs.mkdtemp(path.join(tmpdir(), 'bare-'));
    expect(enforcementEnabled(bare)).toBe(false);
  });

  it('is false for an empty project root rather than resolving to the process cwd', () => {
    expect(enforcementEnabled('')).toBe(false);
  });
});

describe('enforcementEnabled failure discipline', () => {
  // chmod is a no-op for root, so under a root runner statSync succeeds and this fixture asserts
  // nothing about the EACCES branch. Skipped rather than left to fail on whichever diff runs there.
  const isRoot: boolean = process.getuid?.() === 0;

  it.skipIf(isRoot)('returns false for an unreadable marker instead of throwing', async (): Promise<void> => {
    await fs.writeFile(path.join(root, ENFORCEMENT_MARKER_PATH), '');
    await fs.chmod(path.join(root, 'src', 'content'), 0o000);
    try {
      // Both halves matter: not throwing is what makes EACCES a handled absence rather than a
      // build-breaking error, and false is what makes it absence rather than an armed gate.
      expect(() => enforcementEnabled(root)).not.toThrow();
      expect(enforcementEnabled(root)).toBe(false);
    } finally {
      await fs.chmod(path.join(root, 'src', 'content'), 0o755);
    }
  });

  it('returns false when a path component is a file, not a directory', async (): Promise<void> => {
    const bare: string = await fs.mkdtemp(path.join(tmpdir(), 'notdir-'));
    await fs.mkdir(path.join(bare, 'src'), { recursive: true });
    await fs.writeFile(path.join(bare, 'src', 'content'), 'not a directory');

    expect(enforcementEnabled(bare)).toBe(false);
  });

  it('returns false for a symlink loop', async (): Promise<void> => {
    await fs.symlink('.content-authority-enforce', path.join(root, ENFORCEMENT_MARKER_PATH));

    expect(enforcementEnabled(root)).toBe(false);
  });

  it('returns false when the path is too long for the filesystem', () => {
    expect(enforcementEnabled(path.join(tmpdir(), 'a'.repeat(5000)))).toBe(false);
  });

  it('rethrows an error whose code is not an absence code', (): void => {
    // A NUL byte makes statSync throw ERR_INVALID_ARG_VALUE — real and unmocked. Asserted on `code`
    // rather than the message, which drifts across Node majors while the contract does not.
    let caught: unknown;
    try {
      enforcementEnabled('/tmp/a\u0000b');
    } catch (error: unknown) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as { code?: string }).code).toBe('ERR_INVALID_ARG_VALUE');
  });
});
