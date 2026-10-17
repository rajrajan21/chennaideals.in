// gemini-doctor.mjs - finds out why Gemini does not answer and fixes the model name for you.
// Reads GEMINI_API_KEY from .env.local (never printed). Run with Gemini-Doctor.bat from the project folder.
import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), '.env.local');
let lines = [];
try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/); } catch { console.log('No .env.local here. Run this from the project folder.'); process.exit(1); }
const get = (n) => { for (const l of lines) { const m = new RegExp('^\\s*' + n + '\\s*=\\s*(.*)$').exec(l); if (m) return m[1].trim().replace(/^["']|["']$/g, ''); } };
const key = get('GEMINI_API_KEY');
if (!key) { console.log('GEMINI_API_KEY is not in .env.local. Run Set-Gemini-Key.bat first.'); process.exit(1); }
console.log('Key found (' + key.length + ' characters).');
const base = 'https://generativelanguage.googleapis.com/v1beta';
const headers = { 'x-goog-api-key': key, 'Content-Type': 'application/json' };
const short = (t) => String(t).replace(key, '***').replace(/\s+/g, ' ').slice(0, 300);

async function call(url, opts) {
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(20000) });
    const body = await res.text();
    return { status: res.status, body };
  } catch (e) { return { status: 0, body: String(e?.cause?.code || e?.message || e) }; }
}

console.log('\n1. Asking Google which models your key can use...');
const list = await call(`${base}/models?pageSize=200`, { headers });
console.log('   HTTP ' + list.status + (list.status === 200 ? '' : '  ' + short(list.body)));
let names = [];
if (list.status === 200) {
  const j = JSON.parse(list.body);
  names = (j.models ?? []).filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
  console.log('   ' + names.length + ' models can generate text.');
} else if (list.status === 400 || list.status === 403) {
  console.log('\n   The key was refused. Create a new key at https://aistudio.google.com/apikey and run Set-Gemini-Key.bat.');
} else if (list.status === 0) {
  console.log('\n   Could not reach Google from this computer (' + list.body + '). Check the internet connection, VPN or firewall.');
}

const wanted = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-flash-latest'];
const candidates = [...new Set([...wanted.filter((n) => names.length === 0 || names.includes(n)), ...names.filter((n) => /flash/.test(n) && !/image|tts|live|audio|thinking|exp|preview/.test(n))])].slice(0, 12);

console.log('\n2. Trying models one by one...');
let working = null;
for (const model of candidates) {
  const r = await call(`${base}/models/${model}:generateContent`, {
    method: 'POST', headers,
    body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with the single word OK.' }] }] }),
  });
  console.log('   ' + model.padEnd(28) + 'HTTP ' + r.status + (r.status === 200 ? '  works' : '  ' + short(r.body).slice(0, 140)));
  if (r.status === 200) { working = model; break; }
}

console.log('');
if (working) {
  const next = lines.filter((l) => !/^\s*GEMINI_MODEL\s*=/.test(l) && l !== '');
  next.push('GEMINI_MODEL=' + working);
  fs.writeFileSync(file, next.join('\n') + '\n', 'utf8');
  console.log('FIXED: saved GEMINI_MODEL=' + working + ' in .env.local. Restart npm.cmd run dev.');
} else if (list.status === 200 || list.status === 0) {
  console.log('No model answered right now. If the messages above say "overloaded" or "unavailable", Google is busy: try again in 10-30 minutes.');
  console.log('Everything on the site keeps working without Gemini. Send this screen to Claude if it still fails tomorrow.');
}
