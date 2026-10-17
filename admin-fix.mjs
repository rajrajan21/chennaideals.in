// admin-fix.mjs - shows your users, marks admin e-mails as verified, can make a user admin and set a new password.
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

const show = async () => {
  const [rows] = await conn.query('SELECT email, name, is_admin a, email_verified v FROM `user` ORDER BY is_admin DESC, created_at');
  console.log('\nUsers in your database:');
  for (const r of rows) console.log(`  ${r.a ? '[ADMIN]' : '       '} ${r.v ? 'verified  ' : 'NOT verified'}  ${r.email}${r.name ? '  (' + r.name + ')' : ''}`);
  return rows;
};
await show();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const email = (await rl.question('\nType the e-mail to make admin and sign in with (Enter = keep the current admin accounts): ')).trim().toLowerCase();
if (email) {
  const [f] = await conn.query('SELECT id FROM `user` WHERE LOWER(email) = ?', [email]);
  if (!f.length) { console.log('No user with that e-mail. Sign up once on the site with it, then run this again.'); }
  else { await conn.query('UPDATE `user` SET is_admin = 1, email_verified = 1 WHERE id = ?', [f[0].id]); console.log('Done: ' + email + ' is now an admin and verified.'); }
}
await conn.query('UPDATE `user` SET email_verified = 1 WHERE is_admin = 1');
console.log('All admin accounts are marked as verified.');

const target = email || (await conn.query('SELECT email FROM `user` WHERE is_admin = 1 LIMIT 1'))[0][0]?.email;
if (target) {
  const pw = (await rl.question(`New password for ${target} (Enter = leave unchanged, at least 8 characters): `)).trim();
  if (pw) {
    if (pw.length < 8) console.log('Password too short - not changed.');
    else {
      try {
        const { hashPassword } = await import('better-auth/crypto');
        const hash = await hashPassword(pw);
        const [u] = await conn.query('SELECT id FROM `user` WHERE LOWER(email) = ?', [target.toLowerCase()]);
        const [r] = await conn.query("UPDATE account SET password = ? WHERE user_id = ? AND provider_id = 'credential'", [hash, u[0].id]);
        console.log(r.affectedRows ? 'Password changed.' : 'This user has no e-mail password (signed up with Google/Facebook/phone) - not changed.');
      } catch (e) { console.log('Could not change the password: ' + (e.message ?? e)); }
    }
  }
}
rl.close();
await show();
await conn.end();
console.log('\nNow sign in again at /login.');
