// delete-deal.mjs - deletes one deal (and nothing else) by its number, e.g. the 32 in /deals/32.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

const root = process.cwd();
function envLocal(name) {
  try {
    for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = new RegExp('^\\s*' + name + '\\s*=\\s*(.*)$').exec(line);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* none */ }
  return undefined;
}
const dirs = [process.env.NOMAD_TASK_DIR, envLocal('NOMAD_TASK_DIR'), '/local', path.join(root, 'local'), root, 'C:\\local'].filter(Boolean);
let cfg = null;
for (const d of dirs) { try { cfg = JSON.parse(fs.readFileSync(path.join(d, 'config.json'), 'utf8')).DATABASE.VALUE; break; } catch { /* next */ } }
if (!cfg) { console.error('FAIL: could not find config.json with the database settings.'); process.exit(1); }
const mysql = (await import('mysql2/promise')).default;
let conn;
try { conn = await mysql.createConnection({ host: cfg.HOST, port: Number(cfg.PORT), user: cfg.USERNAME, password: cfg.PASSWORD, database: cfg.NAME, connectTimeout: 8000 }); }
catch (e) { console.error('FAIL: cannot connect to MySQL (' + (e.code ?? 'error') + '). Is MySQL running?'); process.exit(1); }

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ids = (await rl.question('Deal number(s) to delete, separated by commas (the number in /deals/NN): ')).split(',').map((x) => Number(x.trim())).filter((n) => Number.isSafeInteger(n) && n > 0);
for (const id of ids) {
  const [r] = await conn.query('SELECT title FROM deals WHERE id = ?', [id]);
  if (!r.length) { console.log(`Deal ${id}: not found`); continue; }
  const ok = (await rl.question(`Delete deal ${id} "${String(r[0].title).slice(0, 70)}"? (y/n) `)).trim().toLowerCase() === 'y';
  if (!ok) { console.log('Kept.'); continue; }
  try { await conn.query('DELETE FROM deals WHERE id = ?', [id]); console.log(`Deleted deal ${id}.`); }
  catch (e) { console.log(`Could not delete ${id}: ${e.code ?? e.message}`); }
}
rl.close();
await conn.end();
