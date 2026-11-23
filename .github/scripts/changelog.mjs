import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const { WEBHOOK, PING, BEFORE, AFTER, REPO } = process.env;
if (!WEBHOOK) { console.log('Chybí DISCORD_CHANGELOG_WEBHOOK, končím.'); process.exit(0); }

const TYPES = {
  new:  { ic: '✨', n: 'Nové',         c: 0x2ecc71 },
  look: { ic: '🎨', n: 'Vzhled',       c: 0x9b59b6 },
  opt:  { ic: '⚡', n: 'Optimalizace', c: 0xf1c40f },
  fix:  { ic: '🐛', n: 'Opravy',       c: 0xe74c3c },
  chg:  { ic: '🔧', n: 'Změny',        c: 0x3498db },
  sec:  { ic: '🔒', n: 'Bezpečnost',   c: 0x95a5a6 },
};
const ORD = ['new', 'look', 'opt', 'fix', 'chg', 'sec'];
const MAP = {
  feat: 'new', nove: 'new', new: 'new', add: 'new',
  vzhled: 'look', style: 'look', design: 'look', ui: 'look',
  perf: 'opt', opt: 'opt', optimalizace: 'opt', rychlost: 'opt',
  fix: 'fix', oprava: 'fix', opravy: 'fix', bug: 'fix',
  zmena: 'chg', zmeny: 'chg', change: 'chg', refactor: 'chg',
  sec: 'sec', security: 'sec', bezpecnost: 'sec',
};
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const sh = c => execSync(c, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

// commity od posledního pushe (při prvním pushi nebo force-pushi jen posledních pár)
let range = `${BEFORE}..${AFTER}`;
if (!BEFORE || /^0+$/.test(BEFORE)) range = `-n 5 ${AFTER}`;
let raw;
try { raw = sh(`git log ${range} --no-merges --format=%an%x1f%s%x1f%b%x1e`); }
catch { raw = sh(`git log -n 5 ${AFTER} --no-merges --format=%an%x1f%s%x1f%b%x1e`); }

const LINE = /^[-*•]?\s*([\p{L}]+)(?:\([^)]*\))?!?:\s*(.+)$/u;
const items = [], authors = new Set();

for (const rec of raw.split('\x1e')) {
  const [author, subject = '', body = ''] = rec.trim().split('\x1f');
  if (!subject) continue;
  const text = subject + '\n' + body;
  if (/\[skip[ -]?(cl|changelog)\]/i.test(text)) continue;
  let used = false;
  // předpona v předmětu i na řádcích v těle commitu (jeden commit = víc změn)
  for (const line of text.split('\n')) {
    const m = LINE.exec(line.trim());
    if (!m) continue;
    const t = MAP[norm(m[1])];
    if (!t) continue;
    items.push({ t, x: m[2].trim().replace(/\s+/g, ' ').slice(0, 300) });
    used = true;
  }
  if (used && author) authors.add(author);
}

if (!items.length) { console.log('Žádné změny s platnou předponou, nic neposílám.'); process.exit(0); }

// verze: soubor VERSION v kořeni repozitáře, jinak datum
let ver = existsSync('VERSION') ? readFileSync('VERSION', 'utf8').trim() : '';
if (!ver) { const d = new Date(); ver = `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; }

// barva podle nejčastějšího typu
const cnt = {}; items.forEach(i => cnt[i.t] = (cnt[i.t] || 0) + 1);
const main = ORD.filter(k => cnt[k]).sort((a, b) => cnt[b] - cnt[a])[0];

const chunk = (s, n) => {
  const out = [];
  while (s.length > n) {
    let cut = s.lastIndexOf('\n', n); if (cut < n * 0.5) cut = n;
    out.push(s.slice(0, cut)); s = s.slice(cut).replace(/^\n/, '');
  }
  out.push(s); return out;
};

const fields = [];
for (const k of ORD) {
  const it = items.filter(i => i.t === k); if (!it.length) continue;
  chunk(it.map(i => '• ' + i.x).join('\n'), 1000)
    .forEach((p, i) => fields.push({ name: i === 0 ? `${TYPES[k].ic} ${TYPES[k].n}` : '\u200b', value: p, inline: false }));
}

const short = AFTER.slice(0, 7);
const compare = BEFORE && !/^0+$/.test(BEFORE) ? `https://github.com/${REPO}/compare/${BEFORE.slice(0, 7)}...${short}` : `https://github.com/${REPO}/commit/${AFTER}`;

const body = {
  username: 'Changelog',
  allowed_mentions: { parse: ['roles'] },
  embeds: [{
    title: `📋 CHANGELOG — v${ver}`,
    url: compare,
    color: TYPES[main].c,
    fields: fields.slice(0, 25),
    footer: { text: `${[...authors].join(', ')} • ${short}` },
    timestamp: new Date().toISOString(),
  }],
};
if (PING && /^\d{5,}$/.test(PING.trim())) body.content = `<@&${PING.trim()}>`;

const res = await fetch(WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
if (!res.ok) { console.error('Discord:', res.status, await res.text()); process.exit(1); }
console.log(`Odesláno: ${items.length} změn, v${ver}.`);
