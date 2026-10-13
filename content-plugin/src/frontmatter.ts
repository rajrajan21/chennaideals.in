export interface ParsedMarkdown {
  data: Record<string, unknown>;
  content: string;
}

function parseScalar(raw: string): unknown {
  const v = raw.trim();
  if (v === '') return '';
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map(parseScalar);
  }
  return v;
}

export function parseFrontmatter(raw: string): ParsedMarkdown {
  const text = raw.replace(/^\uFEFF/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) return { data: {}, content: text };

  const data: Record<string, unknown> = {};
  let currentKey: string | null = null;

  for (const line of match[1].split(/\r?\n/)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    const listItem = /^\s*-\s+(.*)$/.exec(line);
    if (listItem && currentKey) {
      const existing = data[currentKey];
      const arr = Array.isArray(existing) ? existing : [];
      arr.push(parseScalar(listItem[1]));
      data[currentKey] = arr;
      continue;
    }

    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (kv) {
      currentKey = kv[1];
      data[currentKey] = parseScalar(kv[2]);
    }
  }

  return { data, content: text.slice(match[0].length) };
}