// fix-encoding.mjs - repairs "mojibake" (text that was saved with the wrong encoding, e.g. the
// rupee sign showing as a few odd letters) in the project's source files.
// Usage: node tools/fix-encoding.mjs [--check] [folder...]   (default folder: src)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CP1252 = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e,
  0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};
function toByte(ch) {
  const c = ch.codePointAt(0);
  if (c < 0x100) return c;
  return CP1252[c];
}
// A mojibake run starts with a UTF-8 lead byte shown as a Latin letter, followed by continuation bytes.
const RUN = /[Â-ô][\u0080-¿ŒœŠšŸŽžƒˆ˜–—‘-„†-•…‰‹›€™ -¿]{1,3}/gu;
const dec = new TextDecoder('utf-8', { fatal: true });

function undo(run) {
  const bytes = [];
  for (const ch of run) {
    const b = toByte(ch);
    if (b === undefined) return null;
    bytes.push(b);
  }
  try { return dec.decode(Uint8Array.from(bytes)); } catch { return null; }
}

export function repair(text) {
  let out = text;
  for (let pass = 0; pass < 3; pass++) {
    const next = out.replace(RUN, (run) => {
      // try the full run, then shorter prefixes (a real letter may follow the run)
      for (let len = [...run].length; len >= 2; len--) {
        const part = [...run].slice(0, len).join('');
        const fixed = undo(part);
        if (fixed !== null && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(fixed)) return fixed + [...run].slice(len).join('');
      }
      return run;
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

const SKIP = new Set(['node_modules', '.git', 'dist', 'uploads', '.update-backups']);
const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.json', '.md']);
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (EXT.has(path.extname(e.name))) yield p;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const dirs = args.filter((a) => !a.startsWith('--'));
  if (dirs.length === 0) dirs.push('src');
  let changed = 0;
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const file of walk(d)) {
      const buf = fs.readFileSync(file);
      const hasBom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
      const text = buf.toString('utf8');
      const fixed = repair(text);
      if (fixed !== text) {
        changed++;
        console.log((check ? 'would fix: ' : 'fixed: ') + file);
        if (!check) fs.writeFileSync(file, (hasBom ? '﻿' : '') + fixed.replace(/^﻿/, ''), 'utf8');
      }
    }
  }
  console.log(changed === 0 ? 'No garbled text found.' : `${changed} file(s) ${check ? 'need' : 'were'} repaired.`);
}
