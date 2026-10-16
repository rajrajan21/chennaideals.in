// check-ai.mjs - tests your optional FREE Gemini key. Prints only OK / the HTTP status, never the key.
import fs from 'node:fs';
import path from 'node:path';
const env = {};
for (const name of ['.env', '.env.local']) {
  const f = path.resolve(process.cwd(), name);
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
const key = process.env.GEMINI_API_KEY ?? env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL ?? env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite';
if (!key) { console.log('No GEMINI_API_KEY found in .env.local - AI is OFF (that is fine; everything else still works).'); process.exit(0); }
const base = 'https://generativelanguage.googleapis.com/v1beta';
const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
const prompt = 'Reply with JSON {"title":"ok","description":"working"}.';
const tries = [
  ['interactions API', `${base}/interactions`, { model, input: prompt, response_format: { type: 'text', mime_type: 'application/json', schema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' } }, required: ['title', 'description'] } } }],
  ['generateContent API', `${base}/models/${model}:generateContent`, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }],
];
let good = false;
for (const [label, url, body] of tries) {
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    console.log(`${label}: HTTP ${res.status}${res.ok ? ' - OK' : ''}`);
    if (res.ok) { good = true; break; }
    if (res.status === 401 || res.status === 403) { console.log('The key was rejected. Create a new one at aistudio.google.com/apikey and run Set-Gemini-Key.bat again.'); break; }
    if (res.status === 429) { console.log('Free quota used up for now. The site keeps working without AI; try again later.'); break; }
  } catch (e) { console.log(`${label}: failed (${e.code ?? e.name})`); }
}
console.log(good ? `Gemini free tier is working (model ${model}).` : 'Gemini did not answer. The site works without it (rule-based drafts).');
