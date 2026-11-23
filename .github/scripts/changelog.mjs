import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const { WEBHOOK, PING, BEFORE, AFTER, REPO } = process.env;
const DAYS = parseInt(process.env.DAYS || '', 10) || 0;   // >0 = ruční zpětný běh
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
const sh = c => execSync(c, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FMT = '--no-merges --format=%an%x1f%s%x1f%b%x1e';

// které commity se berou
let raw;
if (DAYS > 0) {
  raw = sh(`git log --since="${DAYS} days ago" ${AFTER} ${FMT}`);
} else {
  let range = `${BEFORE}..${AFTER}`;
  if (!BEFORE || /^0+$/.test(BEFORE)) range = `-n 5 ${AFTER}`;
  try { raw = sh(`git log ${range} ${FMT}`); }
  catch { raw = sh(`git log -n 5 ${AFTER} ${FMT}`); }
}

const LINE = /^[-*•]?\s*([\p{L}]+)(?:\([^)]*\))?!?:\s*(.+)$/u;
const items = [], authors = new Set(), seen = new Set();
const add = (t, x) => {
  x = x.trim().replace(/\s+/g, ' ').slice(0, 300);
  const k = t + '|' + x.toLowerCase();
  if (!x || seen.has(k)) return;       // stejná změna dvakrát se nepošle
  seen.add(k); items.push({ t, x });
};

for (const rec of raw.split('\x1e')) {
  const [author, subject = '', body = ''] = rec.trim().split('\x1f');
  if (!subject) continue;
  const text = subject + '\n' + body;
  if (/\[skip[ -]?(cl|changelog)\]/i.test(text)) continue;
  let used = false;
  for (const line of text.split('\n')) {
    const m = LINE.exec(line.trim());
    if (!m) continue;
    const t = MAP[norm(m[1])];
    if (!t) continue;
    add(t, m[2]);
    used = true;
  }
  // commit bez naší předpony (např. od Copilota) → „Změny“, kromě interních
  if (!used && !/^(chore|docs|ci|build|test|merge|revert|wip)\b/i.test(subject)
      && !/^(Add|Create|Update) (GitHub Actions|changelog)/i.test(subject)) {
    add('chg', subject.replace(/^\w+(\([^)]*\))?!?:\s*/, ''));
    used = true;
  }
  if (used && author) authors.add(author);
}

if (!items.length) { console.log('Žádné změny k odeslání.'); process.exit(0); }

let ver = existsSync('VERSION') ? readFileSync('VERSION', 'utf8').trim() : '';
if (!ver) { const d = new Date(); ver = `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; }

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
    .forEach((p, i) => fields.push({ name: i === 0 ? `${TYPES[k].ic} ${TYPES[k].n} (${it.length})` : '\u200b', value: p, inline: false }));
}

// rozdělení do více embedů (limit Discordu: 25 polí a ~6000 znaků na embed)
const groups = []; let cur = [], len = 0;
for (const f of fields) {
  const l = f.name.length + f.value.length;
  if (cur.length >= 25 || len + l > 5000) { groups.push(cur); cur = []; len = 0; }
  cur.push(f); len += l;
}
if (cur.length) groups.push(cur);

const short = AFTER.slice(0, 7);
const link = DAYS > 0
  ? `https://github.com/${REPO}/commits/main`
  : (BEFORE && !/^0+$/.test(BEFORE) ? `https://github.com/${REPO}/compare/${BEFORE.slice(0, 7)}...${short}` : `https://github.com/${REPO}/commit/${AFTER}`);
const period = DAYS > 0 ? ` · posledních ${DAYS} dní` : '';

for (let i = 0; i < groups.length; i++) {
  const body = {
    username: 'Changelog',
    allowed_mentions: { parse: ['roles'] },
    embeds: [{
      title: i === 0 ? `📋 CHANGELOG — v${ver}${period}` : `📋 CHANGELOG — v${ver} (pokračování ${i + 1}/${groups.length})`,
      url: link,
      description: i === 0 && DAYS > 0 ? `Souhrn změn za posledních **${DAYS} dní** (${items.length} změn).` : undefined,
      color: TYPES[main].c,
      fields: groups[i],
      footer: { text: `${[...authors].join(', ')} • ${short}` },
      timestamp: new Date().toISOString(),
    }],
  };
  // označení role jen u běžných automatických zpráv, ne u zpětného souhrnu
  if (i === 0 && DAYS === 0 && PING && /^\d{5,}$/.test(PING.trim())) body.content = `<@&${PING.trim()}>`;
  const res = await fetch(WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) { console.error('Discord:', res.status, await res.text()); process.exit(1); }
  await sleep(1200);   // ať Discord nehlásí rate limit
}
console.log(`Odesláno: ${items.length} změn v ${groups.length} zprávě/zprávách, v${ver}.`);
