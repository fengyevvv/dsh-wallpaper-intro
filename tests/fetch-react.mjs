import fs from 'node:fs';
import path from 'node:path';
const dir = path.join(process.cwd(), 'tests', 'vendor');
fs.mkdirSync(dir, { recursive: true });
const files = [
  ['react.development.js', 'https://unpkg.com/react@18.3.1/umd/react.development.js'],
  ['react-dom.development.js', 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js'],
];
for (const [name, url] of files) {
  const out = path.join(dir, name);
  if (fs.existsSync(out) && fs.statSync(out).size > 10000) { console.log('cached', name); continue; }
  try {
    const res = await fetch(url);
    if (!res.ok) { console.log('HTTP', res.status, url); continue; }
    const text = await res.text();
    fs.writeFileSync(out, text);
    console.log('saved', name, text.length);
  } catch (e) { console.log('ERR', name, e.message); }
}
