// db-audit.mjs - READ-ONLY check of your live MySQL database against your Drizzle files.
// It only runs SELECT queries on information_schema and COUNT(*) on your tables.
// It never changes anything and never prints passwords or table contents.
// Writes db-audit-report.txt (safe to send to Claude).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const lines = [];
const say = (s = '') => { console.log(s); lines.push(s); };
const finish = (code) => {
  fs.writeFileSync(path.join(root, 'db-audit-report.txt'), lines.join('\n') + '\n', 'utf8');
  say('');
  say('Report saved: db-audit-report.txt');
  process.exit(code);
};

// ---------- pure helpers (also unit-tested by Claude) ----------

export function normalizeType(t) {
  let s = String(t).toLowerCase().replace(/\s+/g, ' ').trim();
  s = s.replace(/,\s+/g, ',');
  s = s.replace(/^(smallint|mediumint|int|bigint)\(\d+\)/, '$1');
  const map = { boolean: 'tinyint(1)', serial: 'bigint unsigned' };
  if (map[s]) s = map[s];
  if (s === 'tinyint') s = 'tinyint(1)'; // MySQL shows boolean as tinyint(1)
  return s;
}

/** expected: { table: { col: {type, notNull} } }   live: same shape. */
export function compareSchemas(expected, live) {
  const out = { missingTables: [], extraTables: [], missingColumns: [], extraColumns: [], typeDiffs: [] };
  for (const [t, cols] of Object.entries(expected)) {
    if (!live[t]) { out.missingTables.push(t); continue; }
    for (const [c, def] of Object.entries(cols)) {
      const l = live[t][c];
      if (!l) { out.missingColumns.push(`${t}.${c}`); continue; }
      const a = normalizeType(def.type), b = normalizeType(l.type);
      if (a !== b) out.typeDiffs.push(`${t}.${c}: expected ${a}, live ${b}`);
      if (Boolean(def.notNull) !== Boolean(l.notNull)) {
        out.typeDiffs.push(`${t}.${c}: expected ${def.notNull ? 'NOT NULL' : 'NULL allowed'}, live ${l.notNull ? 'NOT NULL' : 'NULL allowed'}`);
      }
    }
    for (const c of Object.keys(live[t])) if (!cols[c]) out.extraColumns.push(`${t}.${c}`);
  }
  for (const t of Object.keys(live)) if (!expected[t] && !t.startsWith('__drizzle')) out.extraTables.push(t);
  return out;
}

export function snapshotToExpected(snapshot) {
  const exp = {};
  for (const [tname, t] of Object.entries(snapshot.tables ?? {})) {
    exp[t.name ?? tname] = {};
    for (const [cname, c] of Object.entries(t.columns ?? {})) {
      exp[t.name ?? tname][c.name ?? cname] = { type: c.type, notNull: Boolean(c.notNull) };
    }
  }
  return exp;
}

export function tableNamesInSchemaTs(src) {
  return [...src.matchAll(/mysqlTable\(\s*['"`]([A-Za-z0-9_]+)['"`]/g)].map((m) => m[1]);
}

// ---------- main ----------

async function main() {
  say('ChennaiDeals database audit (read-only) - ' + new Date().toISOString());
  say('');

  // 1. files on disk
  const metaDir = path.join(root, 'drizzle', 'meta');
  const journalPath = path.join(metaDir, '_journal.json');
  if (!fs.existsSync(journalPath)) { say('FAIL: drizzle/meta/_journal.json not found. Run this from the project folder.'); return finish(1); }
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  say('== Migration files ==');
  const snaps = fs.readdirSync(metaDir).filter((f) => /_snapshot\.json$/.test(f));
  for (const e of journal.entries) {
    const sqlOk = fs.existsSync(path.join(root, 'drizzle', e.tag + '.sql'));
    const snapOk = snaps.includes(String(e.idx).padStart(4, '0') + '_snapshot.json');
    say(`  ${String(e.idx).padStart(4, '0')} ${e.tag}: sql ${sqlOk ? 'present' : 'MISSING'}, snapshot ${snapOk ? 'present' : 'MISSING'}`);
  }
  const latestSnapName = snaps.sort().pop();
  const snapshot = latestSnapName ? JSON.parse(fs.readFileSync(path.join(metaDir, latestSnapName), 'utf8')) : null;
  const expected = snapshot ? snapshotToExpected(snapshot) : {};
  say(`  Latest snapshot: ${latestSnapName ?? 'none'} (${Object.keys(expected).length} tables)`);

  const schemaTsPath = path.join(root, 'src', 'server', 'db', 'schema.ts');
  const schemaTables = fs.existsSync(schemaTsPath) ? tableNamesInSchemaTs(fs.readFileSync(schemaTsPath, 'utf8')) : [];
  say(`  schema.ts declares ${schemaTables.length} tables: ${schemaTables.join(', ')}`);
  const notInSnap = schemaTables.filter((t) => !expected[t]);
  const notInSchema = Object.keys(expected).filter((t) => !schemaTables.includes(t));
  if (notInSnap.length) say(`  WARN: in schema.ts but not in the latest snapshot: ${notInSnap.join(', ')}`);
  if (notInSchema.length) say(`  WARN: in the snapshot but not in schema.ts: ${notInSchema.join(', ')}`);
  say('');

  // 2. connect (credentials come from the same file the app uses; never printed)
  const cfgPath = path.join(process.env.NOMAD_TASK_DIR || '/local', 'config.json');
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).DATABASE.VALUE;
  } catch {
    say(`FAIL: could not read database settings from ${cfgPath}. Is the file where the app expects it?`);
    return finish(1);
  }
  let mysql;
  try { mysql = (await import('mysql2/promise')).default; } catch { say('FAIL: mysql2 is not installed. Run npm.cmd install.'); return finish(1); }
  let conn;
  try {
    conn = await mysql.createConnection({ host: cfg.HOST, port: Number(cfg.PORT), user: cfg.USERNAME, password: cfg.PASSWORD, database: cfg.NAME, connectTimeout: 8000 });
  } catch (e) {
    say(`FAIL: cannot connect to MySQL (${e.code ?? 'error'}). Is the MySQL service running?`);
    return finish(1);
  }
  say(`== Live database "${cfg.NAME}" ==`);

  try {
    const [ver] = await conn.query('SELECT VERSION() AS v');
    say(`  MySQL version: ${ver[0].v}`);

    const [colRows] = await conn.query(
      'SELECT TABLE_NAME t, COLUMN_NAME c, COLUMN_TYPE ty, IS_NULLABLE n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION');
    const live = {};
    for (const r of colRows) { (live[r.t] ??= {})[r.c] = { type: r.ty, notNull: r.n === 'NO' }; }
    say(`  Tables found: ${Object.keys(live).join(', ') || '(none)'}`);

    const [counts] = [await Promise.all(Object.keys(live).map(async (t) => {
      const [r] = await conn.query('SELECT COUNT(*) AS n FROM `' + t.replace(/`/g, '') + '`');
      return [t, r[0].n];
    }))];
    say('  Row counts: ' + counts.map(([t, n]) => `${t}=${n}`).join(', '));
    say('');

    // 3. compare
    say('== Live database vs latest migration snapshot ==');
    const diff = compareSchemas(expected, live);
    const total = diff.missingTables.length + diff.missingColumns.length + diff.typeDiffs.length;
    if (diff.missingTables.length) say('  FAIL missing tables: ' + diff.missingTables.join(', '));
    if (diff.missingColumns.length) say('  FAIL missing columns: ' + diff.missingColumns.join(', '));
    if (diff.typeDiffs.length) { say('  WARN differences:'); diff.typeDiffs.forEach((d) => say('    ' + d)); }
    if (diff.extraTables.length) say('  INFO tables only in the live DB (not in snapshot): ' + diff.extraTables.join(', '));
    if (diff.extraColumns.length) say('  INFO columns only in the live DB: ' + diff.extraColumns.join(', '));
    if (total === 0) say('  OK: every table and column in the snapshot exists live with matching types.');

    // schema.ts tables that the live DB lacks (the real risk when code is newer than the DB)
    const missingForCode = schemaTables.filter((t) => !live[t]);
    if (missingForCode.length) say('  FAIL tables the CODE (schema.ts) needs but the live DB lacks: ' + missingForCode.join(', '));
    say('');

    // 4. indexes / foreign keys for the tables we care about
    const [fks] = await conn.query(
      'SELECT TABLE_NAME t, COLUMN_NAME c, REFERENCED_TABLE_NAME rt, REFERENCED_COLUMN_NAME rc FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY t');
    say('== Foreign keys ==');
    fks.forEach((f) => say(`  ${f.t}.${f.c} -> ${f.rt}.${f.rc}`));
    const [idx] = await conn.query(
      'SELECT TABLE_NAME t, INDEX_NAME i, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) cols, MAX(NON_UNIQUE) nu FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME <> \'PRIMARY\' GROUP BY TABLE_NAME, INDEX_NAME ORDER BY t');
    say('== Indexes (besides primary keys) ==');
    idx.forEach((i) => say(`  ${i.t}: ${i.i} (${i.cols})${Number(i.nu) === 0 ? ' UNIQUE' : ''}`));
    say('');

    // 5. migration bookkeeping
    say('== Migration bookkeeping ==');
    const hasLog = Boolean(live['__drizzle_migrations']);
    if (!hasLog) {
      say('  No __drizzle_migrations table: the database was built with "drizzle-kit push", not "migrate".');
      say('  That is fine as long as you keep using push. Do NOT run "drizzle-kit migrate" on this database');
      say('  (it would try to re-run 0000 and fail on tables that already exist).');
    } else {
      const [rows] = await conn.query('SELECT COUNT(*) AS n FROM `__drizzle_migrations`');
      say(`  __drizzle_migrations has ${rows[0].n} rows; the journal lists ${journal.entries.length} migrations.`);
    }
  } finally {
    await conn.end();
  }

  say('');
  say('== What to do next ==');
  say('  Nothing was changed. Send db-audit-report.txt to Claude; any fix will be given as a');
  say('  separate script that backs up first and asks before applying.');
  finish(0);
}

if (import.meta.url === new URL(process.argv[1], 'file://').href || process.argv[1]?.endsWith('db-audit.mjs')) {
  main().catch((e) => { say('FAIL: ' + (e?.message ?? e)); finish(1); });
}
