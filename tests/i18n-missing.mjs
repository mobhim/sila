/* Lists Arabic strings that have no English entry in i18n.en.js: every __('…') and say('…') in app.js, and the static Arabic text,
   placeholders and labels of the pages that are translated through the dictionary.   node tests/i18n-missing.mjs */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const AR = /[\u0600-\u06FF]/;
const box = { window: {} };
vm.runInNewContext(readFileSync('i18n.en.js', 'utf8'), box);
const dict = box.window.SILA_EN, missing = new Set();
const need = (s, ctx) => { if (AR.test(s) && dict[ctx ? s + '|' + ctx : s] == null && dict[s] == null) missing.add(s); };
const unescape = s => s.replace(/\\n/g, '\n').replace(/\\(['"\\])/g, '$1');

const js = readFileSync('app.js', 'utf8');
for (const m of js.matchAll(/(?:__|say)\('((?:[^'\\]|\\.)*)'(?:,\s*'(\w+)')?\)/g)) need(unescape(m[1]), m[2]);

for (const file of ['index.html', 'admin.html', 'landmarks.html']) {
  const html = readFileSync(file, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, '\u00a0');
  for (const m of html.matchAll(/(placeholder|aria-label)="([^"]*)"/g)) need(decode(m[2]));
  /* text nodes: an element that carries data-en is replaced whole, so its own text needs no entry */
  const body = html.slice(html.indexOf('<body'));
  let skip = 0;
  for (const m of body.matchAll(/<(\/?)([a-zA-Z0-9]+)((?:"[^"]*"|[^>"])*)>|([^<]+)/g)) {
    if (m[4] != null) { const t = decode(m[4]).trim(); if (t && !skip) need(t); continue; }
    if (/^(br|img|input|meta|link|path|circle|hr)$/i.test(m[2]) || /\/$/.test(m[3])) continue;
    if (m[1]) { if (skip) skip--; } else if (skip || / data-en=/.test(m[3])) skip++;
  }
}
if (process.argv.includes('--json')) console.log(JSON.stringify([...missing], null, 1));
else { [...missing].forEach(s => console.log(JSON.stringify(s))); console.error(missing.size + ' missing'); }
process.exitCode = missing.size ? 1 : 0;
