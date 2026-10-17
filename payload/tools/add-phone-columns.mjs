// add-phone-columns.mjs - adds the two phone columns to the "user" table (safe to run twice).
// Reads the database login from the same config.json the app uses. Nothing is printed that is secret.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
function envLocal(name) {
  try {
    for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = new RegExp('^\\s*' + name + '\\s*=\\s*(.*)$').exec(line);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env.local */ }
  return undefined;
}
const dirs = [process.env.NOMAD_TASK_DIR, envLocal('NOMAD_TASK_DIR'), '/local', path.join(root, 'local'), root, 'C:\\local'].filter(Boolean);
let cfg = null;
for (const d of dirs) {
  const p = path.join(d, 'config.json');
  try { cfg = JSON.parse(fs.readFileSync(p, 'utf8')).DATABASE.VALUE; break; } catch { /* try next */ }
}
if (!cfg) { console.error('FAIL: could not find config.json with the database settings (looked in: ' + dirs.join(', ') + ').'); process.exit(1); }

let mysql;
try { mysql = (await import('mysql2/promise')).default; } catch { console.error('FAIL: mysql2 is not installed.'); process.exit(1); }
let conn;
try {
  conn = await mysql.createConnection({ host: cfg.HOST, port: Number(cfg.PORT), user: cfg.USERNAME, password: cfg.PASSWORD, database: cfg.NAME, connectTimeout: 8000 });
} catch (e) {
  console.error('FAIL: cannot connect to MySQL (' + (e.code ?? 'error') + '). Is the MySQL service running?');
  process.exit(1);
}
try {
  const [cols] = await conn.query("SELECT COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user'");
  const have = new Set(cols.map((r) => r.c));
  if (!have.has('phone_number')) { await conn.query('ALTER TABLE `user` ADD COLUMN `phone_number` varchar(20) NULL'); console.log('Added column user.phone_number'); }
  if (!have.has('phone_number_verified')) { await conn.query('ALTER TABLE `user` ADD COLUMN `phone_number_verified` boolean DEFAULT false'); console.log('Added column user.phone_number_verified'); }
  const [idx] = await conn.query("SELECT INDEX_NAME i FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user' AND COLUMN_NAME = 'phone_number'");
  if (idx.length === 0) { await conn.query('ALTER TABLE `user` ADD UNIQUE INDEX `user_phone_number_unique` (`phone_number`)'); console.log('Added unique index on user.phone_number'); }
  console.log('Database is ready for phone sign-in.');
} catch (e) {
  console.error('FAIL: ' + (e.code ?? '') + ' ' + (e.sqlMessage ?? e.message));
  process.exit(1);
} finally {
  await conn.end();
}
