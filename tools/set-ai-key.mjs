// set-ai-key.mjs - saves an AI search key into .env.local (the key is typed here, never in chat).
import fs from 'node:fs';
import readline from 'node:readline/promises';
const engines = [
  ['1', 'Gemini (Google, free tier)', 'GEMINI_API_KEY'],
  ['2', 'Perplexity', 'PERPLEXITY_API_KEY'],
  ['3', 'ChatGPT (OpenAI API)', 'OPENAI_API_KEY'],
  ['4', 'Claude (Anthropic API)', 'ANTHROPIC_API_KEY'],
];
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log('Which AI key do you want to save?');
for (const [n, label] of engines) console.log(`  ${n}. ${label}`);
const answer = (await rl.question('Number: ')).trim();
const pick = engines.find((e) => e[0] === answer);
if (!pick) { console.log('Nothing saved.'); rl.close(); process.exit(0); }
const key = (await rl.question(`Paste the ${pick[1]} key (it will not be shown again): `)).trim();
rl.close();
if (key.length < 10) { console.log('That does not look like a key. Nothing saved.'); process.exit(0); }
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = fs.existsSync(path.join(here, '..', 'package.json')) ? path.join(here, '..') : process.cwd();
const file = path.join(projectDir, '.env.local');
let text = '';
try { text = fs.readFileSync(file, 'utf8'); } catch { /* new file */ }
const re = new RegExp('^' + pick[2] + '=.*$', 'm');
const nl = text.includes('\r\n') ? '\r\n' : '\n';
text = re.test(text) ? text.replace(re, `${pick[2]}=${key}`) : text + (text && !text.endsWith('\n') ? nl : '') + `${pick[2]}=${key}${nl}`;
fs.writeFileSync(file, text);
console.log(`Saved ${pick[2]}. Restart npm run dev so the Deal Hunter sees it.`);
